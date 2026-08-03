/**
 * gen-launch-overrides.cjs — deriva o mapa oficial `linha -> mês de lançamento`
 * a partir do calendário do Monday (src/data/launch-calendar-2025.json) e o grava
 * em src/data/launch-overrides.json (consumido por launchMap.ts e pelo xlsx).
 *
 * Escopo: itens "Lançado!" com Tipo de lançamento Novidade OU Novas Cores.
 * Matching Monday↔dashboard (STOCK_MAP.linha):
 *   1) ALIAS explícito (nomes que divergem demais);
 *   2) match exato normalizado;
 *   3) substring nos dois sentidos, MAS descarta se casar com >2 linhas
 *      (evita over-match de nomes-família genéricos tipo "Necessaire"/"Estojo").
 * Reporta casados / ambíguos / sem-match pra curadoria.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const cal = require(path.join(ROOT, 'src/data/launch-calendar-2025.json'));
const d = require(path.join(ROOT, 'public/data/processed-data.json'));

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Aliases: substring do core normalizado do Monday -> nome EXATO da linha.
// Cobre itens "(Novas Cores)"/variantes cujo nome diverge do cadastro.
// NB: evitar aliases que apontem uma "Novidade" (novo tamanho/geração) para uma
// LINHA JÁ ESTABELECIDA — isso absorveria toda a base histórica da linha.
// (Bolsa de viagem Joy 2.0→Bolsa Joy, Mala Trip P1→Mala Trip 20", Infinite→Case
// Infinite foram removidos por esse motivo.) Aliases abaixo são só p/ Novas Cores
// (que hoje NÃO entram no calendar2025) — mantidos como referência inócua.
const ALIAS = {
  'mochila 4 rodinhas fun': 'Mochila Rodinha Fun',
  'copo vibe': 'Copo Vibe 470ml',
  'garrafa urban': 'Garrafa urban 500ml',
  'garrafa mini': 'Garrafa Mini 350ml',
  'bolsa tote shopper': 'Tote Colors', // Novidade dez/25 (confirmado pelo João)
};
// Adições MANUAIS: lançamentos confirmados pelo João que NÃO estão no export do
// Monday (ou cuja linha o join não pega). Linha exata do STOCK_MAP -> mês oficial.
// Sobrepõem/estendem o que vem do calendário.
const MANUAL = {
  'Bolsa Voyage': '2025-02', // família Voyage (Mochila/Necessaire Voyage = fev/25)
};
// Override por SKU: drops de cor cujos SKUs venderam já em jan/25 (censura) e
// portanto a 1ª venda não capta. SKU exato -> mês oficial do drop. Entram mesmo
// com 1ª venda < fev/25. NÃO usar a linha inteira (absorveria cores antigas).
const MANUAL_SKUS = {
  'Tote Bag Marrom': '2025-03',            // drop Tote daily mar/25
  'Tote Bag Bege com Caramelo': '2025-03', // drop Tote daily mar/25 ("bege com marrom")
  'Mochila Rodinha BTS Rose': '2025-07',   // drop Mochila 4 Rodinhas Fun (Rosé) jul/25
};
const COLLAB_TERMS = ['mickey', 'minnie', 'flutuante'];
const EXCLUDE_CATEGORIES = ['Spare Part'];
// Linhas específicas ocultadas do mapa (não são lançamento de produto).
const EXCLUDE_LINES = ['Skin Gocase', 'Skin Borders'];

const spareLines = new Set(Object.values(d.STOCK_MAP).filter((s) => EXCLUDE_CATEGORIES.includes(s.categoria)).map((s) => s.linha));
// Candidatos = linhas NÃO-spare (senão Haste/Tampa/Base inflam a contagem e
// derrubam matches bons como Taça Térmica / Garrafa Magsafe).
const lines = [...new Set(Object.values(d.STOCK_MAP).map((s) => s.linha).filter(Boolean))].filter((l) => !spareLines.has(l));
const nLines = lines.map((l) => ({ l, n: norm(l) }));

// core = nome sem bandeira e sem [CATEGORIA]; PARÊNTESES MANTIDOS (viram palavras),
// pra "Copo Life (880mL)" casar com "Copo Life 880ml".
const coreOf = (raw) => norm(raw.replace(/🇧🇷/g, '').replace(/^\s*\[[^\]]*\]\s*/, ''));

// Escopo do calendar2025 (linha -> mês oficial do Monday): TUDO que é Lançado!
// e não é Facelift — ou seja, Novidade + Novas Cores + itens sem tag.
// Decisão do João (2026-07-13): drop de cor entra como a LINHA no mês do Monday
// (automático/completo). Aceita superestimar receita, pois o dado não separa as
// cores novas do drop das cores antigas (todas vendem em jan/25 na base).
// Facelift (redesign) segue fora. Drops de linha em Facelift (ex.: Tote daily)
// entram por manualSkus quando os SKUs são identificáveis.
const scope = cal.items.filter((x) => x.status === 'Lançado!' && !/facelift/i.test(x.tipo));

const map = {};          // linha -> mês (mais cedo)
const meta = {};         // linha -> { mes, tipo: 'A'(Nova Linha) | 'B'(Drop de Cor) }
const ambiguous = [], unmatched = [];
// tipo A = Novidade ou sem tag (linha nova); B = Novas Cores (drop). A vence no empate.
const tipoOf = (t) => /novas cores/i.test(t) ? 'B' : 'A';
const put = (line, mes, tipo) => {
  if (!map[line] || mes < map[line]) map[line] = mes;
  if (!meta[line]) meta[line] = { mes, tipo };
  else { if (mes < meta[line].mes) meta[line].mes = mes; if (tipo === 'A') meta[line].tipo = 'A'; }
};

for (const x of scope) {
  const c = coreOf(x.raw);
  const tp = tipoOf(x.tipo);
  // 1) alias
  const aliasKey = Object.keys(ALIAS).find((k) => c.includes(k));
  if (aliasKey) { put(ALIAS[aliasKey], x.mes, tp); continue; }
  if (!c) { unmatched.push(x.raw); continue; }
  // 2) exato
  const exact = nLines.filter((o) => o.n === c);
  if (exact.length) { exact.forEach((o) => put(o.l, x.mes, tp)); continue; }
  // 3) substring nos dois sentidos, com teto de 2 candidatos
  const subs = nLines.filter((o) => o.n.includes(c) || c.includes(o.n));
  if (subs.length === 0) { unmatched.push(x.raw); continue; }
  if (subs.length > 2) { ambiguous.push(`${x.raw}  ->  [${subs.map((o) => o.l).join(', ')}]`); continue; }
  subs.forEach((o) => put(o.l, x.mes, tp));
}

// adições manuais (fora do Monday) — sobrepõem/estendem o join (tipo A = linha nova)
for (const [l, m] of Object.entries(MANUAL)) { map[l] = m; meta[l] = { mes: m, tipo: 'A' }; }

// remove spare parts do mapa final (excluídas do mapa de qq forma)
const clean = {};
const cleanMeta = {};
Object.keys(map).sort().forEach((l) => { if (!spareLines.has(l)) { clean[l] = map[l]; cleanMeta[l] = meta[l]; } });

const ov = {
  _doc: 'Fonte única de curadoria do Mapa de lançamentos (front src/data/launchMap.ts + gerador scripts/build-launch-map-xlsx.cjs). Regenerar: node scripts/gen-launch-overrides.cjs',
  since: '2025-02',
  _calendar2025_doc: 'Linha -> mês de lançamento OFICIAL (Monday "⭐️ lançamentos 2025", escopo Novidade+Novas Cores). Sobrepõe a 1ª venda (censurada em jan/25).',
  calendar2025: clean,
  _calendar2025Meta_doc: 'Linha -> { mes, tipo: A (Nova Linha) | B (Drop de Cor) }. Usado pelos relatórios semestrais.',
  calendar2025Meta: cleanMeta,
  _manualSkus_doc: 'Override por SKU (drops de cor censurados em jan/25). SKU exato -> mês do drop. Entram mesmo com 1ª venda < since.',
  manualSkus: MANUAL_SKUS,
  _excludeCollabTerms_doc: 'Termos (case/acento-insensível) de estampas/coleções temáticas removidas por nome do SKU.',
  excludeCollabTerms: COLLAB_TERMS,
  _excludeCategories_doc: 'Categorias inteiras ocultadas.',
  excludeCategories: EXCLUDE_CATEGORIES,
  _excludeLines_doc: 'Linhas específicas ocultadas (não são lançamento de produto).',
  excludeLines: EXCLUDE_LINES,
};
fs.writeFileSync(path.join(ROOT, 'src/data/launch-overrides.json'), JSON.stringify(ov, null, 2));

console.log(`Escopo (Lançado! · Novidade+Novas Cores): ${scope.length}`);
console.log(`Linhas mapeadas: ${Object.keys(clean).length}`);
Object.entries(clean).sort((a, b) => (a[1] < b[1] ? -1 : 1)).forEach(([l, m]) => console.log(`  ${m}  ${l}`));
console.log(`\nAMBÍGUOS (>2 linhas, descartados): ${ambiguous.length}`);
ambiguous.forEach((a) => console.log('  ' + a));
console.log(`\nSEM MATCH: ${unmatched.length}`);
unmatched.forEach((u) => console.log('  ' + u));

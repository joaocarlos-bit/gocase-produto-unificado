/*
 * refresh-import-costs.cjs — regenera public/data/import-costs.json a partir da
 * planilha "Controle de Importações.xlsx" (aba "Controle PLs").
 *
 * Uso: node scripts/refresh-import-costs.cjs
 *      ou: npm run refresh-import
 *
 * Fonte: arquivo .xlsx local (a planilha é mantida manualmente pelo time de
 * Supply/Importação e baixada na pasta Downloads). Caminho configurável via env
 * IMPORT_FILE_LOCAL em .env.local; default = ~/Downloads/Controle de Importações.xlsx.
 *
 * Recorte (definido com a squad): histórico de custos POR LINHA de produto.
 * Para cada linha × mês de embarque agrega (média ponderada por quantidade):
 *   - Custo FOB        (col F, US$/un)  → o "histórico de FOB" pedido
 *   - Custo BB S/ IPI  (col I, R$/un)
 *   - Custo BB c/ IPI  (col Z, R$/un)
 *   - Custo Gocom      (col AC, R$/un)
 * Eixo de tempo = "Entrega Itapeva" (col O, data) agrupada em YYYY-MM.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// ── .env.local (sem dependência) ─────────────────────────────────────────
function loadEnv() {
  const p = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const SHEET_NAME = 'Controle PLs';
const DEFAULT_FILE = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'Controle de Importações.xlsx',
);
const FILE = process.env.IMPORT_FILE_LOCAL || DEFAULT_FILE;
const OUT = path.resolve(__dirname, '../public/data/import-costs.json');

if (!fs.existsSync(FILE)) {
  console.error(`✗ Arquivo não encontrado: ${FILE}`);
  console.error('  Defina IMPORT_FILE_LOCAL em .env.local ou coloque "Controle de Importações.xlsx" em Downloads.');
  process.exit(1);
}

// ── Resolve colunas por NOME do cabeçalho (robusto a reordenação) ──────────
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
// nome canônico → lista de cabeçalhos aceitos (normalizados) + índice de fallback
const FIELDS = {
  processo:   { names: ['processo'],                          idx: 0 },
  pl:         { names: ['no da pl', 'nº da pl', 'n da pl'],    idx: 2 },
  qtd:        { names: ['quantidade'],                        idx: 4 },
  fob:        { names: ['custo fob'],                         idx: 5 },
  bbSemIpi:   { names: ['custo bb s/ ipi', 'custo bb s/ipi', 'custo bb sem ipi'], idx: 8 },
  status:     { names: ['status da pl'],                      idx: 9 },
  entrega:    { names: ['entrega itapeva'],                   idx: 14 },
  fornecedor: { names: ['fornecedor'],                        idx: 18 },
  linha:      { names: ['linha'],                             idx: 19 },
  bbComIpi:   { names: ['custo bb c/ ipi', 'custo bb c/ipi', 'custo bb com ipi'], idx: 25 },
  gocom:      { names: ['custo gocom', 'custo gocom '],       idx: 28 },
};

function resolveCols(headerRow) {
  const byName = {};
  headerRow.forEach((h, i) => { const n = norm(h); if (n && !(n in byName)) byName[n] = i; });
  const cols = {};
  for (const [key, def] of Object.entries(FIELDS)) {
    let found = null;
    for (const cand of def.names) { if (cand in byName) { found = byName[cand]; break; } }
    cols[key] = found != null ? found : def.idx;
  }
  return cols;
}

// ── Parsers ────────────────────────────────────────────────────────────────
function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
function toYm(v) {
  let d = null;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400 * 1000)); // serial Excel
  else if (typeof v === 'string') { const t = Date.parse(v); if (!isNaN(t)) d = new Date(t); }
  if (!d || isNaN(d)) return null;
  const y = d.getUTCFullYear();
  if (y < 2020 || y > 2035) return null; // descarta epoch 1899 e lixo
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const isBlankLinha = (s) => {
  const n = norm(s);
  return !n || n === 'sem linha' || n.includes('#n/a') || n === 'n/a' || n === '-';
};

// ── Leitura ──────────────────────────────────────────────────────────────
console.log(`→ Lendo ${FILE}`);
const wb = XLSX.readFile(FILE, { cellDates: true });
const ws = wb.Sheets[SHEET_NAME];
if (!ws) { console.error(`✗ Aba "${SHEET_NAME}" não encontrada. Abas: ${wb.SheetNames.join(', ')}`); process.exit(1); }

const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
const cols = resolveCols(aoa[0] || []);

// Acumuladores por linha×mês. Cada métrica soma value*peso e peso (peso = qtd>0).
function newCell() {
  return {
    qtd: 0, nRows: 0, plSet: new Set(),
    fob:      { wSum: 0, w: 0, sSum: 0, n: 0 },
    bbSemIpi: { wSum: 0, w: 0, sSum: 0, n: 0 },
    bbComIpi: { wSum: 0, w: 0, sSum: 0, n: 0 },
    gocom:    { wSum: 0, w: 0, sSum: 0, n: 0 },
  };
}
function addMetric(m, val, qty) {
  if (val == null || val <= 0) return;
  m.sSum += val; m.n += 1;
  if (qty > 0) { m.wSum += val * qty; m.w += qty; }
}
const avg = (m) => (m.w > 0 ? m.wSum / m.w : m.n > 0 ? m.sSum / m.n : null);

// Acumulador por fornecedor (agregado do histórico inteiro da linha)
function newForn() {
  return {
    qtd: 0, plSet: new Set(), ymMin: null, ymMax: null,
    fob:      { wSum: 0, w: 0, sSum: 0, n: 0 },
    bbSemIpi: { wSum: 0, w: 0, sSum: 0, n: 0 },
    bbComIpi: { wSum: 0, w: 0, sSum: 0, n: 0 },
    gocom:    { wSum: 0, w: 0, sSum: 0, n: 0 },
  };
}

const byLinha = new Map(); // linha -> { fornecedores:Set, plSet:Set, qtd, cells: Map<ym, cell> }
let total = 0, usedRows = 0, skipNoLinha = 0, skipNoDate = 0;
const fornecedoresAll = new Set();
const monthsAll = new Set();
const plsAll = new Set();

for (let r = 1; r < aoa.length; r++) {
  const row = aoa[r];
  if (!row) continue;
  const linhaRaw = row[cols.linha];
  const fobRaw = row[cols.fob];
  if ((linhaRaw == null || linhaRaw === '') && (fobRaw == null || fobRaw === '')) continue; // linha vazia
  total++;

  if (isBlankLinha(linhaRaw)) { skipNoLinha++; continue; }
  const ym = toYm(row[cols.entrega]);
  if (!ym) { skipNoDate++; continue; }

  const linha = String(linhaRaw).trim();
  const qty = toNum(row[cols.qtd]) || 0;
  const fornecedor = row[cols.fornecedor] != null ? String(row[cols.fornecedor]).trim() : '';
  const pl = row[cols.pl] != null ? String(row[cols.pl]).trim() : '';

  if (!byLinha.has(linha)) byLinha.set(linha, { fornecedores: new Set(), plSet: new Set(), qtd: 0, cells: new Map(), forn: new Map() });
  const L = byLinha.get(linha);
  if (fornecedor) { L.fornecedores.add(fornecedor); fornecedoresAll.add(fornecedor); }
  if (pl) { L.plSet.add(pl); plsAll.add(pl); }
  L.qtd += qty;

  // Agrega custos por FORNECEDOR (histórico inteiro da linha, média ponderada por qtd)
  if (fornecedor) {
    if (!L.forn.has(fornecedor)) L.forn.set(fornecedor, newForn());
    const fc = L.forn.get(fornecedor);
    fc.qtd += qty; if (pl) fc.plSet.add(pl);
    if (fc.ymMin == null || ym < fc.ymMin) fc.ymMin = ym;
    if (fc.ymMax == null || ym > fc.ymMax) fc.ymMax = ym;
    addMetric(fc.fob, toNum(fobRaw), qty);
    addMetric(fc.bbSemIpi, toNum(row[cols.bbSemIpi]), qty);
    addMetric(fc.bbComIpi, toNum(row[cols.bbComIpi]), qty);
    addMetric(fc.gocom, toNum(row[cols.gocom]), qty);
  }

  if (!L.cells.has(ym)) L.cells.set(ym, newCell());
  const c = L.cells.get(ym);
  c.qtd += qty; c.nRows += 1; if (pl) c.plSet.add(pl);
  addMetric(c.fob, toNum(fobRaw), qty);
  addMetric(c.bbSemIpi, toNum(row[cols.bbSemIpi]), qty);
  addMetric(c.bbComIpi, toNum(row[cols.bbComIpi]), qty);
  addMetric(c.gocom, toNum(row[cols.gocom]), qty);

  monthsAll.add(ym);
  usedRows++;
}

// ── Monta payload ──────────────────────────────────────────────────────────
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const outByLinha = {};
for (const [linha, L] of byLinha) {
  const series = [...L.cells.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, c]) => ({
      ym,
      qtd: Math.round(c.qtd),
      nPLs: c.plSet.size,
      fob: round(avg(c.fob), 3),
      bbSemIpi: round(avg(c.bbSemIpi)),
      bbComIpi: round(avg(c.bbComIpi)),
      gocom: round(avg(c.gocom)),
    }));
  if (!series.length) continue;
  const bySupplier = [...L.forn.entries()]
    .map(([fornecedor, fc]) => ({
      fornecedor,
      qtd: Math.round(fc.qtd),
      nPLs: fc.plSet.size,
      firstYm: fc.ymMin,
      lastYm: fc.ymMax,
      fob: round(avg(fc.fob), 3),
      bbSemIpi: round(avg(fc.bbSemIpi)),
      bbComIpi: round(avg(fc.bbComIpi)),
      gocom: round(avg(fc.gocom)),
    }))
    .sort((a, b) => b.qtd - a.qtd);
  outByLinha[linha] = {
    linha,
    fornecedores: [...L.fornecedores].sort(),
    totalQtd: Math.round(L.qtd),
    nEmbarques: L.plSet.size,
    series,
    bySupplier,
  };
}

const months = [...monthsAll].sort();
const payload = {
  meta: {
    collectedAt: new Date().toISOString(),
    sourceFile: path.basename(FILE),
    sheet: SHEET_NAME,
    totalRows: total,
    usedRows,
    skippedNoLinha: skipNoLinha,
    skippedNoDate: skipNoDate,
    linhasCount: Object.keys(outByLinha).length,
    fornecedoresCount: fornecedoresAll.size,
    embarquesCount: plsAll.size,
    period: months.length ? { from: months[0], to: months[months.length - 1] } : { from: null, to: null },
    months,
  },
  byLinha: outByLinha,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 0), 'utf8');

console.log('✓ import-costs.json gerado');
console.log(`  linhas: ${payload.meta.linhasCount} · embarques(rows usadas): ${usedRows} · fornecedores: ${fornecedoresAll.size}`);
console.log(`  período: ${payload.meta.period.from} → ${payload.meta.period.to} (${months.length} meses)`);
console.log(`  descartadas: ${skipNoLinha} sem linha · ${skipNoDate} sem data válida (de ${total} linhas de dados)`);
console.log(`  arquivo: ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);

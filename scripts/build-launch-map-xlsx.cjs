/**
 * build-launch-map-xlsx.cjs — Mapa de lançamentos por 1ª venda do SKU (xlsx).
 *
 * Metodologia: SKU cuja 1ª venda registrada é >= fev/25 = lançamento (o corte
 * em fev/25 remove a censura à esquerda — a base começa em jan/25). Lê os
 * snapshots já gerados pelo `npm run refresh` (não re-processa a base bruta):
 *   - public/data/processed-data.json  (skuFirstSale, STOCK_MAP, meta.period)
 *   - public/data/sales-by-sku.json    (qtd/receita por SKU × mês)
 *
 * Mantém a MESMA lógica de src/data/launchMap.ts (fonte única no front).
 *
 * Uso: npm run build-launch-map  →  output/mapa-lancamentos-sku.xlsx
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
// Curadoria compartilhada com o front (src/data/launchMap.ts) — fonte única.
const OV = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'launch-overrides.json'), 'utf8'));
const SINCE = OV.since;
const CALENDAR_2025 = OV.calendar2025 || {};
const MANUAL_SKUS = OV.manualSkus || {};
const EXCLUDE_CATEGORIES = new Set(OV.excludeCategories);
const EXCLUDE_LINES = new Set(OV.excludeLines || []);
const COLLAB_RE = new RegExp(OV.excludeCollabTerms.map((t) => `\\b${t}\\b`).join('|'));
function isThemedCollab(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return COLLAB_RE.test(n);
}
const DATA = path.join(ROOT, 'public', 'data');
const OUT_DIR = path.join(ROOT, 'output');
const OUT = path.join(OUT_DIR, 'mapa-lancamentos-2025.xlsx');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function ymLabel(ym) { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]}/${String(y).slice(2)}`; }
function ymIndex(ym) { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); }

function main() {
  const processed = JSON.parse(fs.readFileSync(path.join(DATA, 'processed-data.json'), 'utf8'));
  const skuSales = JSON.parse(fs.readFileSync(path.join(DATA, 'sales-by-sku.json'), 'utf8'));

  const skuFirstSale = processed.skuFirstSale || {};
  const STOCK_MAP = processed.STOCK_MAP || {};
  const salesBySku = skuSales.salesBySku || {};
  const periodTo = processed.meta.period.to;
  const toIdx = ymIndex(periodTo);

  const rows = [];
  for (const [sku, firstSale] of Object.entries(skuFirstSale)) {
    if (!firstSale) continue;
    if (isThemedCollab(sku)) continue;
    const stock = STOCK_MAP[sku] || {};
    if (stock.categoria && EXCLUDE_CATEGORIES.has(stock.categoria)) continue;
    if (stock.linha && EXCLUDE_LINES.has(stock.linha)) continue;
    // Estreia: 1) override por SKU; 2) calendário da linha; 3) 1ª venda.
    const manualSku = MANUAL_SKUS[sku];
    const calMonth = stock.linha ? CALENDAR_2025[stock.linha] : undefined;
    let launchMonth;
    if (manualSku) launchMonth = manualSku;
    else if (calMonth) launchMonth = calMonth;
    else if (firstSale >= SINCE) launchMonth = firstSale;
    else continue;
    const sd = salesBySku[sku];

    let totalQtd = 0, totalReceita = 0, monthsActive = 0, lastSale = null;
    if (sd) {
      totalQtd = sd.totalQtd || 0;
      totalReceita = sd.totalReceita || 0;
      for (const [ym, cell] of Object.entries(sd.months || {})) {
        if (cell.qtd > 0) { monthsActive++; if (!lastSale || ym > lastSale) lastSale = ym; }
      }
    }
    rows.push({
      sku,
      linha: stock.linha || '—',
      categoria: stock.categoria || '—',
      status: stock.status || '—',
      curva: stock.curva || '—',
      firstSale: launchMonth,
      monthsSinceLaunch: toIdx - ymIndex(launchMonth) + 1,
      monthsActive,
      lastSale,
      totalQtd,
      totalReceita,
      ticketMedio: totalQtd > 0 ? totalReceita / totalQtd : 0,
      estoqueTotal: stock.estoqueTotal || 0,
      custo: stock.custo || 0,
    });
  }
  rows.sort((a, b) => (a.firstSale < b.firstSale ? 1 : a.firstSale > b.firstSale ? -1 : b.totalReceita - a.totalReceita));

  // ── Aba 1: Lançamentos por SKU ────────────────────────────────────────────
  const aoa = [[
    'Mês estreia', 'Estreia (AAAA-MM)', 'SKU', 'Linha', 'Categoria', 'Status', 'Curva',
    'Qtd acumulada', 'Receita acumulada (R$)', 'Ticket médio (R$)', 'Meses ativos',
    'Meses desde estreia', 'Última venda', 'Estoque atual', 'Custo unit. (R$)',
  ]];
  for (const r of rows) {
    aoa.push([
      ymLabel(r.firstSale), r.firstSale, r.sku, r.linha, r.categoria, r.status, r.curva,
      r.totalQtd, round2(r.totalReceita), round2(r.ticketMedio), r.monthsActive,
      r.monthsSinceLaunch, r.lastSale || '', r.estoqueTotal, round2(r.custo),
    ]);
  }
  const wsMain = XLSX.utils.aoa_to_sheet(aoa);
  wsMain['!cols'] = [10, 14, 42, 26, 12, 16, 7, 13, 18, 15, 12, 16, 12, 12, 14].map((w) => ({ wch: w }));
  wsMain['!freeze'] = { xSplit: 0, ySplit: 1 };
  wsMain['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: 14 } }) };

  // ── Aba 2: Coortes por mês de estreia ─────────────────────────────────────
  const byMonth = {};
  for (const r of rows) {
    const k = r.firstSale;
    if (!byMonth[k]) byMonth[k] = { count: 0, receita: 0, qtd: 0 };
    byMonth[k].count++; byMonth[k].receita += r.totalReceita; byMonth[k].qtd += r.totalQtd;
  }
  const cohAoa = [['Mês de estreia', 'AAAA-MM', 'SKUs lançados', 'Qtd acumulada', 'Receita acumulada (R$)']];
  for (const ym of Object.keys(byMonth).sort()) {
    const v = byMonth[ym];
    cohAoa.push([ymLabel(ym), ym, v.count, v.qtd, round2(v.receita)]);
  }
  const wsCoh = XLSX.utils.aoa_to_sheet(cohAoa);
  wsCoh['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 22 }];

  // ── Aba 3: Resumo por categoria ───────────────────────────────────────────
  const byCat = {};
  for (const r of rows) {
    const k = r.categoria;
    if (!byCat[k]) byCat[k] = { count: 0, receita: 0, qtd: 0 };
    byCat[k].count++; byCat[k].receita += r.totalReceita; byCat[k].qtd += r.totalQtd;
  }
  const catAoa = [['Categoria', 'SKUs lançados', 'Qtd acumulada', 'Receita acumulada (R$)']];
  for (const cat of Object.keys(byCat).sort((a, b) => byCat[b].receita - byCat[a].receita)) {
    const v = byCat[cat];
    catAoa.push([cat, v.count, v.qtd, round2(v.receita)]);
  }
  const wsCat = XLSX.utils.aoa_to_sheet(catAoa);
  wsCat['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMain, 'Lançamentos por SKU');
  XLSX.utils.book_append_sheet(wb, wsCoh, 'Coortes por mês');
  XLSX.utils.book_append_sheet(wb, wsCat, 'Por categoria');

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  XLSX.writeFile(wb, OUT);

  const totReceita = rows.reduce((s, r) => s + r.totalReceita, 0);
  const totQtd = rows.reduce((s, r) => s + r.totalQtd, 0);
  console.log(`OK — ${rows.length} SKUs lançados (1ª venda >= ${SINCE}, até ${periodTo}).`);
  console.log(`Receita acumulada: R$ ${totReceita.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} · Qtd: ${totQtd.toLocaleString('pt-BR')}`);
  console.log(`Arquivo: ${OUT}`);
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

main();

/*
 * Extracts SKU-level monthly sales from the original dashboard.html
 * (which embeds the raw sales rows as gzip+base64) and writes
 * public/data/sales-by-sku.json — consumed by the v2 dashboard
 * to show REAL receita/qtd per material (not estimates).
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const HTML_SOURCE = path.resolve(
  __dirname,
  '../../output/2026-05-04-merged-jan25-abr26/dashboard.html',
);
const OUTPUT = path.resolve(__dirname, '../public/data/sales-by-sku.json');

console.log('▶ Reading', HTML_SOURCE);
const html = fs.readFileSync(HTML_SOURCE, 'utf8');
const match = html.match(/window\.__EMBEDDED_DATA_GZ__\s*=\s*"([^"]+)"/);
if (!match) {
  console.error('✗ window.__EMBEDDED_DATA_GZ__ not found');
  process.exit(1);
}
const buf = Buffer.from(match[1], 'base64');
console.log(`  compressed: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
const decompressed = zlib.gunzipSync(buf);
console.log(`  decompressed: ${(decompressed.length / 1024 / 1024).toFixed(2)} MB`);
const payload = JSON.parse(decompressed.toString('utf8'));
console.log(`  snapshot ts: ${payload.ts}`);
console.log(`  sales rows: ${payload.sales.length - 1}`); // -1 for header

const salesHeaders = payload.sales[0];
const salesRows = payload.sales.slice(1);
console.log(`  headers: ${salesHeaders.join(' · ')}`);

function indexOf(names) {
  for (const n of names) {
    const i = salesHeaders.indexOf(n);
    if (i !== -1) return i;
  }
  return -1;
}

const I_SKU   = indexOf(['SKU Único', 'SKU Unico', 'SKU Atual', 'sku']);
const I_LINHA = indexOf(['Linha', 'linha']);
const I_QTD   = indexOf(['Quantidade de Vendas', 'Quantidade', 'Qtd', 'qtd']);
const I_FAT   = indexOf(['Faturamento', 'Receita Produto (pós-desconto)', 'Receita Produto', 'Receita']);
const I_VAL   = indexOf(['Valor Unitário', 'Valor Unitario', 'Preço', 'Preco']);
const I_DATA  = indexOf(['Data', 'DATA', 'Date', 'date', 'Período', 'Periodo', 'Dia']);
const I_MES   = indexOf(['Mês', 'Mes', 'mês']);
const I_ANO   = indexOf(['Ano', 'ano']);

console.log(`  cols → SKU=${I_SKU} Linha=${I_LINHA} Qtd=${I_QTD} Fat=${I_FAT} Val=${I_VAL} Data=${I_DATA} Mes=${I_MES} Ano=${I_ANO}`);

if (I_SKU === -1) {
  console.error('✗ SKU column not found in sales headers');
  process.exit(1);
}

function pNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).replace(/ /g, '').replace(/\s+/g, '');
  // Trata pt-BR vs en-US
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  s = s.replace(/[^0-9+\-\.]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function pInt(v) {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/[^0-9+\-]/g, '');
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseYm(dataStr, mes, ano) {
  // Tenta formato ISO primeiro
  if (dataStr) {
    const s = String(dataStr).trim();
    let m = s.match(/^(\d{4})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}`;
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
      // Assume dd/mm/yyyy (pt-BR)
      let mm = +m[2];
      if (m[2].length > 2) return null;
      // Se primeiro número > 12, é dd; senão pode ser mm.
      // Default: dd/mm/yyyy
      if (+m[1] > 12 && +m[2] <= 12) mm = +m[2];
      else if (+m[2] > 12 && +m[1] <= 12) mm = +m[1];
      return `${m[3]}-${String(mm).padStart(2, '0')}`;
    }
    // Excel serial date
    if (/^\d+(?:\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (n > 30000 && n < 60000) {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        const d = new Date(epoch.getTime() + Math.floor(n) * 86400000);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      }
    }
  }
  // Fallback: colunas Mês + Ano
  if (mes && ano) {
    return `${ano}-${String(mes).padStart(2, '0')}`;
  }
  return null;
}

const salesBySku = {};      // { [sku]: { months: { [ym]: { qtd, receita } }, totalQtd, totalReceita } }
const linhaBySku = {};       // { [sku]: linha } — pra cross-check
let skipped = 0;
let valid = 0;

for (const row of salesRows) {
  const sku = I_SKU !== -1 ? String(row[I_SKU] || '').trim() : '';
  if (!sku) { skipped++; continue; }

  const qtd = I_QTD !== -1 ? pNum(row[I_QTD]) : 0;
  let fat = I_FAT !== -1 ? pNum(row[I_FAT]) : 0;
  if (!fat && I_VAL !== -1) fat = qtd * pNum(row[I_VAL]);
  if (qtd <= 0 && fat <= 0) { skipped++; continue; }

  const dataStr = I_DATA !== -1 ? row[I_DATA] : '';
  const mes = I_MES !== -1 ? pInt(row[I_MES]) : 0;
  const ano = I_ANO !== -1 ? pInt(row[I_ANO]) : 0;
  const ym = parseYm(dataStr, mes, ano);
  if (!ym) { skipped++; continue; }

  if (!salesBySku[sku]) salesBySku[sku] = { months: {}, totalQtd: 0, totalReceita: 0 };
  if (!salesBySku[sku].months[ym]) salesBySku[sku].months[ym] = { qtd: 0, receita: 0 };
  salesBySku[sku].months[ym].qtd += qtd;
  salesBySku[sku].months[ym].receita += fat;
  salesBySku[sku].totalQtd += qtd;
  salesBySku[sku].totalReceita += fat;

  if (I_LINHA !== -1 && !linhaBySku[sku]) {
    const lin = String(row[I_LINHA] || '').trim();
    if (lin) linhaBySku[sku] = lin;
  }

  valid++;
}

console.log(`✓ Processed: ${valid.toLocaleString('pt-BR')} valid · ${skipped.toLocaleString('pt-BR')} skipped`);
console.log(`✓ SKUs únicos: ${Object.keys(salesBySku).length}`);

// Round to keep JSON small
for (const sku of Object.keys(salesBySku)) {
  const data = salesBySku[sku];
  data.totalQtd = Math.round(data.totalQtd * 100) / 100;
  data.totalReceita = Math.round(data.totalReceita * 100) / 100;
  for (const ym of Object.keys(data.months)) {
    data.months[ym].qtd = Math.round(data.months[ym].qtd * 100) / 100;
    data.months[ym].receita = Math.round(data.months[ym].receita * 100) / 100;
  }
}

const out = {
  ts: payload.ts,
  sourceRows: salesRows.length,
  validRows: valid,
  skippedRows: skipped,
  skuCount: Object.keys(salesBySku).length,
  salesBySku,
};

fs.writeFileSync(OUTPUT, JSON.stringify(out));
const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(2);
console.log(`✓ Wrote ${OUTPUT} (${sizeMB} MB)`);

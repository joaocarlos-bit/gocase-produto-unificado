/*
 * refresh-estoque-canais.cjs — snapshot do estoque por canais/locais.
 * Fonte: Google Sheet (gid 1542625543) via export CSV (server-side, sem CORS;
 * o gviz client-side trunca por causa de filtro ativo na planilha).
 * Escreve public/data/estoque-canais.json (por SKU).
 *
 * Uso: node scripts/refresh-estoque-canais.cjs  (ou: npm run refresh-estoque)
 *
 * Cabeçalho de 3 linhas mescladas → lemos por ÍNDICE de coluna.
 * Números vêm em pt-BR ("8.175" = 8175) → parse removendo ponto de milhar.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SHEET_ID = '1FdmE1CvAusXk3DwjfhyKZ8acF1xLzczlzhaPH3-ack8';
const GID = '1542625543';
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const OUT = path.resolve(__dirname, '../public/data/estoque-canais.json');

function fetchCsv(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(fetchCsv(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// CSV parser quote-aware (RFC 4180): retorna array de linhas (array de campos).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignora */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const brNum = (s) => {
  const t = String(s == null ? '' : s).trim();
  if (!t || t === '#N/A' || t === '-') return 0;
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const str = (s) => { const t = String(s == null ? '' : s).trim(); return t === '#N/A' ? '' : t; };

async function main() {
  console.log('→ Baixando CSV do estoque…');
  const csv = await fetchCsv(URL);
  const all = parseCsv(csv);
  console.log(`  linhas no CSV: ${all.length}`);
  // 3 linhas de cabeçalho (grupos / números / nomes) → dados a partir da linha 4 (idx 3)
  const dataRows = all.slice(3).filter((r) => (r[1] || '').trim() && (r[1] || '').trim() !== '#N/A');

  const rows = dataRows.map((r) => ({
    linha: str(r[0]),
    item: str(r[1]),
    categoria: str(r[2]),
    curva: str(r[3]),
    status: str(r[4]),
    chave: str(r[5]),
    totalStock: brNum(r[6]),      // Total Stock
    extrema: brNum(r[7]),         // Estoque [Extrema]
    itapevaTotal: brNum(r[8]),    // Itapeva [Total]
    itapevaB2B: brNum(r[11]),     // Itapeva [B2B]
    extremaB2B: brNum(r[13]),     // Extrema [B2B]
    disponibilidade: str(r[18]),  // Disponibilidade
    ruptura: str(r[27]),          // Ruptura (data prevista ou 0)
    followUp: str(r[28]),         // Follow Up
    pls: str(r[29]),              // Pls
  }));

  const payload = {
    meta: { collectedAt: new Date().toISOString(), sourceGid: GID, count: rows.length },
    rows,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload), 'utf8');

  const totalStock = rows.reduce((s, r) => s + r.totalStock, 0);
  console.log(`✓ estoque-canais.json gerado: ${rows.length} SKUs · estoque total ${totalStock.toLocaleString('pt-BR')}`);
  console.log(`  categorias: ${new Set(rows.map((r) => r.categoria).filter(Boolean)).size} · arquivo: ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}
main().catch((e) => { console.error('✗ Falhou:', e.message); process.exit(1); });

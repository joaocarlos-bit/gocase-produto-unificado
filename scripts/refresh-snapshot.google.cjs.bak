/*
 * refresh-snapshot.cjs — regenera processed-data.json + sales-by-sku.json
 * puxando dados frescos da Sheets API.
 *
 * Uso: node scripts/refresh-snapshot.cjs
 *      ou: npm run refresh
 *
 * Replica a lógica do refreshData() embarcado no dashboard.html original.
 */

const fs = require('fs');
const path = require('path');

// ── Config (mesmas chaves e sheets do dashboard antigo) ─────────────────
const API_KEY    = 'AIzaSyC6g4xMmecyJjQlJcWkGtjODF_9TWMqc3w';
const SHEET_ID   = '1mHnQXMOLom4QPQ9dZOUi48XCbK9rU-LSEJWKVTpevPQ';
const FC_SHEET_ID = '1P2G1yC819E1mHj5Necn45IQmBgAiW0pwRDz05Vnbwrs';
const HIST_SHEET_ID = '1ilxdmN6WSbM8mXjK9AD4gQqsTqU1Dpw1QoVklpItQO8';
const HIST_RANGE = ['2025-01', '2025-03']; // backfill via gviz

const OUT_PROCESSED  = path.resolve(__dirname, '../public/data/processed-data.json');
const OUT_SKU_SALES  = path.resolve(__dirname, '../public/data/sales-by-sku.json');

// ── Fetch helpers ───────────────────────────────────────────────────────

async function fetchSheetAPI(sheetId, sheetName, range = 'A1:ZZ100000') {
  const fullRange = encodeURIComponent(sheetName + '!' + range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${fullRange}?key=${API_KEY}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ao buscar "${sheetName}": ${txt.slice(0, 200)}`);
  }
  const json = await resp.json();
  const values = json.values || [];
  if (!values.length) return [];
  const headers = values[0].map((h) => String(h).trim());
  return values.slice(1)
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]) : ''; });
      return obj;
    })
    .filter((r) => Object.values(r).some((v) => v !== ''));
}

/** Backfill histórico via gviz (filtro server-side por Mês/Ano). */
async function fetchHistoricViaGviz(fromYm, toYm) {
  const [fromY, fromM] = fromYm.split('-').map(Number);
  const [toY, toM] = toYm.split('-').map(Number);
  let where;
  if (fromY === toY) {
    where = `K = ${fromY} and J >= ${fromM} and J <= ${toM}`;
  } else {
    const parts = [`(K = ${fromY} and J >= ${fromM})`];
    for (let y = fromY + 1; y < toY; y++) parts.push(`(K = ${y})`);
    parts.push(`(K = ${toY} and J <= ${toM})`);
    where = parts.join(' or ');
  }
  const query = `select * where ${where}`;
  const url = `https://docs.google.com/spreadsheets/d/${HIST_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent('Sales_refined')}&headers=1&tq=${encodeURIComponent(query)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`gviz HTTP ${resp.status}`);
  const text = await resp.text();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('gviz: resposta inválida');
  const data = JSON.parse(text.slice(start, end + 1));
  if (data.status === 'error') {
    const msg = (data.errors && data.errors[0] && data.errors[0].message) || 'unknown';
    throw new Error(`gviz: ${msg}`);
  }
  const colNames = (data.table.cols || []).map((c) => String(c.label || c.id || '').trim());
  return (data.table.rows || []).map((r) => {
    const obj = {};
    (r.c || []).forEach((cell, i) => {
      let v = '';
      if (cell) {
        if (cell.f !== undefined && cell.f !== null) v = String(cell.f);
        else if (cell.v !== undefined && cell.v !== null) v = String(cell.v);
      }
      obj[colNames[i]] = v;
    });
    return obj;
  }).filter((r) => Object.values(r).some((v) => v !== ''));
}

// ── Number / date parsers (pt-BR aware) ─────────────────────────────────

function pNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).replace(/ /g, '').replace(/\s+/g, '');
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

function _col(row, names) {
  for (const n of names) {
    if (row && Object.prototype.hasOwnProperty.call(row, n) && row[n] !== '') return row[n];
  }
  return '';
}

function parseRowDate(raw, mes, ano) {
  const fallback = (mes && ano) ? `${ano}-${String(mes).padStart(2, '0')}-01` : '';
  if (raw == null) return fallback;
  let s = String(raw).trim().replace(/\s+/g, ' ');
  if (!s) return fallback;

  const normalize = (yyyy, mm, dd) => {
    const y = Number(yyyy), m = Number(mm), d = Number(dd);
    if (!y || !m || !d) return fallback;
    const utc = new Date(Date.UTC(y, m - 1, d));
    if (utc.getUTCFullYear() !== y || utc.getUTCMonth() + 1 !== m || utc.getUTCDate() !== d) return fallback;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[T\s].+$/.test(s)) {
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return normalize(iso[1], iso[2], iso[3]);
  }
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}(?:\s.+)?$/.test(s)) {
    const base = s.split(' ')[0];
    const parts = base.split(/[\/\-]/);
    const a = Number(parts[0]), b = Number(parts[1]), c = Number(parts[2]);
    if (parts[0].length === 4) return normalize(a, b, c);
    if (a > 12 && b <= 12) return normalize(c, b, a);
    if (b > 12 && a <= 12) return normalize(c, a, b);
    if (mes && Number(mes) === a) return normalize(c, a, b);
    if (mes && Number(mes) === b) return normalize(c, b, a);
    return normalize(c, b, a);
  }
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}(?:\s.+)?$/.test(s)) {
    const base = s.split(' ')[0];
    const parts = base.split(/[\/\-]/);
    const a = Number(parts[0]), b = Number(parts[1]), yy = String(parts[2]).padStart(2, '0');
    const yyyy = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
    if (a > 12 && b <= 12) return normalize(yyyy, b, a);
    if (b > 12 && a <= 12) return normalize(yyyy, a, b);
    if (mes && Number(mes) === a) return normalize(yyyy, a, b);
    if (mes && Number(mes) === b) return normalize(yyyy, b, a);
    return normalize(yyyy, b, a);
  }
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 30000 && n < 60000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + Math.floor(n) * 86400000);
      return normalize(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return normalize(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return fallback;
}

// ── Main ────────────────────────────────────────────────────────────────

// ── Canal → Grupo (D2C / B2B / Lojas / Brindes) ───────────────────────
// Brindes = tudo com receita ~0 (influenciadores, prototipos, bonificações).
const CANAL_TO_GRUPO = {
  'Varejo':                        'D2C',
  'Resellers Brasil (Extrema)':    'B2B',
  'Totem Iguatemi Store In Loco':  'Lojas',
  'Totem Iguatemi Store':          'Lojas',
  'Loja Parkshopping Brasília':    'Lojas',
  'Loja Analia Franco SP':         'Lojas',
};
function classifyCanal(canalRaw) {
  // Vazio → D2C: backfill histórico Jan-Mar/25 via gviz não tem coluna Canal.
  // No dataset atual a coluna sempre vem preenchida (44k+ linhas) — vazio só
  // ocorre nos dados pré-redesign quando Varejo era ~100% das vendas.
  if (!canalRaw) return 'D2C';
  const c = String(canalRaw).trim();
  if (!c) return 'D2C';
  if (CANAL_TO_GRUPO[c]) return CANAL_TO_GRUPO[c];
  // Canais não mapeados (Influenciadores, Prototipos, Bonificações, Requests,
  // Outros, People*, Ilustra*) caem em Brindes — receita ~0, qtd inflacionando.
  return 'Brindes';
}
const GRUPOS = ['D2C', 'B2B', 'Lojas', 'Brindes'];

async function main() {
  console.log('▶ Buscando Sales…');
  let salesCurrent = [];
  for (const sheetName of ['Sales_refined', 'Sales']) {
    try {
      // Range ampliado: A1:N pra pegar Canal (col C) + Faturamento (col M) + Projeção (col N)
      salesCurrent = await fetchSheetAPI(SHEET_ID, sheetName, 'A1:N900000');
      if (salesCurrent.length) { console.log(`  encontrado em "${sheetName}": ${salesCurrent.length} linhas`); break; }
    } catch (e) {
      console.log(`  tentou "${sheetName}": ${e.message.slice(0, 80)}`);
    }
  }

  console.log(`▶ Buscando histórico Jan-Mar/25 via gviz…`);
  let salesHist = [];
  try {
    salesHist = await fetchHistoricViaGviz(HIST_RANGE[0], HIST_RANGE[1]);
    console.log(`  histórico: ${salesHist.length} linhas`);
  } catch (e) {
    console.warn(`  histórico falhou (não-fatal): ${e.message}`);
  }
  // Dedupe: meses já presentes em `salesCurrent` vencem o histórico (a Sales atual
  // tem coluna Canal; o histórico via gviz não tem). Sem isso Jan-Mar/25 dobra.
  const currentMonths = new Set();
  for (const r of salesCurrent) {
    const ano = pInt(_col(r, ['Ano', 'ano']));
    const mes = pInt(_col(r, ['Mês', 'Mes', 'mês']));
    if (ano && mes) currentMonths.add(`${ano}-${String(mes).padStart(2, '0')}`);
  }
  const salesHistFiltered = salesHist.filter((r) => {
    const ano = pInt(_col(r, ['Ano', 'ano']));
    const mes = pInt(_col(r, ['Mês', 'Mes', 'mês']));
    if (!ano || !mes) return true; // sem ano/mês legível: deixa o parser decidir
    return !currentMonths.has(`${ano}-${String(mes).padStart(2, '0')}`);
  });
  if (salesHist.length !== salesHistFiltered.length) {
    console.log(`  dedupe: removidas ${salesHist.length - salesHistFiltered.length} linhas do histórico (meses já em Sales)`);
  }
  const salesRaw = [...salesHistFiltered, ...salesCurrent];
  console.log(`  total sales: ${salesRaw.length}`);

  console.log('▶ Buscando TicketSense…');
  const costsRaw = await fetchSheetAPI(SHEET_ID, 'TicketSense', 'A1:U100000');
  console.log(`  total costs: ${costsRaw.length}`);

  console.log('▶ Buscando SlowMoving…');
  let giroRaw = [];
  for (const name of ['SlowMoving', 'Slow Moving', 'slow moving', 'SLOWMOVING']) {
    try {
      giroRaw = await fetchSheetAPI(SHEET_ID, name, 'A1:P2000');
      if (giroRaw.length) { console.log(`  encontrado em "${name}": ${giroRaw.length} linhas`); break; }
    } catch (_) { /* try next */ }
  }
  console.log(`  total giro: ${giroRaw.length}`);

  console.log('▶ Buscando Forecast [Growth]…');
  const fcRaw = await fetchSheetAPI(FC_SHEET_ID, 'Forecast [Growth]', 'A1:V10000');
  console.log(`  total fc: ${fcRaw.length}`);

  // ── COST_MAP ──────────────────────────────────────────────────────────
  const COST_MAP = {};
  const TICKET_MAP = {};
  for (const r of costsRaw) {
    const lin = _col(r, ['Linha', 'LINHA', 'linha', 'Produto', 'produto']);
    const cu  = pNum(_col(r, ['Custo', 'custo', 'CUSTO', 'Custo Unitário', 'Custo Unitario', 'Custo unitário']));
    if (lin && cu > 0) COST_MAP[lin] = cu;
    if (lin) {
      TICKET_MAP[lin] = {
        status: _col(r, ['Status', 'status']) || '',
        totalForecast: pInt(_col(r, ['Forecast Total', 'Total Forecast', 'forecastTotal'])),
        salesAccumulated: pInt(_col(r, ['Vendas Acumuladas', 'salesAccumulated'])),
        ticketAtual:    _col(r, ['Ticket Atual', 'ticketAtual']),
        ticketHistorico: _col(r, ['Ticket Histórico', 'Ticket Historico', 'ticketHistorico']),
        ticketOrcado:    _col(r, ['Ticket Orçado', 'Ticket Orcado', 'ticketOrcado']),
        custo: cu,
        faturamentoRealizado: pNum(_col(r, ['Faturamento Realizado', 'faturamentoRealizado'])),
        markupPlanejado: _col(r, ['Markup Planejado', 'markupPlanejado']),
        markupAtual:     _col(r, ['Markup Atual', 'markupAtual']),
      };
    }
  }

  // ── FC_MAP ────────────────────────────────────────────────────────────
  const FC_MAP = {};
  const MONTH_PT = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  if (fcRaw.length) {
    const fcHeaders = Object.keys(fcRaw[0] || {});
    const fcYmCols = [];
    fcHeaders.forEach((h) => {
      const norm = h.toLowerCase().replace(/[.\/]/g, '').trim();
      const m = norm.match(/^([a-z]{3})\s*(\d{4})$/);
      if (m) {
        const mon = MONTH_PT[m[1].substring(0, 3)];
        if (mon) fcYmCols.push({ h, ym: `${m[2]}-${String(mon).padStart(2, '0')}` });
      }
    });
    for (const r of fcRaw) {
      const lin = r['Nome da Linha'] || r['Linha'] || r['nome da linha'] || r['linha'] || '';
      const tipo = (r['Projetado'] || r['projetado'] || '').toLowerCase();
      if (!lin || tipo === 'mimo') continue;
      if (!FC_MAP[lin]) FC_MAP[lin] = {};
      fcYmCols.forEach(({ h, ym }) => {
        const v = parseFloat(String(r[h] || '').replace(',', '.')) || 0;
        if (v > 0) FC_MAP[lin][ym] = (FC_MAP[lin][ym] || 0) + v;
      });
    }
  }

  // ── Lookup SKU → Linha (a partir de SlowMoving) ──────────────────────
  // Canais não-Varejo só vêm com SKU Único preenchido (Linha/MacroLinha vazia).
  // Usamos SlowMoving como source-of-truth pra mapear SKU → Linha.
  const skuToLinha = {};
  const skuToCategoria = {};
  for (const r of giroRaw) {
    const sku = _col(r, ['SKU Único', 'SKU Unico', 'SKU Atual', 'SKU', 'sku', 'Nome Único', 'Nome Unico']);
    const linha = _col(r, ['Linha', 'linha']);
    const categoria = _col(r, ['Categoria', 'categoria']);
    if (sku && linha && !skuToLinha[sku]) {
      skuToLinha[sku] = linha;
      if (categoria) skuToCategoria[sku] = categoria;
    }
  }

  // ── Sales processing (salesByLinha + salesBySku) ──────────────────────
  const FAT_COLS = ['Faturamento', 'Receita Produto (pós-desconto)', 'Receita Produto', 'Receita'];
  const VAL_COLS = ['Valor Unitário', 'Valor Unitario', 'Valor Unit', 'Preço', 'Preco'];
  const QTD_COLS = ['Quantidade de Vendas', 'Quantidade', 'Qtd', 'qtd'];

  function getFat(r) {
    const direct = pNum(_col(r, FAT_COLS));
    if (direct > 0) return direct;
    const qtd = pNum(_col(r, QTD_COLS));
    const vu  = pNum(_col(r, VAL_COLS));
    return qtd * vu;
  }

  const salesByLinha = {};
  const salesBySku   = {};
  const linhaFirstSale = {};
  const skuFirstSale = {};
  const linhaSkus = {};

  let validRows = 0;
  let skipped = 0;

  for (const r of salesRaw) {
    let lin = _col(r, ['Linha', 'linha']);
    let cat = _col(r, ['Categoria', 'Categoria Macro (NOVO)', 'Categoria Macro', 'categoria']);
    const sku = _col(r, ['SKU Único', 'SKU Unico', 'SKU Atual', 'sku']);
    const status = _col(r, ['Status', 'status']) || '—';
    const qtd = pNum(_col(r, QTD_COLS));
    const fat = getFat(r);
    // Canais não-Varejo: Linha vem vazia, derivar de skuToLinha via SlowMoving
    if (!lin && sku && skuToLinha[sku]) {
      lin = skuToLinha[sku];
      if (!cat && skuToCategoria[sku]) cat = skuToCategoria[sku];
    }
    if (!lin || (qtd <= 0 && fat <= 0)) { skipped++; continue; }

    const mes = pInt(_col(r, ['Mês', 'Mes', 'mês']));
    const ano = pInt(_col(r, ['Ano', 'ano']));
    const rawDate = _col(r, ['Data', 'DATA', 'Date', 'date', 'Período', 'Periodo', 'Dia', 'dia']);
    const dt = parseRowDate(rawDate, mes, ano);
    if (!dt) { skipped++; continue; }
    const ym = dt.slice(0, 7);

    // Canal → grupo
    const canalRaw = _col(r, ['Canal', 'canal', 'CANAL']);
    const grupo = classifyCanal(canalRaw);

    // salesByLinha (mantém qtd/receita totais pra back-compat; byCanal pra filtro)
    if (!salesByLinha[lin]) salesByLinha[lin] = { categoria: cat || '—', status, months: {} };
    if (!salesByLinha[lin].months[ym]) salesByLinha[lin].months[ym] = { qtd: 0, receita: 0, ticketSum: 0, ticketCount: 0, byCanal: {} };
    const cell = salesByLinha[lin].months[ym];
    cell.qtd += qtd;
    cell.receita += fat;
    if (!cell.byCanal[grupo]) cell.byCanal[grupo] = { qtd: 0, receita: 0 };
    cell.byCanal[grupo].qtd += qtd;
    cell.byCanal[grupo].receita += fat;
    if (qtd > 0) { cell.ticketSum += fat / qtd * 1; cell.ticketCount += 1; }

    // salesBySku
    if (sku) {
      if (!salesBySku[sku]) salesBySku[sku] = { totalQtd: 0, totalReceita: 0, months: {} };
      if (!salesBySku[sku].months[ym]) salesBySku[sku].months[ym] = { qtd: 0, receita: 0, byCanal: {} };
      const sCell = salesBySku[sku].months[ym];
      sCell.qtd += qtd;
      sCell.receita += fat;
      if (!sCell.byCanal[grupo]) sCell.byCanal[grupo] = { qtd: 0, receita: 0 };
      sCell.byCanal[grupo].qtd += qtd;
      sCell.byCanal[grupo].receita += fat;
      salesBySku[sku].totalQtd += qtd;
      salesBySku[sku].totalReceita += fat;

      // first sale
      if (!skuFirstSale[sku] || ym < skuFirstSale[sku]) skuFirstSale[sku] = ym;
      if (!linhaSkus[lin]) linhaSkus[lin] = {};
      linhaSkus[lin][sku] = true;
    }

    if (!linhaFirstSale[lin] || ym < linhaFirstSale[lin]) linhaFirstSale[lin] = ym;
    validRows++;
  }

  console.log(`✓ Processado: ${validRows} válidas · ${skipped} skipped · linhas: ${Object.keys(salesByLinha).length} · SKUs: ${Object.keys(salesBySku).length}`);

  // Round salesBySku
  for (const sd of Object.values(salesBySku)) {
    sd.totalQtd = Math.round(sd.totalQtd * 100) / 100;
    sd.totalReceita = Math.round(sd.totalReceita * 100) / 100;
    for (const cell of Object.values(sd.months)) {
      cell.qtd = Math.round(cell.qtd * 100) / 100;
      cell.receita = Math.round(cell.receita * 100) / 100;
    }
  }

  // ── STOCK_MAP / STOCK_LINHA_MAP ───────────────────────────────────────
  const STOCK_MAP = {};
  const STOCK_LINHA_MAP = {};
  for (const r of giroRaw) {
    const sku = _col(r, ['SKU Único', 'SKU Unico', 'SKU Atual', 'SKU', 'sku', 'Nome Único', 'Nome Unico']);
    const linha = _col(r, ['Linha', 'linha']);
    const categoria = _col(r, ['Categoria', 'categoria']);
    const status = _col(r, ['Status', 'status']) || '—';
    const curva = _col(r, ['Curva ABC', 'Curva', 'curva']) || 'Não Classificado';
    const estoque = pNum(_col(r, ['Estoque', 'Estoque Total', 'Saldo']));
    const custo = pNum(_col(r, ['Custo', 'Custo Unitário', 'custo']));
    // Saída diária — a planilha SlowMoving agora dá só "Média_Diária" (un/dia);
    // usamos esse mesmo valor pra saida3d e saida7d (ambos consumidos como un/dia).
    const mediaDiaria = pNum(_col(r, ['Média_Diária', 'Media_Diaria', 'Média Diária', 'Media Diaria']));
    const saida3d = pNum(_col(r, ['Saída 3d', 'Saida 3d', 'saida3d', 'Saída 3 dias'])) || mediaDiaria;
    const saida7d = pNum(_col(r, ['Saída 7d', 'Saida 7d', 'saida7d', 'Saída 7 dias'])) || mediaDiaria;
    if (!sku) continue;
    STOCK_MAP[sku] = { categoria, linha, status, curva, estoqueTotal: estoque, custo, saida3d, saida7d };
  }
  // Agrega por linha
  for (const s of Object.values(STOCK_MAP)) {
    if (!s.linha) continue;
    if (!STOCK_LINHA_MAP[s.linha]) {
      STOCK_LINHA_MAP[s.linha] = {
        categoria: s.categoria,
        estoqueTotal: 0, curvas: {}, skusCount: 0,
        saida3dTotal: 0, saida7dTotal: 0, dominanteCurva: '', coberturaDias: 0,
      };
    }
    const L = STOCK_LINHA_MAP[s.linha];
    L.estoqueTotal += s.estoqueTotal;
    L.curvas[s.curva] = (L.curvas[s.curva] || 0) + 1;
    L.skusCount += 1;
    L.saida3dTotal += s.saida3d;
    L.saida7dTotal += s.saida7d;
  }
  for (const L of Object.values(STOCK_LINHA_MAP)) {
    let dom = '', max = -1;
    for (const [k, v] of Object.entries(L.curvas)) if (v > max) { dom = k; max = v; }
    L.dominanteCurva = dom;
    L.coberturaDias = L.saida7dTotal > 0 ? Math.round(L.estoqueTotal / L.saida7dTotal * 10) / 10 : 0;
  }

  // ── Launch detection (typeA + typeB) ──────────────────────────────────
  // typeA: linha cujo firstSale é >= snapshot_start (não pré-existente)
  // typeB: linha existente que ganhou SKUs novos depois da linhaFirst
  const SNAPSHOT_START = Object.values(salesByLinha)
    .flatMap((sd) => Object.keys(sd.months))
    .sort()[0] || '';

  const typeA_newLines = [];
  const typeB_extensions = {};
  const existingLines = {};

  for (const [linha, sd] of Object.entries(salesByLinha)) {
    const firstSale = linhaFirstSale[linha];
    if (firstSale && firstSale > SNAPSHOT_START) {
      // Tipo A — apareceu DEPOIS do começo do snapshot
      typeA_newLines.push({
        linha,
        categoria: sd.categoria,
        firstSale,
        status: sd.status,
      });
    } else {
      existingLines[linha] = { categoria: sd.categoria, firstSale: firstSale || '', status: sd.status };
    }

    // Tipo B — SKUs da linha que estrearam DEPOIS da linha
    const skus = linhaSkus[linha] || {};
    const newer = Object.keys(skus)
      .filter((sku) => skuFirstSale[sku] && skuFirstSale[sku] > firstSale)
      .map((sku) => ({ sku, firstSale: skuFirstSale[sku], nomeMaterial: sku }));
    if (newer.length > 0) {
      typeB_extensions[linha] = {
        categoria: sd.categoria,
        linhaFirst: firstSale,
        skus: newer,
      };
    }
  }

  // ── Meta ──────────────────────────────────────────────────────────────
  const yms = Object.values(salesByLinha).flatMap((sd) => Object.keys(sd.months));
  const allYms = [...new Set(yms)].sort();
  const meta = {
    collectedAt: new Date().toISOString(),
    period: { from: allYms[0] || '', to: allYms[allYms.length - 1] || '', fromDay: null, toDay: null },
    qualityScore: 100,
    apiStatus: { sales: true, ticketsense: true, slowmoving: giroRaw.length > 0, forecast: fcRaw.length > 0 },
    apisLoaded: [salesRaw, costsRaw, giroRaw, fcRaw].filter((a) => a.length > 0).length,
    totalSalesRows: salesRaw.length,
    filteredRows: validRows,
    linhasInPeriod: Object.keys(salesByLinha).length,
    skusInPeriod: Object.keys(salesBySku).length,
    linhasWithCost: Object.keys(COST_MAP).length,
    costCoverage: `${(Object.keys(COST_MAP).length / Math.max(1, Object.keys(salesByLinha).length) * 100).toFixed(1)}%`,
    linhasWithFC: Object.keys(FC_MAP).length,
    fcCoverage: `${(Object.keys(FC_MAP).length / Math.max(1, Object.keys(salesByLinha).length) * 100).toFixed(1)}%`,
    linhasNoCost: Object.keys(salesByLinha).filter((l) => !COST_MAP[l]),
    linhasNoFC: Object.keys(salesByLinha).filter((l) => !FC_MAP[l]),
  };

  // ── Write JSONs ───────────────────────────────────────────────────────
  const processed = {
    meta,
    COST_MAP,
    TICKET_MAP,
    FC_MAP,
    salesByLinha,
    linhaFirstSale,
    skuFirstSale,
    typeA_newLines,
    typeB_extensions,
    existingLines,
    STOCK_LINHA_MAP,
    STOCK_MAP,
  };

  fs.writeFileSync(OUT_PROCESSED, JSON.stringify(processed));
  const sizeMb1 = (fs.statSync(OUT_PROCESSED).size / 1024 / 1024).toFixed(2);
  console.log(`✓ Wrote ${OUT_PROCESSED} (${sizeMb1} MB)`);

  const skuOut = {
    ts: meta.collectedAt,
    sourceRows: salesRaw.length,
    validRows,
    skippedRows: skipped,
    skuCount: Object.keys(salesBySku).length,
    salesBySku,
  };
  fs.writeFileSync(OUT_SKU_SALES, JSON.stringify(skuOut));
  const sizeMb2 = (fs.statSync(OUT_SKU_SALES).size / 1024 / 1024).toFixed(2);
  console.log(`✓ Wrote ${OUT_SKU_SALES} (${sizeMb2} MB)`);

  console.log('\n✓ Pronto! Período coberto:', meta.period.from, '→', meta.period.to);
  console.log('  Linhas:', meta.linhasInPeriod, '· SKUs:', meta.skusInPeriod);
  console.log('  Cobertura custo:', meta.costCoverage, '· cobertura FC:', meta.fcCoverage);
}

main().catch((e) => {
  console.error('✗ Falhou:', e.message);
  process.exit(1);
});

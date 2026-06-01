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
const XLSX = require('xlsx');
const { getGraphToken } = require('./graph-auth.cjs');

// ── Carrega .env.local manualmente (sem dependência) ─────────────────────
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

// ── Config (fonte = Excel no SharePoint via Microsoft Graph) ─────────────
// Migrado do Google Sheets em 2026-06. App registration "gocase-produto-refresh"
// (Entra ID, tenant Gocase). Backup do script Google: refresh-snapshot.google.cjs.bak
const GRAPH_CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const GRAPH_TENANT_ID = process.env.GRAPH_TENANT_ID;
const SHAREPOINT_FILE_URL = process.env.SHAREPOINT_FILE_URL;
// Modo arquivo local (sem admin/OAuth): se SHAREPOINT_FILE_LOCAL apontar pra um
// .xlsx no disco, o script lê dele e ignora o Graph. Usado enquanto o
// consentimento de admin não sai. Pra voltar pro Graph: comente/remova essa env.
const SHAREPOINT_FILE_LOCAL = process.env.SHAREPOINT_FILE_LOCAL;

if (!SHAREPOINT_FILE_LOCAL && (!GRAPH_CLIENT_ID || !GRAPH_TENANT_ID || !SHAREPOINT_FILE_URL)) {
  console.error('✗ Defina SHAREPOINT_FILE_LOCAL (modo arquivo local) OU GRAPH_CLIENT_ID/GRAPH_TENANT_ID/SHAREPOINT_FILE_URL (modo Graph) em .env.local');
  process.exit(1);
}

const OUT_PROCESSED  = path.resolve(__dirname, '../public/data/processed-data.json');
const OUT_SKU_SALES  = path.resolve(__dirname, '../public/data/sales-by-sku.json');

// ── Graph: baixa o .xlsx e parseia abas em arrays-de-objetos ─────────────

/** Encoding de URL de compartilhamento p/ o endpoint /shares do Graph. */
function encodeShareUrl(url) {
  const b64 = Buffer.from(url, 'utf8').toString('base64')
    .replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  return 'u!' + b64;
}

/** Baixa o workbook .xlsx inteiro via Graph e devolve o Buffer. */
async function downloadWorkbook(token, fileUrl) {
  const share = encodeShareUrl(fileUrl);
  const url = `https://graph.microsoft.com/v1.0/shares/${share}/driveItem/content`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Graph download HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Converte uma aba do workbook em array-de-objetos no MESMO formato que a
 * antiga fetchSheetAPI: 1ª linha = headers (trim), demais = { header: valor }
 * com valores formatados (raw:false ≈ FORMATTED_VALUE do Google). Aceita uma
 * lista de nomes candidatos e usa o 1º que existir (case-insensitive).
 */
function sheetToObjects(wb, candidateNames) {
  const lowerMap = {};
  for (const real of wb.SheetNames) lowerMap[real.toLowerCase().trim()] = real;
  let realName = null;
  for (const cand of candidateNames) {
    const hit = lowerMap[String(cand).toLowerCase().trim()];
    if (hit) { realName = hit; break; }
  }
  if (!realName) return { name: null, rows: [] };

  const ws = wb.Sheets[realName];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (!aoa.length) return { name: realName, rows: [] };
  const headers = (aoa[0] || []).map((h) => String(h == null ? '' : h).trim());
  const rows = aoa.slice(1)
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] !== undefined && row[i] !== null ? String(row[i]) : '';
      });
      return obj;
    })
    .filter((r) => Object.values(r).some((v) => v !== ''));
  return { name: realName, rows };
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
// Taxonomia da fonte SharePoint (Analytics BI). Mantém também os nomes
// legados da antiga fonte Google por segurança.
const CANAL_TO_GRUPO = {
  // SharePoint (Analytics BI):
  'Varejo':                        'D2C',
  'Atacado':                       'B2B',
  'Lojas':                         'Lojas',
  'Outros':                        'Brindes',
  // Legado Google (mantido por compat):
  'Resellers Brasil (Extrema)':    'B2B',
  'Totem Iguatemi Store In Loco':  'Lojas',
  'Totem Iguatemi Store':          'Lojas',
  'Loja Parkshopping Brasília':    'Lojas',
  'Loja Analia Franco SP':         'Lojas',
};
function classifyCanal(canalRaw, naturezaRaw) {
  // Natureza=Mimo (brinde/cortesia) → Brindes, independente do canal.
  if (String(naturezaRaw || '').trim().toLowerCase() === 'mimo') return 'Brindes';
  if (!canalRaw) return 'D2C';
  const c = String(canalRaw).trim();
  if (!c) return 'D2C';
  if (CANAL_TO_GRUPO[c]) return CANAL_TO_GRUPO[c];
  // Canais não mapeados caem em Brindes — receita ~0, qtd inflacionando.
  return 'Brindes';
}
const GRUPOS = ['D2C', 'B2B', 'Lojas', 'Brindes'];

async function main() {
  let buf;
  if (SHAREPOINT_FILE_LOCAL) {
    console.log(`▶ Modo arquivo local: lendo ${SHAREPOINT_FILE_LOCAL}`);
    if (!fs.existsSync(SHAREPOINT_FILE_LOCAL)) {
      throw new Error(`arquivo local não encontrado: ${SHAREPOINT_FILE_LOCAL}`);
    }
    buf = fs.readFileSync(SHAREPOINT_FILE_LOCAL);
    console.log(`  lido: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log('▶ Autenticando no Microsoft Graph…');
    const token = await getGraphToken({ clientId: GRAPH_CLIENT_ID, tenantId: GRAPH_TENANT_ID });
    console.log('▶ Baixando Analytics BI.xlsx do SharePoint…');
    buf = await downloadWorkbook(token, SHAREPOINT_FILE_URL);
    console.log(`  baixado: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  }
  const wb = XLSX.read(buf, { type: 'buffer' });
  console.log(`  abas no workbook: ${wb.SheetNames.join(' · ')}`);

  console.log('▶ Lendo Sales…');
  // Histórico completo agora vem na própria aba Sales (Jan/25 →). O backfill
  // via Google gviz foi removido na migração pro SharePoint.
  const salesSheet = sheetToObjects(wb, ['Sales', 'Sales_refined', 'Vendas']);
  const salesRaw = salesSheet.rows;
  console.log(`  aba "${salesSheet.name}": ${salesRaw.length} linhas`);

  console.log('▶ Lendo TicketSense…');
  const costsRaw = sheetToObjects(wb, ['TicketSense', 'Ticket Sense', 'Ticket']).rows;
  console.log(`  total costs: ${costsRaw.length}`);

  console.log('▶ Lendo SlowMoving…');
  const giroSheet = sheetToObjects(wb, ['SlowMoving', 'Slow Moving', 'SLOWMOVING']);
  const giroRaw = giroSheet.rows;
  console.log(`  aba "${giroSheet.name}": ${giroRaw.length} linhas`);

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
  // Construído mais abaixo, a partir da coluna `Projeção` da aba Sales
  // (precisa de skuToLinha pra resolver Linha de canais não-Varejo).
  const FC_MAP = {};

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

  // ── FC_MAP a partir da coluna `Projeção` (aba Sales) ──────────────────
  // Projeção = QUANTIDADE projetada por linha/mês. O frontend trata FC_MAP como
  // quantidade (atingimento = qtd_realizada / forecastQtd − 1), exatamente como
  // a antiga aba "Forecast [Growth]" fazia. Passo SEPARADO do loop de vendas
  // porque meses futuros têm Projeção mas qtd=0 (seriam descartados pelo filtro).
  const PROJ_COLS = ['Projeção', 'Projecao', 'Projeçao', 'Projecão', 'Projeção', 'projeção', 'Projeção (Qtd)', 'Projecao Qtd'];
  let fcTotal = 0;
  for (const r of salesRaw) {
    // Mimo (cortesia) não entra no forecast — espelha o antigo descarte de 'mimo'.
    if (String(_col(r, ['Natureza', 'natureza']) || '').trim().toLowerCase() === 'mimo') continue;
    let lin = _col(r, ['Linha', 'linha']);
    const sku = _col(r, ['SKU Único', 'SKU Unico', 'SKU Atual', 'sku']);
    if (!lin && sku && skuToLinha[sku]) lin = skuToLinha[sku];
    if (!lin) continue;
    const proj = pNum(_col(r, PROJ_COLS));
    if (proj <= 0) continue;
    const mes = pInt(_col(r, ['Mês', 'Mes', 'mês']));
    const ano = pInt(_col(r, ['Ano', 'ano']));
    const rawDate = _col(r, ['Data', 'DATA', 'Date', 'date', 'Período', 'Periodo', 'Dia', 'dia']);
    const dt = parseRowDate(rawDate, mes, ano);
    if (!dt) continue;
    const ym = dt.slice(0, 7);
    if (!FC_MAP[lin]) FC_MAP[lin] = {};
    FC_MAP[lin][ym] = (FC_MAP[lin][ym] || 0) + proj;
    fcTotal += proj;
  }
  console.log(`  FC_MAP: ${Object.keys(FC_MAP).length} linhas · soma Projeção = ${Math.round(fcTotal).toLocaleString('pt-BR')} un (baseline Google ≈ 8.664.917)`);

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

    // Canal → grupo (Natureza=Mimo força Brindes)
    const canalRaw = _col(r, ['Canal', 'canal', 'CANAL']);
    const naturezaRaw = _col(r, ['Natureza', 'natureza', 'NATUREZA']);
    const grupo = classifyCanal(canalRaw, naturezaRaw);

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
    apiStatus: { sales: true, ticketsense: true, slowmoving: giroRaw.length > 0, forecast: Object.keys(FC_MAP).length > 0 },
    apisLoaded: [salesRaw, costsRaw, giroRaw].filter((a) => a.length > 0).length,
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

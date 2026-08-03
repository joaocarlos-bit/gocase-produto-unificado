/*
 * metabase-sales.cjs — vendas realizadas do Gocase a partir da card pública do
 * Metabase "[Supply Intelligence] - Venda diária Gogroup" (27799).
 *
 * Por que: a aba Sales do Analytics BI.xlsx é um snapshot manual (fica dias
 * atrás) e virou janela móvel. A card do Metabase cobre 2025-01 → D-1 e é a
 * mesma fonte que o dashboard Gobeaute já usa.
 *
 * Escopo: SÓ vendas realizadas (qtd, receita, canal, natureza).
 * Forecast (coluna `Projeção`), estoque/custo/curva (SlowMoving) e TicketSense
 * continuam vindo do Analytics BI.xlsx.
 *
 * Retorna linhas com os MESMOS nomes de coluna da aba Sales, pra entrar no
 * pipeline existente sem refatorar o refresh.
 *
 * PEGADINHAS tratadas:
 *  - a card traz o grupo todo → filtra empresa = Gocase;
 *  - `status` vem com caixa inconsistente ("descontinuado") → normaliza;
 *  - o nome do SKU (chave do STOCK_MAP) vem do de-para por `chave` com a aba
 *    SlowMoving; `descricao` da card é fallback;
 *  - API JSON pública corta em 2.000 linhas → usa o endpoint CSV (~86 MB);
 *  - sem CORS: só server-side.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const CARD_UUID = process.env.METABASE_SALES_UUID || '2e63a932-4ec5-4bac-b64a-365951bbf869';
const CSV_URL = `https://metabase.gocase.com.br/api/public/card/${CARD_UUID}/query/csv`;
const EMPRESA = process.env.METABASE_EMPRESA || 'Gocase';
// Cache local pra não baixar 86 MB a cada tentativa. TTL em minutos.
const CACHE_FILE = path.join(os.tmpdir(), `metabase-vendas-${CARD_UUID.slice(0, 8)}.csv`);
const CACHE_TTL_MIN = Number(process.env.METABASE_CACHE_TTL_MIN || 180);

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          file.close();
          res.resume();
          return resolve(download(res.headers.location, dest, redirects + 1));
        }
        if (res.statusCode !== 200) {
          file.close();
          res.resume();
          return reject(new Error(`Metabase HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', (e) => {
        file.close();
        reject(e);
      });
  });
}

async function ensureCsv(log = console.log) {
  if (fs.existsSync(CACHE_FILE)) {
    const ageMin = (Date.now() - fs.statSync(CACHE_FILE).mtimeMs) / 60000;
    if (ageMin < CACHE_TTL_MIN) {
      log(`  cache do Metabase: ${(fs.statSync(CACHE_FILE).size / 1024 / 1024).toFixed(1)} MB · ${ageMin.toFixed(0)} min`);
      return CACHE_FILE;
    }
  }
  log(`  baixando card ${CARD_UUID.slice(0, 8)}… (CSV, ~86 MB)`);
  await download(CSV_URL, CACHE_FILE);
  log(`  baixado: ${(fs.statSync(CACHE_FILE).size / 1024 / 1024).toFixed(1)} MB`);
  return CACHE_FILE;
}

/** Parser CSV quote-aware (RFC 4180) por linha. */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** "descontinuado" → "Descontinuado"; preserva "Linha/Recompra". */
function normStatus(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const low = t.toLowerCase();
  if (low === 'descontinuado') return 'Descontinuado';
  if (low === 'linha/recompra') return 'Linha/Recompra';
  if (low === 'lançamento' || low === 'lancamento') return 'Lançamento';
  if (low === 'sazonal') return 'Sazonal';
  return t;
}

/**
 * @param {Map<string,string>} nomePorChave de-para chave → "Nome Único" (SlowMoving)
 * @returns {Promise<Array<Object>>} linhas no formato da aba Sales
 */
async function fetchGocaseSales({ nomePorChave = new Map(), log = console.log } = {}) {
  const file = await ensureCsv(log);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const ix = {};
  header.forEach((h, i) => { ix[h] = i; });
  for (const req of ['empresa', 'ano', 'mes', 'canal', 'natureza', 'chave', 'descricao', 'quantidade', 'faturamento']) {
    if (ix[req] === undefined) throw new Error(`coluna "${req}" ausente no CSV do Metabase (header: ${header.join(',')})`);
  }

  const rows = [];
  let semNome = 0;
  const stats = { total: 0, gocase: 0 };
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line) continue;
    stats.total++;
    const c = splitCsvLine(line);
    if (c[ix.empresa] !== EMPRESA) continue;
    stats.gocase++;
    const chave = String(c[ix.chave] || '').trim();
    // O restante do pipeline indexa SKU pelo NOME (STOCK_MAP/skuFirstSale).
    const nome = nomePorChave.get(chave) || String(c[ix.descricao] || '').trim();
    if (!nomePorChave.has(chave)) semNome++;
    const qtd = Number(c[ix.quantidade]) || 0;
    const fat = Number(c[ix.faturamento]) || 0;
    rows.push({
      Ano: Number(c[ix.ano]) || null,
      'Mês': Number(c[ix.mes]) || null,
      Data: c[ix.data] || null,
      Canal: String(c[ix.canal] || '').trim(),
      Natureza: String(c[ix.natureza] || '').trim(),
      Categoria: String(c[ix.categoria] || '').trim(),
      MacroLinha: String(c[ix.macrolinha] || '').trim(),
      Linha: String(c[ix.linha] || '').trim(),
      'SKU Único': nome,
      Chave: chave,
      Status: normStatus(c[ix.status]),
      'Quantidade de Vendas': qtd,
      'Valor Unitário': Number(c[ix.ticket]) || (qtd > 0 ? fat / qtd : 0),
      Faturamento: fat,
      // A card não tem projeção; FC_MAP continua vindo do Analytics BI.
      'Projeção': null,
    });
  }
  log(`  Metabase: ${stats.gocase.toLocaleString('pt-BR')} linhas ${EMPRESA} (de ${stats.total.toLocaleString('pt-BR')} do grupo)`);
  if (semNome) log(`  ⚠ ${semNome} linhas sem de-para chave→nome (usando descricao da card)`);
  return rows;
}

module.exports = { fetchGocaseSales, CARD_UUID, CSV_URL };

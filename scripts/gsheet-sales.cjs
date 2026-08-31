/*
 * gsheet-sales.cjs — vendas realizadas a partir da planilha Google "Analytics"
 * legada (aba "Sales"), via Sheets API v4 com API key pública (mesma da
 * versão pré-migração, ver refresh-snapshot.google.cjs.bak).
 *
 * Por que: metabase.gocase.com.br ficou bloqueado no egress do ambiente onde a
 * rotina agendada roda (desde 2026-08-29, HTTP 403 host not in allowlist). A
 * planilha continua sendo atualizada em paralelo (95.257 linhas, até o mês
 * corrente, confirmado em 2026-08-31) — mesma fonte de antes da migração pro
 * SharePoint+Metabase.
 *
 * IMPORTANTE: NÃO usar o endpoint gviz (docs.google.com/.../gviz/tq) com
 * agregações (ex.: `select count(A)`) nessa planilha — confirmado que o
 * Google retorna uma contagem truncada/errada (123 em vez de 95.257) pra
 * acesso anônimo em sheets grandes. Leituras linha-a-linha via gviz (sem
 * agregação) funcionam normalmente; a Sheets API v4 usada aqui não tem esse
 * problema em nenhum dos dois modos.
 *
 * Retorna linhas já no formato esperado pelo pipeline (mesmos nomes de coluna
 * da aba Sales do SharePoint: Ano, Mês, Canal, Natureza, Categoria, MacroLinha,
 * Linha, "SKU Único", Status, "Quantidade de Vendas", "Valor Unitário",
 * Faturamento, Projeção) — sem remapeamento nem de-para necessário.
 */

const DEFAULT_API_KEY = 'AIzaSyC6g4xMmecyJjQlJcWkGtjODF_9TWMqc3w';

/**
 * @param {{ sheetId: string, sheetName?: string, range?: string, apiKey?: string, log?: (m: string) => void }} opts
 * @returns {Promise<Array<Object>>}
 */
async function fetchSheetSales({
  sheetId,
  sheetName = 'Sales',
  range = 'A1:R200000',
  apiKey = process.env.GOOGLE_SHEETS_API_KEY || DEFAULT_API_KEY,
  log = console.log,
} = {}) {
  const fullRange = encodeURIComponent(`${sheetName}!${range}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${fullRange}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Sheets API HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const json = await resp.json();
  const values = json.values || [];
  if (!values.length) return [];
  const headers = values[0].map((h) => String(h).trim());
  const rows = values.slice(1)
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        const v = row[i];
        obj[h] = v === undefined || v === null ? '' : v;
      });
      return obj;
    })
    .filter((r) => Object.values(r).some((v) => v !== ''));
  log(`  planilha "${sheetName}": ${rows.length.toLocaleString('pt-BR')} linhas`);
  return rows;
}

module.exports = { fetchSheetSales };

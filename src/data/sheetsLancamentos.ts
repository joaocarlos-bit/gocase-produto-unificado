// Planilha "Projeções de Lançamentos" (Google Sheets) — fonte de receita
// projetada (2026+2027) por lançamento, usada na aba Categorias de Alocação
// de Recurso pra cruzar com o status vindo do Monday. Lida via Sheets API v4
// com chave de API pública (mesma usada em scripts/gsheet-sales.cjs) — sem
// OAuth, a planilha é compartilhada por link.
// https://docs.google.com/spreadsheets/d/1oSaBB5ZVbRjvs0pRK3vahpUUBJgR0cwH6eKt3nxi80I/edit?gid=1894371001

const SHEET_ID = '1oSaBB5ZVbRjvs0pRK3vahpUUBJgR0cwH6eKt3nxi80I';
const SHEET_TAB = 'Projeções (v4)'; // aba de gid=1894371001
const API_KEY = 'AIzaSyC6g4xMmecyJjQlJcWkGtjODF_9TWMqc3w';

// Índices de coluna (0-based) dentro do range buscado abaixo.
const COL = { lancamento: 1, statusLancamento: 4, categoria: 14, subcategoria: 15, receita2026: 21, receita2027: 22 };

export interface MonthlyValue { year: number; month: number; value: number } // month: 0-based (jan=0)

export interface SheetLancRow {
  lancamento: string;
  categoria: string | null;
  subcategoria: string | null;
  statusLancamento: string | null;
  receita2026: number;
  receita2027: number;
  receitaTotal: number;
  /** Receita mês a mês (Qtd × Preço), lida do 3º bloco de colunas mensais da
   *  planilha (à direita das colunas anuais V/W) — vazio se o cabeçalho não
   *  tiver esse bloco. Usado pro cálculo de "Impacto de atrasos". */
  receitaMensal: MonthlyValue[];
}

const isSerialDate = (v: unknown): v is number => typeof v === 'number' && v > 40000 && v < 60000;
/** Serial de data do Sheets/Excel (dia 0 = 30/12/1899) → {year, month 0-based}. */
function serialToYM(serial: number): { year: number; month: number } {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}
/** Acha sequências de datas contíguas na linha de cabeçalho — a planilha tem
 *  3 blocos mensais lado a lado (Quantidade, Preço, Receita), separados por
 *  coluna(s) em branco. O 3º bloco é a receita mensal que a gente quer. */
function findDateRuns(header: any[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let start = -1;
  for (let i = 0; i < header.length; i++) {
    if (isSerialDate(header[i])) { if (start === -1) start = i; }
    else if (start !== -1) { runs.push({ start, end: i - 1 }); start = -1; }
  }
  if (start !== -1) runs.push({ start, end: header.length - 1 });
  return runs;
}

/** Busca as linhas da planilha de Projeções (Lançamento, Categoria, Status,
 *  receita 2026/2027 + curva mensal). Lança se a planilha não puder ser lida. */
export async function fetchSheetLancamentos(): Promise<SheetLancRow[]> {
  const range = encodeURIComponent(`${SHEET_TAB}!A1:DZ3000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar planilha de lançamentos`);
  const json = await res.json();
  const allRows: any[][] = json.values || [];
  const header = allRows[0] || [];
  const revenueRun = findDateRuns(header)[2] || null; // 1º=Qtd, 2º=Preço, 3º=Receita
  const num = (v: any) => (typeof v === 'number' ? v : 0);
  return allRows
    .slice(1) // descarta cabeçalho
    .map((r): SheetLancRow | null => {
      const lancamento = String(r[COL.lancamento] || '').trim();
      if (!lancamento) return null;
      const receita2026 = num(r[COL.receita2026]);
      const receita2027 = num(r[COL.receita2027]);
      const receitaMensal: MonthlyValue[] = [];
      if (revenueRun) {
        for (let i = revenueRun.start; i <= revenueRun.end; i++) {
          receitaMensal.push({ ...serialToYM(header[i]), value: num(r[i]) });
        }
      }
      return {
        lancamento,
        categoria: String(r[COL.categoria] || '').trim() || null,
        subcategoria: String(r[COL.subcategoria] || '').trim() || null,
        statusLancamento: String(r[COL.statusLancamento] || '').trim() || null,
        receita2026,
        receita2027,
        receitaTotal: receita2026 + receita2027,
        receitaMensal,
      };
    })
    .filter((r): r is SheetLancRow => r !== null);
}

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const prefixOf = (s: string) => norm(s).split(' - ')[0];

export interface SheetIndex { byExact: Map<string, SheetLancRow>; byPrefix: Map<string, SheetLancRow[]> }

/** Indexa as linhas por nome normalizado (match exato) e por prefixo — texto
 *  antes do primeiro " - " (match aproximado, pro nome do Monday que às vezes
 *  varia só na cor/variante em relação ao nome na planilha). */
export function buildSheetIndex(rows: SheetLancRow[]): SheetIndex {
  const byExact = new Map<string, SheetLancRow>();
  const byPrefix = new Map<string, SheetLancRow[]>();
  rows.forEach((r) => {
    byExact.set(norm(r.lancamento), r);
    const p = prefixOf(r.lancamento);
    if (!byPrefix.has(p)) byPrefix.set(p, []);
    byPrefix.get(p)!.push(r);
  });
  return { byExact, byPrefix };
}

/** Casa um nome de lançamento (já sem a tag de categoria) com a planilha.
 *  Sem match exato, soma a receita de todas as variantes do mesmo produto-base
 *  (mesmo prefixo antes do " - "). Retorna null se nada bater. */
export function matchSheetRow(name: string, index: SheetIndex): SheetLancRow | null {
  const exact = index.byExact.get(norm(name));
  if (exact) return exact;
  const candidates = index.byPrefix.get(prefixOf(name));
  if (!candidates || candidates.length === 0) return null;
  const receita2026 = candidates.reduce((s, c) => s + c.receita2026, 0);
  const receita2027 = candidates.reduce((s, c) => s + c.receita2027, 0);
  return { ...candidates[0], receita2026, receita2027, receitaTotal: receita2026 + receita2027 };
}

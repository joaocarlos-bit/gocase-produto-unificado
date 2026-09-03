// Planilha "Projeções de Lançamentos" (Google Sheets) — fonte de receita
// projetada (2026+2027) por lançamento, usada na aba Categorias de Alocação
// de Recurso pra cruzar com o status vindo do Monday. Lida via Sheets API v4
// com chave de API pública (mesma usada em scripts/gsheet-sales.cjs) — sem
// OAuth, a planilha é compartilhada por link.
// https://docs.google.com/spreadsheets/d/1oSaBB5ZVbRjvs0pRK3vahpUUBJgR0cwH6eKt3nxi80I/edit?gid=1894371001

const SHEET_ID = '1oSaBB5ZVbRjvs0pRK3vahpUUBJgR0cwH6eKt3nxi80I';
const SHEET_TAB = 'Projeções (v4)'; // aba de gid=1894371001
const API_KEY = 'AIzaSyC6g4xMmecyJjQlJcWkGtjODF_9TWMqc3w';

// Índices de coluna (0-based) dentro do range A:X buscado abaixo.
const COL = { lancamento: 1, statusLancamento: 4, categoria: 14, subcategoria: 15, receita2026: 21, receita2027: 22 };

export interface SheetLancRow {
  lancamento: string;
  categoria: string | null;
  subcategoria: string | null;
  statusLancamento: string | null;
  receita2026: number;
  receita2027: number;
  receitaTotal: number;
}

/** Busca as linhas da planilha de Projeções (Lançamento, Categoria, Status,
 *  receita 2026/2027). Lança se a planilha não puder ser lida. */
export async function fetchSheetLancamentos(): Promise<SheetLancRow[]> {
  const range = encodeURIComponent(`${SHEET_TAB}!A1:X2000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar planilha de lançamentos`);
  const json = await res.json();
  const rows: any[][] = json.values || [];
  const num = (v: any) => (typeof v === 'number' ? v : 0);
  return rows
    .slice(1) // descarta cabeçalho
    .map((r): SheetLancRow | null => {
      const lancamento = String(r[COL.lancamento] || '').trim();
      if (!lancamento) return null;
      const receita2026 = num(r[COL.receita2026]);
      const receita2027 = num(r[COL.receita2027]);
      return {
        lancamento,
        categoria: String(r[COL.categoria] || '').trim() || null,
        subcategoria: String(r[COL.subcategoria] || '').trim() || null,
        statusLancamento: String(r[COL.statusLancamento] || '').trim() || null,
        receita2026,
        receita2027,
        receitaTotal: receita2026 + receita2027,
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

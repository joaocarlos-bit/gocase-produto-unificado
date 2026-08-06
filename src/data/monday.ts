// Cliente Monday.com (GraphQL) — portado do dash-produto. Usado por Prazo e
// Projetos. Token JWT lido do localStorage (chave monday_admin_token), passado
// no header Authorization. Chamadas direto do browser (Monday permite CORS com
// token). Boards/colunas conforme CONFIG.monday do dash-produto.

export const MONDAY = {
  api: 'https://api.monday.com/v2',
  apiVersion: '2024-01',
  boards: {
    lancamentos2026: 9392961557,
    lancamentos2027: 18412582876,
    portfolio: 8370828020,
    warehouseSamples: 6758443649,
  },
  groups: {
    warehouseSamples2026: 'group_title', // grupo "Samples 2026" do board 03 - Warehouse Samples
    portfolioOkr262: 'group_mm5rjfqh', // grupo "OKRs 26.2" do board 04 - Project Portfolio Management
    portfolioIaTech: 'group_mm1zd2t2', // grupo "Projetos de IA/Tech" do board 04 - Project Portfolio Management
  },
  columns: {
    portfolio: {
      status: 'priority_mkmv8z0z',
      color: 'color_mm1dkggz',
      priority: 'priority_mkmvx0t4',
      lastUpdate: 'pulse_updated_mm2gxajt',
      notes: 'text_mm26vw3j',
      owner: 'person',
    },
    warehouseSamples: {
      dateReceived: 'date4', // "Date Received"
      dateTested: 'date__1', // "Date Tested"
      approval: 'status_1__1', // "Approval" (Approved / Not Approved / Approved w/ Restriction / Waiting / No Test Needed)
      razao: 'dropdown_mm122nkz', // "Razão" — motivo(s) de reprovação (multi-select, texto separado por vírgula)
      relatorio: 'file_mkyhct24', // "Relatorio Arquivo" — link (ex.: Google Sheets) do relatório do teste
    },
    launches2026: {
      people: 'multiple_person_mkt1ez1j', // "People"
      launchStatus: 'status33', // "Launch status"
      dificuldade: 'color_mkt95wfd', // "Nível de dificuldade" (Baixo/Médio/Alto)
    },
    launches2027: {
      people: 'person', // "People"
      launchStatus: 'color_mm38he5h', // "Launch status"
      dificuldade: 'color_mm39ykd4', // "Nível" (Baixo/Médio/Alto/Crítico)
    },
  },
};

const TOKEN_KEY = 'monday_admin_token';
export const getMondayToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setMondayToken = (t: string) => {
  if (!t) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, t);
};

export interface MondayColumn { id: string; text: string | null; type?: string; value?: string | null; }
export interface MondayBoardColumn { id: string; title: string; type: string; }
export interface MondaySubitem { id: string; name: string; board?: { id: string; columns?: MondayBoardColumn[] }; column_values?: MondayColumn[]; }
export interface MondayItem {
  id: string; name: string;
  group?: { id: string; title: string };
  column_values?: MondayColumn[];
  subitems?: MondaySubitem[];
  _year?: string;
}

async function gql(token: string, query: string): Promise<any> {
  const res = await fetch(MONDAY.api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': MONDAY.apiVersion },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'Erro na API Monday');
  return json;
}

/** Busca todos os itens (com subitems) de um board de Prazo, paginando por cursor. */
export async function fetchPrazoBoard(token: string, boardId: number): Promise<MondayItem[]> {
  let items: MondayItem[] = [];
  let cursor: string | null = null;
  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : '';
    const query = `{
      boards(ids: [${boardId}]) {
        items_page(limit: 200${cursorPart}) {
          cursor
          items {
            id name
            group { id title }
            subitems {
              id name
              column_values(ids: ["timerange_mksd4dcn","timerange_mm38mv4d","status","date_mktc1qac"]) { id text value }
            }
          }
        }
      }
    }`;
    const json = await gql(token, query);
    const page = json.data?.boards?.[0]?.items_page;
    if (!page) throw new Error('Resposta inesperada da API');
    items = items.concat(page.items || []);
    cursor = page.cursor || null;
  } while (cursor);
  return items;
}

/** Busca todos os projetos do board Portfolio (items + subitems), paginando. */
export async function fetchPortfolio(token: string): Promise<MondayItem[]> {
  let items: MondayItem[] = [];
  let cursor: string | null = null;
  const cols = '["person","priority_mkmv8z0z","color_mm1dkggz","priority_mkmvx0t4","pulse_updated_mm2gxajt","text_mm26vw3j"]';
  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : '';
    const query = `{
      boards(ids: [${MONDAY.boards.portfolio}]) {
        items_page(limit: 200${cursorPart}) {
          cursor
          items {
            id name
            group { id title }
            column_values(ids: ${cols}) { id text type }
            subitems { id name board { id columns { id title type } } column_values { id text type value } }
          }
        }
      }
    }`;
    const json = await gql(token, query);
    const page = json.data?.boards?.[0]?.items_page;
    if (!page) throw new Error('Resposta inesperada da API');
    items = items.concat(page.items || []);
    cursor = page.cursor || null;
  } while (cursor);
  return items;
}

// ── Alocação de Recurso (People + Launch status dos boards de Lançamentos) ──
export interface LaunchAllocItem {
  id: string; name: string; people: string[]; launchStatus: string | null; dificuldade: string | null; group: string; launched: boolean;
}

const LAUNCHED_RE = /launched|lan[çc]ad[oa]/i;

/** Busca id/nome/pessoas/status/dificuldade de lançamento de todos os itens de
 *  um board de Lançamentos (2026 ou 2027), paginando por cursor. `launched` =
 *  true quando o "Launch status" indica que já foi lançado (qualquer variação
 *  de "Launched"/"Lançado"), incluindo lançamentos fora do prazo. */
export async function fetchLaunchAllocation(
  token: string, boardId: number, peopleColId: string, statusColId: string, difficultyColId: string,
): Promise<LaunchAllocItem[]> {
  const items: LaunchAllocItem[] = [];
  let cursor: string | null = null;
  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : '';
    const query = `{
      boards(ids: [${boardId}]) {
        items_page(limit: 200${cursorPart}) {
          cursor
          items {
            id name
            group { id title }
            column_values(ids: ["${peopleColId}","${statusColId}","${difficultyColId}"]) { id text }
          }
        }
      }
    }`;
    const json = await gql(token, query);
    const page = json.data?.boards?.[0]?.items_page;
    if (!page) throw new Error('Resposta inesperada da API');
    (page.items || []).forEach((it: MondayItem) => {
      const cvs = it.column_values || [];
      const peopleText = cvs.find((c) => c.id === peopleColId)?.text || '';
      const launchStatus = cvs.find((c) => c.id === statusColId)?.text || null;
      const dificuldade = cvs.find((c) => c.id === difficultyColId)?.text || null;
      items.push({
        id: it.id,
        name: it.name,
        people: peopleText.split(',').map((s) => s.trim()).filter(Boolean),
        launchStatus,
        dificuldade,
        group: it.group?.title || 'Sem grupo',
        launched: LAUNCHED_RE.test(launchStatus || ''),
      });
    });
    cursor = page.cursor || null;
  } while (cursor);
  return items;
}

/** true quando o item ainda não foi lançado e está num grupo de mês (exclui
 *  "Sem previsão", "Cancelados" e qualquer outro grupo que não seja um mês). */
export function isPendingLaunch(it: LaunchAllocItem): boolean {
  return !it.launched && parseGroupMonth(it.group) !== null;
}

// ── Atualizações de Lançamentos (updates por item do board 2026) ─────────
export interface LancUpdate { text: string; ts: number; creator: string | null; }
export interface LancUpdateItem { id: string; name: string; group: string; updates: LancUpdate[]; }

export async function fetchLancUpdates(token: string): Promise<LancUpdateItem[]> {
  const q = `{
    boards(ids: [${MONDAY.boards.lancamentos2026}]) {
      items_page(limit: 200) {
        items { id name group { id title } updates(limit: 10) { text_body created_at creator { name } } }
      }
    }
  }`;
  const json = await gql(token, q);
  const items = json.data?.boards?.[0]?.items_page?.items || [];
  return items.map((it: any): LancUpdateItem => ({
    id: it.id,
    name: it.name,
    group: it.group?.title || 'Sem grupo',
    updates: (it.updates || [])
      .map((u: any) => ({ text: (u.text_body || '').trim(), ts: Date.parse(u.created_at || '') || 0, creator: u.creator?.name || null }))
      .filter((u: LancUpdate) => u.ts > 0 && u.text.length >= 3)
      .sort((a: LancUpdate, b: LancUpdate) => b.ts - a.ts),
  }));
}

// ── Engenharia de Produto (board 03 - Warehouse Samples, grupo Samples 2026) ─
export interface WarehouseSampleItem {
  id: string; name: string;
  dateReceived: string | null; dateTested: string | null;
  approval: string | null; razao: string[]; relatorioUrl: string | null;
}

/** Busca os itens do grupo "Samples 2026" do board 03 - Warehouse Samples, com
 *  as datas de Recebimento/Teste, o status de Aprovação, o(s) motivo(s) de
 *  reprovação ("Razão", multi-select) e o link do "Relatorio Arquivo",
 *  paginando por cursor. */
export async function fetchWarehouseSamples(token: string, boardId: number, groupId: string): Promise<WarehouseSampleItem[]> {
  const { dateReceived: recvId, dateTested: testId, approval: approvalId, razao: razaoId, relatorio: relatorioId } = MONDAY.columns.warehouseSamples;
  const items: WarehouseSampleItem[] = [];
  let cursor: string | null = null;
  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : '';
    const query = `{
      boards(ids: [${boardId}]) {
        items_page(limit: 200${cursorPart}) {
          cursor
          items {
            id name
            group { id title }
            column_values(ids: ["${recvId}","${testId}","${approvalId}","${razaoId}","${relatorioId}"]) { id text }
          }
        }
      }
    }`;
    const json = await gql(token, query);
    const page = json.data?.boards?.[0]?.items_page;
    if (!page) throw new Error('Resposta inesperada da API');
    (page.items || [])
      .filter((it: MondayItem) => it.group?.id === groupId)
      .forEach((it: MondayItem) => {
        const cvs = it.column_values || [];
        const razaoText = cvs.find((c) => c.id === razaoId)?.text || '';
        const relatorioText = cvs.find((c) => c.id === relatorioId)?.text || '';
        items.push({
          id: it.id,
          name: it.name,
          dateReceived: cvs.find((c) => c.id === recvId)?.text || null,
          dateTested: cvs.find((c) => c.id === testId)?.text || null,
          approval: cvs.find((c) => c.id === approvalId)?.text || null,
          razao: razaoText.split(',').map((s) => s.trim()).filter(Boolean),
          relatorioUrl: /^https?:\/\//.test(relatorioText) ? relatorioText : null,
        });
      });
    cursor = page.cursor || null;
  } while (cursor);
  return items;
}

/** Dias úteis entre duas datas (YYYY-MM-DD), inclusive em ambas as pontas —
 *  mesma semântica da coluna fórmula "SLA Teste" (WORKDAYS) do board. */
export function businessDaysInclusive(startStr: string, endStr: string): number | null {
  const a0 = new Date(startStr + 'T00:00:00');
  const b0 = new Date(endStr + 'T00:00:00');
  if (isNaN(a0.getTime()) || isNaN(b0.getTime())) return null;
  const [a, b] = a0 <= b0 ? [a0, b0] : [b0, a0];
  let count = 0;
  const d = new Date(a);
  while (d <= b) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// ── Helpers de Prazo ─────────────────────────────────────────────────────
export const MONTH_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  janeiro: 0, fevereiro: 1, março: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};
export const EXCLUDED_GROUPS = ['cancelados', 'sem previsão', 'sem previsao', 'canceled'];
export const MONTHS_2026 = [8, 9, 10, 11]; // set/out/nov/dez do board 2026

export interface ParsedMonth { month: number; year: number | null; label: string; }
export function parseGroupMonth(title: string): ParsedMonth | null {
  if (!title) return null;
  const firstWord = title.trim().toLowerCase().split(/[\s(]/)[0];
  const yearM = title.match(/\d{4}/);
  const year = yearM ? parseInt(yearM[0]) : null;
  for (const [name, idx] of Object.entries(MONTH_MAP)) {
    if (firstWord === name) return { month: idx, year, label: `${MONTH_PT[idx]} ${year || ''}`.trim() };
  }
  return null;
}

export function formatDateBR(d: string | Date | null): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(typeof d === 'string' && !d.includes('T') ? d + 'T00:00:00' : d);
  if (isNaN(date.getTime())) return String(d) || '—';
  return String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + date.getFullYear();
}

export function getSubitemDate(sub?: MondaySubitem): string | null {
  if (!sub) return null;
  for (const trId of ['timerange_mksd4dcn', 'timerange_mm38mv4d']) {
    const tr = sub.column_values?.find((c) => c.id === trId);
    if (!tr) continue;
    if (tr.value && tr.value !== 'null') {
      try {
        const v = JSON.parse(tr.value);
        if (v.from || v.to) return v.from || v.to;
      } catch { /* ignore */ }
    }
    if (tr.text && tr.text !== 'null' && tr.text !== '') {
      const start = tr.text.split(' - ')[0].trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
    }
  }
  const dc = sub.column_values?.find((c) => c.id === 'date_mktc1qac');
  if (dc?.text && dc.text !== 'null') return dc.text;
  return null;
}

export function getSubitemStatusText(sub?: MondaySubitem): string | null {
  return sub?.column_values?.find((c) => c.id === 'status')?.text || null;
}

export type PrazoStatus = 'no-prazo' | 'fora-do-mes' | 'sem-data';
export function getStatusForItem(lancDateStr: string | null, groupMonth: ParsedMonth | null): PrazoStatus {
  if (!lancDateStr) return 'sem-data';
  if (!groupMonth) return 'no-prazo';
  try {
    const d = new Date(lancDateStr + 'T00:00:00');
    const groupRef = new Date(groupMonth.year || 0, groupMonth.month, 1);
    const launchRef = new Date(d.getFullYear(), d.getMonth(), 1);
    return launchRef > groupRef ? 'fora-do-mes' : 'no-prazo';
  } catch {
    return 'no-prazo';
  }
}

// ── Helpers de Projetos ──────────────────────────────────────────────────
export const isAIGroup = (g: string) => g.includes('projeto') && (g.includes(' ia') || g.includes('i.a') || g.includes('intelig'));

export function projStatusBadge(statusText: string): { cls: string; label: string } {
  const s = (statusText || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s || s.includes('nao inici') || s.includes('not start') || s.includes('stand by') || s === '-' || s === '—')
    return { cls: 'st-nao', label: statusText || 'Não iniciado' };
  if (s.includes('finaliz') || s.includes('conclu') || s.includes('done')) return { cls: 'st-fim', label: statusText };
  if (s.includes('andamento') || s.includes('progress') || s.includes('curso')) return { cls: 'st-and', label: statusText };
  if (s.includes('pausad') || s.includes('paused') || s.includes('bloque')) return { cls: 'st-pause', label: statusText };
  if (s.includes('nalise')) return { cls: 'st-anal', label: statusText };
  return { cls: 'st-nao', label: statusText };
}

export function subStatusBadge(statusText: string): { cls: string; label: string; icon: string } {
  if (!statusText) return { cls: 'ms-pending', label: 'Não iniciado', icon: '○' };
  const s = statusText.toLowerCase();
  if (s.includes('conclu') || s.includes('done') || s.includes('finaliz')) return { cls: 'ms-done', label: 'Concluído', icon: '✓' };
  if (s.includes('andamento') || s.includes('progress') || s.includes('doing') || s.includes('curso')) return { cls: 'ms-doing', label: 'Em andamento', icon: '▶' };
  if (s.includes('pausad') || s.includes('blocked') || s.includes('bloque')) return { cls: 'ms-paused', label: 'Pausado', icon: '⏸' };
  return { cls: 'ms-pending', label: statusText, icon: '○' };
}

export function getSubStatus(sub: MondaySubitem): string {
  const c = (sub.column_values || []).find((c) => c.type === 'color' || c.type === 'status');
  return c?.text?.trim() || '';
}

export function getSubStatusColumnInfo(sub: MondaySubitem): { columnId: string; value: string | null } | null {
  const c = (sub.column_values || []).find((c) => c.type === 'color' || c.type === 'status');
  if (!c) return null;
  return { columnId: c.id, value: c.value ?? null };
}

export async function updateSubitemStatus(
  token: string, boardId: string, subitemId: string,
  columnId: string, labelText: string,
): Promise<void> {
  const val = JSON.stringify({ label: labelText });
  const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `mutation { change_column_value(board_id: ${boardId}, item_id: ${subitemId}, column_id: "${columnId}", value: "${escaped}") { id } }`;
  await gql(token, query);
}
// IDs fixos das colunas "Data" do board de subitems (compartilhado entre Portfolio e Prazo).
const DATA_TIMERANGE_IDS = ['timerange_mksd4dcn', 'timerange_mm38mv4d'];
const DATA_DATE_ID = 'date_mktc1qac';

function _findDataColumn(sub: MondaySubitem): { col: MondayColumn; colType: 'date' | 'timeline' } | null {
  const cols = sub.column_values || [];
  const boardCols = sub.board?.columns;

  // 1. Coluna cujo título é "Data" no schema do board (abordagem correta e confiável)
  if (boardCols) {
    const dataColDef = boardCols.find((bc) => bc.title?.trim().toLowerCase() === 'data');
    if (dataColDef) {
      const col = cols.find((c) => c.id === dataColDef.id);
      if (col) {
        const colType = (dataColDef.type === 'timeline' || dataColDef.type === 'timerange') ? 'timeline' : 'date';
        return { col, colType };
      }
    }
  }
  // 2. IDs fixos conhecidos (Prazo board – fallback se boards compartilham subitem board)
  for (const id of DATA_TIMERANGE_IDS) {
    const c = cols.find((col) => col.id === id);
    if (c) return { col: c, colType: 'timeline' };
  }
  const dc = cols.find((c) => c.id === DATA_DATE_ID);
  if (dc) return { col: dc, colType: 'date' };
  // 3. Primeira timeline/date COM texto (evita colunas Deadline vazias que venham antes)
  const tlText = cols.find((c) => (c.type === 'timeline' || c.type === 'timerange') && c.text);
  if (tlText) return { col: tlText, colType: 'timeline' };
  const dtText = cols.find((c) => c.type === 'date' && c.text);
  if (dtText) return { col: dtText, colType: 'date' };
  // 4. Último recurso
  const tl = cols.find((c) => c.type === 'timeline' || c.type === 'timerange');
  if (tl) return { col: tl, colType: 'timeline' };
  const dt = cols.find((c) => c.type === 'date');
  if (dt) return { col: dt, colType: 'date' };
  return null;
}

export function getSubDate(sub: MondaySubitem): string {
  const found = _findDataColumn(sub);
  if (!found) return '';
  const { col, colType } = found;
  if (!col.text) return '';
  if (colType === 'timeline') { const parts = col.text.split(' - '); return parts[parts.length - 1]?.trim() || ''; }
  return col.text.trim();
}

export function getSubDateColumnInfo(sub: MondaySubitem): { columnId: string; columnType: 'date' | 'timeline'; originalValue: string | null } | null {
  const found = _findDataColumn(sub);
  if (!found) return null;
  return { columnId: found.col.id, columnType: found.colType, originalValue: found.col.value ?? null };
}

export async function updateSubitemName(token: string, boardId: string, subitemId: string, newName: string): Promise<void> {
  const escaped = newName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `mutation { change_simple_column_value(board_id: ${boardId}, item_id: ${subitemId}, column_id: "name", value: "${escaped}") { id } }`;
  await gql(token, query);
}

export async function updateSubitemDate(
  token: string, boardId: string, subitemId: string,
  columnId: string, columnType: 'date' | 'timeline',
  newDateStr: string, originalValue?: string | null,
): Promise<void> {
  let val: string;
  if (columnType === 'timeline') {
    let fromDate = newDateStr;
    if (originalValue) {
      try { const p = JSON.parse(originalValue); if (p.from) fromDate = p.from; } catch { /* preserve from date */ }
    }
    val = JSON.stringify({ from: fromDate, to: newDateStr });
  } else {
    val = JSON.stringify({ date: newDateStr });
  }
  const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `mutation { change_column_value(board_id: ${boardId}, item_id: ${subitemId}, column_id: "${columnId}", value: "${escaped}") { id } }`;
  await gql(token, query);
}

/** Busca o board_id de um subitem (fallback caso não venha no fetch inicial). */
export async function fetchSubitemBoardId(token: string, subitemId: string): Promise<string> {
  const q = `{ items(ids: [${subitemId}]) { board { id } } }`;
  const json = await gql(token, q);
  const id = json.data?.items?.[0]?.board?.id;
  if (!id) throw new Error('Board do subitem não encontrado.');
  return String(id);
}

/** Marco/subitem: rótulo de data curto + flag de atraso. */
export function formatSubDate(dateStr: string): { label: string; overdue: boolean } | null {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return { label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), overdue: d < today };
  }
  return { label: dateStr, overdue: false };
}

/** Progresso derivado do status (fallback quando não há subitems). */
export function progressFromStatus(status: string): number {
  const s = (status || '').toLowerCase();
  if (s.includes('finalizado') || s.includes('conclu')) return 100;
  if (s.includes('andamento')) return 50;
  if (s.includes('nalise')) return 20;
  if (s.includes('pausad')) return 30;
  return 5;
}

/** Progresso baseado na conclusão dos subitems (etapas do cronograma).
 *  Retorna null se não houver subitems (usar fallback por status). */
export function progressFromSubitems(subs: MondaySubitem[]): number | null {
  if (!subs || subs.length === 0) return null;
  const done = subs.filter((s) => subStatusBadge(getSubStatus(s)).cls === 'ms-done').length;
  return Math.round((done / subs.length) * 100);
}

export interface NotesSections { objetivo: string | null; justificativa: string | null; stakeholders: string | null; premissas: string | null; }

const normHeader = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/:$/, '').replace(/\s+/g, '_');
const DIVIDER_LINE = /^[\s]*[-–—_]{3,}[\s]*$/;
const KNOWN_HEADERS: Record<string, keyof NotesSections> = {
  objetivo: 'objetivo',
  justificativa: 'justificativa',
  stakeholders: 'stakeholders', stakeholder: 'stakeholders',
  premissas: 'premissas', premissa: 'premissas',
};

/** Divide o texto de notas do Monday em seções (Objetivo, Justificativa, Stakeholders,
 *  Premissas). Um cabeçalho é qualquer linha cujo texto seja só um desses nomes — os
 *  divisores decorativos ("---", "───" etc.) que aparecem antes/depois/entre eles, com
 *  ou sem par correspondente, são descartados por completo, não só quando "bem-formados".
 *  Conteúdo antes do primeiro cabeçalho reconhecido (formato legado) vira Objetivo. */
export function parseNotesSections(raw: string | null): NotesSections {
  const empty: NotesSections = { objetivo: null, justificativa: null, stakeholders: null, premissas: null };
  if (!raw) return empty;
  const lines = raw.trim().split('\n');
  const sections: Partial<Record<keyof NotesSections, string[]>> = {};
  let cur: keyof NotesSections | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (DIVIDER_LINE.test(trimmed)) continue;
    const known = KNOWN_HEADERS[normHeader(trimmed)];
    if (known) { cur = known; sections[cur] ||= []; continue; }
    if (cur === null) cur = 'objetivo';
    (sections[cur] ||= []).push(line);
  }
  const clean = (arr?: string[]) => (arr ? arr.join('\n').replace(/\n{3,}/g, '\n\n').trim() : '');
  return {
    objetivo: clean(sections.objetivo) || null,
    justificativa: clean(sections.justificativa) || null,
    stakeholders: clean(sections.stakeholders) || null,
    premissas: clean(sections.premissas) || null,
  };
}

export interface UpdImage { url: string; name: string; }
export interface ItemUpdate { text: string; body: string; images: UpdImage[]; ts: number; }

/** Busca os updates (comentários) de um item, com texto + body HTML + imagens. */
export async function fetchItemUpdates(token: string, itemId: string): Promise<ItemUpdate[]> {
  const q = `{ items(ids: [${itemId}]) { updates(limit: 25) { text_body body created_at assets { public_url file_extension name } } } }`;
  const json = await gql(token, q);
  const ups = json.data?.items?.[0]?.updates || [];
  const IMG = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic']);
  return ups
    .map((u: any): ItemUpdate => ({
      text: (u.text_body || '').trim(),
      body: u.body || '',
      ts: Date.parse(u.created_at || '') || 0,
      images: (u.assets || [])
        .filter((a: any) => a.public_url && IMG.has((a.file_extension || '').toLowerCase().replace('.', '')))
        .map((a: any) => ({ url: a.public_url, name: a.name || 'imagem' })),
    }))
    .filter((u: ItemUpdate) => u.text.length > 5 || u.images.length || /<table/i.test(u.body))
    .sort((a: ItemUpdate, b: ItemUpdate) => b.ts - a.ts);
}

export interface GainRow { label: string; before: string | null; after: string | null; amount: string | null; }
export interface GainsTable { rows: GainRow[]; }

const GAIN_HEADER_RE = /antes|depois|economi|ganho/i;

/** Acha, dentre as tabelas de um HTML de update, a que representa ganhos
 *  (cabeçalho com Antes/Depois/Economia/Ganho) — ignora outras tabelas do
 *  mesmo comentário (ex: "Escopo" com colunas Módulo/O que cobre). */
export function extractGainsTable(html: string): GainsTable | null {
  if (!html || !/<table/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const headerRow = table.querySelector('tr');
    if (!headerRow) continue;
    const headers = Array.from(headerRow.querySelectorAll('th,td')).map((c) => (c.textContent || '').trim());
    if (!headers.some((h) => GAIN_HEADER_RE.test(h))) continue;
    const idxAntes = headers.findIndex((h) => /antes/i.test(h));
    const idxDepois = headers.findIndex((h) => /depois/i.test(h));
    const idxGanho = headers.findIndex((h) => /economi|ganho/i.test(h));
    const bodyRows = Array.from(table.querySelectorAll('tr')).slice(1);
    const rows: GainRow[] = bodyRows
      .map((tr) => Array.from(tr.querySelectorAll('td,th')).map((c) => (c.textContent || '').trim()))
      .filter((cells) => cells.some((c) => c))
      .map((cells) => ({
        label: cells[0] || '',
        before: idxAntes > 0 ? cells[idxAntes] || null : null,
        after: idxDepois > 0 ? cells[idxDepois] || null : null,
        amount: idxGanho > 0 ? cells[idxGanho] || null : (cells.length > 1 ? cells[cells.length - 1] : null),
      }));
    if (rows.length) return { rows };
  }
  return null;
}

function splitSections(text: string): Record<string, string> {
  const KNOWN = ['status\\s+atual', 'próximos?\\s*passos?', 'objetivo', 'justificativa', 'stakeholders?', 'premissas?', 'ganhos?(?:\\s+em\\s+tempo)?', 'okrs?\\s+vinculados?', 'riscos?'];
  const re = new RegExp(`^(${KNOWN.join('|')})\\s*:?\\s*(.*)$`, 'i');
  const lines = text.split('\n');
  const sections: Record<string, string> = {};
  let cur: string | null = null; let buf: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (DIVIDER_LINE.test(trimmed)) continue;
    const m = re.exec(trimmed);
    if (m) {
      if (cur !== null) sections[cur] = buf.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      cur = m[1].trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s*:$/, '').replace(/\s+/g, '_');
      buf = m[2]?.trim() ? [m[2].trim()] : [];
    } else if (cur !== null) buf.push(line);
  }
  if (cur !== null) sections[cur] = buf.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return sections;
}
function parseBullets(text: string): string[] {
  return (text || '').split('\n').map((l) => l.replace(/^[\s\-–•*●\d.)]+/, '').trim()).filter((l) => l.length > 3).slice(0, 10);
}

export interface ParsedUpdates {
  statusAtual: string | null; proximos: string[]; ganhos: string[]; objetivo: string | null;
  justificativa: string | null; stakeholders: string | null; premissas: string | null;
  gainsTable: GainsTable | null; images: UpdImage[]; latestTs: number;
}

/** Extrai Status Atual + Próximos Passos + Ganhos + Objetivo/Justificativa/Stakeholders/Premissas + tabela de ganhos + imagens. */
export function parseUpdates(updates: ItemUpdate[]): ParsedUpdates {
  let statusAtual: string | null = null;
  let proximos: string[] = [];
  let ganhos: string[] = [];
  let objetivo: string | null = null;
  let justificativa: string | null = null;
  let stakeholders: string | null = null;
  let premissas: string | null = null;
  let gainsTable: GainsTable | null = null;
  const images: UpdImage[] = [];
  let latestTs = 0;
  for (const upd of updates) {
    upd.images.forEach((im) => images.push(im));
    if (!gainsTable) gainsTable = extractGainsTable(upd.body);
    const text = upd.text;
    if (!text || text.replace(/[|\-\s]/g, '').length < 10) continue;
    const sec = splitSections(text);
    const keys = Object.keys(sec);
    if (!statusAtual) {
      const sk = keys.find((k) => /status/.test(k));
      if (sk && sec[sk].length > 2) { statusAtual = sec[sk].substring(0, 600); latestTs = upd.ts; }
      else if (!keys.length) { statusAtual = text.trim().substring(0, 600); latestTs = upd.ts; }
    }
    if (!proximos.length) {
      const pk = keys.find((k) => /pr[oó]ximos/.test(k));
      if (pk) proximos = parseBullets(sec[pk]);
    }
    if (!ganhos.length) {
      const gk = keys.find((k) => /ganhos?/.test(k));
      if (gk) ganhos = parseBullets(sec[gk]);
    }
    if (!objetivo) {
      const ok = keys.find((k) => /objetivo|escopo/.test(k));
      if (ok && sec[ok].length > 8) objetivo = sec[ok].substring(0, 500);
    }
    if (!justificativa) {
      const jk = keys.find((k) => /justificativa/.test(k));
      if (jk && sec[jk].length > 8) justificativa = sec[jk].substring(0, 800);
    }
    if (!stakeholders) {
      const stk = keys.find((k) => /stakeholders?/.test(k));
      if (stk && sec[stk].length > 2) stakeholders = sec[stk].substring(0, 800);
    }
    if (!premissas) {
      const pmk = keys.find((k) => /premissas?/.test(k));
      if (pmk && sec[pmk].length > 2) premissas = sec[pmk].substring(0, 800);
    }
  }
  return { statusAtual, proximos, ganhos, objetivo, justificativa, stakeholders, premissas, gainsTable, images, latestTs };
}

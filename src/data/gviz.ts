// Leitura de Google Sheets via gviz/JSONP — portado do dash-produto (loadSheetViaJSONP).
// As telas de Gestão (Engenharia, Lançamentos, Waitlists) puxam dessas planilhas;
// não estão no SharePoint. Acesso público via gviz, sem API key (planilha
// compartilhada por link). Injeta <script> com responseHandler — JSONP clássico.

export interface GvizOpts {
  sheetId: string;
  colNames: string[];
  sheetName?: string | null;
  tq?: string | null;
  gid?: number | null;
  timeoutMs?: number;
}

export function loadSheetViaJSONP({
  sheetId,
  colNames,
  sheetName = null,
  tq = null,
  gid = null,
  timeoutMs = 20000,
}: GvizOpts): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const cbName = '_gs_' + Math.random().toString(36).slice(2);
    const w = window as unknown as Record<string, unknown>;
    const cleanup = () => {
      delete w[cbName];
      const s = document.getElementById(cbName);
      if (s) s.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout ao carregar "' + (sheetName || gid) + '"'));
    }, timeoutMs);

    w[cbName] = (resp: any) => {
      clearTimeout(timer);
      cleanup();
      if (!resp || resp.status === 'error') {
        const msg =
          resp && resp.errors && resp.errors[0]
            ? resp.errors[0].detailed_message || resp.errors[0].message
            : 'Erro desconhecido';
        reject(new Error(msg));
        return;
      }
      const table = resp.table;
      if (!table || !table.rows) {
        resolve([]);
        return;
      }

      const rows: Record<string, string>[] = [];
      for (const row of table.rows) {
        if (!row || !row.c) continue;
        const firstCell = row.c[0];
        if (!firstCell || firstCell.v === null || firstCell.v === undefined || firstCell.v === '') continue;
        // pula cabeçalho e linhas divisoras "Produto"
        const fv = String(firstCell.v).trim().toLowerCase();
        if (fv === colNames[0].toLowerCase() || fv === 'produto') continue;
        // pula artefato de data-zero do gviz
        const dateCell = row.c[1];
        if (dateCell && typeof dateCell.v === 'string' && dateCell.v === 'Date(1899,11,30)') continue;

        const obj: Record<string, string> = {};
        colNames.forEach((name, i) => {
          const cell = row.c[i];
          if (!cell || cell.v === null || cell.v === undefined) {
            obj[name] = '';
            return;
          }
          if (typeof cell.v === 'string' && cell.v.indexOf('Date(') === 0) {
            const dm = cell.v.match(/Date\((\d+),(\d+),(\d+)\)/);
            obj[name] = dm
              ? String(parseInt(dm[3])).padStart(2, '0') +
                '/' +
                String(parseInt(dm[2]) + 1).padStart(2, '0') +
                '/' +
                dm[1]
              : cell.f || '';
          } else if (
            typeof cell.v === 'number' &&
            cell.f &&
            /\d/.test(cell.f) &&
            !cell.f.includes('R$') &&
            !cell.f.includes('%')
          ) {
            obj[name] = cell.f;
          } else if (typeof cell.v === 'number' && !cell.f) {
            const d = new Date(Math.round((cell.v - 25569) * 86400 * 1000));
            obj[name] =
              String(d.getUTCDate()).padStart(2, '0') +
              '/' +
              String(d.getUTCMonth() + 1).padStart(2, '0') +
              '/' +
              d.getUTCFullYear();
          } else {
            const raw = String(cell.v).trim();
            const isUrl = /^https?:\/\//i.test(raw);
            obj[name] = isUrl ? raw : cell.f !== null && cell.f !== undefined ? String(cell.f) : raw;
          }
        });
        rows.push(obj);
      }
      resolve(rows);
    };

    const script = document.createElement('script');
    script.id = cbName;
    let src =
      'https://docs.google.com/spreadsheets/d/' +
      sheetId +
      '/gviz/tq?tqx=out:json;responseHandler:' +
      cbName;
    if (gid != null) src += '&gid=' + gid;
    else if (sheetName) src += '&sheet=' + encodeURIComponent(sheetName);
    if (tq) src += '&tq=' + encodeURIComponent(tq);
    script.src = src;
    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('Erro ao carregar aba "' + sheetName + '"'));
    };
    document.head.appendChild(script);
  });
}

/** Normaliza qualquer formato de mês para "Mon/YY" (ex.: "janeiro/2026" → "Jan/26"). */
export function normalizeMes(raw: string): string {
  if (!raw) return raw;
  let s = raw.trim().replace(/\s+de\s+/gi, '/');
  const MAP: Record<string, string> = {
    janeiro: 'Jan', fevereiro: 'Fev', março: 'Mar', marco: 'Mar', abril: 'Abr',
    maio: 'Mai', junho: 'Jun', julho: 'Jul', agosto: 'Ago', setembro: 'Set',
    outubro: 'Out', novembro: 'Nov', dezembro: 'Dez',
  };
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const mISO = s.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (mISO) return (months[parseInt(mISO[2]) - 1] || mISO[2]) + '/' + mISO[1].slice(2);

  const m1 = s.match(/^([A-Za-záéíóúàâãêôç]+)[\/\s](\d{2,4})$/i);
  if (m1) {
    const short = MAP[m1[1].toLowerCase()] || m1[1].substring(0, 3);
    const yr = m1[2].length === 4 ? m1[2].slice(2) : m1[2];
    return short.charAt(0).toUpperCase() + short.slice(1).toLowerCase() + '/' + yr;
  }
  const m2full = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2full) return (months[parseInt(m2full[2]) - 1] || m2full[2]) + '/' + m2full[3].slice(2);

  const m3 = s.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (m3) return (months[parseInt(m3[2]) - 1] || m3[2]) + '/' + m3[1].slice(2);

  const m2 = s.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    const yr = m2[2].length === 4 ? m2[2].slice(2) : m2[2];
    return (months[parseInt(m2[1]) - 1] || m2[1]) + '/' + yr;
  }
  return s;
}

/** "R$ 1.422,13" → 1422.13 · "196.42" → 196.42 · "13527" → 13527 (pt-BR aware). */
export function parseSheetNum(val: unknown): number {
  if (!val) return 0;
  const s = String(val).trim();
  if (s.includes(',')) {
    return parseFloat(s.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(/R\$\s*/g, '')) || 0;
}

/** "01/03/2026" / "2026-03-01" / "Date(2026,2,1)" → Date | null. */
export function parseDateBR(str: unknown): Date | null {
  if (!str) return null;
  const s = String(str).trim();
  const slash = s.split('/');
  if (slash.length === 3) {
    const a = parseInt(slash[0]), b = parseInt(slash[1]), y = parseInt(slash[2]);
    if (!isNaN(a) && !isNaN(b) && !isNaN(y) && y > 1900) {
      if (a <= 31 && b <= 12) return new Date(y, b - 1, a);
      if (a <= 12 && b <= 31) return new Date(y, a - 1, b);
    }
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const gv = s.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (gv) return new Date(+gv[1], +gv[2], +gv[3]);
  return null;
}

// ── CONFIG das fontes de Gestão (dash-produto) ───────────────────────────
export const GESTAO_CONFIG = {
  sheets: {
    waitlist: '1w_9faPGTnadObygRDvXqF47PD9CWdtMsPzDKTS0ov6s',
    waitlistResults: { sheetId: '1GtwCBZ2ljYY_iAL3EgjC-SsAmRGArTxcbpIpw0jE3vA', gid: 1642972502 },
    lancamentos: '1F0NNA-T5Vscc_AmIeh2tQkvKAdsmPjrHMLldzUznRi8',
    sales: '1mHnQXMOLom4QPQ9dZOUi48XCbK9rU-LSEJWKVTpevPQ',
    engenhariaGid: 975326169,
    // Estoque por canais/locais (por SKU). Cabeçalho de 3 linhas mescladas →
    // ler por índice de coluna (ver COLS em EstoqueCanais.tsx).
    estoqueCanais: { sheetId: '1FdmE1CvAusXk3DwjfhyKZ8acF1xLzczlzhaPH3-ack8', gid: 1542625543 },
  },
};

/**
 * Carrega uma aba do Google Sheets detectando os nomes das colunas dinamicamente
 * a partir do cabeçalho da resposta gviz — sem precisar informar a ordem das colunas.
 */
export function loadSheetDynamic({
  sheetId, sheetName = null, tq = null, gid = null, timeoutMs = 20000,
}: Omit<GvizOpts, 'colNames'>): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const cbName = '_gs_' + Math.random().toString(36).slice(2);
    const w = window as unknown as Record<string, unknown>;
    const cleanup = () => {
      delete w[cbName];
      const s = document.getElementById(cbName);
      if (s) s.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout ao carregar "' + (sheetName || gid) + '"'));
    }, timeoutMs);

    w[cbName] = (resp: any) => {
      clearTimeout(timer);
      cleanup();
      if (!resp || resp.status === 'error') {
        const msg = resp?.errors?.[0]?.detailed_message || resp?.errors?.[0]?.message || 'Erro desconhecido';
        reject(new Error(msg));
        return;
      }
      const table = resp.table;
      if (!table || !table.rows) { resolve([]); return; }

      const cols: string[] = (table.cols || []).map((c: any) => String(c.label || c.id || '').trim());

      const rows: Record<string, string>[] = [];
      for (const row of table.rows) {
        if (!row?.c) continue;
        const firstCell = row.c[0];
        if (!firstCell || firstCell.v === null || firstCell.v === undefined || firstCell.v === '') continue;

        const obj: Record<string, string> = {};
        cols.forEach((name, i) => {
          if (!name) return;
          const cell = row.c[i];
          if (!cell || cell.v === null || cell.v === undefined) { obj[name] = ''; return; }
          if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
            const dm = cell.v.match(/Date\((\d+),(\d+),(\d+)\)/);
            obj[name] = dm
              ? String(parseInt(dm[3])).padStart(2, '0') + '/' + String(parseInt(dm[2]) + 1).padStart(2, '0') + '/' + dm[1]
              : cell.f || '';
          } else {
            const raw = String(cell.v).trim();
            obj[name] = cell.f !== null && cell.f !== undefined ? String(cell.f) : raw;
          }
        });
        rows.push(obj);
      }
      resolve(rows);
    };

    const script = document.createElement('script');
    script.id = cbName;
    let src = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json;responseHandler:' + cbName;
    if (gid != null) src += '&gid=' + gid;
    else if (sheetName) src += '&sheet=' + encodeURIComponent(sheetName);
    if (tq) src += '&tq=' + encodeURIComponent(tq);
    script.src = src;
    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('Erro ao carregar "' + (sheetName || gid) + '"'));
    };
    document.head.appendChild(script);
  });
}

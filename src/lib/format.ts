export function fmtBRL(v: number | null | undefined, compact = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (compact) {
    if (Math.abs(v) >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
    return `R$ ${Math.round(v)}`;
  }
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function fmtNum(v: number | null | undefined, compact = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (compact) {
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  }
  return Math.round(v).toLocaleString('pt-BR');
}

export function fmtPct(v: number | null | undefined, withSign = false): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = withSign && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

export function ymLabel(ym: string): string {
  const months = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [y, m] = ym.split('-');
  return `${months[+m]}/${y.slice(2)}`;
}

export function ymCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Returns 'YYYY-MM' of the most recent month present in `yms`. */
export function maxYm(yms: string[]): string | null {
  if (!yms.length) return null;
  return yms.reduce((max, ym) => (ym > max ? ym : max), yms[0]);
}

/** Subtract `months` from a `YYYY-MM` string. */
export function shiftYm(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

// Paginação reutilizável para tabelas (máx. 15 linhas por página por padrão).

export const PAGE_SIZE = 15;

interface Props {
  page: number;       // 0-based
  total: number;      // total de itens (antes do slice)
  pageSize?: number;
  onChange: (page: number) => void;
}

export function Pager({ page, total, pageSize = PAGE_SIZE, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const cur = Math.min(page, pages - 1);
  return (
    <div className="g-pager">
      <button className="g-pager__btn" disabled={cur <= 0} onClick={() => onChange(cur - 1)}>‹ Anterior</button>
      <span className="g-pager__info">{cur + 1} / {pages}</span>
      <button className="g-pager__btn" disabled={cur >= pages - 1} onClick={() => onChange(cur + 1)}>Próximo ›</button>
      <style>{`
        .g-pager { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 12px; }
        .g-pager__btn { font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); }
        .g-pager__btn:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
        .g-pager__btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .g-pager__info { font-size: 12px; font-weight: 700; color: var(--text-2); font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}

/** Fatia um array para a página atual, clampando a página ao total disponível. */
export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const cur = Math.min(Math.max(0, page), pages - 1);
  return items.slice(cur * pageSize, cur * pageSize + pageSize);
}

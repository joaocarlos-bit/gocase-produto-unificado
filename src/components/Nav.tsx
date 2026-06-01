export type ScreenId = 'pulso' | 'lancamentos' | 'produto' | 'portfolio' | 'estoque' | 'canais' | 'clientes' | 'diario' | 'roadmap';

export interface NavItem {
  id: ScreenId;
  label: string;
  available: boolean;
  badge?: string;
  align?: 'right';
}

const ITEMS: NavItem[] = [
  { id: 'pulso',       label: 'VISÃO GERAL',   available: true },
  { id: 'lancamentos', label: 'LANÇAMENTOS',   available: true },
  { id: 'produto',     label: 'PRODUTO',       available: true },
  { id: 'portfolio',   label: 'PORTFÓLIO',     available: true },
  { id: 'estoque',     label: 'ESTOQUE',       available: true },
  { id: 'canais',      label: 'CANAIS',        available: true },
  { id: 'clientes',    label: 'CLIENTES',      available: true },
  { id: 'diario',      label: 'DIÁRIO',        available: false, badge: 'S3' },
  { id: 'roadmap',     label: 'ROADMAP',       available: true,  align: 'right' },
];

interface Props {
  current: ScreenId;
  onChange: (id: ScreenId) => void;
}

export function Nav({ current, onChange }: Props) {
  const left = ITEMS.filter((i) => i.align !== 'right');
  const right = ITEMS.filter((i) => i.align === 'right');

  const renderBtn = (item: NavItem) => (
    <button
      key={item.id}
      className={`nav__tab ${current === item.id ? 'nav__tab--on' : ''} ${!item.available ? 'nav__tab--soon' : ''}`}
      onClick={() => item.available && onChange(item.id)}
      disabled={!item.available}
      title={item.available ? '' : `Em desenvolvimento — sprint ${item.badge}`}
    >
      <span className={`nav__dot ${current === item.id ? 'nav__dot--on' : ''}`} />
      <span>{item.label}</span>
      {!item.available && <span className="nav__badge">{item.badge}</span>}
    </button>
  );

  return (
    <nav className="nav">
      <div className="nav__inner">
        <div className="nav__group">{left.map(renderBtn)}</div>
        <div className="nav__group">{right.map(renderBtn)}</div>
      </div>
      <style>{`
        .nav {
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 56px;
          z-index: 40;
        }
        .nav__inner {
          display: flex;
          justify-content: space-between;
          padding: 0 32px;
          max-width: 1600px;
          margin: 0 auto;
          overflow-x: auto;
        }
        .nav__group {
          display: flex;
          align-items: center;
        }
        .nav__tab {
          padding: 14px 16px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-2);
          border-bottom: 3px solid transparent;
          margin-bottom: -1px;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 8px;
          letter-spacing: 0.3px;
          transition: all 0.15s;
        }
        .nav__tab:not(:disabled):hover {
          color: var(--text);
        }
        .nav__tab--on {
          color: var(--text);
          border-bottom-color: var(--accent);
          background: linear-gradient(180deg, transparent 0%, rgba(200, 231, 76, 0.08) 100%);
        }
        .nav__tab--soon {
          color: var(--text-3);
          cursor: not-allowed;
          opacity: 0.7;
        }
        .nav__dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--border-2);
        }
        .nav__dot--on {
          background: var(--accent-d);
        }
        .nav__badge {
          font-size: 9px;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--surface-2);
          color: var(--text-3);
          border: 1px solid var(--border);
          letter-spacing: 0;
        }
        @media (max-width: 700px) {
          .nav__inner { padding: 0 16px; }
          .nav__tab { padding: 10px 12px; font-size: 10px; }
        }
      `}</style>
    </nav>
  );
}

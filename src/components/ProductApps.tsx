import { useEffect, useRef, useState } from 'react';
import { PRODUCT_APPS } from '../data/productApps';

// Launcher estilo "Google Apps" (grade de waffle) no topo à direita.
// Abre um popover com os apps de produto (mesma fonte da Central de Links).
export function ProductApps() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="papps" ref={rootRef}>
      <button
        className={`papps__btn ${open ? 'on' : ''}`}
        title="Product Apps"
        aria-label="Product Apps"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          {[2, 8, 14].map((y) => [2, 8, 14].map((x) => (
            <circle key={`${x}-${y}`} cx={x + 1} cy={y + 1} r="1.6" fill="currentColor" />
          )))}
        </svg>
      </button>

      {open && (
        <div className="papps__panel" role="menu">
          <div className="papps__head">Product Apps</div>
          <div className="papps__grid">
            {PRODUCT_APPS.map((a) => (
              <a
                key={a.url}
                className="papps__tile"
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                title={a.description}
                onClick={() => setOpen(false)}
              >
                <span className="papps__tile-icon">{a.icon}</span>
                <span className="papps__tile-title">{a.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .papps { position: relative; display: flex; align-items: center; }
        .papps__btn {
          display: flex; align-items: center; justify-content: center;
          width: 34px; height: 34px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.2);
          color: #cdd9eb;
          border: 1.5px solid transparent;
          cursor: pointer;
          transition: all .12s;
        }
        .papps__btn:hover { color: #fff; background: rgba(0, 0, 0, 0.32); }
        .papps__btn.on { color: var(--brand-blue-d); background: var(--accent); border-color: var(--accent); }
        .papps__panel {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          width: 320px;
          max-height: 70vh;
          overflow-y: auto;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-md);
          box-shadow: 0 16px 44px rgba(0,0,0,0.22);
          padding: 14px;
          z-index: 100;
          animation: papps-in .12s ease-out;
        }
        @keyframes papps-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .papps__head {
          font-size: 10px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 1.2px;
          color: var(--text-3);
          padding: 2px 4px 12px;
        }
        .papps__grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }
        .papps__tile {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 8px;
          padding: 14px 6px;
          border-radius: var(--r-sm);
          text-decoration: none;
          text-align: center;
          transition: background .12s;
        }
        .papps__tile:hover { background: var(--surface-2); }
        .papps__tile-icon {
          width: 44px; height: 44px;
          border-radius: 12px;
          background: var(--surface-2);
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
        }
        .papps__tile:hover .papps__tile-icon { background: var(--surface); }
        .papps__tile-title {
          font-size: 11.5px; font-weight: 700; color: var(--text);
          line-height: 1.25;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

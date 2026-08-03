import { useMemo, useState } from 'react';
import { PageHero } from '../../components/PageHero';
import { PRODUCT_APPS, hostOf, type ProductApp } from '../../data/productApps';

export function CentralLinks() {
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('pt-BR');
    const filtered = PRODUCT_APPS.filter(
      (l) => term === '' ||
        l.title.toLocaleLowerCase('pt-BR').includes(term) ||
        l.description.toLocaleLowerCase('pt-BR').includes(term) ||
        l.category.toLocaleLowerCase('pt-BR').includes(term),
    );
    const map = new Map<string, ProductApp[]>();
    for (const l of filtered) {
      if (!map.has(l.category)) map.set(l.category, []);
      map.get(l.category)!.push(l);
    }
    return Array.from(map.entries());
  }, [q]);

  return (
    <div className="links">
      <PageHero
        breadcrumb="Geral · Central de Links"
        title="Central de Links"
        subtitle="Diretório das ferramentas e apps internos do time Produto Gocase. Clique para abrir em uma nova aba."
        right={
          <input
            className="links__search"
            placeholder="Buscar link…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      />

      {groups.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          Nenhum link encontrado para “{q}”.
        </div>
      )}

      {groups.map(([category, items]) => (
        <div key={category} className="links__group">
          <div className="links__group-title">{category}</div>
          <div className="links__grid">
            {items.map((l) => (
              <a key={l.url} className="links__card" href={l.url} target="_blank" rel="noopener noreferrer">
                <div className="links__card-icon">{l.icon}</div>
                <div className="links__card-body">
                  <div className="links__card-title">
                    {l.title}
                    <span className="links__card-ext">↗</span>
                  </div>
                  <div className="links__card-host">{hostOf(l.url)}</div>
                  <div className="links__card-desc">{l.description}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}

      <style>{`
        .links__search {
          padding: 8px 14px;
          font-size: 13px;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          outline: none;
          min-width: 220px;
        }
        .links__search:focus { border-color: var(--brand-blue); }
        .links__group { margin-bottom: 28px; }
        .links__group-title {
          font-size: 11px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 1.2px;
          color: var(--text-3);
          margin-bottom: 12px;
        }
        .links__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
        }
        .links__card {
          display: flex; gap: 14px; align-items: flex-start;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-md);
          box-shadow: var(--shadow-sm);
          padding: 18px;
          text-decoration: none;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .links__card:hover {
          border-color: var(--brand-blue);
          box-shadow: 0 8px 24px rgba(30, 95, 184, 0.12);
          transform: translateY(-2px);
        }
        .links__card-icon {
          flex-shrink: 0;
          width: 46px; height: 46px;
          border-radius: 12px;
          background: var(--surface-2);
          display: flex; align-items: center; justify-content: center;
          font-size: 24px;
        }
        .links__card-body { flex: 1; min-width: 0; }
        .links__card-title {
          font-size: 15px; font-weight: 800; color: var(--text);
          display: flex; align-items: center; gap: 6px;
          letter-spacing: -0.01em;
        }
        .links__card-ext { font-size: 12px; color: var(--text-3); }
        .links__card-host { font-size: 11px; color: var(--brand-blue); font-weight: 600; margin-top: 2px; }
        .links__card-desc { font-size: 12.5px; color: var(--text-2); line-height: 1.5; margin-top: 8px; }
      `}</style>
    </div>
  );
}

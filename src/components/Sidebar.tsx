// Sidebar lateral da aplicação unificada (Gestão + Performance).
// Substitui a antiga Nav de abas no topo. Duas frentes:
//   - Gestão     → telas vindas do dash-produto (em migração; placeholders)
//   - Performance → telas do gocase-produto (já funcionais)

export type ScreenId =
  // Geral — prefixo gr_
  | 'gr_feed' | 'gr_links'
  // Performance (gocase-produto)
  | 'pulso' | 'lancamentos' | 'produto' | 'portfolio' | 'estoque' | 'canais' | 'clientes' | 'roadmap'
  // Gestão (dash-produto) — prefixo g_ pra não colidir com 'lancamentos' do Performance
  | 'g_engenharia' | 'g_lancamentos' | 'g_waitlists' | 'g_prazo' | 'g_projetos' | 'g_relatorios'
  // Importação (Controle de Importações) — prefixo imp_
  | 'imp_custos';

export type Front = 'geral' | 'gestao' | 'performance' | 'importacao';

export interface NavItem {
  id: ScreenId;
  label: string;
  /** false = tela ainda não migrada → abre placeholder "em migração". */
  ready: boolean;
}

export interface NavSection {
  front: Front;
  label: string;
  hint: string;
  items: NavItem[];
}

export const SECTIONS: NavSection[] = [
  {
    front: 'geral',
    label: 'Geral',
    hint: 'Feed & Links',
    items: [
      { id: 'gr_feed',  label: 'Comentários & Feedbacks', ready: true },
      { id: 'gr_links', label: 'Central de Links',         ready: true },
    ],
  },
  {
    front: 'gestao',
    label: 'Gestão',
    hint: 'dash-produto',
    items: [
      { id: 'g_engenharia', label: 'Engenharia de produto', ready: true },
      { id: 'g_lancamentos', label: 'Status Lançamentos',   ready: true },
      { id: 'g_waitlists',  label: 'Waitlist & CTR',        ready: true },
      { id: 'g_prazo',      label: 'Prazo dos pedidos',     ready: true },
      { id: 'g_projetos',   label: 'Projetos',              ready: true },
      { id: 'g_relatorios', label: 'Relatórios',            ready: true },
    ],
  },
  {
    front: 'performance',
    label: 'Performance',
    hint: 'gocase-produto',
    items: [
      { id: 'pulso',       label: 'Visão Geral', ready: true },
      { id: 'lancamentos', label: 'Lançamentos', ready: true },
      { id: 'produto',     label: 'Produto',     ready: true },
      { id: 'portfolio',   label: 'Portfólio',   ready: true },
      { id: 'estoque',     label: 'Estoque',     ready: true },
      { id: 'canais',      label: 'Canais',      ready: true },
      { id: 'clientes',    label: 'Clientes',    ready: true },
      { id: 'roadmap',     label: 'Roadmap',     ready: true },
    ],
  },
  {
    front: 'importacao',
    label: 'Importação',
    hint: 'Controle de Importações',
    items: [
      { id: 'imp_custos', label: 'Histórico de Custos', ready: true },
    ],
  },
];

interface Props {
  current: ScreenId;
  onChange: (id: ScreenId) => void;
  open: boolean;
  onToggle: () => void;
}

export function Sidebar({ current, onChange, open, onToggle }: Props) {
  return (
    <aside className={`sb ${open ? '' : 'sb--collapsed'}`}>
      <button
        className="sb__toggle"
        onClick={onToggle}
        title={open ? 'Recolher menu' : 'Expandir menu'}
        aria-label={open ? 'Recolher menu' : 'Expandir menu'}
      >
        {open ? '«' : '☰'}
      </button>
      <nav className="sb__nav">
        {SECTIONS.map((section) => (
          <div className="sb__section" key={section.front}>
            <div className="sb__head">
              <span className="sb__head-label">{section.label}</span>
            </div>
            <div className="sb__items">
              {section.items.map((item) => {
                const on = current === item.id;
                return (
                  <button
                    key={item.id}
                    className={`sb__item ${on ? 'sb__item--on' : ''} ${item.ready ? '' : 'sb__item--soon'}`}
                    onClick={() => onChange(item.id)}
                  >
                    <span className={`sb__dot ${on ? 'sb__dot--on' : ''}`} />
                    <span className="sb__label">{item.label}</span>
                    {!item.ready && <span className="sb__badge">em breve</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <style>{`
        .sb {
          flex: 0 0 224px;
          width: 224px;
          align-self: stretch;
          background: var(--surface);
          border-right: 1px solid var(--border);
          position: sticky;
          top: 56px;
          height: calc(100vh - 56px);
          overflow-y: auto;
          overflow-x: hidden;
          padding: 14px 12px 24px;
          transition: flex-basis 0.18s ease, width 0.18s ease, padding 0.18s ease;
        }
        .sb__toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          margin: 0 0 12px auto;
          border-radius: 7px;
          border: 1px solid var(--border);
          background: var(--surface-2);
          color: var(--text-2);
          font-size: 14px;
          line-height: 1;
          transition: background 0.12s, color 0.12s;
        }
        .sb__toggle:hover { background: var(--border); color: var(--text); }
        /* Recolhido: vira um trilho estreito só com o botão de expandir */
        .sb--collapsed {
          flex-basis: 50px;
          width: 50px;
          padding: 14px 8px 24px;
        }
        .sb--collapsed .sb__toggle { margin: 0 auto 0; }
        .sb--collapsed .sb__nav { display: none; }
        .sb__section { margin-bottom: 22px; }
        .sb__head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          padding: 0 10px 8px;
          margin-bottom: 4px;
          border-bottom: 1px solid var(--border);
        }
        .sb__head-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--text);
        }
        .sb__head-hint {
          font-size: 9px;
          color: var(--text-3);
          font-variant-numeric: tabular-nums;
        }
        .sb__items { display: flex; flex-direction: column; gap: 2px; }
        .sb__item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          text-align: left;
          padding: 9px 10px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-2);
          border-left: 3px solid transparent;
          transition: background 0.12s, color 0.12s;
        }
        .sb__item:hover { background: var(--surface-2); color: var(--text); }
        .sb__item--on {
          background: linear-gradient(90deg, rgba(200, 231, 76, 0.16) 0%, transparent 100%);
          color: var(--text);
          border-left-color: var(--accent);
        }
        .sb__item--soon { color: var(--text-3); }
        .sb__item--soon:hover { color: var(--text-2); }
        .sb__dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--border-2);
          flex: 0 0 auto;
        }
        .sb__dot--on { background: var(--accent-d); }
        .sb__label { flex: 1; }
        .sb__badge {
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.3px;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--surface-2);
          color: var(--text-3);
          border: 1px solid var(--border);
        }
        /* Mobile: vira barra horizontal rolável acima do conteúdo */
        @media (max-width: 900px) {
          .sb {
            flex: 1 1 auto;
            width: 100%;
            height: auto;
            position: static;
            border-right: none;
            border-bottom: 1px solid var(--border);
            padding: 10px 12px;
          }
          .sb__nav { display: flex; gap: 18px; overflow-x: auto; }
          .sb__section { margin-bottom: 0; min-width: max-content; }
          .sb__items { flex-direction: row; }
          .sb__item { white-space: nowrap; }
          .sb__toggle { display: none; } /* sem recolher no mobile */
          .sb--collapsed { flex-basis: auto; width: 100%; padding: 10px 12px; }
          .sb--collapsed .sb__nav { display: flex; }
        }
      `}</style>
    </aside>
  );
}

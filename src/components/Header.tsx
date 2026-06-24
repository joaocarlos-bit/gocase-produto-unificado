import type { CanalGrupo } from '../data/types';
import { CANAL_GRUPOS } from '../data/types';
import { OnlinePresence } from './OnlinePresence';

interface Props {
  periodFrom: string;
  periodTo: string;
  collectedAt: string;
  linhasCount: number;
  skusCount: number;
  canais: CanalGrupo[];
  onChangeCanais: (canais: CanalGrupo[]) => void;
}

const CANAL_LABEL: Record<CanalGrupo, string> = {
  D2C: 'D2C', B2B: 'B2B', Lojas: 'Lojas', Brindes: 'Brindes',
};

export function Header({ periodFrom, periodTo, collectedAt, linhasCount, skusCount, canais, onChangeCanais }: Props) {
  const dt = new Date(collectedAt);
  const collectedLabel = `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  void periodFrom; void periodTo; void linhasCount; void skusCount;
  function toggle(c: CanalGrupo) {
    const set = new Set(canais);
    if (set.has(c)) set.delete(c); else set.add(c);
    // Garante pelo menos um canal selecionado
    if (set.size === 0) return;
    onChangeCanais(CANAL_GRUPOS.filter((g) => set.has(g)));
  }
  return (
    <header className="hdr">
      <div className="hdr__left">
        <span className="hdr__brand">gogroup</span>
        <div className="hdr__divider">
          <div className="hdr__rocket">🚀</div>
          <div className="hdr__tropa">
            <div className="hdr__tropa-title">PRODUTO GOCASE</div>
            <div className="hdr__tropa-sub">PERFORMANCE · v2</div>
          </div>
        </div>
      </div>
      <div className="hdr__right">
        <div className="hdr__canais" title="Filtro global de canais (afeta todas as abas)">
          <span className="hdr__canais-lbl">Canais</span>
          {CANAL_GRUPOS.map((c) => (
            <button
              key={c}
              className={`hdr__canal-chip ${canais.includes(c) ? 'on' : ''}`}
              onClick={() => toggle(c)}
            >
              {CANAL_LABEL[c]}
            </button>
          ))}
        </div>
        <OnlinePresence />
        <span className="hdr__pill">📦 snapshot · {collectedLabel}</span>
      </div>
      <style>{`
        .hdr {
          background: var(--brand-blue);
          background-image: linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-blue-d) 100%);
          color: #fff;
          padding: 14px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .hdr__left {
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .hdr__brand {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.5px;
          color: #fff;
          line-height: 1;
        }
        .hdr__divider {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .hdr__rocket {
          width: 32px;
          height: 32px;
          background: var(--accent);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }
        .hdr__tropa {
          line-height: 1.1;
        }
        .hdr__tropa-title {
          font-size: 15px;
          font-weight: 800;
          color: #fff;
          letter-spacing: 0.5px;
        }
        .hdr__tropa-sub {
          font-size: 10px;
          font-weight: 600;
          color: #a8c9f0;
          letter-spacing: 1.2px;
          margin-top: 2px;
        }
        .hdr__right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .hdr__pill {
          font-size: 11px;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.25);
          color: #fff;
          letter-spacing: 0.3px;
        }
        .hdr__canais {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
        }
        .hdr__canais-lbl {
          font-size: 9px;
          font-weight: 700;
          color: #cdd9eb;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          margin-right: 2px;
        }
        .hdr__canal-chip {
          font-size: 10px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          background: transparent;
          color: #a8c9f0;
          border: 1.5px solid transparent;
          transition: all .12s;
          letter-spacing: 0.3px;
        }
        .hdr__canal-chip:hover { color: #fff; }
        .hdr__canal-chip.on {
          background: var(--accent);
          color: var(--brand-blue-d);
          border-color: var(--accent);
        }
        @media (max-width: 700px) {
          .hdr { padding: 12px 16px; flex-wrap: wrap; gap: 8px; }
          .hdr__brand { font-size: 22px; }
          .hdr__canais-lbl { display: none; }
        }
      `}</style>
    </header>
  );
}

import { Roadmap } from '../components/Roadmap';
import { PageHero } from './../components/PageHero';

export function RoadmapScreen() {
  return (
    <div className="rmscr">
      <PageHero
        breadcrumb="Unidade de negócio: Produto Gocase · Roadmap"
        title="Roadmap da Dashboard v2"
        subtitle="Transparência total: o que já está pronto, o que está sendo construído agora e o que vem a seguir. Esta página é atualizada a cada entrega."
      />

      <div className="rmscr__principles">
        <div className="rmscr__principle">
          <span className="rmscr__principle-icon">🎯</span>
          <div>
            <strong>Cada tela responde uma pergunta</strong>
            <p>Se duas telas respondem a mesma pergunta com cortes diferentes, vira filtro — não vira aba.</p>
          </div>
        </div>
        <div className="rmscr__principle">
          <span className="rmscr__principle-icon">📐</span>
          <div>
            <strong>Decisão, não dado bruto</strong>
            <p>A landing default é a tela mais usada (Pulso). Tabelas são exception view, não home.</p>
          </div>
        </div>
        <div className="rmscr__principle">
          <span className="rmscr__principle-icon">🔁</span>
          <div>
            <strong>Espelha as cadências da squad</strong>
            <p>Sandro (semanal) → Pulso. Lara (quinzenal) → Lançamentos. Miguel (mensal) → Portfólio.</p>
          </div>
        </div>
      </div>

      <Roadmap />

      <style>{`
        .rmscr__principles {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        @media (max-width: 900px) {
          .rmscr__principles { grid-template-columns: 1fr; }
        }
        .rmscr__principle {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-md);
          padding: 14px 16px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .rmscr__principle-icon {
          font-size: 22px;
          flex-shrink: 0;
        }
        .rmscr__principle strong {
          display: block;
          font-size: 13px;
          color: var(--text);
          margin-bottom: 4px;
        }
        .rmscr__principle p {
          font-size: 11px;
          color: var(--text-2);
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}

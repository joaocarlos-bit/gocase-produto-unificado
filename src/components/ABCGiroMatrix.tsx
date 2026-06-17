import {
  abcGiroMatrix,
  BAND_HINT,
  BAND_LABEL,
  BANDS_ORDER,
  CURVAS_ORDER,
  type CoberturaBand,
  type EstoqueRow,
} from '../data/aggregates';
import { fmtBRL } from '../lib/format';
import { Card } from './Card';

interface Props {
  rows: EstoqueRow[];
  /** Cross-filter atual (curva + band). null = sem filtro. */
  selected: { curva: string | null; band: CoberturaBand | null };
  onCellClick: (curva: string, band: CoberturaBand) => void;
}

const BAND_BG: Record<CoberturaBand, string> = {
  ruptura: 'rgba(220, 38, 38, 0.14)',
  critica: 'rgba(220, 38, 38, 0.08)',
  baixa:   'rgba(217, 119, 6, 0.10)',
  boa:     'rgba(5, 150, 105, 0.10)',
  excesso: 'rgba(30, 95, 184, 0.08)',
};
const BAND_TEXT: Record<CoberturaBand, string> = {
  ruptura: '#dc2626',
  critica: '#dc2626',
  baixa:   '#d97706',
  boa:     '#059669',
  excesso: '#1e5fb8',
};

export function ABCGiroMatrix({ rows, selected, onCellClick }: Props) {
  const cells = abcGiroMatrix(rows);

  // Encontra o capital máximo pra escalar a intensidade visual
  const maxCapital = Math.max(1, ...cells.map((c) => c.capital));

  // Sub: total skus + total capital
  const total = rows.length;
  const totalCapital = rows.reduce((s, r) => s + r.capitalImobilizado, 0);

  return (
    <Card
      title="Matriz ABC × Cobertura"
      subtitle={
        <>
          <strong>{total}</strong> SKUs · <strong>{fmtBRL(totalCapital)}</strong> de capital imobilizado · clique numa célula pra filtrar
        </>
      }
    >
      <div className="abc-mx__wrap">
        <table className="abc-mx">
          <thead>
            <tr>
              <th className="abc-mx__corner">Curva ↓ / Cobertura →</th>
              {BANDS_ORDER.map((b) => (
                <th key={b} className="abc-mx__hdr">
                  <div className="abc-mx__hdr-lbl">{BAND_LABEL[b]}</div>
                  <div className="abc-mx__hdr-hint">{BAND_HINT[b]}</div>
                </th>
              ))}
              <th className="abc-mx__hdr abc-mx__hdr--total">Total</th>
            </tr>
          </thead>
          <tbody>
            {CURVAS_ORDER.map((curva) => {
              const rowCells = cells.filter((c) => c.curva === curva);
              const rowCount = rowCells.reduce((s, c) => s + c.count, 0);
              const rowCapital = rowCells.reduce((s, c) => s + c.capital, 0);
              return (
                <tr key={curva}>
                  <th className="abc-mx__row-hdr">{curva}</th>
                  {BANDS_ORDER.map((band) => {
                    const cell = cells.find((c) => c.curva === curva && c.band === band)!;
                    const isSel = selected.curva === curva && selected.band === band;
                    const alpha = cell.capital > 0 ? 0.25 + (cell.capital / maxCapital) * 0.75 : 0.06;
                    const bgStrong = cell.capital > 0
                      ? BAND_BG[band].replace(/[\d.]+\)$/, `${alpha})`)
                      : 'var(--surface-2)';
                    return (
                      <td
                        key={band}
                        className={`abc-mx__cell ${isSel ? 'abc-mx__cell--sel' : ''} ${cell.count === 0 ? 'abc-mx__cell--empty' : ''}`}
                        style={{ background: cell.count > 0 ? bgStrong : 'var(--surface-2)' }}
                        onClick={() => cell.count > 0 && onCellClick(curva, band)}
                        title={cell.count > 0 ? `${cell.count} SKUs · ${fmtBRL(cell.capital)} de capital` : 'Vazio'}
                      >
                        <div className="abc-mx__cell-count" style={{ color: cell.count > 0 ? BAND_TEXT[band] : 'var(--text-3)' }}>
                          {cell.count}
                        </div>
                        <div className="abc-mx__cell-capital">{cell.count > 0 ? fmtBRL(cell.capital) : ''}</div>
                      </td>
                    );
                  })}
                  <td className="abc-mx__total">
                    <div className="abc-mx__total-count">{rowCount}</div>
                    <div className="abc-mx__total-capital">{fmtBRL(rowCapital)}</div>
                  </td>
                </tr>
              );
            })}
            <tr className="abc-mx__footer-row">
              <th className="abc-mx__row-hdr">Total</th>
              {BANDS_ORDER.map((band) => {
                const colCells = cells.filter((c) => c.band === band);
                const colCount = colCells.reduce((s, c) => s + c.count, 0);
                const colCapital = colCells.reduce((s, c) => s + c.capital, 0);
                return (
                  <td key={band} className="abc-mx__col-total">
                    <div className="abc-mx__total-count">{colCount}</div>
                    <div className="abc-mx__total-capital">{fmtBRL(colCapital)}</div>
                  </td>
                );
              })}
              <td className="abc-mx__grand-total">
                <div className="abc-mx__total-count">{total}</div>
                <div className="abc-mx__total-capital">{fmtBRL(totalCapital)}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <style>{`
        .abc-mx__wrap {
          overflow-x: auto;
        }
        .abc-mx {
          width: 100%;
          border-collapse: separate;
          border-spacing: 4px;
          font-size: 12px;
          font-variant-numeric: tabular-nums;
          min-width: 720px;
        }
        .abc-mx__corner {
          font-size: 9px;
          font-weight: 700;
          color: var(--text-3);
          text-transform: uppercase;
          letter-spacing: 0.4px;
          text-align: left;
          padding: 6px 10px;
          background: transparent;
        }
        .abc-mx__hdr {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          padding: 8px 6px;
          text-align: center;
        }
        .abc-mx__hdr--total {
          background: var(--surface);
          border-color: var(--border-2);
        }
        .abc-mx__hdr-lbl {
          font-size: 11px;
          font-weight: 700;
          color: var(--text);
        }
        .abc-mx__hdr-hint {
          font-size: 9px;
          font-weight: 500;
          color: var(--text-3);
          margin-top: 2px;
        }
        .abc-mx__row-hdr {
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 800;
          color: var(--text);
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          text-align: left;
          letter-spacing: 0.3px;
        }
        .abc-mx__cell {
          padding: 10px 6px;
          text-align: center;
          border: 1.5px solid transparent;
          border-radius: var(--r-sm);
          cursor: pointer;
          transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s;
          min-width: 90px;
        }
        .abc-mx__cell:not(.abc-mx__cell--empty):hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(15, 23, 42, 0.06);
          border-color: var(--brand-blue);
        }
        .abc-mx__cell--sel {
          border-color: var(--brand-blue) !important;
          box-shadow: 0 0 0 2px var(--brand-blue-l);
        }
        .abc-mx__cell--empty {
          cursor: default;
        }
        .abc-mx__cell-count {
          font-size: 20px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.5px;
        }
        .abc-mx__cell-capital {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-2);
          margin-top: 4px;
          min-height: 12px;
        }

        .abc-mx__total,
        .abc-mx__col-total,
        .abc-mx__grand-total {
          padding: 10px 6px;
          text-align: center;
          background: var(--surface);
          border: 1px solid var(--border-2);
          border-radius: var(--r-sm);
        }
        .abc-mx__grand-total {
          background: var(--brand-blue-l);
          border-color: var(--brand-blue);
        }
        .abc-mx__total-count {
          font-size: 16px;
          font-weight: 800;
          color: var(--text);
        }
        .abc-mx__total-capital {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-2);
          margin-top: 3px;
        }
      `}</style>
    </Card>
  );
}

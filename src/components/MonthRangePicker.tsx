import { useEffect, useMemo, useRef, useState } from 'react';
import { ymLabel } from '../lib/format';

interface Props {
  /** Lista de meses YYYY-MM disponíveis no dataset (ordenada asc). */
  available: string[];
  value: { from: string; to: string };
  onChange: (range: { from: string; to: string }) => void;
}

const M_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function parseYm(ym: string): { y: number; m: number } {
  const [y, m] = ym.split('-').map(Number);
  return { y, m };
}
function buildYm(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Month-granularity range picker. Two panels side by side:
 * left = "De" (start month), right = "Até" (end month).
 * Year navigation arrows above each grid; 4×3 month grid.
 */
export function MonthRangePicker({ available, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);
  const [align, setAlign] = useState<'left' | 'right'>('right');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Pre-compute year boundaries of available data
  const { minYear, maxYear, availableSet } = useMemo(() => {
    const set = new Set(available);
    const years = available.map((ym) => +ym.split('-')[0]);
    return {
      minYear: years.length ? Math.min(...years) : new Date().getFullYear(),
      maxYear: years.length ? Math.max(...years) : new Date().getFullYear(),
      availableSet: set,
    };
  }, [available]);

  const [yearLeft, setYearLeft] = useState(parseYm(value.from).y);
  const [yearRight, setYearRight] = useState(parseYm(value.to).y);

  // Sync drafts + year when value prop changes externally
  useEffect(() => {
    setDraftFrom(value.from);
    setDraftTo(value.to);
    setYearLeft(parseYm(value.from).y);
    setYearRight(parseYm(value.to).y);
  }, [value.from, value.to]);

  // Close on outside click + decide popover alignment dynamically
  useEffect(() => {
    if (!open) return;
    // Choose alignment based on available horizontal space
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popWidth = 540; // approx min-width
      const spaceRight = window.innerWidth - rect.left;
      setAlign(spaceRight < popWidth ? 'right' : 'left');
    }
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        cancel();
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') cancel();
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  function cancel() {
    setDraftFrom(value.from);
    setDraftTo(value.to);
    setYearLeft(parseYm(value.from).y);
    setYearRight(parseYm(value.to).y);
    setOpen(false);
  }

  function apply() {
    let from = draftFrom;
    let to = draftTo;
    if (from > to) { const tmp = from; from = to; to = tmp; }
    onChange({ from, to });
    setOpen(false);
  }

  function applyShortcut(months: number) {
    // Last N months ending on the most recent available month
    const last = available[available.length - 1];
    if (!last) return;
    const idx = available.indexOf(last);
    const startIdx = Math.max(0, idx - (months - 1));
    onChange({ from: available[startIdx], to: last });
    setOpen(false);
  }

  function applyYtd() {
    const last = available[available.length - 1];
    if (!last) return;
    const y = parseYm(last).y;
    const ytdStart = available.find((ym) => parseYm(ym).y === y) ?? last;
    onChange({ from: ytdStart, to: last });
    setOpen(false);
  }

  function applyAll() {
    if (available.length) onChange({ from: available[0], to: available[available.length - 1] });
    setOpen(false);
  }

  return (
    <div className="mrp" ref={wrapRef}>
      <button ref={triggerRef} className="mrp__trigger" onClick={() => setOpen((v) => !v)} type="button">
        <span className="mrp__trigger-icon">📅</span>
        <span className="mrp__trigger-label">{ymLabel(value.from)} → {ymLabel(value.to)}</span>
        <span className="mrp__trigger-caret">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className={`mrp__pop ${align === 'right' ? 'mrp__pop--right' : ''}`}>
          <div className="mrp__shortcuts">
            <button onClick={() => applyShortcut(1)}>Últ. mês</button>
            <button onClick={() => applyShortcut(3)}>Últ. 3m</button>
            <button onClick={() => applyShortcut(6)}>Últ. 6m</button>
            <button onClick={() => applyShortcut(12)}>Últ. 12m</button>
            <button onClick={applyYtd}>YTD</button>
            <button onClick={applyAll}>Tudo</button>
          </div>
          <div className="mrp__panels">
            <Panel
              title="Data de início"
              year={yearLeft}
              setYear={setYearLeft}
              minYear={minYear}
              maxYear={maxYear}
              selected={draftFrom}
              otherEnd={draftTo}
              boundary="from"
              onPick={(ym) => {
                setDraftFrom(ym);
                if (draftTo < ym) setDraftTo(ym);
              }}
              availableSet={availableSet}
            />
            <Panel
              title="Data de término"
              year={yearRight}
              setYear={setYearRight}
              minYear={minYear}
              maxYear={maxYear}
              selected={draftTo}
              otherEnd={draftFrom}
              boundary="to"
              onPick={(ym) => {
                setDraftTo(ym);
                if (draftFrom > ym) setDraftFrom(ym);
              }}
              availableSet={availableSet}
            />
          </div>
          <div className="mrp__footer">
            <span className="mrp__draft">
              {ymLabel(draftFrom)} → {ymLabel(draftTo)}
            </span>
            <div className="mrp__actions">
              <button className="mrp__btn mrp__btn--ghost" onClick={cancel}>Cancelar</button>
              <button className="mrp__btn mrp__btn--primary" onClick={apply}>Aplicar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mrp {
          position: relative;
          display: inline-block;
        }
        .mrp__trigger {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text);
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          font-family: var(--font-sans);
          transition: border-color 0.15s;
        }
        .mrp__trigger:hover { border-color: var(--teal); }
        .mrp__trigger-icon { font-size: 13px; }
        .mrp__trigger-label {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
          color: var(--text);
        }
        .mrp__trigger-caret {
          font-size: 9px;
          color: var(--text-3);
        }

        .mrp__pop {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 100;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          box-shadow: 0 12px 36px rgba(15, 23, 42, 0.12);
          padding: 12px;
          min-width: 520px;
          max-width: calc(100vw - 32px);
        }
        .mrp__pop--right {
          left: auto;
          right: 0;
        }
        .mrp__shortcuts {
          display: flex;
          gap: 6px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .mrp__shortcuts button {
          font-size: 11px;
          font-weight: 500;
          color: var(--text-2);
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 99px;
          padding: 3px 10px;
        }
        .mrp__shortcuts button:hover {
          color: var(--teal);
          border-color: var(--teal);
        }
        .mrp__panels {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .mrp__footer {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .mrp__draft {
          font-family: var(--font-mono);
          font-variant-numeric: tabular-nums;
          font-size: 11px;
          color: var(--text-2);
        }
        .mrp__actions {
          display: flex;
          gap: 6px;
        }
        .mrp__btn {
          padding: 5px 14px;
          font-size: 12px;
          font-weight: 500;
          border-radius: var(--r-sm);
          font-family: var(--font-sans);
        }
        .mrp__btn--ghost {
          color: var(--text-2);
          background: transparent;
          border: 1px solid var(--border);
        }
        .mrp__btn--ghost:hover {
          color: var(--text);
          border-color: var(--text-3);
        }
        .mrp__btn--primary {
          color: #fff;
          background: var(--teal);
          border: 1px solid var(--teal);
        }
        .mrp__btn--primary:hover {
          background: var(--teal-d);
          border-color: var(--teal-d);
        }

        @media (max-width: 600px) {
          .mrp__pop { min-width: 0; width: calc(100vw - 32px); left: -8px; }
          .mrp__panels { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

interface PanelProps {
  title: string;
  year: number;
  setYear: (y: number) => void;
  minYear: number;
  maxYear: number;
  selected: string;
  otherEnd: string;
  boundary: 'from' | 'to';
  onPick: (ym: string) => void;
  availableSet: Set<string>;
}

function Panel({ title, year, setYear, minYear, maxYear, selected, otherEnd, boundary, onPick, availableSet }: PanelProps) {
  const selected_y = parseYm(selected).y;
  const selected_m = parseYm(selected).m;
  const lo = boundary === 'from' ? selected : otherEnd < selected ? otherEnd : selected;
  const hi = boundary === 'to' ? selected : otherEnd > selected ? otherEnd : selected;

  return (
    <div className="mrp-panel">
      <div className="mrp-panel__title">{title}</div>
      <div className="mrp-panel__navrow">
        <button
          className="mrp-panel__nav"
          onClick={() => setYear(Math.max(minYear, year - 1))}
          disabled={year <= minYear}
          aria-label="Ano anterior"
        >‹</button>
        <strong className="mrp-panel__year mono">{year}</strong>
        <button
          className="mrp-panel__nav"
          onClick={() => setYear(Math.min(maxYear, year + 1))}
          disabled={year >= maxYear}
          aria-label="Próximo ano"
        >›</button>
      </div>
      <div className="mrp-panel__grid">
        {M_PT.map((label, idx) => {
          const m = idx + 1;
          const ym = buildYm(year, m);
          const available = availableSet.has(ym);
          const isSelected = year === selected_y && m === selected_m;
          const inRange = ym >= lo && ym <= hi;
          return (
            <button
              key={ym}
              className={`mrp-panel__cell ${available ? '' : 'mrp-panel__cell--off'} ${isSelected ? 'mrp-panel__cell--sel' : ''} ${inRange && !isSelected ? 'mrp-panel__cell--rng' : ''}`}
              disabled={!available}
              onClick={() => onPick(ym)}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
      <style>{`
        .mrp-panel__title {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-2);
          margin-bottom: 8px;
        }
        .mrp-panel__navrow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .mrp-panel__nav {
          width: 24px;
          height: 24px;
          border-radius: var(--r-sm);
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-2);
          font-size: 14px;
          line-height: 1;
        }
        .mrp-panel__nav:hover:not(:disabled) {
          color: var(--teal);
          border-color: var(--teal);
        }
        .mrp-panel__nav:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .mrp-panel__year {
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
        }
        .mrp-panel__grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
        }
        .mrp-panel__cell {
          padding: 8px 4px;
          font-size: 11px;
          font-weight: 500;
          border-radius: var(--r-sm);
          background: transparent;
          color: var(--text-2);
          border: 1px solid transparent;
          font-family: var(--font-sans);
        }
        .mrp-panel__cell:hover:not(:disabled) {
          background: var(--teal-l);
          color: var(--teal);
        }
        .mrp-panel__cell--off {
          color: var(--text-3);
          opacity: 0.4;
          cursor: not-allowed;
        }
        .mrp-panel__cell--sel {
          background: var(--teal);
          color: #fff !important;
          font-weight: 600;
        }
        .mrp-panel__cell--rng {
          background: var(--teal-l);
          color: var(--teal);
        }
      `}</style>
    </div>
  );
}

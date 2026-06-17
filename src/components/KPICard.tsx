import type { ReactNode } from 'react';

export type KPIAccent = 'blue' | 'green' | 'yellow' | 'red' | 'purple';

interface Props {
  label: string;
  value: ReactNode;
  icon?: string;
  accent?: KPIAccent;
  unit?: string;
  delta?: ReactNode;
  hint?: ReactNode;
}

export function KPICard({ label, value, icon, accent = 'blue', unit, delta, hint }: Props) {
  return (
    <div className="kpi">
      <div className="kpi__top">
        {icon && <div className={`kpi__icon kpi__icon--${accent}`}>{icon}</div>}
        {delta != null && <div className="kpi__delta">{delta}</div>}
      </div>
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">
        {value}
        {unit && <span className="kpi__unit">{unit}</span>}
      </div>
      {hint != null && <div className="kpi__hint">{hint}</div>}
      <style>{`
        .kpi {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          padding: 18px;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .kpi:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }
        .kpi__top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .kpi__icon {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        .kpi__icon--blue   { background: var(--brand-blue-l); color: var(--brand-blue); }
        .kpi__icon--green  { background: var(--green-l);      color: var(--green); }
        .kpi__icon--yellow { background: var(--amber-l);      color: var(--amber); }
        .kpi__icon--red    { background: var(--red-l);        color: var(--red); }
        .kpi__icon--purple { background: var(--purple-l);     color: var(--purple); }

        .kpi__delta {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          color: var(--text-2);
          background: var(--surface-2);
        }
        .kpi__label {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-2);
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-top: 16px;
        }
        .kpi__value {
          font-size: 32px;
          font-weight: 900;
          color: var(--text);
          margin-top: 4px;
          letter-spacing: -1px;
          line-height: 1.05;
          font-variant-numeric: tabular-nums;
        }
        .kpi__unit {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-2);
          margin-left: 4px;
          letter-spacing: normal;
        }
        .kpi__hint {
          font-size: 11px;
          color: var(--text-2);
          margin-top: 8px;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

interface DeltaProps {
  value: number | null;
  suffix?: string;
}
export function Delta({ value, suffix = '%' }: DeltaProps) {
  if (value == null || !Number.isFinite(value)) {
    return <span style={{ color: 'var(--text-3)' }}>—</span>;
  }
  const positive = value >= 0;
  const cls = positive ? 'delta--up' : 'delta--down';
  return (
    <>
      <span className={`delta ${cls}`}>
        {positive ? '↑' : '↓'} {Math.abs(value).toFixed(1)}{suffix}
      </span>
      <style>{`
        .delta {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
        }
        .delta--up   { color: var(--green); background: var(--green-l); }
        .delta--down { color: var(--red);   background: var(--red-l); }
      `}</style>
    </>
  );
}

import type { ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function Card({ title, subtitle, right, children, className, noPadding }: Props) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || right) && (
        <header className="card__hdr">
          <div>
            {title && <h3 className="card__title">{title}</h3>}
            {subtitle && <p className="card__sub">{subtitle}</p>}
          </div>
          {right && <div className="card__right">{right}</div>}
        </header>
      )}
      <div className={`card__body ${noPadding ? 'card__body--flush' : ''}`}>{children}</div>
      <style>{`
        .card {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-md);
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .card__hdr {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px 6px;
        }
        .card__title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.01em;
        }
        .card__sub {
          font-size: 11px;
          color: var(--text-3);
          margin-top: 2px;
        }
        .card__right {
          flex-shrink: 0;
        }
        .card__body {
          padding: 8px 18px 16px;
        }
        .card__body--flush {
          padding: 0;
        }
      `}</style>
    </section>
  );
}

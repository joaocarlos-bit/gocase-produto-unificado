import type { ReactNode } from 'react';

interface Props {
  breadcrumb: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}

/** Reusable hero with breadcrumb + big title + optional right slot. */
export function PageHero({ breadcrumb, title, subtitle, right }: Props) {
  return (
    <div className="ph">
      <div className="ph__breadcrumb">{breadcrumb}</div>
      <div className="ph__row">
        <div>
          <h1 className="ph__title">{title}</h1>
          {subtitle && <div className="ph__sub">{subtitle}</div>}
        </div>
        {right && <div className="ph__right">{right}</div>}
      </div>
      <style>{`
        .ph {
          margin-bottom: 24px;
        }
        .ph__breadcrumb {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-3);
          letter-spacing: 1.5px;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        .ph__row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }
        .ph__title {
          font-size: 36px;
          font-weight: 900;
          color: var(--text);
          line-height: 1.05;
          letter-spacing: -1px;
        }
        .ph__sub {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-2);
          margin-top: 6px;
          max-width: 880px;
          line-height: 1.5;
        }
        .ph__right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
      `}</style>
    </div>
  );
}

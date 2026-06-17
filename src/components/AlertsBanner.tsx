import type { LinhaAgg, ProcessedData, Ym } from '../data/types';
import { LAUNCH_CUTOFF } from '../data/aggregates';
import { fmtBRL, fmtNum, fmtPct, ymLabel } from '../lib/format';

interface Props {
  rows: LinhaAgg[];
  data: ProcessedData;
  latestYm: Ym;
}

type Severity = 'crit' | 'warn' | 'info';

interface Alert {
  severity: Severity;
  icon: string;
  title: string;
  hint: string;
  linha: string;
}

const SEV: Record<Severity, { bg: string; color: string; border: string }> = {
  crit: { bg: 'var(--red-l)', color: 'var(--red)', border: 'var(--red)' },
  warn: { bg: 'var(--amber-l)', color: 'var(--amber)', border: 'var(--amber)' },
  info: { bg: 'var(--teal-l)', color: 'var(--teal)', border: 'var(--teal)' },
};

function detectAlerts(rows: LinhaAgg[], data: ProcessedData): Alert[] {
  const alerts: Alert[] = [];

  // 1) Linhas grandes (top 30% receita) com atingimento <-20%
  const sortedByRevenue = [...rows].sort((a, b) => b.receita - a.receita);
  const cutoff = Math.max(5, Math.floor(sortedByRevenue.length * 0.3));
  const bigLinhas = new Set(sortedByRevenue.slice(0, cutoff).map((r) => r.linha));

  rows
    .filter((r) => bigLinhas.has(r.linha) && r.atingimento != null && r.atingimento <= -20 && r.forecastQtd != null && r.forecastQtd > 100)
    .sort((a, b) => (a.atingimento ?? 0) - (b.atingimento ?? 0))
    .slice(0, 2)
    .forEach((r) => {
      alerts.push({
        severity: 'crit',
        icon: '🔴',
        title: `${r.linha}: ${fmtPct(r.atingimento, true)} vs FC`,
        hint: `${fmtNum(r.qtd)} / ${fmtNum(r.forecastQtd)} un · ${fmtBRL(r.receita)}`,
        linha: r.linha,
      });
    });

  // 2) Linhas com cobertura crítica (<= 14 dias) e curva AA/A
  const stockAlerts = Object.entries(data.STOCK_LINHA_MAP)
    .filter(([, s]) => s.coberturaDias > 0 && s.coberturaDias <= 14 && (s.dominanteCurva === 'AA' || s.dominanteCurva === 'A'))
    .sort((a, b) => a[1].coberturaDias - b[1].coberturaDias)
    .slice(0, 2);
  stockAlerts.forEach(([linha, s]) => {
    alerts.push({
      severity: 'crit',
      icon: '📦',
      title: `${linha}: estoque cobre ${Math.round(s.coberturaDias)} dias`,
      hint: `Curva ${s.dominanteCurva} · ${fmtNum(s.estoqueTotal)} un · ${s.skusCount} SKUs`,
      linha,
    });
  });

  // 3) Lançamentos ativos (typeA a partir do cutoff de jan/26) — destacar positivos
  const recentTypeA = data.typeA_newLines.filter((l) => l.firstSale && l.firstSale >= LAUNCH_CUTOFF);
  if (recentTypeA.length > 0) {
    const linhas = recentTypeA.map((l) => l.linha).slice(0, 3).join(', ');
    alerts.push({
      severity: 'info',
      icon: '🚀',
      title: `${recentTypeA.length} novas linhas desde ${ymLabel(LAUNCH_CUTOFF)}`,
      hint: recentTypeA.length > 3 ? `${linhas} e mais ${recentTypeA.length - 3}` : linhas,
      linha: '',
    });
  }

  // 4) Linhas com performance forte (>+30% vs FC) — bom sinal
  rows
    .filter((r) => r.atingimento != null && r.atingimento >= 30 && r.forecastQtd != null && r.forecastQtd > 100)
    .sort((a, b) => (b.atingimento ?? 0) - (a.atingimento ?? 0))
    .slice(0, 1)
    .forEach((r) => {
      alerts.push({
        severity: 'info',
        icon: '🟢',
        title: `${r.linha}: ${fmtPct(r.atingimento, true)} vs FC`,
        hint: `Acelerar reposição · ${fmtBRL(r.receita)}`,
        linha: r.linha,
      });
    });

  // 5) Slow-movers em curva A/AA (capital imobilizado importante)
  const slowmovers = Object.entries(data.STOCK_LINHA_MAP)
    .filter(([, s]) => s.coberturaDias > 180 && (s.dominanteCurva === 'AA' || s.dominanteCurva === 'A'))
    .sort((a, b) => b[1].coberturaDias - a[1].coberturaDias)
    .slice(0, 1);
  slowmovers.forEach(([linha, s]) => {
    alerts.push({
      severity: 'warn',
      icon: '🐢',
      title: `${linha}: ${Math.round(s.coberturaDias)}d de cobertura`,
      hint: `Slow-mover em curva ${s.dominanteCurva} · ${fmtNum(s.estoqueTotal)} un parados`,
      linha,
    });
  });

  return alerts.slice(0, 5);
}

export function AlertsBanner({ rows, data, latestYm }: Props) {
  // latestYm currently unused — detectAlerts uses LAUNCH_CUTOFF for the launch alert.
  void latestYm;
  const alerts = detectAlerts(rows, data);
  if (alerts.length === 0) return null;

  return (
    <div className="alerts">
      <div className="alerts__head">
        <span className="alerts__title mono">⚡ Sinais do período</span>
        <span className="alerts__count mono">{alerts.length} alertas</span>
      </div>
      <div className="alerts__list">
        {alerts.map((a, i) => {
          const sev = SEV[a.severity];
          return (
            <div
              key={i}
              className="alert"
              style={{ background: sev.bg, borderLeftColor: sev.border }}
            >
              <span className="alert__icon">{a.icon}</span>
              <div className="alert__body">
                <div className="alert__title" style={{ color: sev.color }}>{a.title}</div>
                <div className="alert__hint">{a.hint}</div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        .alerts {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-md);
          padding: 12px 14px 14px;
          margin-bottom: 16px;
        }
        .alerts__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .alerts__title {
          font-size: 11px;
          font-weight: 700;
          color: var(--text);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .alerts__count {
          font-size: 10px;
          color: var(--text-3);
        }
        .alerts__list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 8px;
        }
        .alert {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 9px 12px;
          border-radius: var(--r-sm);
          border-left: 3px solid;
        }
        .alert__icon {
          font-size: 16px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .alert__body {
          min-width: 0;
        }
        .alert__title {
          font-size: 12px;
          font-weight: 700;
          line-height: 1.3;
        }
        .alert__hint {
          font-size: 10px;
          color: var(--text-2);
          margin-top: 2px;
          line-height: 1.4;
          font-family: var(--font-mono);
        }
      `}</style>
    </div>
  );
}

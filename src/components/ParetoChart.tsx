import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PortfolioLinha } from '../data/aggregates';
import { fmtBRL } from '../lib/format';
import { Card } from './Card';

interface Props {
  rows: PortfolioLinha[];
  /** Limite a quantas linhas mostrar no eixo X (default 30). */
  maxLinhas?: number;
}

function fmtBRLAxis(v: number): string {
  if (Math.abs(v) >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`;
  return `R$${Math.round(v)}`;
}

export function ParetoChart({ rows, maxLinhas = 30 }: Props) {
  const shown = rows.slice(0, maxLinhas);
  if (shown.length === 0) {
    return (
      <Card title="Pareto · concentração de receita" subtitle="Sem dados no período">
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12 }}>
          Sem dados.
        </div>
      </Card>
    );
  }

  // Quantas linhas geram 80% e 95%
  const idx80 = rows.findIndex((r) => r.shareAcum >= 80);
  const idx95 = rows.findIndex((r) => r.shareAcum >= 95);
  const pct80 = idx80 >= 0 ? ((idx80 + 1) / rows.length) * 100 : 100;
  const pct95 = idx95 >= 0 ? ((idx95 + 1) / rows.length) * 100 : 100;

  const sub = (
    <>
      <strong style={{ color: 'var(--brand-blue)' }}>{idx80 >= 0 ? idx80 + 1 : rows.length} linhas</strong> ({pct80.toFixed(1)}% do catálogo) geram 80% da receita ·
      {' '}<strong>{idx95 >= 0 ? idx95 + 1 : rows.length}</strong> chegam a 95%
    </>
  );

  return (
    <Card title="Pareto · concentração de receita" subtitle={sub}>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={shown} margin={{ top: 12, right: 30, bottom: 50, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="linha"
              tick={{ fill: 'var(--text-2)', fontSize: 10, fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={70}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={fmtBRLAxis}
              tick={{ fill: 'var(--text-3)', fontSize: 10 }}
              width={62}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v) => `${Math.round(v)}%`}
              tick={{ fill: 'var(--text-3)', fontSize: 10 }}
              domain={[0, 100]}
              width={42}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(v: number, name: string) => {
                if (name === 'Share acum.') return [`${v.toFixed(1)}%`, name];
                return [fmtBRL(v, false), 'Receita'];
              }}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
              cursor={{ fill: 'rgba(30, 95, 184, 0.06)' }}
            />
            <ReferenceLine yAxisId="right" y={80} stroke="#dc2626" strokeDasharray="4 3" label={{ value: '80%', position: 'right', fill: '#dc2626', fontSize: 10, fontWeight: 700 }} />
            <ReferenceLine yAxisId="right" y={95} stroke="#94a3b8" strokeDasharray="2 3" label={{ value: '95%', position: 'right', fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
            <Bar yAxisId="left" dataKey="receita" name="Receita" fill="var(--brand-blue)" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="shareAcum" name="Share acum." stroke="#dc2626" strokeWidth={2} dot={{ r: 3, fill: '#dc2626', strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {rows.length > maxLinhas && (
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, textAlign: 'center' }}>
          Mostrando top {maxLinhas} de {rows.length} linhas · ordenadas por receita
        </p>
      )}
    </Card>
  );
}

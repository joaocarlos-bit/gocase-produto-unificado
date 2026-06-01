import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StackedMonthlySeries } from '../data/aggregates';
import { fmtBRL } from '../lib/format';
import { Card } from './Card';

interface Props {
  title: string;
  subtitle: string;
  series: StackedMonthlySeries;
  mode: 'absolute' | 'percent';
  selectedKey: string | null;
  onKeyClick?: (key: string) => void;
  /** Min % p/ mostrar label dentro do segmento no modo 100%. */
  minPctLabel?: number;
  /** Min R$ p/ mostrar label dentro do segmento no modo absoluto. */
  minAbsLabel?: number;
}

function fmtBRLAxis(v: number): string {
  if (Math.abs(v) >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`;
  return `R$${Math.round(v)}`;
}

export function StackedMonthlyChart({
  title,
  subtitle,
  series,
  mode,
  selectedKey,
  onKeyClick,
  minPctLabel = 5,
  minAbsLabel = 1e6,
}: Props) {
  // Para modo 100%, converter cada valor → % do total da linha
  const data = useMemo(() => {
    if (mode === 'absolute') return series.points;
    return series.points.map((p) => {
      const total = p.total || 0;
      const row: any = { ym: p.ym, label: p.label, total: 100 };
      series.keys.forEach((k) => {
        const v = (p[k] as number) || 0;
        row[k] = total > 0 ? (v / total) * 100 : 0;
      });
      return row;
    });
  }, [series, mode]);

  const isPercent = mode === 'percent';

  return (
    <Card title={title} subtitle={subtitle}>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 28, right: 18, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              tickFormatter={(v) => (isPercent ? `${Math.round(v)}%` : fmtBRLAxis(v))}
              tick={{ fill: 'var(--text-3)', fontSize: 10 }}
              width={isPercent ? 44 : 62}
              tickLine={false}
              axisLine={false}
              domain={isPercent ? [0, 100] : undefined}
            />
            <Tooltip
              formatter={(v: number, name: string) =>
                isPercent ? [`${v.toFixed(1)}%`, name] : [fmtBRL(v, false), name]
              }
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
              cursor={{ fill: 'rgba(30, 95, 184, 0.06)' }}
            />
            <Legend
              iconType="square"
              iconSize={10}
              wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 4 }}
              verticalAlign="bottom"
              align="center"
              onClick={(item) => onKeyClick?.(String(item.value))}
            />
            {series.keys.map((key, i) => {
              const isLast = i === series.keys.length - 1;
              const dimmed = selectedKey != null && selectedKey !== key;
              const color = series.colors[key] || '#94A3B8';
              return (
                <Bar
                  key={key}
                  dataKey={key}
                  name={key}
                  stackId="x"
                  fill={dimmed ? '#cbd5e1' : color}
                  radius={isLast ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                  onClick={onKeyClick ? () => onKeyClick(key) : undefined}
                  style={{ cursor: onKeyClick ? 'pointer' : 'default' }}
                >
                  {/* Label DENTRO do segmento */}
                  <LabelList
                    dataKey={key}
                    content={(props: any) => {
                      const { x, y, width, height, value } = props;
                      if (!value) return null;
                      if (isPercent && value < minPctLabel) return null;
                      if (!isPercent && value < minAbsLabel) return null;
                      if (height < 16) return null;
                      const cx = x + width / 2;
                      const cy = y + height / 2;
                      const text = isPercent
                        ? `${Math.round(value)}%`
                        : fmtBRL(value);
                      return (
                        <text
                          x={cx}
                          y={cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={11}
                          fontWeight={800}
                          fill="#fff"
                          style={{ pointerEvents: 'none' }}
                        >
                          {text}
                        </text>
                      );
                    }}
                  />
                  {/* Label do TOTAL no topo (só no último segmento e no modo absoluto) */}
                  {isLast && !isPercent && (
                    <LabelList
                      dataKey="total"
                      position="top"
                      formatter={(v: number) => (v > 0 ? fmtBRL(v) : '')}
                      fill="var(--text)"
                      fontSize={12}
                      fontWeight={800}
                    />
                  )}
                </Bar>
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

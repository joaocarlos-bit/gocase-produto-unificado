import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LinhaMonthlyPoint } from '../data/aggregates';
import { fmtBRL, fmtNum } from '../lib/format';
import { Card } from './Card';

interface Props {
  data: LinhaMonthlyPoint[];
  linha: string;
  /** Esconde o card de margem bruta — renderiza só Receita & Qtd, em largura cheia. */
  hideMargem?: boolean;
}

const COLOR_RECEITA = '#1e5fb8';
const COLOR_QTD     = '#d97706';
const COLOR_MARGEM  = '#7c3aed';

function fmtBRLAxis(v: number): string {
  if (Math.abs(v) >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`;
  return `R$${Math.round(v)}`;
}

export function LinhaMonthlyChart({ data, linha, hideMargem = false }: Props) {
  if (data.length === 0) {
    return (
      <Card title={`Evolução mensal · ${linha}`} subtitle="Sem dados">
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12 }}>
          Sem histórico de vendas pra essa linha.
        </div>
      </Card>
    );
  }

  return (
    <div className={hideMargem ? 'lmc-detail lmc-detail--single' : 'lmc-detail'}>
      <Card
        title={`Receita & Qtd · ${linha}`}
        subtitle="Barras = receita mensal · Linha âmbar = quantidade vendida"
      >
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 44, right: 24, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis yAxisId="left" tickFormatter={fmtBRLAxis} tick={{ fill: 'var(--text-3)', fontSize: 10 }} width={62} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmtNum(v)} tick={{ fill: COLOR_QTD, fontSize: 10 }} width={50} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v: number, name: string) => {
                  if (name === 'Qtd') return [fmtNum(v, false) + ' un', 'Quantidade'];
                  return [fmtBRL(v, false), name];
                }}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
                cursor={{ fill: 'rgba(30, 95, 184, 0.06)' }}
              />
              <Legend
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingBottom: 4 }}
                verticalAlign="top"
                align="right"
              />
              <Bar yAxisId="left" dataKey="receita" name="Receita" fill={COLOR_RECEITA} radius={[6, 6, 0, 0]}>
                <LabelList
                  dataKey="receita"
                  content={(props: any) => {
                    const { x, y, width, value } = props;
                    if (!value || value <= 0) return null;
                    const text = fmtBRL(value);
                    const padX = 6;
                    const textW = text.length * 6.8 + padX * 2;
                    const cx = x + width / 2;
                    return (
                      <g>
                        <rect x={cx - textW / 2} y={y - 24} width={textW} height={20} rx={4} fill="#fff" stroke="var(--border)" strokeWidth={1} />
                        <text x={cx} y={y - 10} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--text)">{text}</text>
                      </g>
                    );
                  }}
                />
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="qtd"
                name="Qtd"
                stroke={COLOR_QTD}
                strokeWidth={2.5}
                dot={{ r: 4, fill: COLOR_QTD, stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {!hideMargem && (
      <Card
        title={`Margem bruta · ${linha}`}
        subtitle="% por mês · (TM − custo) ÷ TM"
      >
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 30, right: 24, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis tickFormatter={(v) => `${Math.round(v)}%`} tick={{ fill: COLOR_MARGEM, fontSize: 10 }} width={46} tickLine={false} axisLine={false} domain={[0, 'dataMax + 10']} />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)}%`, 'Margem bruta']}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
                cursor={{ stroke: 'var(--border-2)', strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="margemPct"
                name="Margem bruta"
                stroke={COLOR_MARGEM}
                strokeWidth={2.5}
                dot={{ r: 4, fill: COLOR_MARGEM, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                connectNulls
              >
                <LabelList
                  dataKey="margemPct"
                  position="top"
                  formatter={(v: number | null) => (v != null && Number.isFinite(v) ? `${v.toFixed(1)}%` : '')}
                  fill={COLOR_MARGEM}
                  fontSize={11}
                  fontWeight={700}
                  offset={10}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      )}

      <style>{`
        .lmc-detail {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .lmc-detail--single {
          grid-template-columns: 1fr;
        }
        @media (max-width: 900px) {
          .lmc-detail { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

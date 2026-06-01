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
import type { LaunchMonthlyPoint } from '../data/aggregates';
import { fmtBRL, fmtNum } from '../lib/format';
import { Card } from './Card';

// Tons de azul para o stack de Receita
const COLOR_NOVA_LINHA = '#1e5fb8'; // var(--brand-blue)
const COLOR_DROP_COR   = '#7eb3e8'; // azul claro p/ contraste no stack
const COLOR_QTD        = '#d97706'; // âmbar p/ destacar a linha de qtd sobre as barras azuis
const COLOR_TM         = '#84cc16'; // verde-lima (--accent-d)
const COLOR_MARGEM     = '#7c3aed'; // roxo (--purple) — contraste claro com o lime

interface Props {
  data: LaunchMonthlyPoint[];
}

function fmtBRLAxis(v: number): string {
  if (Math.abs(v) >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`;
  return `R$${Math.round(v)}`;
}

export function LaunchMonthlyCharts({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card title="Evolução mensal" subtitle="Sem dados no período de consulta">
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 12 }}>
          Selecione um período de consulta com dados.
        </div>
      </Card>
    );
  }

  return (
    <div className="lmc">
      <Card
        title="Receita mensal"
        subtitle="Barras = receita (empilhada por tipo) · Linha âmbar = qtd vendida (hover pra ver valor)"
      >
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 44, right: 24, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
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
                tickFormatter={(v) => fmtNum(v)}
                tick={{ fill: COLOR_QTD, fontSize: 10 }}
                width={50}
                tickLine={false}
                axisLine={false}
              />
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
              <Bar yAxisId="left" dataKey="receitaA" name="Nova linha" stackId="x" fill={COLOR_NOVA_LINHA} />
              <Bar yAxisId="left" dataKey="receitaB" name="Drop de cor" stackId="x" fill={COLOR_DROP_COR} radius={[6, 6, 0, 0]}>
                <LabelList
                  dataKey="receita"
                  content={(props: any) => {
                    const { x, y, width, value } = props;
                    if (!value || value <= 0) return null;
                    const text = fmtBRL(value);
                    // Background card branco pra garantir leitura sobre a linha
                    const padX = 6;
                    const textW = text.length * 6.8 + padX * 2;
                    const cx = x + width / 2;
                    return (
                      <g>
                        <rect
                          x={cx - textW / 2}
                          y={y - 24}
                          width={textW}
                          height={20}
                          rx={4}
                          fill="#fff"
                          stroke="var(--border)"
                          strokeWidth={1}
                        />
                        <text
                          x={cx}
                          y={y - 10}
                          textAnchor="middle"
                          fontSize={12}
                          fontWeight={800}
                          fill="var(--text)"
                        >
                          {text}
                        </text>
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

      <Card
        title="Ticket médio mensal"
        subtitle="Linha verde = TM (R$/un) · Linha roxa = margem bruta (%)"
      >
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 36, right: 30, bottom: 24, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => `R$${Math.round(v)}`}
                tick={{ fill: COLOR_TM, fontSize: 10 }}
                width={50}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => `${Math.round(v)}%`}
                tick={{ fill: COLOR_MARGEM, fontSize: 10 }}
                width={44}
                tickLine={false}
                axisLine={false}
                domain={[0, 'dataMax + 10']}
              />
              <Tooltip
                formatter={(v: number, name: string) => {
                  if (name === 'Margem bruta') return [`${v.toFixed(1)}%`, name];
                  return [`R$ ${v.toFixed(2)}`, name];
                }}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
                cursor={{ stroke: 'var(--border-2)', strokeWidth: 1 }}
              />
              <Legend
                iconType="circle"
                iconSize={9}
                wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingBottom: 4 }}
                verticalAlign="top"
                align="right"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="ticketMedio"
                name="Ticket médio"
                stroke={COLOR_TM}
                strokeWidth={2.5}
                dot={{ r: 4, fill: COLOR_TM, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              >
                <LabelList
                  dataKey="ticketMedio"
                  position="top"
                  formatter={(v: number) => (v > 0 ? `R$ ${v.toFixed(0)}` : '')}
                  fill={COLOR_TM}
                  fontSize={11}
                  fontWeight={700}
                  offset={10}
                />
              </Line>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="margemPct"
                name="Margem bruta"
                stroke={COLOR_MARGEM}
                strokeWidth={2.5}
                strokeDasharray="0"
                dot={{ r: 4, fill: COLOR_MARGEM, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                connectNulls
              >
                <LabelList
                  dataKey="margemPct"
                  position="bottom"
                  formatter={(v: number | null) => (v != null && Number.isFinite(v) ? `${v.toFixed(1)}%` : '')}
                  fill={COLOR_MARGEM}
                  fontSize={11}
                  fontWeight={700}
                  offset={10}
                />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <style>{`
        .lmc {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        @media (max-width: 900px) {
          .lmc { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

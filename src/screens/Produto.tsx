import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ProcessedData, SalesBySkuPayload, Status, Ym } from '../data/types';
import { allMonthsWithCurrent, latestMonth, linhaMonthlySeries } from '../data/aggregates';

// Paleta de cores curada pro pie/legend (índice = posição no ranking)
const PIE_PALETTE = [
  '#A855F7', // roxo
  '#F59E0B', // âmbar
  '#22C55E', // verde
  '#EC4899', // rosa
  '#3B82F6', // azul
  '#0EA5E9', // ciano
  '#14B8A6', // teal
  '#94A3B8', // slate (Outros)
];
import { fmtBRL, fmtNum, fmtPct, shiftYm, ymLabel } from '../lib/format';
import { KPICard } from '../components/KPICard';
import { MonthRangePicker } from '../components/MonthRangePicker';
import { MultiSelect } from '../components/MultiSelect';
import { PageHero } from '../components/PageHero';
import { Card } from '../components/Card';
import { LinhaMonthlyChart } from '../components/LinhaMonthlyChart';

interface Props { data: ProcessedData; sales: SalesBySkuPayload; }

interface MonthlyDetailRow {
  ym: Ym;
  label: string;
  fcQtd: number | null;
  qtd: number;
  atingimento: number | null;
  receita: number;
  ticketMedio: number;
  custo: number | null;
  margemPct: number | null;
  margemRS: number | null;
}

interface ColorRow {
  sku: string;
  qtd: number;
  receita: number;
  ticketMedio: number;
  shareQtd: number;
  shareReceita: number;
  margemPct: number | null;
  status: Status | null;
}

// Badge de status por SKU — cores semânticas alinhadas aos tokens do tema
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  const s = status.toLocaleLowerCase('pt-BR');
  let bg = 'var(--surface-2)', fg = 'var(--text-2)';
  if (s.includes('lança') || s.includes('lanca')) { bg = 'var(--brand-blue-l)'; fg = 'var(--brand-blue-d)'; }
  else if (s.includes('descontinuad')) { bg = 'var(--red-l)'; fg = 'var(--red)'; }
  else if (s.includes('recompra') || s.includes('linha')) { bg = 'var(--green-l)'; fg = 'var(--green)'; }
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '3px 9px',
      borderRadius: 99, background: bg, color: fg, letterSpacing: '0.2px', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

export function Produto({ data, sales }: Props) {
  const months = useMemo(() => allMonthsWithCurrent(data), [data]);
  const latest = latestMonth(data) ?? months[months.length - 1];
  const defaultFrom = useMemo(() => shiftYm(latest, -5), [latest]); // últimos 6 meses default
  const [range, setRange] = useState<{ from: Ym; to: Ym }>({ from: defaultFrom, to: latest });

  // Picker de produto (linha) — single-select
  const linhasAll = useMemo(() => Object.keys(data.salesByLinha).sort(), [data]);
  const [selectedLinhas, setSelectedLinhas] = useState<string[]>(linhasAll.length ? [linhasAll[0]] : []);
  const linha = selectedLinhas[0] ?? null;

  // Dados agregados da linha selecionada no período
  const analysis = useMemo(() => {
    if (!linha) return null;
    const sd = data.salesByLinha[linha];
    if (!sd) return null;
    const custo = data.COST_MAP[linha] ?? null;
    const fcMap = data.FC_MAP[linha] || {};

    // Mensal com fc, atingimento, margem
    const monthly: MonthlyDetailRow[] = [];
    let totQtd = 0, totReceita = 0, totFc = 0;
    let totMargemRS = 0, receitaComCusto = 0;
    let hasFc = false;
    for (const ym of months) {
      if (ym < range.from || ym > range.to) continue;
      const cell = sd.months[ym];
      const qtd = cell?.qtd ?? 0;
      const receita = cell?.receita ?? 0;
      const tm = qtd > 0 ? receita / qtd : 0;
      const fcQtd = fcMap[ym] ?? null;
      const atingimento = fcQtd && fcQtd > 0 ? (qtd / fcQtd - 1) * 100 : null;
      const margemPct = custo != null && tm > 0 ? ((tm - custo) / tm) * 100 : null;
      const margemRS = custo != null ? (tm - custo) * qtd : null;
      monthly.push({
        ym,
        label: ymLabel(ym),
        fcQtd,
        qtd,
        atingimento,
        receita,
        ticketMedio: tm,
        custo,
        margemPct,
        margemRS,
      });
      totQtd += qtd;
      totReceita += receita;
      if (fcQtd != null) { totFc += fcQtd; hasFc = true; }
      if (custo != null && qtd > 0) {
        totMargemRS += (tm - custo) * qtd;
        receitaComCusto += receita;
      }
    }
    const totTm = totQtd > 0 ? totReceita / totQtd : 0;
    const totAtingimento = hasFc && totFc > 0 ? (totQtd / totFc - 1) * 100 : null;
    const totMargemPct = receitaComCusto > 0 ? (totMargemRS / receitaComCusto) * 100 : null;

    // SKUs (cores/variações) da linha
    const skusOfLinha = Object.entries(data.STOCK_MAP)
      .filter(([, s]) => s.linha === linha)
      .map(([sku]) => sku);

    const colorsRaw: { sku: string; qtd: number; receita: number; custo: number | null; status: Status | null }[] = [];
    for (const sku of skusOfLinha) {
      const skuSales = sales.salesBySku[sku];
      if (!skuSales) continue;
      let qtd = 0, receita = 0;
      for (const [ym, cell] of Object.entries(skuSales.months)) {
        if (ym < range.from || ym > range.to) continue;
        qtd += cell.qtd;
        receita += cell.receita;
      }
      if (qtd > 0 || receita > 0) {
        const skuCusto = data.STOCK_MAP[sku]?.custo ?? null;
        const skuStatus = data.STOCK_MAP[sku]?.status ?? null;
        colorsRaw.push({ sku, qtd, receita, custo: skuCusto, status: skuStatus });
      }
    }

    const totColorQtd = colorsRaw.reduce((s, c) => s + c.qtd, 0);
    const totColorReceita = colorsRaw.reduce((s, c) => s + c.receita, 0);
    const colors: ColorRow[] = colorsRaw
      .map((c) => {
        const tm = c.qtd > 0 ? c.receita / c.qtd : 0;
        const margemPct = c.custo != null && tm > 0 ? ((tm - c.custo) / tm) * 100 : null;
        return {
          sku: c.sku,
          qtd: c.qtd,
          receita: c.receita,
          ticketMedio: tm,
          shareQtd: totColorQtd > 0 ? (c.qtd / totColorQtd) * 100 : 0,
          shareReceita: totColorReceita > 0 ? (c.receita / totColorReceita) * 100 : 0,
          margemPct,
          status: c.status,
        };
      })
      .sort((a, b) => b.receita - a.receita);

    // Cor líder
    const leadColor = colors[0] ?? null;
    const top3Share = colors.slice(0, 3).reduce((s, c) => s + c.shareReceita, 0);

    return {
      categoria: sd.categoria,
      status: sd.status,
      custo,
      totQtd, totReceita, totTm, totFc, totAtingimento, totMargemPct, totMargemRS,
      monthly, colors,
      leadColor, top3Share,
      colorsCount: colors.length,
    };
  }, [data, sales, linha, months, range]);

  // Série mensal pro chart Receita & Qtd + Margem
  const monthlySeries = useMemo(
    () => (linha ? linhaMonthlySeries(data, linha, range.from, range.to) : []),
    [data, linha, range],
  );

  return (
    <div className="prd">
      <PageHero
        breadcrumb="Unidade de negócio: Produto Gocase · Produto"
        title="Análise de Produto"
        subtitle={
          <>
            Drill-down em uma linha específica: <strong>performance temporal</strong>,
            <strong> mix de cores/variações</strong> e detalhamento mensal.
            Selecione um produto e o período de análise.
          </>
        }
        right={
          <div className="prd__period">
            <span className="prd__period-lbl">Período</span>
            <MonthRangePicker available={months} value={range} onChange={setRange} />
          </div>
        }
      />

      <div className="prd__picker">
        <span className="prd__picker-lbl">Produto</span>
        <MultiSelect
          options={linhasAll}
          value={selectedLinhas}
          onChange={setSelectedLinhas}
          singleSelect
          allLabel="Selecione um produto…"
        />
        {linha && analysis && (
          <span className="prd__picker-meta">
            <span className="prd__chip">{analysis.categoria}</span>
            <span className="prd__chip prd__chip--muted">{analysis.status}</span>
            {analysis.custo != null && (
              <span className="prd__chip prd__chip--muted">Custo unit. R$ {analysis.custo.toFixed(2)}</span>
            )}
          </span>
        )}
      </div>

      {!linha || !analysis ? (
        <Card>
          <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24, fontSize: 13 }}>
            Selecione um produto pra ver a análise.
          </p>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-5">
            <KPICard
              label="Receita no período"
              icon="💰"
              accent="blue"
              value={fmtBRL(analysis.totReceita)}
              hint={`${ymLabel(range.from)} → ${ymLabel(range.to)}`}
            />
            <KPICard
              label="Qtd vendida"
              icon="📦"
              accent="purple"
              value={fmtNum(analysis.totQtd)}
              hint={analysis.totFc > 0 ? `FC ${fmtNum(analysis.totFc)} un` : 'sem forecast'}
            />
            <KPICard
              label="Ticket médio"
              icon="🎟️"
              accent="yellow"
              value={`R$ ${analysis.totTm.toFixed(2)}`}
              hint="receita ÷ qtd"
            />
            <KPICard
              label="Margem bruta"
              icon="📊"
              accent={analysis.totMargemPct != null && analysis.totMargemPct >= 50 ? 'green' : analysis.totMargemPct != null && analysis.totMargemPct >= 30 ? 'yellow' : 'red'}
              value={analysis.totMargemPct != null ? `${analysis.totMargemPct.toFixed(1)}%` : '—'}
              hint={analysis.totMargemRS != null ? `${fmtBRL(analysis.totMargemRS)} no período` : 'sem custo conhecido'}
            />
            <KPICard
              label="Atingimento FC"
              icon="🎯"
              accent={
                analysis.totAtingimento == null ? 'blue' :
                analysis.totAtingimento >= 0 ? 'green' :
                analysis.totAtingimento >= -15 ? 'yellow' : 'red'
              }
              value={analysis.totAtingimento != null ? fmtPct(analysis.totAtingimento, true) : '—'}
              hint={analysis.totFc > 0 ? `Real ${fmtNum(analysis.totQtd)} · FC ${fmtNum(analysis.totFc)}` : 'sem forecast'}
            />
          </div>

          {/* Mix info */}
          {analysis.colorsCount > 0 && (
            <div className="grid grid-3" style={{ marginTop: 8 }}>
              <KPICard
                label="Cor líder"
                icon="🎨"
                accent="purple"
                value={analysis.leadColor?.sku ?? '—'}
                hint={analysis.leadColor ? `${fmtBRL(analysis.leadColor.receita)} · ${analysis.leadColor.shareReceita.toFixed(1)}% da linha` : ''}
              />
              <KPICard
                label="Variações no escopo"
                icon="🧱"
                accent="blue"
                value={String(analysis.colorsCount)}
                hint="SKUs com venda no período"
              />
              <KPICard
                label="Concentração top 3"
                icon="🏆"
                accent={analysis.top3Share > 80 ? 'red' : analysis.top3Share > 60 ? 'yellow' : 'green'}
                value={`${analysis.top3Share.toFixed(1)}%`}
                hint="receita das 3 cores líderes"
              />
            </div>
          )}

          {/* Seção 1: Performance temporal */}
          <div className="section-title">
            📈 Performance temporal · {linha}
            <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
              receita, qtd e margem bruta no período
            </span>
          </div>
          <LinhaMonthlyChart data={monthlySeries} linha={linha} />

          {/* Realizado vs Forecast */}
          <div style={{ marginBottom: 16 }}>
            <Card
              title="Realizado vs Forecast · qtd"
              subtitle="Barras agrupadas por mês · azul = real, cinza tracejado = forecast"
            >
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analysis.monthly} margin={{ top: 26, right: 18, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                    <YAxis tickFormatter={(v) => fmtNum(v)} tick={{ fill: 'var(--text-3)', fontSize: 10 }} width={56} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v: number, name: string) => [`${fmtNum(v, false)} un`, name]}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
                      cursor={{ fill: 'rgba(30, 95, 184, 0.06)' }}
                    />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} verticalAlign="top" align="right" />
                    <Bar dataKey="qtd" name="Realizado" fill="#1e5fb8" radius={[6, 6, 0, 0]}>
                      <LabelList dataKey="qtd" position="top" formatter={(v: number) => (v > 0 ? fmtNum(v) : '')} fill="var(--text)" fontSize={10} fontWeight={700} />
                    </Bar>
                    <Bar dataKey="fcQtd" name="Forecast" fill="#cbd5e1" radius={[6, 6, 0, 0]}>
                      <LabelList dataKey="fcQtd" position="top" formatter={(v: number) => (v > 0 ? fmtNum(v) : '')} fill="var(--text-2)" fontSize={10} fontWeight={600} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Seção 2: Mix de variações */}
          {analysis.colors.length > 0 && (() => {
            // Top 7 + Outros (se houver mais que 7 SKUs)
            const TOP_N = 7;
            const top = analysis.colors.slice(0, TOP_N).map((c, i) => ({ ...c, _color: PIE_PALETTE[i], _isOutros: false }));
            const rest = analysis.colors.slice(TOP_N);
            const pieData = rest.length === 0 ? top : [
              ...top,
              {
                sku: `Outros (${rest.length})`,
                qtd: rest.reduce((s, c) => s + c.qtd, 0),
                receita: rest.reduce((s, c) => s + c.receita, 0),
                shareReceita: rest.reduce((s, c) => s + c.shareReceita, 0),
                shareQtd: rest.reduce((s, c) => s + c.shareQtd, 0),
                ticketMedio: 0,
                margemPct: null,
                status: null,
                _color: PIE_PALETTE[7],
                _isOutros: true,
              },
            ];

            // Label customizado com leader line + nome + %
            const RADIAN = Math.PI / 180;
            const renderLabel = (props: any) => {
              const { cx, cy, midAngle, outerRadius, payload } = props;
              if (!payload || payload.shareReceita < 2.5) return null; // skip slices muito pequenas
              const cos = Math.cos(-RADIAN * midAngle);
              const sin = Math.sin(-RADIAN * midAngle);
              const sx = cx + (outerRadius + 2) * cos;
              const sy = cy + (outerRadius + 2) * sin;
              const mx = cx + (outerRadius + 18) * cos;
              const my = cy + (outerRadius + 18) * sin;
              const dir = cos >= 0 ? 1 : -1;
              const ex = mx + dir * 28;
              const ey = my;
              const tx = ex + dir * 4;
              const anchor = dir > 0 ? 'start' : 'end';
              const name = String(payload.sku);
              const short = name.length > 22 ? name.slice(0, 20) + '…' : name;
              return (
                <g>
                  <polyline
                    points={`${sx},${sy} ${mx},${my} ${ex},${ey}`}
                    stroke={payload._color}
                    strokeWidth={1.4}
                    fill="none"
                  />
                  <circle cx={ex} cy={ey} r={2.5} fill={payload._color} />
                  <text x={tx} y={ey - 5} textAnchor={anchor} fontSize={11} fontWeight={700} fill="var(--text)">{short}</text>
                  <text x={tx} y={ey + 9} textAnchor={anchor} fontSize={11} fontWeight={600} fill="var(--text-2)">
                    {payload.shareReceita.toFixed(1)}%
                  </text>
                </g>
              );
            };

            const tableRows = analysis.colors.slice(0, 10);

            return (
              <>
                <div className="section-title">
                  🎨 Mix de variações · {linha}
                  <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
                    {analysis.colors.length} SKUs com venda · top {Math.min(TOP_N, analysis.colors.length)}{rest.length > 0 ? ` + Outros (${rest.length})` : ''} no gráfico
                  </span>
                </div>
                <div className="grid grid-2 prd__row">
                  <Card
                    title="Distribuição por variação"
                    subtitle={`Receita por SKU · ${analysis.colors.length} variações no período`}
                  >
                    <div style={{ position: 'relative', height: 380 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 16, right: 80, bottom: 16, left: 80 }}>
                          <Pie
                            data={pieData}
                            dataKey="receita"
                            nameKey="sku"
                            cx="50%"
                            cy="50%"
                            outerRadius={110}
                            innerRadius={72}
                            paddingAngle={2}
                            label={renderLabel}
                            labelLine={false}
                            stroke="#fff"
                            strokeWidth={2}
                          >
                            {pieData.map((c, i) => (
                              <Cell key={i} fill={c._color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v: number, _name: string, p: any) => [
                              `${fmtBRL(v, false)} · ${p.payload.shareReceita.toFixed(1)}%`,
                              p.payload.sku,
                            ]}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Texto central */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          textAlign: 'center',
                          pointerEvents: 'none',
                        }}
                      >
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
                          Receita total
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px', marginTop: 2, lineHeight: 1 }}>
                          {fmtBRL(analysis.totReceita)}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginTop: 4 }}>
                          {analysis.colors.length} variações
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card
                    title="Top 10 variações · Receita"
                    subtitle="Ranking no período · cores idênticas ao gráfico"
                  >
                    <div style={{ height: 380, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        <thead>
                          <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                            <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>#</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>SKU</th>
                            <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Qtd</th>
                            <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Receita</th>
                            <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Share</th>
                            <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Ticket médio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.map((c, i) => {
                            const color = i < TOP_N ? PIE_PALETTE[i] : PIE_PALETTE[7];
                            return (
                              <tr key={c.sku} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '9px 8px', color: 'var(--text-3)', width: 24 }}>{i + 1}.</td>
                                <td style={{ padding: '9px 8px', fontWeight: 600 }}>
                                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color, marginRight: 8, verticalAlign: 'middle' }} />
                                  {c.sku}
                                </td>
                                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmtNum(c.qtd)}</td>
                                <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtBRL(c.receita)}</td>
                                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-2)' }}>{c.shareReceita.toFixed(1)}%</td>
                                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-2)' }}>R$ {c.ticketMedio.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              </>
            );
          })()}

          {/* Seção 3: Tabelas detalhadas */}
          <div className="section-title">
            📋 Detalhamento mensal · {linha}
            <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
              fc, real, atingimento, receita, ticket médio, margem
            </span>
          </div>
          <div className="tbl">
            <div className="tbl__wrap">
              <table className="tbl__table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th className="right">FC Qtd</th>
                    <th className="right">Real Qtd</th>
                    <th className="right">Atingimento</th>
                    <th className="right">Receita</th>
                    <th className="right">Ticket médio</th>
                    <th className="right">Custo unit.</th>
                    <th className="right">Mg %</th>
                    <th className="right">Mg R$</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.monthly.map((m) => (
                    <tr key={m.ym}>
                      <td className="tbl__primary">{m.label}</td>
                      <td className="right tbl__muted">{m.fcQtd != null ? fmtNum(m.fcQtd) : '—'}</td>
                      <td className="right tbl__strong">{fmtNum(m.qtd)}</td>
                      <td className={`right ${m.atingimento == null ? 'tbl__faded' : m.atingimento >= 0 ? 'tbl__pos' : 'tbl__neg'}`}>
                        {m.atingimento != null ? fmtPct(m.atingimento, true) : '—'}
                      </td>
                      <td className="right tbl__strong">{fmtBRL(m.receita)}</td>
                      <td className="right tbl__muted">R$ {m.ticketMedio.toFixed(2)}</td>
                      <td className="right tbl__muted">{m.custo != null ? `R$ ${m.custo.toFixed(2)}` : '—'}</td>
                      <td className={`right ${m.margemPct == null ? 'tbl__faded' : m.margemPct >= 50 ? 'tbl__pos' : m.margemPct >= 30 ? 'tbl__warn' : 'tbl__neg'}`}>
                        {m.margemPct != null ? `${m.margemPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="right tbl__muted">{m.margemRS != null ? fmtBRL(m.margemRS) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {analysis.colors.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 24 }}>
                🎨 Resumo por variação · {linha}
                <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
                  {analysis.colors.length} SKUs no período
                </span>
              </div>
              <div className="tbl">
                <div className="tbl__wrap">
                  <table className="tbl__table" style={{ minWidth: 900 }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>SKU / Variação</th>
                        <th>Status</th>
                        <th className="right">Qtd</th>
                        <th className="right">Share qtd</th>
                        <th className="right">Receita</th>
                        <th className="right">Share rec.</th>
                        <th className="right">Ticket médio</th>
                        <th className="right">Mg %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.colors.map((c, i) => (
                        <tr key={c.sku}>
                          <td className="tbl__num">{i + 1}.</td>
                          <td className="tbl__primary">
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: PIE_PALETTE[i % PIE_PALETTE.length], marginRight: 6, verticalAlign: 'middle' }} />
                            {c.sku}
                          </td>
                          <td><StatusBadge status={c.status} /></td>
                          <td className="right">{fmtNum(c.qtd)}</td>
                          <td className="right tbl__muted">{c.shareQtd.toFixed(1)}%</td>
                          <td className="right tbl__strong">{fmtBRL(c.receita)}</td>
                          <td className="right tbl__muted">{c.shareReceita.toFixed(1)}%</td>
                          <td className="right tbl__muted">R$ {c.ticketMedio.toFixed(2)}</td>
                          <td className={`right ${c.margemPct == null ? 'tbl__faded' : c.margemPct >= 50 ? 'tbl__pos' : c.margemPct >= 30 ? 'tbl__warn' : 'tbl__neg'}`}>
                            {c.margemPct != null ? `${c.margemPct.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <style>{`
        .prd__period {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .prd__period-lbl {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--text-3);
        }
        .prd__picker {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          padding: 12px 14px;
          margin-bottom: 18px;
        }
        .prd__picker-lbl {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-2);
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .prd__picker-meta {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .prd__chip {
          font-size: 10px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 99px;
          background: var(--brand-blue-l);
          color: var(--brand-blue-d);
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }
        .prd__chip--muted {
          background: var(--surface-2);
          color: var(--text-2);
        }
        .prd__row { margin-bottom: 8px; }
      `}</style>
    </div>
  );
}

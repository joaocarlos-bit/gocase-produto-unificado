// Importação › Histórico de Custos — fonte: "Controle de Importações.xlsx"
// (aba "Controle PLs"), snapshot em public/data/import-costs.json gerado por
// scripts/refresh-import-costs.cjs.
//
// Recorte: histórico de custos POR LINHA de produto ao longo dos meses de
// embarque. Headline = Custo FOB (US$); cada linha também traz Custo BB s/ IPI,
// BB c/ IPI e GOCOM (R$). Layout: KPIs + gráfico de evolução + tabela detalhada.

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card } from '../../components/Card';
import { KPICard } from '../../components/KPICard';
import { MultiSelect } from '../../components/MultiSelect';
import { Sparkline } from '../../components/Sparkline';
import { ymLabel } from '../../lib/format';
import {
  loadImportCosts, firstLast, deltaPct, IMPORT_METRICS,
  type ImportCostsPayload, type ImportLinha, type ImportMetric, type ImportSupplierAgg,
} from '../../data/importCosts';

// ── Formatação ───────────────────────────────────────────────────────────
const fmtUSD = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : 'US$ ' + v.toFixed(2).replace('.', ',');
const fmtR = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : 'R$ ' + v.toFixed(2).replace('.', ',');
const fmtMetric = (v: number | null | undefined, unit: 'US$' | 'R$') =>
  unit === 'US$' ? fmtUSD(v) : fmtR(v);
const fmtQtd = (v: number) =>
  Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(Math.round(v));

const SERIES_COLORS = [
  '#1e5fb8', '#d97706', '#059669', '#7c3aed', '#dc2626',
  '#0891b2', '#c026d3', '#65a30d', '#e11d48', '#475569',
];

const TOP_DEFAULT = 6;
// Quando o filtro de Linha está ativo, plota até este nº de linhas filtradas (top por volume)
const AUTO_PLOT_CAP = 10;

/** Badge de variação com semântica de CUSTO: alta = vermelho, queda = verde. */
function CostDelta({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) return <span className="hc-d hc-d--na">—</span>;
  const up = value > 0.05;
  const down = value < -0.05;
  const cls = up ? 'hc-d--up' : down ? 'hc-d--down' : 'hc-d--flat';
  const arrow = up ? '↑' : down ? '↓' : '→';
  return <span className={`hc-d ${cls}`}>{arrow} {Math.abs(value).toFixed(1)}%</span>;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ImportCostsPayload };

type SortKey =
  | 'linha' | 'fornecedor' | 'totalQtd' | 'nEmbarques'
  | 'fobLast' | 'fobDelta' | 'bbSemIpiLast' | 'bbComIpiLast' | 'gocomLast' | 'gocomDelta';
type SortDir = 'asc' | 'desc';

interface Row {
  linha: ImportLinha;
  fobLast: number | null; fobDelta: number | null;
  bbSemIpiLast: number | null; bbComIpiLast: number | null;
  gocomLast: number | null; gocomDelta: number | null;
  firstYm: string | null; lastYm: string | null;
}

function buildRow(L: ImportLinha): Row {
  const fob = firstLast(L.series, 'fob');
  const goc = firstLast(L.series, 'gocom');
  return {
    linha: L,
    fobLast: fob.last, fobDelta: deltaPct(L.series, 'fob'),
    bbSemIpiLast: firstLast(L.series, 'bbSemIpi').last,
    bbComIpiLast: firstLast(L.series, 'bbComIpi').last,
    gocomLast: goc.last, gocomDelta: deltaPct(L.series, 'gocom'),
    firstYm: L.series[0]?.ym ?? null,
    lastYm: L.series[L.series.length - 1]?.ym ?? null,
  };
}

export function HistoricoCustos() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [metric, setMetric] = useState<ImportMetric>('fob');
  const [fornecedorSel, setFornecedorSel] = useState<string[]>([]); // [] = todos
  const [linhaFilter, setLinhaFilter] = useState<string[]>([]);     // [] = todas (filtra a TABELA)
  const [selectedLinhas, setSelectedLinhas] = useState<string[]>([]); // linhas plotadas no gráfico
  const [sortKey, setSortKey] = useState<SortKey>('totalQtd');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadImportCosts()
      .then((data) => { if (!cancelled) setState({ kind: 'ready', data }); })
      .catch((e) => { if (!cancelled) setState({ kind: 'error', message: String(e?.message || e) }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const data = state.kind === 'ready' ? state.data : null;

  const allLinhas = useMemo(() => (data ? Object.values(data.byLinha) : []), [data]);
  const fornecedorOptions = useMemo(() => {
    const s = new Set<string>();
    allLinhas.forEach((L) => L.fornecedores.forEach((f) => s.add(f)));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allLinhas]);

  // Linhas após filtro de fornecedor
  const filteredLinhas = useMemo(() => {
    if (!fornecedorSel.length) return allLinhas;
    return allLinhas.filter((L) => L.fornecedores.some((f) => fornecedorSel.includes(f)));
  }, [allLinhas, fornecedorSel]);

  const filteredNames = useMemo(() => filteredLinhas.map((L) => L.linha), [filteredLinhas]);

  // Linhas que aparecem na TABELA: fornecedor + filtro de Linha (AND).
  const tableLinhas = useMemo(() => {
    if (!linhaFilter.length) return filteredLinhas;
    const set = new Set(linhaFilter);
    return filteredLinhas.filter((L) => set.has(L.linha));
  }, [filteredLinhas, linhaFilter]);
  const tableNames = useMemo(() => tableLinhas.map((L) => L.linha), [tableLinhas]);

  // Seleção do gráfico:
  //   - filtro de Linha ativo  → plota as linhas filtradas (top AUTO_PLOT_CAP por volume)
  //   - sem filtro de Linha    → default top N por volume, preservando a seleção válida do usuário
  useEffect(() => {
    if (!data) return;
    if (linhaFilter.length) {
      const plot = [...tableLinhas]
        .sort((a, b) => b.totalQtd - a.totalQtd)
        .slice(0, AUTO_PLOT_CAP)
        .map((L) => L.linha);
      setSelectedLinhas(plot);
      return;
    }
    const top = [...filteredLinhas]
      .sort((a, b) => b.totalQtd - a.totalQtd)
      .slice(0, TOP_DEFAULT)
      .map((L) => L.linha);
    setSelectedLinhas((prev) => {
      const stillValid = prev.filter((n) => filteredNames.includes(n));
      return stillValid.length ? stillValid : top;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, fornecedorSel, linhaFilter]);

  const rows = useMemo(() => tableLinhas.map(buildRow), [tableLinhas]);

  const sortedRows = useMemo(() => {
    const val = (r: Row): string | number => {
      switch (sortKey) {
        case 'linha':        return r.linha.linha.toLocaleLowerCase('pt-BR');
        case 'fornecedor':   return (r.linha.fornecedores[0] || '').toLocaleLowerCase('pt-BR');
        case 'totalQtd':     return r.linha.totalQtd;
        case 'nEmbarques':   return r.linha.nEmbarques;
        case 'fobLast':      return r.fobLast ?? -Infinity;
        case 'fobDelta':     return r.fobDelta ?? -Infinity;
        case 'bbSemIpiLast': return r.bbSemIpiLast ?? -Infinity;
        case 'bbComIpiLast': return r.bbComIpiLast ?? -Infinity;
        case 'gocomLast':    return r.gocomLast ?? -Infinity;
        case 'gocomDelta':   return r.gocomDelta ?? -Infinity;
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  // Quebra por fornecedor das linhas em vista (uma linha por fornecedor de cada linha).
  const supplierRows = useMemo(() => {
    const out: { linha: string; s: ImportSupplierAgg }[] = [];
    tableLinhas.forEach((L) => (L.bySupplier ?? []).forEach((s) => out.push({ linha: L.linha, s })));
    return out.sort((a, b) => b.s.qtd - a.s.qtd);
  }, [tableLinhas]);

  const metricDef = IMPORT_METRICS.find((m) => m.key === metric)!;

  // Dados do gráfico: união de meses entre as linhas selecionadas plotáveis
  const plottable = useMemo(
    () => selectedLinhas.filter((n) => data && data.byLinha[n]),
    [selectedLinhas, data],
  );
  const chartData = useMemo(() => {
    if (!data) return [];
    const monthsSet = new Set<string>();
    plottable.forEach((n) => data.byLinha[n].series.forEach((p) => monthsSet.add(p.ym)));
    const months = [...monthsSet].sort();
    return months.map((ym) => {
      const point: Record<string, number | string | null> = { ym, label: ymLabel(ym) };
      plottable.forEach((n) => {
        const pt = data.byLinha[n].series.find((p) => p.ym === ym);
        point[n] = pt ? pt[metric] : null;
      });
      return point;
    });
  }, [data, plottable, metric]);

  // Rótulos de dados: com poucas linhas mostra em todos os pontos; com muitas,
  // só no último ponto (valor atual) de cada linha pra não poluir.
  const showAllLabels = plottable.length <= 3;
  const lastIdxByLinha = useMemo(() => {
    const m: Record<string, number> = {};
    plottable.forEach((n) => {
      let last = -1;
      chartData.forEach((pt, idx) => { if (pt[n] != null) last = idx; });
      m[n] = last;
    });
    return m;
  }, [plottable, chartData]);

  // KPI: linhas com a métrica atual em ALTA no período
  const altaInfo = useMemo(() => {
    let up = 0, withHist = 0;
    rows.forEach((r) => {
      const d = deltaPct(r.linha.series, metric);
      if (d != null) { withHist++; if (d > 0.05) up++; }
    });
    return { up, withHist };
  }, [rows, metric]);

  // Renderizador de rótulo por linha (cor da série, valor compacto).
  function makeLabel(name: string, color: string) {
    return (props: any) => {
      const { x, y, value, index } = props;
      if (value == null || !Number.isFinite(value)) return null;
      if (!showAllLabels && index !== lastIdxByLinha[name]) return null;
      const text = metricDef.unit === 'US$'
        ? value.toFixed(2).replace('.', ',')
        : String(Math.round(value));
      const isLast = index === lastIdxByLinha[name];
      return (
        <text
          x={x}
          y={y - 8}
          textAnchor={isLast && !showAllLabels ? 'end' : 'middle'}
          fontSize={9.5}
          fontWeight={700}
          fill={color}
        >
          {text}
        </text>
      );
    };
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      const numeric: SortKey[] = ['totalQtd', 'nEmbarques', 'fobLast', 'fobDelta', 'bbSemIpiLast', 'bbComIpiLast', 'gocomLast', 'gocomDelta'];
      setSortDir(numeric.includes(key) ? 'desc' : 'asc');
    }
  }

  function toggleLinha(name: string) {
    setSelectedLinhas((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function handleExport() {
    const header = ['Linha', 'Fornecedor(es)', 'Qtd total', 'Embarques', 'Período',
      'FOB atual (US$)', 'Δ FOB %', 'BB s/IPI (R$)', 'BB c/IPI (R$)', 'GOCOM atual (R$)', 'Δ GOCOM %'];
    const cell = (v: string | number | null) =>
      v == null || (typeof v === 'number' && !Number.isFinite(v)) ? ''
        : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const lines = sortedRows.map((r) => [
      r.linha.linha, r.linha.fornecedores.join(' / '), Math.round(r.linha.totalQtd), r.linha.nEmbarques,
      r.firstYm && r.lastYm ? `${ymLabel(r.firstYm)}–${ymLabel(r.lastYm)}` : '',
      r.fobLast?.toFixed(2) ?? '', r.fobDelta?.toFixed(1) ?? '',
      r.bbSemIpiLast?.toFixed(2) ?? '', r.bbComIpiLast?.toFixed(2) ?? '',
      r.gocomLast?.toFixed(2) ?? '', r.gocomDelta?.toFixed(1) ?? '',
    ].map(cell).join(','));
    const csv = [header.map((h) => `"${h}"`).join(','), ...lines].join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `import-custos_${state.kind === 'ready' ? state.data.meta.collectedAt.slice(0, 10) : 'export'}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function handleExportSuppliers() {
    const header = ['Linha', 'Fornecedor', 'Qtd', 'Embarques', 'Período',
      'FOB (US$)', 'BB s/IPI (R$)', 'BB c/IPI (R$)', 'GOCOM (R$)'];
    const cell = (v: string | number | null) =>
      v == null || (typeof v === 'number' && !Number.isFinite(v)) ? ''
        : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const lines = supplierRows.map(({ linha, s }) => [
      linha, s.fornecedor, Math.round(s.qtd), s.nPLs,
      s.firstYm && s.lastYm ? `${ymLabel(s.firstYm)}–${ymLabel(s.lastYm)}` : '',
      s.fob?.toFixed(2) ?? '', s.bbSemIpi?.toFixed(2) ?? '', s.bbComIpi?.toFixed(2) ?? '', s.gocom?.toFixed(2) ?? '',
    ].map(cell).join(','));
    const csv = [header.map((h) => `"${h}"`).join(','), ...lines].join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `import-custos-fornecedor_${state.kind === 'ready' ? state.data.meta.collectedAt.slice(0, 10) : 'export'}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  if (state.kind === 'loading') {
    return <div className="hc-status"><span className="spinner" /> Carregando histórico de custos…</div>;
  }
  if (state.kind === 'error') {
    return (
      <div className="hc-status hc-status--err">
        ⚠ Erro ao carregar: {state.message}
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
          O snapshot é gerado por <code>npm run refresh-import</code> (lê a planilha Controle de Importações).
        </div>
        <button className="hc-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Tentar de novo</button>
      </div>
    );
  }

  const { meta } = state.data;
  const periodo = meta.period.from && meta.period.to
    ? `${ymLabel(meta.period.from)} – ${ymLabel(meta.period.to)}`
    : '—';

  return (
    <div className="hc">
      <div className="hc__hero">
        <div className="hc__crumb">IMPORTAÇÃO</div>
        <div className="hc__hero-row">
          <div>
            <h1 className="hc__title">Histórico de Custos</h1>
            <div className="hc__sub">
              Custo <strong>FOB</strong> (US$) e custos <strong>BB s/ IPI</strong>, <strong>BB c/ IPI</strong> e <strong>GOCOM</strong> (R$)
              por linha ao longo dos embarques · {periodo}
            </div>
          </div>
          <div className="hc__hero-right">
            <span className="hc__updated">
              Fonte: {meta.sourceFile} › {meta.sheet}<br />
              Atualizado: {new Date(meta.collectedAt).toLocaleString('pt-BR')}
            </span>
            <button className="hc-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Atualizar</button>
          </div>
        </div>
      </div>

      <div className="hc__kpis">
        <KPICard label="Linhas monitoradas" value={meta.linhasCount} icon="📦" accent="blue" />
        <KPICard label="Embarques (PLs)" value={fmtQtd(meta.embarquesCount)} icon="🚢" accent="blue"
          hint={`${meta.usedRows.toLocaleString('pt-BR')} itens de PL`} />
        <KPICard label="Fornecedores" value={meta.fornecedoresCount} icon="🏭" accent="purple" />
        <KPICard
          label={`Linhas c/ ${metricDef.label} em alta`}
          value={altaInfo.up}
          icon="📈"
          accent={altaInfo.up > altaInfo.withHist / 2 ? 'red' : 'yellow'}
          hint={`de ${altaInfo.withHist} com histórico no período`}
        />
      </div>

      {/* Controles */}
      <div className="hc__controls">
        <div className="hc__metric">
          <span className="hc__ctl-label">Métrica</span>
          <div className="hc__seg">
            {IMPORT_METRICS.map((m) => (
              <button
                key={m.key}
                className={`hc__seg-btn ${metric === m.key ? 'on' : ''}`}
                onClick={() => setMetric(m.key)}
              >
                {m.label} <span className="hc__seg-unit">{m.unit}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="hc__filters">
          <div className="hc__ctl">
            <span className="hc__ctl-label">Fornecedor</span>
            <MultiSelect options={fornecedorOptions} value={fornecedorSel} onChange={setFornecedorSel} allLabel="Todos" placeholder="Filtrar por fornecedor" />
          </div>
          <div className="hc__ctl">
            <span className="hc__ctl-label">Linha</span>
            <MultiSelect options={filteredNames} value={linhaFilter} onChange={setLinhaFilter} allLabel="Todas" placeholder="Filtrar linhas (tabela)" />
          </div>
          <div className="hc__ctl">
            <span className="hc__ctl-label">Linhas no gráfico</span>
            <MultiSelect options={tableNames} value={selectedLinhas} onChange={setSelectedLinhas} allLabel="Escolher linhas" placeholder="Linhas plotadas" />
          </div>
        </div>
      </div>

      {/* Gráfico de evolução */}
      <Card
        title={`Evolução do custo ${metricDef.label} (${metricDef.unit})`}
        subtitle={plottable.length
          ? `${plottable.length} linha${plottable.length !== 1 ? 's' : ''} · média ponderada por quantidade · clique numa linha da tabela para incluir/remover`
          : 'Selecione ao menos uma linha (na tabela ou no seletor acima)'}
      >
        <div style={{ height: 360 }}>
          {plottable.length === 0 ? (
            <div className="hc-empty">Nenhuma linha selecionada.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 24, right: 40, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 10, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis
                  tick={{ fill: 'var(--text-3)', fontSize: 10 }}
                  width={56}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => metricDef.unit === 'US$' ? `$${v.toFixed(1)}` : `R$${Math.round(v)}`}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [fmtMetric(v, metricDef.unit), name]}
                  labelFormatter={(l) => `Mês: ${l}`}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
                  cursor={{ stroke: 'var(--border-2)', strokeWidth: 1 }}
                />
                <Legend iconType="plainline" iconSize={16} wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 4 }} />
                {plottable.map((n, i) => {
                  const color = SERIES_COLORS[i % SERIES_COLORS.length];
                  return (
                    <Line
                      key={n}
                      type="monotone"
                      dataKey={n}
                      name={n}
                      stroke={color}
                      strokeWidth={2.2}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    >
                      <LabelList dataKey={n} content={makeLabel(n, color)} />
                    </Line>
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Tabela detalhada */}
      <div className="hc__tbl-wrap">
        <div className="tbl tbl--sticky-2col tbl--clickable">
          <div className="tbl__topbar">
            <span className="tbl__count">
              {sortedRows.length} linha{sortedRows.length !== 1 ? 's' : ''}
              <span className="tbl__count-sub">· clique para incluir no gráfico · tendência = {metricDef.label}</span>
            </span>
            <button className="tbl__export" onClick={handleExport} title="Baixar como CSV">⤓ Exportar CSV</button>
          </div>
          <div className="tbl__wrap">
            <table className="tbl__table" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <th className="num-col" style={{ width: 32 }}>#</th>
                  {([
                    ['linha', 'Linha', ''],
                    ['fornecedor', 'Fornecedor', ''],
                    ['totalQtd', 'Qtd total', 'right'],
                    ['nEmbarques', 'Emb.', 'right'],
                    ['fobLast', 'FOB (US$)', 'right'],
                    ['fobDelta', 'Δ FOB', 'right'],
                    ['bbSemIpiLast', 'BB s/IPI', 'right'],
                    ['bbComIpiLast', 'BB c/IPI', 'right'],
                    ['gocomLast', 'GOCOM', 'right'],
                    ['gocomDelta', 'Δ GOCOM', 'right'],
                  ] as [SortKey, string, string][]).map(([key, label, align]) => (
                    <th
                      key={key}
                      className={`${align === 'right' ? 'right' : ''} ${sortKey === key ? 'on' : ''}`}
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      {sortKey === key && <span className="tbl__sort">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                  <th className="right">Tendência</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => {
                  const sel = selectedLinhas.includes(r.linha.linha);
                  const spark = r.linha.series.map((p) => p[metric]).filter((v): v is number => v != null);
                  const sparkDelta = deltaPct(r.linha.series, metric);
                  const sparkColor = sparkDelta == null ? 'var(--text-3)' : sparkDelta > 0.05 ? 'var(--red)' : sparkDelta < -0.05 ? 'var(--green)' : 'var(--brand-blue)';
                  const fornec = r.linha.fornecedores;
                  return (
                    <tr key={r.linha.linha} className={sel ? 'is-selected' : ''} onClick={() => toggleLinha(r.linha.linha)}>
                      <td className="tbl__num">{i + 1}.</td>
                      <td className="tbl__primary" title={r.linha.linha}>{r.linha.linha}</td>
                      <td className="tbl__muted" title={fornec.join(' / ')}>
                        {fornec[0] || '—'}{fornec.length > 1 && <span className="hc-more"> +{fornec.length - 1}</span>}
                      </td>
                      <td className="right tbl__muted">{fmtQtd(r.linha.totalQtd)}</td>
                      <td className="right tbl__muted">{r.linha.nEmbarques}</td>
                      <td className="right tbl__strong">{fmtUSD(r.fobLast)}</td>
                      <td className="right"><CostDelta value={r.fobDelta} /></td>
                      <td className="right tbl__muted">{fmtR(r.bbSemIpiLast)}</td>
                      <td className="right tbl__muted">{fmtR(r.bbComIpiLast)}</td>
                      <td className="right tbl__strong">{fmtR(r.gocomLast)}</td>
                      <td className="right"><CostDelta value={r.gocomDelta} /></td>
                      <td className="right">
                        {spark.length > 1
                          ? <Sparkline values={spark} width={96} height={26} color={sparkColor} fill="transparent" />
                          : <span className="tbl__faded">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="tbl__note">
            FOB em US$/un · BB e GOCOM em R$/un · valores = média ponderada pela quantidade do mês de entrega ·
            Δ = variação do 1º ao último embarque com dado. {meta.skippedNoLinha} itens sem linha e {meta.skippedNoDate} sem data foram descartados.
          </div>
        </div>
      </div>

      {/* Tabela: custo por fornecedor (quebra das linhas em vista) */}
      <div className="hc__tbl-wrap">
        <div className="tbl">
          <div className="tbl__topbar">
            <span className="tbl__count">
              Custo por fornecedor
              <span className="tbl__count-sub">
                · {supplierRows.length} fornecedor{supplierRows.length !== 1 ? 'es' : ''} nas {tableLinhas.length} linha{tableLinhas.length !== 1 ? 's' : ''} em vista · média ponderada do período
              </span>
            </span>
            <button className="tbl__export" onClick={handleExportSuppliers} title="Baixar como CSV">⤓ Exportar CSV</button>
          </div>
          <div className="tbl__wrap">
            <table className="tbl__table" style={{ minWidth: 1000 }}>
              <thead>
                <tr>
                  <th className="num-col" style={{ width: 32 }}>#</th>
                  <th>Linha</th>
                  <th>Fornecedor</th>
                  <th className="right">Qtd</th>
                  <th className="right">Emb.</th>
                  <th className="right">FOB (US$)</th>
                  <th className="right">BB s/IPI</th>
                  <th className="right">BB c/IPI</th>
                  <th className="right">GOCOM</th>
                  <th className="right">Período</th>
                </tr>
              </thead>
              <tbody>
                {supplierRows.map(({ linha, s }, i) => (
                  <tr key={`${linha}|${s.fornecedor}`}>
                    <td className="tbl__num">{i + 1}.</td>
                    <td className="tbl__muted" title={linha}>{linha}</td>
                    <td className="tbl__primary" title={s.fornecedor}>{s.fornecedor}</td>
                    <td className="right tbl__muted">{fmtQtd(s.qtd)}</td>
                    <td className="right tbl__muted">{s.nPLs}</td>
                    <td className="right tbl__strong">{fmtUSD(s.fob)}</td>
                    <td className="right tbl__muted">{fmtR(s.bbSemIpi)}</td>
                    <td className="right tbl__muted">{fmtR(s.bbComIpi)}</td>
                    <td className="right tbl__strong">{fmtR(s.gocom)}</td>
                    <td className="right tbl__muted">
                      {s.firstYm && s.lastYm ? `${ymLabel(s.firstYm)}–${ymLabel(s.lastYm)}` : '—'}
                    </td>
                  </tr>
                ))}
                {supplierRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="tbl__muted" style={{ textAlign: 'center', padding: 16 }}>
                      Sem dados de fornecedor para as linhas em vista.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="tbl__note">
            Uma linha por fornecedor de cada linha de produto em vista (respeita os filtros acima). Valores = média
            ponderada por quantidade de todos os embarques daquele fornecedor no período. Use o filtro <strong>Linha</strong> para focar numa linha específica.
          </div>
        </div>
      </div>

      <style>{`
        .hc__hero { margin-bottom: 20px; }
        .hc__crumb { font-size: 10px; font-weight: 700; color: var(--text-3); letter-spacing: 1.5px; margin-bottom: 8px; text-transform: uppercase; }
        .hc__hero-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .hc__title { font-size: 32px; font-weight: 900; color: var(--text); line-height: 1.05; letter-spacing: -1px; }
        .hc__sub { font-size: 13px; font-weight: 500; color: var(--text-2); margin-top: 6px; max-width: 880px; line-height: 1.5; }
        .hc__hero-right { display: flex; align-items: center; gap: 12px; }
        .hc__updated { font-size: 10px; color: var(--text-3); text-align: right; line-height: 1.5; }
        .hc-retry { font-size: 11px; font-weight: 700; padding: 6px 11px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); white-space: nowrap; }
        .hc-retry:hover { background: var(--border); color: var(--text); }

        .hc__kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }

        .hc__controls { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
        .hc__metric, .hc__ctl { display: flex; flex-direction: column; gap: 5px; }
        .hc__filters { display: flex; gap: 14px; flex-wrap: wrap; }
        .hc__ctl-label { font-size: 10px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.6px; }
        .hc__seg { display: inline-flex; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; padding: 3px; gap: 2px; }
        .hc__seg-btn { font-size: 12px; font-weight: 600; color: var(--text-2); padding: 6px 12px; border-radius: 7px; transition: background 0.12s, color 0.12s; }
        .hc__seg-btn:hover { color: var(--text); }
        .hc__seg-btn.on { background: var(--surface); color: var(--brand-blue-d); font-weight: 800; box-shadow: var(--shadow-sm); }
        .hc__seg-unit { font-size: 9px; font-weight: 600; color: var(--text-3); margin-left: 2px; }
        .hc__seg-btn.on .hc__seg-unit { color: var(--brand-blue); }

        .hc__tbl-wrap { margin-top: 18px; }
        .hc-more { color: var(--text-3); font-size: 10px; font-weight: 600; }
        .hc-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-3); font-size: 13px; }

        .hc-d { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .hc-d--up { color: var(--red); }
        .hc-d--down { color: var(--green); }
        .hc-d--flat { color: var(--text-2); }
        .hc-d--na { color: var(--text-3); }

        .hc-status { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 40px; color: var(--text-2); font-size: 13px; }
        .hc-status--err { color: var(--red); }
        .hc-status code { font-family: var(--font-mono); font-size: 11px; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }

        @media (max-width: 1000px) {
          .hc__kpis { grid-template-columns: repeat(2, 1fr); }
          .hc__controls { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  );
}

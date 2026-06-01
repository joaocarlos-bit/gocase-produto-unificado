import { useMemo, useState } from 'react';
import type { ProcessedData, Ym } from '../data/types';
import {
  aggregatedMonthlySeries,
  allMonthsWithCurrent,
  latestMonth,
  linhaMonthlySeries,
  paretoBreak,
  portfolioAggregate,
  totalsForRange,
} from '../data/aggregates';
import { fmtBRL, shiftYm, ymLabel } from '../lib/format';
import { Delta, KPICard } from '../components/KPICard';
import { MonthRangePicker } from '../components/MonthRangePicker';
import { PageHero } from '../components/PageHero';
import { ParetoChart } from '../components/ParetoChart';
import { PortfolioTable } from '../components/PortfolioTable';
import { MultiSelect } from '../components/MultiSelect';
import { LinhaMonthlyChart } from '../components/LinhaMonthlyChart';

interface Props { data: ProcessedData; }

export function Portfolio({ data }: Props) {
  const months = useMemo(() => allMonthsWithCurrent(data), [data]);
  const latest = latestMonth(data) ?? months[months.length - 1];
  const defaultFrom = useMemo(() => shiftYm(latest, -2), [latest]);

  const [range, setRange] = useState<{ from: Ym; to: Ym }>({ from: defaultFrom, to: latest });
  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterLinhas, setFilterLinhas] = useState<string[]>([]);
  const [search, setSearch] = useState<string>('');
  const [selectedLinha, setSelectedLinha] = useState<string | null>(null);

  function toggleLinhaSelection(linha: string) {
    setSelectedLinha((cur) => (cur === linha ? null : linha));
  }

  const totals = useMemo(() => totalsForRange(data, range.from, range.to), [data, range]);
  const lyTotals = useMemo(
    () => totalsForRange(data, shiftYm(range.from, -12), shiftYm(range.to, -12)),
    [data, range],
  );
  const yoyTotal = lyTotals.receita > 0 ? (totals.receita / lyTotals.receita - 1) * 100 : null;

  const portfolio = useMemo(() => portfolioAggregate(data, range.from, range.to), [data, range]);

  const categorias = useMemo(
    () => Array.from(new Set(portfolio.map((r) => r.categoria))).sort(),
    [portfolio],
  );
  const statuses = useMemo(
    () => Array.from(new Set(portfolio.map((r) => r.status))).sort(),
    [portfolio],
  );
  const linhas = useMemo(
    () => Array.from(new Set(portfolio.map((r) => r.linha))).sort(),
    [portfolio],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return portfolio.filter(
      (r) =>
        (filterCats.length === 0 || filterCats.includes(r.categoria)) &&
        (filterStatuses.length === 0 || filterStatuses.includes(r.status)) &&
        (filterLinhas.length === 0 || filterLinhas.includes(r.linha)) &&
        (selectedLinha == null || r.linha === selectedLinha) &&
        (q === '' || r.linha.toLocaleLowerCase('pt-BR').includes(q)),
    );
  }, [portfolio, filterCats, filterStatuses, filterLinhas, search, selectedLinha]);

  // Série mensal:
  //   - se uma linha está selecionada → trajetória dela ao longo do snapshot inteiro
  //   - caso contrário → agregado de TODAS as linhas filtradas (categoria, status, linha, busca)
  const monthlySeries = useMemo(() => {
    if (selectedLinha) return linhaMonthlySeries(data, selectedLinha);
    return aggregatedMonthlySeries(data, filtered.map((r) => r.linha));
  }, [data, selectedLinha, filtered]);

  const monthlyLabel = selectedLinha ?? (
    filtered.length === portfolio.length
      ? 'Geral · todo o catálogo'
      : `${filtered.length} linhas no escopo`
  );

  // KPIs
  const totalFilteredRevenue = filtered.reduce((s, r) => s + r.receita, 0);
  const linhasGrowing = filtered.filter((r) => r.yoyPct != null && r.yoyPct > 0).length;
  const linhasShrinking = filtered.filter((r) => r.yoyPct != null && r.yoyPct < 0).length;
  const top10Concentration = filtered.length > 0
    ? filtered.slice(0, 10).reduce((s, r) => s + r.receita, 0) / (filtered.reduce((s, r) => s + r.receita, 0) || 1) * 100
    : 0;
  const pareto80 = paretoBreak(portfolio, 80);

  return (
    <div className="portfolio">
      <PageHero
        breadcrumb="Unidade de negócio: Produto Gocase · Portfólio"
        title="Portfólio"
        subtitle={
          <>
            Visão estratégica de catálogo: <strong>concentração (Pareto)</strong>, <strong>crescimento YoY</strong> e <strong>margem por linha</strong>.
            Use os filtros pra recortar o escopo e clique numa linha pra abrir o detalhe mês a mês.
          </>
        }
        right={
          <div className="pf__period">
            <span className="pf__period-lbl">Período</span>
            <MonthRangePicker available={months} value={range} onChange={setRange} />
          </div>
        }
      />

      {/* Filtros */}
      <div className="pf__filters">
        <div className="pf__filter-grp">
          <span className="pf__filter-lbl">Categoria</span>
          <MultiSelect
            options={categorias}
            value={filterCats}
            onChange={setFilterCats}
            allLabel="Todas"
          />
        </div>
        <div className="pf__filter-grp">
          <span className="pf__filter-lbl">Status</span>
          <MultiSelect
            options={statuses}
            value={filterStatuses}
            onChange={setFilterStatuses}
            allLabel="Todos"
          />
        </div>
        <div className="pf__filter-grp">
          <span className="pf__filter-lbl">Linha</span>
          <MultiSelect
            options={linhas}
            value={filterLinhas}
            onChange={setFilterLinhas}
            allLabel="Todas"
          />
        </div>
        <div className="pf__filter-grp pf__filter-grp--grow">
          <span className="pf__filter-lbl">Buscar</span>
          <input
            className="pf__search"
            placeholder="Filtrar por nome da linha…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="pf__chip" onClick={() => setSearch('')} title="Limpar busca">✕</button>
          )}
        </div>
      </div>

      {/* Chip de filtro ativo */}
      {selectedLinha && (
        <div className="pf__active-filter">
          <span className="pf__active-filter-lbl">Filtro ativo</span>
          <button className="pf__active-filter-chip" onClick={() => setSelectedLinha(null)}>
            📌 Linha: <strong>{selectedLinha}</strong>
            <span className="pf__active-filter-x">✕</span>
          </button>
          <span className="pf__active-filter-hint">
            Gráficos, Pareto e tabela restritos a essa linha · clique no chip ou na linha da tabela pra limpar
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-5">
        <KPICard
          label="Linhas no escopo"
          icon="📚"
          accent="blue"
          value={String(filtered.length)}
          hint={`de ${portfolio.length} total · ${ymLabel(range.from)} → ${ymLabel(range.to)}`}
        />
        <KPICard
          label="Receita"
          icon="💰"
          accent="purple"
          value={fmtBRL(totalFilteredRevenue)}
          delta={yoyTotal != null ? <Delta value={yoyTotal} /> : null}
          hint="vs LY (total do período, sem filtros)"
        />
        <KPICard
          label="Concentração top 10"
          icon="🎯"
          accent={top10Concentration > 80 ? 'red' : top10Concentration > 60 ? 'yellow' : 'green'}
          value={`${top10Concentration.toFixed(1)}%`}
          hint="top 10 linhas / receita filtrada"
        />
        <KPICard
          label="80% da receita"
          icon="📊"
          accent="yellow"
          value={`${pareto80.linhasCount}`}
          unit="linhas"
          hint={`${pareto80.pctOfCatalog.toFixed(1)}% do catálogo · regra 80/20`}
        />
        <KPICard
          label="Crescendo vs LY"
          icon="🌱"
          accent="green"
          value={`${linhasGrowing}`}
          unit={`/ ${filtered.length}`}
          hint={`${linhasShrinking} em queda · sem dado LY: ${filtered.length - linhasGrowing - linhasShrinking}`}
        />
      </div>

      {/* Detalhe mês a mês — sempre visível.
          Sem linha selecionada: agregado das linhas filtradas.
          Com linha selecionada: trajetória da linha. */}
      <div className="section-title">
        📈 Detalhe mês a mês · {monthlyLabel}
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          receita, quantidade e margem bruta · {selectedLinha ? 'snapshot inteiro da linha' : 'agregado das linhas no escopo'}
        </span>
      </div>
      <LinhaMonthlyChart data={monthlySeries} linha={monthlyLabel} />

      {/* Pareto */}
      <div className="section-title">
        📐 Concentração de receita (Pareto)
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          ordenado por receita desc · top 30 linhas
        </span>
      </div>
      <ParetoChart rows={filtered} />

      {/* Tabela mestre */}
      <div className="section-title">
        📋 Portfólio detalhado
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          {filtered.length} linhas · clique para filtrar
        </span>
      </div>
      <PortfolioTable
        rows={filtered}
        selectedLinha={selectedLinha}
        onRowClick={toggleLinhaSelection}
        exportTitle="portfolio"
      />

      <style>{`
        .pf__period {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .pf__period-lbl {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--text-3);
        }

        .pf__filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          padding: 12px 14px;
          margin-bottom: 18px;
        }
        .pf__filter-grp {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pf__filter-grp--grow {
          flex: 1;
          min-width: 240px;
        }
        .pf__filter-lbl {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-3);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .pf__search {
          flex: 1;
          min-width: 180px;
          padding: 5px 10px;
          font-size: 12px;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          outline: none;
        }
        .pf__search:focus { border-color: var(--brand-blue); }
        .pf__chip {
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-2);
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 99px;
        }

        .pf__active-filter {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          background: linear-gradient(90deg, rgba(30, 95, 184, 0.06) 0%, transparent 100%);
          border: 1px solid var(--brand-blue-l);
          border-left: 3px solid var(--brand-blue);
          border-radius: var(--r-md);
          padding: 10px 14px;
          margin-bottom: 16px;
        }
        .pf__active-filter-lbl {
          font-size: 10px;
          font-weight: 700;
          color: var(--brand-blue);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .pf__active-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--brand-blue-d);
          background: var(--surface);
          border: 1.5px solid var(--brand-blue);
          border-radius: 99px;
          padding: 5px 12px;
        }
        .pf__active-filter-chip:hover { background: var(--brand-blue-l); }
        .pf__active-filter-chip strong { color: var(--text); }
        .pf__active-filter-x {
          font-size: 13px;
          margin-left: 4px;
          color: var(--brand-blue);
          font-weight: 700;
        }
        .pf__active-filter-hint {
          font-size: 11px;
          color: var(--text-2);
          font-weight: 500;
        }
        @media (max-width: 700px) {
          .pf__active-filter-hint { display: none; }
        }
      `}</style>
    </div>
  );
}

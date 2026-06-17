import { useMemo, useState } from 'react';
import type { ProcessedData, Ym } from '../data/types';
import {
  aggregatedMonthlySeries, allMonthsWithCurrent, categoriaMonthlyStack, getSubcategoria,
  latestMonth, portfolioAggregate, subcategoriaMonthlyStack,
  totalsForRange,
} from '../data/aggregates';
import { fmtBRL, fmtNum, fmtPct, shiftYm, ymLabel } from '../lib/format';
import { Delta, KPICard } from '../components/KPICard';
import { MonthRangePicker } from '../components/MonthRangePicker';
import { PageHero } from '../components/PageHero';
import { StackedMonthlyChart } from '../components/StackedMonthlyChart';
import { PortfolioTable } from '../components/PortfolioTable';
import { LinhaMonthlyChart } from '../components/LinhaMonthlyChart';

interface Props { data: ProcessedData; }

export function Pulso({ data }: Props) {
  const months = useMemo(() => allMonthsWithCurrent(data), [data]);
  const latest = latestMonth(data) ?? months[months.length - 1];

  const defaultFrom = useMemo(() => shiftYm(latest, -2), [latest]);

  const [range, setRange] = useState<{ from: Ym; to: Ym }>({ from: defaultFrom, to: latest });

  // Year-over-year shifted range
  const lyFrom = useMemo(() => shiftYm(range.from, -12), [range.from]);
  const lyTo   = useMemo(() => shiftYm(range.to, -12), [range.to]);

  const totals   = useMemo(() => totalsForRange(data, range.from, range.to), [data, range]);
  const lyTotals = useMemo(() => totalsForRange(data, lyFrom, lyTo), [data, lyFrom, lyTo]);

  const yoyRec = lyTotals.receita > 0 ? (totals.receita / lyTotals.receita - 1) * 100 : null;
  const yoyQtd = lyTotals.qtd > 0 ? (totals.qtd / lyTotals.qtd - 1) * 100 : null;

  const portfolio = useMemo(
    () => portfolioAggregate(data, range.from, range.to),
    [data, range],
  );

  // Linhas (com subcategoria adicionada)
  const linhasAggRows = useMemo(() => portfolio.filter((r) => r.receita > 0), [portfolio]);

  // Cross-filter via clique nos charts empilhados (move pra cima — usado nos stacks abaixo)
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);

  // Stacked series — categoria e subcategoria
  //   - respeita o período selecionado
  //   - quando o usuário escolhe categoria, o sub chart filtra àquela cat
  //   - quando escolhe subcategoria, o cat chart filtra às cats com essa sub
  const catStack = useMemo(
    () => categoriaMonthlyStack(data, range.from, range.to, selectedSub ?? undefined),
    [data, range, selectedSub],
  );
  const subStack = useMemo(
    () => subcategoriaMonthlyStack(data, 8, range.from, range.to, selectedCat ?? undefined),
    [data, range, selectedCat],
  );

  function toggleCat(key: string) {
    setSelectedCat((cur) => (cur === key ? null : key));
    setSelectedSub(null);
  }
  function toggleSub(key: string) {
    setSelectedSub((cur) => (cur === key ? null : key));
  }
  function clearFilters() {
    setSelectedCat(null);
    setSelectedSub(null);
  }

  // Linhas filtradas pelos chips ativos
  const filteredRows = useMemo(() => {
    return linhasAggRows.filter((r) => {
      if (selectedCat && r.categoria !== selectedCat) return false;
      if (selectedSub && getSubcategoria(r.linha) !== selectedSub) return false;
      return true;
    });
  }, [linhasAggRows, selectedCat, selectedSub]);

  // Série mensal Receita & Qtd + Margem agregada (respeita o período selecionado)
  const monthlySeries = useMemo(
    () => aggregatedMonthlySeries(data, filteredRows.map((r) => r.linha), range.from, range.to),
    [data, filteredRows, range],
  );

  const monthlyLabel = selectedCat
    ? `Categoria: ${selectedCat}`
    : selectedSub
      ? `Subcategoria: ${selectedSub}`
      : 'Geral · todo o catálogo';

  // Quantos meses no range escolhido (pra hint)
  const rangeMonths = useMemo(() => {
    const fromIdx = months.indexOf(range.from);
    const toIdx = months.indexOf(range.to);
    if (fromIdx === -1 || toIdx === -1) return 0;
    return toIdx - fromIdx + 1;
  }, [months, range]);

  return (
    <div className="pulso">
      <PageHero
        breadcrumb="Unidade de negócio: Produto Gocase · Visão Geral"
        title="Visão Geral"
        subtitle={
          <>{ymLabel(range.from)} → {ymLabel(range.to)} · {rangeMonths} {rangeMonths === 1 ? 'mês' : 'meses'} · referência {ymLabel(latest)}</>
        }
        right={
          <div className="pulso__period">
            <span className="pulso__period-lbl">Período</span>
            <MonthRangePicker available={months} value={range} onChange={setRange} />
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-5">
        <KPICard
          label="Receita"
          icon="💰"
          accent="blue"
          value={fmtBRL(totals.receita)}
          delta={yoyRec != null ? <Delta value={yoyRec} /> : null}
          hint={`${rangeMonths} ${rangeMonths === 1 ? 'mês' : 'meses'} · ${totals.linhasCount} linhas ativas`}
        />
        <KPICard
          label="Qtd Vendida"
          icon="📦"
          accent="purple"
          value={fmtNum(totals.qtd)}
          delta={yoyQtd != null ? <Delta value={yoyQtd} /> : null}
          hint="unidades · vs LY"
        />
        <KPICard
          label="Ticket Médio"
          icon="🎟️"
          accent="yellow"
          value={`R$ ${totals.ticketMedio.toFixed(2)}`}
          hint="receita ÷ qtd"
        />
        <KPICard
          label="Margem Bruta"
          icon="📊"
          accent={totals.margemPct != null && totals.margemPct >= 50 ? 'green' : 'yellow'}
          value={totals.margemPct != null ? `${totals.margemPct.toFixed(1)}%` : '—'}
          hint={fmtBRL(totals.margemRS) + ' · linhas com custo conhecido'}
        />
        <KPICard
          label="Atingimento FC"
          icon="🎯"
          accent={
            totals.atingimento == null ? 'blue' :
            totals.atingimento >= 0 ? 'green' :
            totals.atingimento >= -15 ? 'yellow' : 'red'
          }
          value={fmtPct(totals.atingimento, true)}
          hint={`Real ${fmtNum(totals.qtd)} · FC ${fmtNum(totals.forecastQtd)}`}
        />
      </div>

      {/* Evolução mensal agregada — mesmo padrão da aba Portfólio */}
      <div className="section-title">
        📈 Evolução mensal · {monthlyLabel}
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          receita, quantidade e margem bruta · {filteredRows.length} linhas no escopo
        </span>
      </div>
      <LinhaMonthlyChart data={monthlySeries} linha={monthlyLabel} hideMargem />

      {/* Stacked charts — Categorias e Subcategorias */}
      <div className="section-title">
        🗂️ Categorias mensal
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          empilhado · clique numa categoria na legenda ou no segmento pra filtrar a tabela
        </span>
      </div>
      <div className="grid grid-2 pulso__row">
        <StackedMonthlyChart
          title="Categorias mensal — Absoluto"
          subtitle="Empilhado por mês · evolução em valor"
          series={catStack}
          mode="absolute"
          selectedKey={selectedCat}
          onKeyClick={toggleCat}
        />
        <StackedMonthlyChart
          title="Categorias mensal — 100%"
          subtitle="Mix mensal em % · evolução da participação relativa"
          series={catStack}
          mode="percent"
          selectedKey={selectedCat}
          onKeyClick={toggleCat}
        />
      </div>

      <div className="section-title">
        🏷️ Subcategorias mensal
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          top 8 + Outros · derivada do primeiro token do nome da linha
        </span>
      </div>
      <div className="grid grid-2 pulso__row">
        <StackedMonthlyChart
          title="Subcategorias mensal — Absoluto"
          subtitle="Top N empilhado · evolução em valor"
          series={subStack}
          mode="absolute"
          selectedKey={selectedSub}
          onKeyClick={toggleSub}
        />
        <StackedMonthlyChart
          title="Subcategorias mensal — 100%"
          subtitle="Top N mix mensal em %"
          series={subStack}
          mode="percent"
          selectedKey={selectedSub}
          onKeyClick={toggleSub}
        />
      </div>

      {/* Tabela filtrada dinamicamente */}
      <div className="section-title">
        📋 Linhas no escopo
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          {filteredRows.length} linhas · filtragem reflete cliques nos charts e na própria tabela
        </span>
      </div>

      {(selectedCat || selectedSub) && (
        <div className="pulso__active-filter">
          <span className="pulso__active-filter-lbl">Filtro ativo</span>
          {selectedCat && (
            <button className="pulso__active-filter-chip" onClick={() => setSelectedCat(null)}>
              🗂️ Categoria: <strong>{selectedCat}</strong>
              <span className="pulso__active-filter-x">✕</span>
            </button>
          )}
          {selectedSub && (
            <button className="pulso__active-filter-chip" onClick={() => setSelectedSub(null)}>
              🏷️ Subcategoria: <strong>{selectedSub}</strong>
              <span className="pulso__active-filter-x">✕</span>
            </button>
          )}
          <button className="pulso__active-filter-clear" onClick={clearFilters}>Limpar tudo</button>
        </div>
      )}

      <PortfolioTable rows={filteredRows} exportTitle="pulso_linhas" />

      <footer className="pulso__footer">
        <span className="mono">
          Fonte: snapshot processed-data.json · gerado {new Date(data.meta.collectedAt).toLocaleString('pt-BR')} ·
          {' '}cobertura custo {data.meta.costCoverage} · cobertura FC {data.meta.fcCoverage}
        </span>
      </footer>

      <style>{`
        .pulso__period {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .pulso__period-lbl {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--text-3);
        }
        .pulso__row { margin-bottom: 8px; }

        .pulso__active-filter {
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
        .pulso__active-filter-lbl {
          font-size: 10px;
          font-weight: 700;
          color: var(--brand-blue);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .pulso__active-filter-chip {
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
        .pulso__active-filter-chip:hover { background: var(--brand-blue-l); }
        .pulso__active-filter-chip strong { color: var(--text); }
        .pulso__active-filter-x { font-size: 13px; margin-left: 4px; color: var(--brand-blue); font-weight: 700; }
        .pulso__active-filter-clear {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-2);
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          padding: 5px 10px;
          margin-left: auto;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .pulso__active-filter-clear:hover {
          color: var(--brand-blue);
          border-color: var(--brand-blue);
        }

        .pulso__footer {
          margin-top: 28px;
          padding-top: 16px;
          border-top: 1px solid var(--border);
          font-size: 10px;
          color: var(--text-3);
          text-align: center;
        }
      `}</style>
    </div>
  );
}


import { useMemo, useState } from 'react';
import type { ProcessedData } from '../data/types';
import {
  buildEstoqueRows,
  estoqueKpis,
  type CoberturaBand,
} from '../data/aggregates';
import { fmtBRL, fmtNum } from '../lib/format';
import { KPICard } from '../components/KPICard';
import { PageHero } from '../components/PageHero';
import { ABCGiroMatrix } from '../components/ABCGiroMatrix';
import { EstoqueTable } from '../components/EstoqueTable';
import { MultiSelect } from '../components/MultiSelect';
import { EstoqueCanais } from './gestao/EstoqueCanais';

interface Props { data: ProcessedData; }

export function Estoque({ data }: Props) {
  const [subTab, setSubTab] = useState<'geral' | 'canais'>('geral');
  const allRows = useMemo(() => buildEstoqueRows(data), [data]);

  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [filterCurva, setFilterCurva] = useState<string>('all');
  const [filterBand, setFilterBand] = useState<CoberturaBand | null>(null);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterLinhas, setFilterLinhas] = useState<string[]>([]);
  const [search, setSearch] = useState<string>('');
  const [selectedLinha, setSelectedLinha] = useState<string | null>(null);

  function toggleLinhaSelection(linha: string) {
    setSelectedLinha((cur) => (cur === linha ? null : linha));
  }

  function toggleMatrixCell(curva: string, band: CoberturaBand) {
    if (filterCurva === curva && filterBand === band) {
      setFilterCurva('all'); setFilterBand(null);
    } else {
      setFilterCurva(curva); setFilterBand(band);
    }
  }

  const categorias = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.categoria))).sort(),
    [allRows],
  );
  const statuses = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.status))).sort(),
    [allRows],
  );
  const linhas = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.linha))).sort(),
    [allRows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return allRows.filter(
      (r) =>
        (filterCats.length === 0 || filterCats.includes(r.categoria)) &&
        (filterCurva === 'all' || r.curva === filterCurva) &&
        (filterBand == null || r.band === filterBand) &&
        (filterStatuses.length === 0 || filterStatuses.includes(r.status)) &&
        (filterLinhas.length === 0 || filterLinhas.includes(r.linha)) &&
        (selectedLinha == null || r.linha === selectedLinha) &&
        (q === '' ||
          r.sku.toLocaleLowerCase('pt-BR').includes(q) ||
          r.linha.toLocaleLowerCase('pt-BR').includes(q)),
    );
  }, [allRows, filterCats, filterCurva, filterBand, filterStatuses, filterLinhas, selectedLinha, search]);

  const kpis = useMemo(() => estoqueKpis(filtered), [filtered]);
  const allKpis = useMemo(() => estoqueKpis(allRows), [allRows]);

  return (
    <div className="estoque">
      <div className="est-subtabs">
        <button className={`est-subtab ${subTab === 'geral' ? 'on' : ''}`} onClick={() => setSubTab('geral')}>Visão Geral</button>
        <button className={`est-subtab ${subTab === 'canais' ? 'on' : ''}`} onClick={() => setSubTab('canais')}>Por Canais</button>
      </div>

      {subTab === 'canais' ? <EstoqueCanais /> : (<>
      <PageHero
        breadcrumb="Unidade de negócio: Produto Gocase · Estoque"
        title="Estoque"
        subtitle={
          <>
            Visão operacional do catálogo: <strong>capital imobilizado</strong>, <strong>risco de ruptura</strong> e <strong>slow movers</strong>.
            Cobertura = estoque ÷ saída média 7d. Clique na matriz pra filtrar pela combinação Curva × Banda.
          </>
        }
      />

      {/* Filtros */}
      <div className="es__filters">
        <div className="es__filter-grp">
          <span className="es__filter-lbl">Categoria</span>
          <MultiSelect options={categorias} value={filterCats} onChange={setFilterCats} allLabel="Todas" />
        </div>
        <div className="es__filter-grp">
          <span className="es__filter-lbl">Status</span>
          <MultiSelect options={statuses} value={filterStatuses} onChange={setFilterStatuses} allLabel="Todos" />
        </div>
        <div className="es__filter-grp">
          <span className="es__filter-lbl">Linha</span>
          <MultiSelect options={linhas} value={filterLinhas} onChange={setFilterLinhas} allLabel="Todas" />
        </div>
        <div className="es__filter-grp es__filter-grp--grow">
          <span className="es__filter-lbl">Buscar</span>
          <input
            className="es__search"
            placeholder="Filtrar por SKU ou linha…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="es__chip" onClick={() => setSearch('')} title="Limpar busca">✕</button>
          )}
        </div>
      </div>

      {/* Filtros ativos */}
      {(filterCurva !== 'all' || filterBand != null || selectedLinha) && (
        <div className="es__active-filter">
          <span className="es__active-filter-lbl">Filtros ativos</span>
          {filterCurva !== 'all' && filterBand != null && (
            <button className="es__active-filter-chip" onClick={() => { setFilterCurva('all'); setFilterBand(null); }}>
              📐 {filterCurva} × {filterBand}
              <span className="es__active-filter-x">✕</span>
            </button>
          )}
          {selectedLinha && (
            <button className="es__active-filter-chip" onClick={() => setSelectedLinha(null)}>
              📌 Linha: <strong>{selectedLinha}</strong>
              <span className="es__active-filter-x">✕</span>
            </button>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-5">
        <KPICard
          label="Capital imobilizado"
          icon="💰"
          accent="blue"
          value={fmtBRL(kpis.capitalTotal)}
          hint={`${fmtNum(kpis.skusCount)} SKUs no escopo · total catálogo ${fmtBRL(allKpis.capitalTotal)}`}
        />
        <KPICard
          label="🔴 Em risco (≤7d)"
          icon="⚠️"
          accent="red"
          value={String(kpis.riscoCount)}
          unit="SKUs"
          hint={fmtBRL(kpis.riscoCapital) + ' · rupturas + cobertura crítica'}
        />
        <KPICard
          label="📦 Sem estoque"
          icon="📭"
          accent="red"
          value={String(kpis.rupturaCount)}
          unit="SKUs"
          hint={fmtBRL(kpis.rupturaCapital) + ' · necessitam reposição urgente'}
        />
        <KPICard
          label="🐢 Slow movers"
          icon="🕰️"
          accent="yellow"
          value={String(kpis.slowCount)}
          unit="SKUs"
          hint={fmtBRL(kpis.slowCapital) + ' · cobertura >90d ou parado'}
        />
        <KPICard
          label="🗑️ Obsoletos (>365d)"
          icon="📉"
          accent="purple"
          value={String(kpis.obsoletoCount)}
          unit="SKUs"
          hint={fmtBRL(kpis.obsoletoCapital) + ' · candidatos a liquidação'}
        />
      </div>

      {/* Matriz ABC × Cobertura */}
      <div className="section-title">
        📐 Matriz ABC × Cobertura
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          intensidade pela R$ capital · clique numa célula pra filtrar
        </span>
      </div>
      <ABCGiroMatrix
        rows={filtered}
        selected={{ curva: filterCurva !== 'all' ? filterCurva : null, band: filterBand }}
        onCellClick={toggleMatrixCell}
      />

      {/* Tabela */}
      <div className="section-title">
        📋 SKUs detalhados
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          {filtered.length} SKUs · clique para filtrar pela linha
        </span>
      </div>
      <EstoqueTable
        rows={filtered}
        selectedLinha={selectedLinha}
        onRowClick={toggleLinhaSelection}
        exportTitle="estoque"
      />

      <style>{`
        .es__filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          padding: 12px 14px;
          margin-bottom: 16px;
        }
        .es__filter-grp { display: flex; align-items: center; gap: 6px; }
        .es__filter-grp--grow { flex: 1; min-width: 220px; }
        .es__filter-lbl {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-3);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .es__select {
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 500;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          font-family: var(--font-sans);
          cursor: pointer;
        }
        .es__search {
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
        .es__search:focus { border-color: var(--brand-blue); }
        .es__chip {
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-2);
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 99px;
        }

        .es__active-filter {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          background: linear-gradient(90deg, rgba(30, 95, 184, 0.06) 0%, transparent 100%);
          border: 1px solid var(--brand-blue-l);
          border-left: 3px solid var(--brand-blue);
          border-radius: var(--r-md);
          padding: 10px 14px;
          margin-bottom: 16px;
        }
        .es__active-filter-lbl {
          font-size: 10px;
          font-weight: 700;
          color: var(--brand-blue);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-right: 4px;
        }
        .es__active-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          color: var(--brand-blue-d);
          background: var(--surface);
          border: 1.5px solid var(--brand-blue);
          border-radius: 99px;
          padding: 4px 12px;
        }
        .es__active-filter-chip:hover { background: var(--brand-blue-l); }
        .es__active-filter-chip strong { color: var(--text); }
        .es__active-filter-x {
          font-size: 13px;
          margin-left: 4px;
          color: var(--brand-blue);
          font-weight: 700;
        }
      `}</style>
      </>)}

      <style>{`
        .est-subtabs { display: flex; gap: 6px; margin-bottom: 18px; border-bottom: 1.5px solid var(--border); }
        .est-subtab {
          padding: 9px 16px; font-size: 13px; font-weight: 700;
          color: var(--text-3); background: transparent; border: none;
          border-bottom: 2.5px solid transparent; margin-bottom: -1.5px; cursor: pointer;
        }
        .est-subtab:hover { color: var(--text); }
        .est-subtab.on { color: var(--brand-blue); border-bottom-color: var(--brand-blue); }
      `}</style>
    </div>
  );
}

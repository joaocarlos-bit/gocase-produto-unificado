import { useMemo, useState } from 'react';
import type { ProcessedData, SalesBySkuPayload } from '../data/types';
import { buildLaunchMap, launchCohortsByMonth, LAUNCH_MAP_SINCE, type LaunchEntry } from '../data/launchMap';
import { fmtBRL, fmtNum, ymLabel } from '../lib/format';
import { MultiSelect } from '../components/MultiSelect';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts';

interface Props { data: ProcessedData; sales: SalesBySkuPayload; }

type SortKey = 'firstSale' | 'sku' | 'linha' | 'categoria' | 'totalReceita' | 'totalQtd' | 'ticketMedio' | 'estoqueTotal';

export function LancamentosMapa({ data, sales }: Props) {
  const all = useMemo(() => buildLaunchMap(data, sales), [data, sales]);

  const categorias = useMemo(() => Array.from(new Set(all.map((e) => e.categoria))).sort(), [all]);
  const statuses = useMemo(() => Array.from(new Set(all.map((e) => e.status))).sort(), [all]);
  const monthsAvail = useMemo(() => Array.from(new Set(all.map((e) => e.firstSale))).sort(), [all]);

  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [fromYm, setFromYm] = useState<string>(monthsAvail[0] ?? LAUNCH_MAP_SINCE);
  const [toYm, setToYm] = useState<string>(monthsAvail[monthsAvail.length - 1] ?? data.meta.period.to);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('firstSale');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    let rows = all.filter((e) => {
      if (e.firstSale < fromYm || e.firstSale > toYm) return false;
      if (filterCats.length && !filterCats.includes(e.categoria)) return false;
      if (filterStatuses.length && !filterStatuses.includes(e.status)) return false;
      if (term && !e.sku.toLocaleLowerCase('pt-BR').includes(term) && !e.linha.toLocaleLowerCase('pt-BR').includes(term)) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'pt-BR') * dir;
    });
    return rows;
  }, [all, filterCats, filterStatuses, fromYm, toYm, search, sortKey, sortDir]);

  const kpis = useMemo(() => {
    const receita = filtered.reduce((s, e) => s + e.totalReceita, 0);
    const qtd = filtered.reduce((s, e) => s + e.totalQtd, 0);
    const cats = new Set(filtered.map((e) => e.categoria)).size;
    const linhas = new Set(filtered.map((e) => e.linha)).size;
    return { count: filtered.length, receita, qtd, cats, linhas };
  }, [filtered]);

  const cohorts = useMemo(() => {
    const c = launchCohortsByMonth(filtered);
    return c.map((x) => ({ ...x, label: ymLabel(x.ym) }));
  }, [filtered]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'sku' || k === 'linha' || k === 'categoria' ? 'asc' : 'desc'); }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div className="lm">
      <div className="lm__intro">
        <h1 className="lm__title">Mapa de lançamentos 2025+</h1>
        <p className="lm__sub">
          Data de estreia pelo <strong>calendário oficial de lançamentos</strong> (Monday) para 2025 e pela{' '}
          <strong>1ª venda</strong> para estreias de {ymLabel(LAUNCH_MAP_SINCE)} em diante fora do calendário.
          O calendário resolve a censura de jan/25 (a base de vendas começa nesse mês). {all.length} SKUs · métricas
          acumuladas desde a estreia. <em>Fora do escopo: peças de reposição, coleções temáticas e cases por modelo de aparelho.</em>
        </p>
      </div>

      <div className="lm__filters">
        <div className="lm__fgrp">
          <span className="lm__flabel">Estreia de</span>
          <select className="lm__select" value={fromYm} onChange={(e) => setFromYm(e.target.value)}>
            {monthsAvail.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
          </select>
          <span className="lm__flabel">até</span>
          <select className="lm__select" value={toYm} onChange={(e) => setToYm(e.target.value)}>
            {monthsAvail.map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
          </select>
        </div>
        <div className="lm__fgrp">
          <span className="lm__flabel">Categoria</span>
          <MultiSelect options={categorias} value={filterCats} onChange={setFilterCats} allLabel="Todas" />
        </div>
        <div className="lm__fgrp">
          <span className="lm__flabel">Status</span>
          <MultiSelect options={statuses} value={filterStatuses} onChange={setFilterStatuses} allLabel="Todos" />
        </div>
        <input className="lm__search" placeholder="Buscar SKU ou linha…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="lm__kpis">
        <div className="lm__kpi"><div className="lm__kpi-lbl">SKUs lançados</div><div className="lm__kpi-val">{fmtNum(kpis.count, false)}</div></div>
        <div className="lm__kpi"><div className="lm__kpi-lbl">Receita acumulada</div><div className="lm__kpi-val">{fmtBRL(kpis.receita)}</div></div>
        <div className="lm__kpi"><div className="lm__kpi-lbl">Qtd acumulada</div><div className="lm__kpi-val">{fmtNum(kpis.qtd)}</div></div>
        <div className="lm__kpi"><div className="lm__kpi-lbl">Linhas</div><div className="lm__kpi-val">{kpis.linhas}</div></div>
        <div className="lm__kpi"><div className="lm__kpi-lbl">Categorias</div><div className="lm__kpi-val">{kpis.cats}</div></div>
      </div>

      <div className="lm__chart">
        <div className="lm__chart-title">Coortes de lançamento · SKUs por mês de estreia</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={cohorts} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip
              formatter={(v: number, n: string) => [n === 'count' ? `${v} SKUs` : fmtBRL(v), n === 'count' ? 'SKUs' : 'Receita']}
              labelStyle={{ fontWeight: 700 }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {cohorts.map((c) => <Cell key={c.ym} fill="var(--brand-blue)" />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="lm__tablewrap">
        <table className="lm__table">
          <thead>
            <tr>
              <th className="lm__th lm__th--l" onClick={() => toggleSort('firstSale')}>Estreia{arrow('firstSale')}</th>
              <th className="lm__th lm__th--l" onClick={() => toggleSort('sku')}>SKU{arrow('sku')}</th>
              <th className="lm__th lm__th--l" onClick={() => toggleSort('linha')}>Linha{arrow('linha')}</th>
              <th className="lm__th lm__th--l" onClick={() => toggleSort('categoria')}>Categoria{arrow('categoria')}</th>
              <th className="lm__th">Status</th>
              <th className="lm__th">Curva</th>
              <th className="lm__th" onClick={() => toggleSort('totalQtd')}>Qtd{arrow('totalQtd')}</th>
              <th className="lm__th" onClick={() => toggleSort('totalReceita')}>Receita{arrow('totalReceita')}</th>
              <th className="lm__th" onClick={() => toggleSort('ticketMedio')}>Ticket{arrow('ticketMedio')}</th>
              <th className="lm__th">Meses ativos</th>
              <th className="lm__th" onClick={() => toggleSort('estoqueTotal')}>Estoque{arrow('estoqueTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e: LaunchEntry) => (
              <tr key={e.sku}>
                <td className="lm__td lm__td--l"><span className="lm__badge">{ymLabel(e.firstSale)}</span></td>
                <td className="lm__td lm__td--l lm__td--strong">{e.sku}</td>
                <td className="lm__td lm__td--l">{e.linha}</td>
                <td className="lm__td lm__td--l">{e.categoria}</td>
                <td className="lm__td">{e.status}</td>
                <td className="lm__td">{e.curva}</td>
                <td className="lm__td lm__td--num">{fmtNum(e.totalQtd)}</td>
                <td className="lm__td lm__td--num">{fmtBRL(e.totalReceita)}</td>
                <td className="lm__td lm__td--num">{e.ticketMedio > 0 ? fmtBRL(e.ticketMedio, false) : '—'}</td>
                <td className="lm__td lm__td--num">{e.monthsActive}/{e.monthsSinceLaunch}</td>
                <td className="lm__td lm__td--num">{fmtNum(e.estoqueTotal)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="lm__td" colSpan={11} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>Nenhum lançamento no filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .lm__intro { margin-bottom: 18px; }
        .lm__title { font-size: 26px; font-weight: 900; letter-spacing: -0.02em; color: var(--text); }
        .lm__sub { font-size: 13px; color: var(--text-2); line-height: 1.55; margin-top: 6px; max-width: 900px; }
        .lm__filters { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--r-md); padding: 14px 16px; margin-bottom: 16px; }
        .lm__fgrp { display: flex; align-items: center; gap: 8px; }
        .lm__flabel { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-3); }
        .lm__select, .lm__search { padding: 7px 12px; font-size: 13px; border: 1.5px solid var(--border); border-radius: var(--r-sm); background: var(--surface); color: var(--text); outline: none; }
        .lm__search { min-width: 220px; flex: 1; }
        .lm__select:focus, .lm__search:focus { border-color: var(--brand-blue); }
        .lm__kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .lm__kpi { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--r-md); padding: 14px 16px; box-shadow: var(--shadow-sm); }
        .lm__kpi-lbl { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-3); }
        .lm__kpi-val { font-size: 22px; font-weight: 900; letter-spacing: -0.02em; color: var(--text); margin-top: 4px; font-variant-numeric: tabular-nums; }
        .lm__chart { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--r-md); padding: 16px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
        .lm__chart-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-3); margin-bottom: 12px; }
        .lm__tablewrap { overflow-x: auto; background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-sm); }
        .lm__table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .lm__th { text-align: right; padding: 10px 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-3); background: var(--surface-2); position: sticky; top: 0; cursor: pointer; white-space: nowrap; user-select: none; }
        .lm__th--l { text-align: left; }
        .lm__th:hover { color: var(--brand-blue); }
        .lm__td { padding: 9px 12px; text-align: right; border-top: 1px solid var(--border); color: var(--text-2); white-space: nowrap; }
        .lm__td--l { text-align: left; }
        .lm__td--num { font-variant-numeric: tabular-nums; }
        .lm__td--strong { font-weight: 700; color: var(--text); }
        .lm__badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--brand-blue) 12%, transparent); color: var(--brand-blue); }
        .lm__table tbody tr:hover { background: var(--surface-2); }
      `}</style>
    </div>
  );
}

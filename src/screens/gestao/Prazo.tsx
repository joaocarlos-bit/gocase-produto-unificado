// Gestão › Prazo — portado do dash-produto (loadPrazoData + renderPrazoTable).
// Acompanhamento de prazo de pedido de compra dos lançamentos (Monday.com).
// Filtro por ano (2026/2027), por mês e busca. Status: no prazo / fora do mês.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../../components/Card';
import { TokenPrompt } from '../../components/TokenPrompt';
import {
  MONDAY, EXCLUDED_GROUPS, MONTHS_2026, getMondayToken, fetchPrazoBoard,
  parseGroupMonth, formatDateBR, getSubitemDate, getSubitemStatusText, getStatusForItem,
  type MondayItem, type ParsedMonth,
} from '../../data/monday';

interface PrazoGroup { id: string; title: string; parsed: ParsedMonth | null; year?: string; items: MondayItem[]; }

type State =
  | { kind: 'no-token' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: MondayItem[]; updatedAt: string };

const TIPO_ALIASES: Record<string, string> = { 'TÉRMICO': 'TÉRMICOS' };

function extractTipo(name: string): string | null {
  const m = name.match(/\[([^\]]+)\]/);
  if (!m) return null;
  const raw = m[1].trim().toUpperCase();
  return TIPO_ALIASES[raw] ?? raw;
}

export function Prazo() {
  const [years, setYears] = useState<Set<string>>(new Set(['2026']));
  const [state, setState] = useState<State>(() => (getMondayToken() ? { kind: 'loading' } : { kind: 'no-token' }));
  const [reloadKey, setReloadKey] = useState(0);
  const [monthFilter, setMonthFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<Set<string>>(new Set());
  const [nextRefresh, setNextRefresh] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutos

  useEffect(() => {
    if (!getMondayToken()) return;
    const schedule = () => {
      const deadline = Date.now() + AUTO_REFRESH_MS;
      setNextRefresh(deadline);
      timerRef.current = setInterval(() => {
        setReloadKey((k) => k + 1);
        setNextRefresh(Date.now() + AUTO_REFRESH_MS);
      }, AUTO_REFRESH_MS);
    };
    schedule();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Contador regressivo exibido na UI
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    if (!nextRefresh) return;
    const tick = () => {
      const diff = Math.max(0, nextRefresh - Date.now());
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRefresh]);

  useEffect(() => {
    if (!getMondayToken()) { setState({ kind: 'no-token' }); return; }
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const token = getMondayToken();
        const fetches: Promise<MondayItem[]>[] = [];
        if (years.has('2026')) fetches.push(fetchPrazoBoard(token, MONDAY.boards.lancamentos2026).then((it) => { it.forEach((i) => (i._year = '2026')); return it; }));
        if (years.has('2027')) fetches.push(fetchPrazoBoard(token, MONDAY.boards.lancamentos2027).then((it) => { it.forEach((i) => (i._year = '2027')); return it; }));
        const items = (await Promise.all(fetches)).flat();
        if (cancelled) return;
        setState({ kind: 'ready', items, updatedAt: new Date().toLocaleString('pt-BR') });
      } catch (e: any) {
        if (cancelled) return;
        setState({ kind: 'error', message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [years, reloadKey]);

  const visibleGroups = useMemo<PrazoGroup[]>(() => {
    if (state.kind !== 'ready') return [];
    const map: Record<string, PrazoGroup> = {};
    state.items.forEach((item) => {
      const g = item.group;
      if (!g) return;
      if (EXCLUDED_GROUPS.some((ex) => g.title.toLowerCase().includes(ex))) return;
      if (!map[g.id]) map[g.id] = { id: g.id, title: g.title, parsed: parseGroupMonth(g.title), year: item._year, items: [] };
      map[g.id].items.push(item);
    });
    return Object.values(map)
      .filter((grp) => grp.parsed && (grp.year === '2026' ? MONTHS_2026.includes(grp.parsed.month) : true))
      .sort((a, b) => {
        const am = a.parsed!, bm = b.parsed!;
        if (am.year !== bm.year) return (am.year || 0) - (bm.year || 0);
        return am.month - bm.month;
      });
  }, [state]);

  const allTipos = useMemo<string[]>(() => {
    const set = new Set<string>();
    visibleGroups.forEach((g) =>
      g.items.filter((it) => it.subitems && it.subitems.length > 0).forEach((it) => {
        const t = extractTipo(it.name); if (t) set.add(t);
      })
    );
    return [...set].sort();
  }, [visibleGroups]);

  if (state.kind === 'no-token') return <TokenPrompt tab="Prazo" onSaved={() => setReloadKey((k) => k + 1)} />;
  if (state.kind === 'loading') return <div className="g-status"><span className="spinner" /> Carregando Prazo do Monday…</div>;
  if (state.kind === 'error') return (
    <div className="g-status g-status--err">⚠ {state.message} (verifique o token)
      <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Tentar de novo</button></div>
  );

  const toggleYear = (y: string) => setYears((prev) => {
    const next = new Set(prev);
    if (next.has(y) && next.size > 1) next.delete(y); else next.add(y);
    return next.size ? next : new Set([y]);
  });

  const toggleTipo = (t: string) => setTipoFilter((prev) => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });

  const q = search.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const groupsToShow = (monthFilter === 'todos' ? visibleGroups : visibleGroups.filter((g) => g.id === monthFilter))
    .map((g) => {
      let rowItems = g.items.filter((it) => it.subitems && it.subitems.length > 0);
      if (tipoFilter.size > 0) rowItems = rowItems.filter((it) => { const t = extractTipo(it.name); return t ? tipoFilter.has(t) : false; });
      if (q) rowItems = rowItems.filter((it) => it.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
      return { ...g, rowItems };
    })
    .filter((g) => g.rowItems.length);

  return (
    <div>
      <div className="g-eng__head">
        <h1 className="g-eng__title">Prazo <span className="g-eng__tag">pedido de compra · {[...years].sort().join(' + ')}</span></h1>
        <div className="g-eng__meta">
          <span>Atualizado: {state.updatedAt}</span>
          {countdown && <span style={{ fontSize: 11, color: 'var(--muted)' }}>↻ em {countdown}</span>}
          <button className="g-retry" onClick={() => { setReloadKey((k) => k + 1); setNextRefresh(Date.now() + AUTO_REFRESH_MS); }}>↺ Atualizar</button>
        </div>
      </div>

      <div className="g-wl__period">
        {['2026', '2027'].map((y) => (
          <button key={y} className={`g-chip ${years.has(y) ? 'g-chip--on' : ''}`} onClick={() => toggleYear(y)}>{y}</button>
        ))}
        <select className="g-input" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={{ marginLeft: 8 }}>
          <option value="todos">📅 Todos os meses</option>
          {visibleGroups.map((g) => <option key={g.id} value={g.id}>{g.parsed!.label}</option>)}
        </select>
        <input className="g-input" placeholder="Buscar lançamento…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {allTipos.length > 0 && (
        <div className="g-wl__period" style={{ marginTop: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 6, whiteSpace: 'nowrap' }}>Tipo:</span>
          {tipoFilter.size > 0 && (
            <button className="g-chip" onClick={() => setTipoFilter(new Set())} style={{ marginRight: 4, fontSize: 11 }}>✕ Limpar</button>
          )}
          {allTipos.map((t) => (
            <button key={t} className={`g-chip ${tipoFilter.has(t) ? 'g-chip--on' : ''}`} onClick={() => toggleTipo(t)}>{t}</button>
          ))}
        </div>
      )}

      <Card noPadding>
        <div className="g-tablewrap">
          <table className="g-table">
            <tbody>
              {groupsToShow.length === 0 && <tr><td className="g-empty">Nenhum lançamento com subitems encontrado.</td></tr>}
              {groupsToShow.map((g) => (
                <PrazoGroupRows key={g.id} group={g} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PrazoGroupRows({ group }: { group: PrazoGroup & { rowItems: MondayItem[] } }) {
  return (
    <>
      <tr className="pz-month"><td colSpan={4}>📅 {group.parsed?.label || group.title}
        <span className="pz-count">{group.rowItems.length} lançamento{group.rowItems.length !== 1 ? 's' : ''}</span></td></tr>
      <tr className="pz-subhead">
        <td>Lançamento</td><td className="c">Data do Pedido</td><td className="c">Data Prevista de Lançamento</td><td className="c">Status</td>
      </tr>
      {group.rowItems.map((item) => {
        const pedidoSub = item.subitems!.find((s) => s.name.toLowerCase().includes('pedido de compra'));
        const lancSub = item.subitems!.find((s) => { const n = s.name.toLowerCase().trim(); return n === 'lançamento' || n === 'lancamento' || n === 'launch'; });
        const pedidoDate = getSubitemDate(pedidoSub);
        const pedidoStatus = getSubitemStatusText(pedidoSub);
        const lancDate = getSubitemDate(lancSub);
        const status = getStatusForItem(lancDate, group.parsed);
        const pedidoDone = pedidoStatus && ['pronto', 'done', 'feito', 'ready', 'purchase order'].some((s) => pedidoStatus.toLowerCase().includes(s));
        return (
          <tr key={item.id} className="g-data-row">
            <td className="g-name" style={{ maxWidth: 320 }}>{item.name}</td>
            <td className="c m">{pedidoDone ? <span className="pz-ok">✓ Enviado</span> : pedidoDate ? formatDateBR(pedidoDate) : '—'}</td>
            <td className="c m" style={{ color: status === 'fora-do-mes' ? 'var(--red)' : undefined }}>{lancDate ? formatDateBR(lancDate) : '—'}</td>
            <td className="c">
              {status === 'no-prazo' ? <span className="g-badge--on g-badge">✅ No prazo</span>
                : status === 'fora-do-mes' ? <span className="g-badge" style={{ background: 'var(--red-l)', color: 'var(--red)' }}>🚨 Fora do mês</span>
                : <span className="g-badge">— Sem data</span>}
            </td>
          </tr>
        );
      })}
    </>
  );
}

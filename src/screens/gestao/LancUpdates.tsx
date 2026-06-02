// Gestão › Lançamentos › Atualizações — portado do dash-produto (renderLancUpdates).
// Lê os comentários (updates) de cada lançamento no Monday.com, com seletor de
// mês + filtro de semana (Mês inteiro / Sem 1-4). Notas manuais ficam como
// rascunho local (localStorage) — sem escrever no Monday (decisão: leitura primeiro).

import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { TokenPrompt } from '../../components/TokenPrompt';
import { getMondayToken, fetchLancUpdates, formatDateBR, type LancUpdateItem } from '../../data/monday';

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MANUAL_KEY = 'lancManualUpdates_v1';
type Week = 'month' | 'week-1' | 'week-2' | 'week-3' | 'week-4';
interface ManualNote { id: string; name: string; text: string; ts: number; }

function readManual(): ManualNote[] { try { return JSON.parse(localStorage.getItem(MANUAL_KEY) || '[]'); } catch { return []; } }
function writeManual(arr: ManualNote[]) { localStorage.setItem(MANUAL_KEY, JSON.stringify(arr)); }

function periodBounds(ym: string, week: Week) {
  const [y, m] = ym.split('-').map(Number); const mi = m - 1;
  const label = `${MESES_PT[mi]} ${y}`;
  const wm = /^week-([1-4])$/.exec(week);
  if (wm) {
    const n = parseInt(wm[1], 10);
    const startDay = (n - 1) * 7 + 1;
    const lastDay = new Date(y, mi + 1, 0).getDate();
    const endDay = n === 4 ? lastDay : n * 7;
    return { from: new Date(y, mi, startDay, 0, 0, 0), to: new Date(y, mi, endDay, 23, 59, 59, 999), label: `${label} · Sem. ${n}` };
  }
  return { from: new Date(y, mi, 1, 0, 0, 0), to: new Date(y, mi + 1, 0, 23, 59, 59, 999), label };
}

type State =
  | { kind: 'no-token' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: LancUpdateItem[] };

export function LancUpdates() {
  const [state, setState] = useState<State>(() => (getMondayToken() ? { kind: 'loading' } : { kind: 'no-token' }));
  const [reloadKey, setReloadKey] = useState(0);
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [week, setWeek] = useState<Week>('month');
  const [manual, setManual] = useState<ManualNote[]>(() => readManual());
  const [draftName, setDraftName] = useState('');
  const [draftText, setDraftText] = useState('');

  useEffect(() => {
    if (!getMondayToken()) { setState({ kind: 'no-token' }); return; }
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const items = await fetchLancUpdates(getMondayToken());
        if (!cancelled) setState({ kind: 'ready', items });
      } catch (e: any) {
        if (!cancelled) setState({ kind: 'error', message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let i = -11; i <= 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MESES_PT[d.getMonth()]} ${d.getFullYear()}` });
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addManual = () => {
    const text = draftText.trim();
    if (!text) return;
    const note: ManualNote = { id: 'man_' + Date.now(), name: draftName.trim() || 'Nota manual', text, ts: Date.now() };
    const next = [note, ...manual];
    setManual(next); writeManual(next);
    setDraftName(''); setDraftText('');
  };
  const delManual = (id: string) => { const next = manual.filter((m) => m.id !== id); setManual(next); writeManual(next); };

  const bounds = periodBounds(month, week);
  const isPast = week !== 'month';

  const rows = state.kind === 'ready' ? state.items.map((it) => {
    const inPeriod = it.updates.filter((u) => u.ts >= bounds.from.getTime() && u.ts <= bounds.to.getTime());
    const best = inPeriod[0] || null;
    const last = it.updates[0] || null;
    return { ...it, best, last };
  }) : [];
  // Mês inteiro: mostra todos; semana específica: só quem teve update na semana
  const visible = isPast ? rows.filter((r) => r.best) : rows;

  return (
    <Card title="📝 Atualizações de Lançamentos" subtitle={bounds.label}
      right={state.kind === 'ready' ? <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Atualizar</button> : undefined}>
      {state.kind === 'no-token' ? (
        <TokenPrompt tab="Atualizações de Lançamentos" onSaved={() => setReloadKey((k) => k + 1)} />
      ) : (
        <>
          <div className="lu-filters">
            <select className="g-input" value={month} onChange={(e) => setMonth(e.target.value)}>
              {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {(['month', 'week-1', 'week-2', 'week-3', 'week-4'] as Week[]).map((w) => (
              <button key={w} className={`g-chip ${week === w ? 'g-chip--on' : ''}`} onClick={() => setWeek(w)}>
                {w === 'month' ? 'Mês inteiro' : 'Sem. ' + w.slice(-1)}
              </button>
            ))}
          </div>

          {/* nota manual (rascunho local) */}
          <div className="lu-add">
            <input className="g-input" placeholder="Lançamento (opcional)" value={draftName} onChange={(e) => setDraftName(e.target.value)} style={{ maxWidth: 180 }} />
            <input className="g-input" placeholder="Adicionar nota manual…" value={draftText} onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addManual()} style={{ flex: 1 }} />
            <button className="g-chip g-chip--on" onClick={addManual}>+ Adicionar</button>
          </div>

          {state.kind === 'loading' && <div className="g-status"><span className="spinner" /> Buscando atualizações do Monday.com…</div>}
          {state.kind === 'error' && <div className="g-status g-status--err">⚠ {state.message} (verifique o token)
            <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺</button></div>}

          {state.kind === 'ready' && (
            <div className="lu-list">
              {manual.map((m) => (
                <div key={m.id} className="lu-item lu-item--manual">
                  <div className="lu-dot lu-dot--manual" />
                  <div className="lu-body">
                    <div className="lu-name">{m.name} <span className="lu-tag">manual</span></div>
                    <div className="lu-text">{m.text}</div>
                    <div className="lu-meta">📅 {formatDateBR(new Date(m.ts))} <button className="lu-del" onClick={() => delManual(m.id)}>remover</button></div>
                  </div>
                </div>
              ))}
              {visible.length === 0 && manual.length === 0 && (
                <div className="g-empty">Nenhum lançamento com atualização neste período.</div>
              )}
              {visible.map((r) => (
                <div key={r.id} className={`lu-item ${r.best ? '' : 'lu-item--none'}`}>
                  <div className={`lu-dot ${r.best ? 'lu-dot--on' : ''}`} />
                  <div className="lu-body">
                    <div className="lu-name">{r.name}</div>
                    {r.best ? (
                      <>
                        <div className="lu-text">{r.best.text}</div>
                        <div className="lu-meta">📅 {formatDateBR(new Date(r.best.ts))}{r.best.creator ? ` · ${r.best.creator}` : ''}</div>
                      </>
                    ) : (
                      <>
                        <div className="lu-none">Sem atualização no período</div>
                        {r.last && (
                          <div className="lu-last">
                            <div className="lu-text">{r.last.text}</div>
                            <div className="lu-meta">📅 {formatDateBR(new Date(r.last.ts))}{r.last.creator ? ` · ${r.last.creator}` : ''} · última conhecida</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        .lu-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .lu-add { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
        .lu-list { display: flex; flex-direction: column; gap: 8px; }
        .lu-item { display: flex; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; }
        .lu-item--none { opacity: 0.7; background: var(--surface-2); }
        .lu-item--manual { border-left: 3px solid var(--brand-blue); }
        .lu-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border-2); margin-top: 5px; flex: 0 0 auto; }
        .lu-dot--on { background: var(--green); }
        .lu-dot--manual { background: var(--brand-blue); }
        .lu-body { flex: 1; min-width: 0; }
        .lu-name { font-size: 13px; font-weight: 700; color: var(--text); }
        .lu-tag { font-size: 9px; font-weight: 700; text-transform: uppercase; background: var(--brand-blue-l); color: var(--brand-blue); padding: 1px 6px; border-radius: 4px; margin-left: 6px; }
        .lu-text { font-size: 12px; color: var(--text); line-height: 1.5; margin-top: 4px; white-space: pre-wrap; }
        .lu-none { font-size: 11px; color: var(--text-3); margin-top: 2px; }
        .lu-last { margin-top: 6px; padding: 7px 10px; background: var(--surface-2); border-left: 3px solid var(--border-2); border-radius: 4px; }
        .lu-meta { font-size: 10px; color: var(--text-3); margin-top: 4px; }
        .lu-del { font-size: 10px; color: var(--red); margin-left: 8px; }
      `}</style>
    </Card>
  );
}

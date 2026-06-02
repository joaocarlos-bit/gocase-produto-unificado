// Gestão › Lançamentos — portado do dash-produto (loadLancamentosFromSheets + _loadLancRows).
// Núcleo de acompanhamento de prazo: KPIs (Total/No Prazo/Atrasados/Aderência),
// gráfico Programados×No Prazo×Atrasados por mês, tabela mensal com contagens
// clicáveis → modal com a lista de produtos. Fonte: planilha lançamentos (gviz).
// NÃO inclui ainda os gráficos de Receita/Share de Lançamentos (join Sales) —
// complemento planejado para a próxima etapa.

import { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList,
} from 'recharts';
import { Card } from '../../components/Card';
import { KPICard } from '../../components/KPICard';
import { loadSheetViaJSONP, normalizeMes, GESTAO_CONFIG } from '../../data/gviz';
import { LancUpdates } from './LancUpdates';

interface LancRow { mes: string; prog: number; prazo: number; atras: number; }
interface DetItem { nome: string; motivo?: string; }
interface Detalhe { prazo: DetItem[]; atras: DetItem[]; }

const COL = ['Mês', 'Programados', 'No Prazo', 'Lançamentos No Prazo', 'Atrasados', 'Lançamentos Atrasados', 'Motivo de atraso'];
const TABS: (string | null)[] = [
  null, 'Lançamentos', 'Lancamentos', 'lançamento', 'lancamento', 'Lançamento', 'Lancamento',
  'Lançamentos 2026', 'Lancamentos 2026', 'Plan1', 'Planilha1', 'Página1', 'Sheet1',
  'Dados', 'Resumo', 'Base', 'Indicadores', 'Produtos', 'Dashboard', 'Cronograma',
];

function parseLancList(text: string): string[] {
  if (!text) return [];
  const s = String(text).trim();
  let parts = s.split(/\r?\n/);
  if (parts.length <= 1 && /\d+\./.test(s)) parts = s.split(/(?=\d+[.)]\s)/);
  return parts.map((l) => l.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: LancRow[]; det: Record<string, Detalhe>; updatedAt: string };

export function LancamentosGestao() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [selMeses, setSelMeses] = useState<Set<string>>(new Set()); // vazio = todos
  const [modal, setModal] = useState<{ mes: string; tipo: 'prazo' | 'atras' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const sheetId = GESTAO_CONFIG.sheets.lancamentos;
        let rows: Record<string, string>[] = [];
        for (const tab of TABS) {
          try {
            const r = await loadSheetViaJSONP({ sheetId, sheetName: tab, colNames: COL });
            if (!r.length) continue;
            const isLanc = r.some((row) => {
              const m = normalizeMes((row['Mês'] || '').trim());
              const validMonth = /^[A-Za-záéíóúàâãêôç]{2,4}\/\d{2}$/.test(m);
              return validMonth && (
                parseInt(row['No Prazo']) > 0 || (row['Lançamentos No Prazo'] || '').trim() !== '' ||
                parseInt(row['Atrasados']) > 0 || (row['Lançamentos Atrasados'] || '').trim() !== ''
              );
            });
            if (isLanc) { rows = r; break; }
          } catch { /* tenta próxima aba */ }
        }
        if (!rows.length) throw new Error('Aba de Lançamentos não encontrada na planilha.');

        const data: LancRow[] = [];
        const det: Record<string, Detalhe> = {};
        rows.forEach((r) => {
          const mes = normalizeMes((r['Mês'] || '').trim());
          const prazo = parseInt(r['No Prazo']) || 0;
          const atras = parseInt(r['Atrasados']) || 0;
          const prog = parseInt(r['Programados']) || prazo + atras;
          const listPrazo = parseLancList(r['Lançamentos No Prazo']);
          const listAtras = parseLancList(r['Lançamentos Atrasados']);
          const motivo = (r['Motivo de atraso'] || '').trim();
          if (!mes || (!prog && !prazo && !atras && !listPrazo.length && !listAtras.length)) return;
          if (mes.length > 10 && !prazo && !atras) return;
          data.push({ mes, prog, prazo, atras });
          det[mes] = {
            prazo: listPrazo.map((nome) => ({ nome })),
            atras: listAtras.map((nome) => ({ nome, motivo })),
          };
        });
        if (cancelled) return;
        setState({ kind: 'ready', data, det, updatedAt: new Date().toLocaleString('pt-BR') });
      } catch (e: any) {
        if (cancelled) return;
        setState({ kind: 'error', message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const ready = state.kind === 'ready' ? state : null;
  const allMeses = ready ? ready.data.map((d) => d.mes) : [];

  const totals = useMemo(() => {
    if (!ready) return { prog: 0, prazo: 0, atras: 0, ader: null as number | null };
    const sel = selMeses.size === 0 ? ready.data : ready.data.filter((d) => selMeses.has(d.mes));
    const t = sel.reduce((a, d) => ({ prog: a.prog + d.prog, prazo: a.prazo + d.prazo, atras: a.atras + d.atras }), { prog: 0, prazo: 0, atras: 0 });
    return { ...t, ader: t.prog ? (t.prazo / t.prog) * 100 : null };
  }, [ready, selMeses]);

  if (state.kind === 'loading') return <div className="g-status"><span className="spinner" /> Carregando Lançamentos…</div>;
  if (state.kind === 'error') return (
    <div className="g-status g-status--err">⚠ {state.message}
      <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Tentar de novo</button></div>
  );

  const toggleMes = (m: string) => setSelMeses((prev) => {
    const next = new Set(prev);
    if (next.has(m)) next.delete(m); else next.add(m);
    return next;
  });
  const allSelected = selMeses.size === 0;
  const tableRows = ready!.data.filter((d) => allSelected || selMeses.has(d.mes));
  const modalItems = modal ? (ready!.det[modal.mes]?.[modal.tipo] || []) : [];

  return (
    <div className="g-lanc">
      <div className="g-eng__head">
        <h1 className="g-eng__title">Lançamentos <span className="g-eng__tag">prazo &amp; aderência</span></h1>
        <div className="g-eng__meta">
          <span>Atualizado: {ready!.updatedAt}</span>
          <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Atualizar</button>
        </div>
      </div>

      <div className="g-eng__kpis">
        <KPICard label="Total Programados" value={totals.prog} icon="🚀" accent="blue" />
        <KPICard label="No Prazo" value={totals.prazo || '—'} icon="✓" accent="green"
          delta={totals.ader != null ? <span className="lk-up">↑ {totals.ader.toFixed(1).replace('.', ',')}%</span> : null} />
        <KPICard label="Atrasados" value={totals.atras || '—'} icon="⚠" accent="red"
          delta={totals.atras > 0 ? <span className="lk-warn">Atenção</span> : null} />
        <KPICard label="Aderência YTD" unit="%" icon="🎯" accent={totals.ader != null && totals.ader >= 90 ? 'green' : 'yellow'}
          value={totals.ader != null ? totals.ader.toFixed(1).replace('.', ',') : '—'}
          delta={<span className="lk-meta">Meta: 90%</span>} />
      </div>

      <div className="g-wl__period">
        <button className={`g-chip ${allSelected ? 'g-chip--on' : ''}`} onClick={() => setSelMeses(new Set())}>Todos</button>
        {allMeses.map((m) => (
          <button key={m} className={`g-chip ${selMeses.has(m) ? 'g-chip--on' : ''}`} onClick={() => toggleMes(m)}>{m.replace(/\/\d{2}$/, '')}</button>
        ))}
      </div>

      <Card title="Programados × No Prazo × Atrasados" subtitle="Por mês de lançamento">
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ready!.data} margin={{ top: 18, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-2)' }} width={32} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="prog" name="Programados" fill="var(--text-3)" radius={[4, 4, 0, 0]} maxBarSize={24}>
                <LabelList dataKey="prog" position="top" style={{ fontSize: 10, fontWeight: 700, fill: 'var(--text-2)' }} formatter={(v: number) => (v > 0 ? v : '')} />
              </Bar>
              <Bar dataKey="prazo" name="No Prazo" fill="var(--green)" radius={[4, 4, 0, 0]} maxBarSize={24}>
                <LabelList dataKey="prazo" position="top" style={{ fontSize: 10, fontWeight: 700, fill: 'var(--green)' }} formatter={(v: number) => (v > 0 ? v : '')} />
              </Bar>
              <Bar dataKey="atras" name="Atrasados" fill="var(--red)" radius={[4, 4, 0, 0]} maxBarSize={24}>
                <LabelList dataKey="atras" position="top" style={{ fontSize: 10, fontWeight: 700, fill: 'var(--red)' }} formatter={(v: number) => (v > 0 ? v : '')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card title="Detalhe por mês" subtitle="Clique nos números para ver os produtos" noPadding>
        <div className="g-tablewrap">
          <table className="g-table">
            <thead><tr><th>Mês</th><th>Programados</th><th>No Prazo</th><th>Atrasados</th></tr></thead>
            <tbody>
              {tableRows.length === 0 && <tr><td colSpan={4} className="g-empty">Nenhum mês selecionado.</td></tr>}
              {tableRows.map((d) => (
                <tr key={d.mes}>
                  <td className="m">{d.mes}</td>
                  <td className="c b">{d.prog}</td>
                  <td className="c">
                    {d.prazo ? <button className="g-count g-count--green" onClick={() => setModal({ mes: d.mes, tipo: 'prazo' })}>{d.prazo}</button> : '–'}
                  </td>
                  <td className="c">
                    {d.atras ? <button className="g-count g-count--red" onClick={() => setModal({ mes: d.mes, tipo: 'atras' })}>{d.atras}</button> : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ height: 14 }} />
      <LancUpdates />

      {modal && (
        <div className="g-modal" onClick={() => setModal(null)}>
          <div className="g-modal__box" onClick={(e) => e.stopPropagation()}>
            <div className="g-modal__head">
              <strong>{modal.tipo === 'prazo' ? `✓ No Prazo — ${modal.mes}` : `⚠ Atrasados — ${modal.mes}`}</strong>
              <button className="g-modal__x" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="g-modal__body">
              {modalItems.length === 0 ? <div className="g-empty">Nenhum produto listado.</div> : modalItems.map((it, i) => (
                <div key={i} className="g-modal__item" style={{ borderLeftColor: modal.tipo === 'prazo' ? 'var(--green)' : 'var(--red)' }}>
                  <div className="g-modal__nome">{it.nome}</div>
                  {modal.tipo === 'atras' && it.motivo && <div className="g-modal__motivo">{it.motivo}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .g-eng__tag { font-size: 11px; font-weight: 600; color: var(--text-3); background: var(--surface-2); border: 1px solid var(--border); padding: 2px 8px; border-radius: 999px; margin-left: 8px; vertical-align: middle; }
        .lk-up { color: var(--green); font-weight: 700; }
        .lk-warn { color: var(--amber); font-weight: 700; }
        .lk-meta { color: var(--text-3); font-weight: 600; }
        .g-count { font-weight: 800; font-variant-numeric: tabular-nums; padding: 2px 10px; border-radius: 6px; cursor: pointer; }
        .g-count--green { background: var(--green-l); color: var(--green); }
        .g-count--red { background: var(--red-l); color: var(--red); }
        .g-count:hover { filter: brightness(0.95); }
        .g-modal { position: fixed; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .g-modal__box { background: var(--surface); border-radius: var(--r-md); width: 100%; max-width: 460px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: var(--shadow-md); }
        .g-modal__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); font-size: 14px; }
        .g-modal__x { font-size: 16px; color: var(--text-3); padding: 2px 8px; }
        .g-modal__body { padding: 12px 18px 18px; overflow-y: auto; }
        .g-modal__item { border-left: 3px solid; padding: 8px 12px; margin-bottom: 8px; background: var(--surface-2); border-radius: 0 6px 6px 0; }
        .g-modal__nome { font-size: 13px; font-weight: 600; color: var(--text); }
        .g-modal__motivo { font-size: 11px; color: var(--text-3); margin-top: 3px; }
      `}</style>
    </div>
  );
}

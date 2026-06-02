// Gestão › Projetos — portado do dash-produto (loadProjetosData + renderProjetosAccordion).
// Portfólio de projetos/iniciativas (Monday board portfolio). Sub-aba Projetos/IA,
// filtro de status (ativos/não iniciados/pausados/todos), accordion expansível por
// projeto com status, responsável, risco e subitems (EAP).

import { useEffect, useMemo, useState } from 'react';
import { TokenPrompt } from '../../components/TokenPrompt';
import {
  MONDAY, getMondayToken, fetchPortfolio, isAIGroup, projStatusBadge, subStatusBadge,
  getSubStatus, getSubDate, formatSubDate, progressFromStatus, extractObjetivo,
  fetchItemUpdates, parseUpdates, type MondayItem, type UpdImage,
} from '../../data/monday';

type Filter = 'ativos' | 'nao-iniciado' | 'pausado' | 'todos';
type SubTab = 'projetos' | 'ia';

type State =
  | { kind: 'no-token' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: MondayItem[]; updatedAt: string };

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const C = MONDAY.columns.portfolio;

function riscoBadge(risco: string | null): { cls: string; label: string } | null {
  if (!risco || risco === '—') return null;
  const r = norm(risco);
  if (r.includes('atrasad')) return { cls: 'rb-atras', label: '🔴 ' + risco };
  if (r.includes('risco')) return { cls: 'rb-risco', label: '⚠ ' + risco };
  if (r.includes('finaliz') || r.includes('conclu')) return { cls: 'rb-fim', label: risco };
  if (r.includes('prazo')) return { cls: 'rb-prazo', label: '✅ ' + risco };
  return { cls: 'rb-none', label: risco };
}

export function Projetos() {
  const [state, setState] = useState<State>(() => (getMondayToken() ? { kind: 'loading' } : { kind: 'no-token' }));
  const [reloadKey, setReloadKey] = useState(0);
  const [subTab, setSubTab] = useState<SubTab>('projetos');
  const [filter, setFilter] = useState<Filter>('ativos');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [upd, setUpd] = useState<Record<string, { loading: boolean; statusAtual: string | null; proximos: string[]; ganhos: string[]; objetivo: string | null; richHtml: string | null; images: UpdImage[] }>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [commentsVer, setCommentsVer] = useState(0);

  useEffect(() => {
    if (!getMondayToken()) { setState({ kind: 'no-token' }); return; }
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const items = await fetchPortfolio(getMondayToken());
        if (cancelled) return;
        setState({ kind: 'ready', items, updatedAt: new Date().toLocaleString('pt-BR') });
      } catch (e: any) {
        if (cancelled) return;
        setState({ kind: 'error', message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const groups = useMemo(() => {
    if (state.kind !== 'ready') return [] as { title: string; items: MondayItem[] }[];
    const filtered = state.items.filter((item) => {
      const gTitle = norm(item.group?.title || '');
      const ai = isAIGroup(gTitle);
      if (subTab === 'ia' ? !ai : ai) return false;
      const st = norm(item.column_values?.find((c) => c.id === C.status)?.text || '');
      const isPausado = st.includes('pausad') || st.includes('paused');
      const isNao = !st || st.includes('nao inici') || st.includes('not start') || st.includes('stand by') || st === '-' || st === '—';
      const isFim = st.includes('finaliz') || st.includes('conclu') || st.includes('done');
      if (filter === 'ativos') return !isPausado && !isNao && !isFim;
      if (filter === 'nao-iniciado') return isNao;
      if (filter === 'pausado') return isPausado;
      return !isFim;
    });
    const map: Record<string, MondayItem[]> = {};
    filtered.forEach((it) => { const g = it.group?.title || 'Outros'; (map[g] ||= []).push(it); });
    return Object.entries(map).map(([title, items]) => ({ title, items }));
  }, [state, subTab, filter]);

  if (state.kind === 'no-token') return <TokenPrompt tab="Projetos" onSaved={() => setReloadKey((k) => k + 1)} />;
  if (state.kind === 'loading') return <div className="g-status"><span className="spinner" /> Carregando Projetos do Monday…</div>;
  if (state.kind === 'error') return (
    <div className="g-status g-status--err">⚠ {state.message} (verifique o token)
      <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Tentar de novo</button></div>
  );

  const total = groups.reduce((s, g) => s + g.items.length, 0);

  const toggle = (id: string) => {
    setOpen((prev) => {
      const n = new Set(prev);
      const opening = !n.has(id);
      if (opening) n.add(id); else n.delete(id);
      if (opening && !upd[id]) {
        setUpd((u) => ({ ...u, [id]: { loading: true, statusAtual: null, proximos: [], ganhos: [], objetivo: null, richHtml: null, images: [] } }));
        fetchItemUpdates(getMondayToken(), id)
          .then((ups) => { const p = parseUpdates(ups); setUpd((u) => ({ ...u, [id]: { loading: false, statusAtual: p.statusAtual, proximos: p.proximos, ganhos: p.ganhos, objetivo: p.objetivo, richHtml: p.richHtml, images: p.images } })); })
          .catch(() => setUpd((u) => ({ ...u, [id]: { loading: false, statusAtual: null, proximos: [], ganhos: [], objetivo: null, richHtml: null, images: [] } })));
      }
      return n;
    });
  };

  // Comentários como rascunho local (localStorage) — sem escrever no Monday
  const getComments = (id: string): { text: string; ts: number }[] => {
    void commentsVer;
    try { return JSON.parse(localStorage.getItem('projComments_' + id) || '[]'); } catch { return []; }
  };
  const addComment = (id: string) => {
    const text = (drafts[id] || '').trim();
    if (!text) return;
    const list = getComments(id);
    list.unshift({ text, ts: Date.now() });
    localStorage.setItem('projComments_' + id, JSON.stringify(list));
    setDrafts((d) => ({ ...d, [id]: '' }));
    setCommentsVer((v) => v + 1);
  };

  return (
    <div>
      <div className="g-eng__head">
        <h1 className="g-eng__title">Projetos <span className="g-eng__tag">{subTab === 'ia' ? 'projetos de IA' : 'iniciativas'}</span></h1>
        <div className="g-eng__meta">
          <span>Atualizado: {state.updatedAt}</span>
          <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Atualizar</button>
        </div>
      </div>

      <div className="g-wl__period">
        <button className={`g-chip ${subTab === 'projetos' ? 'g-chip--on' : ''}`} onClick={() => setSubTab('projetos')}>Projetos / Iniciativas</button>
        <button className={`g-chip ${subTab === 'ia' ? 'g-chip--on' : ''}`} onClick={() => setSubTab('ia')}>Projetos de IA</button>
      </div>

      <div className="g-wl__period">
        {(['ativos', 'nao-iniciado', 'pausado', 'todos'] as Filter[]).map((f) => (
          <button key={f} className={`g-chip ${filter === f ? 'g-chip--on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'ativos' ? 'Em andamento' : f === 'nao-iniciado' ? 'Não iniciados' : f === 'pausado' ? 'Pausados' : 'Todos'}
          </button>
        ))}
      </div>

      {total === 0 ? <div className="g-empty">Nenhum projeto para o filtro selecionado.</div> : groups.map((g) => (
        <div key={g.title} className="pj-group">
          <div className="pj-group__hd">{g.title}<span className="pz-count">{g.items.length} projeto{g.items.length !== 1 ? 's' : ''}</span></div>
          {g.items.map((item) => {
            const cv: Record<string, string | null> = {};
            (item.column_values || []).forEach((c) => { cv[c.id] = c.text || null; });
            const status = cv[C.status] || 'Não iniciado';
            const risco = cv[C.color] || null;
            const owner = cv[C.owner] || '—';
            const objetivo = extractObjetivo(cv[C.notes]);
            const badge = projStatusBadge(status);
            const subs = item.subitems || [];
            const isOpen = open.has(item.id);
            const pct = progressFromStatus(status); // status-based (igual ao original)
            const rb = riscoBadge(risco);
            const u = upd[item.id];
            const comments = isOpen ? getComments(item.id) : [];
            return (
              <div key={item.id} className={`pj-card ${isOpen ? 'pj-card--open' : ''}`}>
                <button className="pj-card__hd" onClick={() => toggle(item.id)}>
                  <span className="pj-card__chev">{isOpen ? '▾' : '▸'}</span>
                  <span className="pj-card__name">{item.name}</span>
                  <span className="pj-owner">{owner}</span>
                  <span className={`pj-st ${badge.cls}`}>{badge.label}</span>
                  {pct != null && (
                    <span className="pj-prog"><span className="pj-prog__bar"><span className="pj-prog__fill" style={{ width: pct + '%' }} /></span>{pct}%</span>
                  )}
                  {rb && <span className={`pj-risco ${rb.cls}`}>{rb.label}</span>}
                </button>
                {isOpen && (
                  <div className="pj-card__body">
                    <div className="pj-grid">
                      <div>
                        <div className="pj-lbl">Objetivo</div>
                        {objetivo || u?.objetivo
                          ? <div className="pj-text">{objetivo || u?.objetivo}</div>
                          : <div className="pj-pending">{!u || u.loading ? '…' : 'Objetivo não cadastrado no Monday.com'}</div>}
                        <div className="pj-lbl">Cronograma de Marcos</div>
                        {subs.length > 0 ? (
                          <div className="pj-subs">
                            {subs.map((s) => {
                              const sb = subStatusBadge(getSubStatus(s));
                              const dt = formatSubDate(getSubDate(s));
                              return (
                                <div key={s.id} className="pj-sub">
                                  <span className={`pj-sub__ic ${sb.cls}`}>{sb.icon}</span>
                                  <span className="pj-sub__name">{s.name}</span>
                                  {dt && <span className={`pj-sub__date ${dt.overdue && sb.cls !== 'ms-done' ? 'pj-sub__date--late' : ''}`}>📅 {dt.label}{dt.overdue && sb.cls !== 'ms-done' ? ' ⚠' : ''}</span>}
                                </div>
                              );
                            })}
                          </div>
                        ) : <div className="pj-pending">Nenhum marco no EAP.</div>}
                      </div>
                      <div>
                        <div className="pj-lbl">Status Atual</div>
                        {!u || u.loading ? <div className="pj-pending"><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Carregando…</div>
                          : u.statusAtual ? <div className="pj-text pj-statusbox">{u.statusAtual}</div>
                          : <div className="pj-pending">Nenhuma atualização registrada.</div>}
                        <div className="pj-lbl">Próximos Passos</div>
                        {!u || u.loading ? <div className="pj-pending">…</div>
                          : u.proximos.length ? <ul className="pj-next">{u.proximos.map((p, i) => <li key={i}>{p}</li>)}</ul>
                          : <div className="pj-pending">—</div>}
                      </div>
                    </div>

                    {u && !u.loading && (u.richHtml || u.ganhos.length > 0) && (
                      <>
                        <div className="pj-lbl">Ganhos em Tempo</div>
                        {u.richHtml
                          ? <div className="pj-rich" dangerouslySetInnerHTML={{ __html: u.richHtml }} />
                          : <ul className="pj-next">{u.ganhos.map((g, i) => <li key={i}>{g}</li>)}</ul>}
                      </>
                    )}

                    {u && !u.loading && u.images.length > 0 && (
                      <>
                        <div className="pj-lbl">Imagens dos comentários</div>
                        <div className="pj-imgs">
                          {u.images.map((im, i) => (
                            <a key={i} href={im.url} target="_blank" rel="noreferrer" title={im.name}>
                              <img src={im.url} alt={im.name} referrerPolicy="no-referrer" loading="lazy" />
                            </a>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="pj-comments">
                      <div className="pj-lbl">💬 Comentários <span className="pj-mut">(rascunho local)</span></div>
                      {comments.map((c, i) => (
                        <div key={i} className="pj-comment">{c.text}<span className="pj-comment__ts">{new Date(c.ts).toLocaleString('pt-BR')}</span></div>
                      ))}
                      <div className="pj-comment-add">
                        <textarea className="pj-comment-txt" placeholder="Escreva uma atualização… (rascunho local)"
                          value={drafts[item.id] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') addComment(item.id); }} />
                        <button className="g-chip g-chip--on" onClick={() => addComment(item.id)}>+ Salvar nota</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <style>{`
        .pj-group { margin-bottom: 18px; }
        .pj-group__hd { padding: 12px 16px 6px; font-size: 10px; font-weight: 800; color: var(--brand-blue); text-transform: uppercase; letter-spacing: 1px; border-left: 3px solid var(--brand-blue); background: var(--surface-2); border-radius: 0 6px 0 0; }
        .pj-card { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); margin-top: 8px; overflow: hidden; }
        .pj-card__hd { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 12px 16px; }
        .pj-card__hd:hover { background: var(--surface-2); }
        .pj-card__chev { color: var(--text-3); font-size: 12px; }
        .pj-card__name { flex: 1; font-weight: 700; font-size: 13px; color: var(--text); }
        .pj-st { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
        .pj-st.st-and { background: var(--green-l); color: var(--green); }
        .pj-st.st-fim { background: var(--surface-2); color: var(--text-3); }
        .pj-st.st-pause { background: var(--amber-l); color: var(--amber); }
        .pj-st.st-nao { background: var(--surface-2); color: var(--text-2); }
        .pj-st.st-anal { background: var(--brand-blue-l); color: var(--brand-blue); }
        .pj-risco { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
        .pj-risco.rb-atras { background: var(--red-l); color: var(--red); }
        .pj-risco.rb-risco { background: var(--amber-l); color: var(--amber); }
        .pj-risco.rb-prazo { background: var(--green-l); color: var(--green); }
        .pj-risco.rb-fim { background: var(--surface-2); color: var(--text-3); }
        .pj-risco.rb-none { background: var(--surface-2); color: var(--text-2); }
        .pj-prog { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--text-2); font-variant-numeric: tabular-nums; }
        .pj-prog__bar { width: 70px; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
        .pj-prog__fill { display: block; height: 100%; background: var(--brand-blue); }
        .pj-owner { font-size: 11px; font-weight: 600; color: var(--text-2); min-width: 80px; text-align: right; flex: 1; }
        .pj-card__body { padding: 12px 16px 16px 40px; border-top: 1px solid var(--border); }
        .pj-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 800px) { .pj-grid { grid-template-columns: 1fr; } }
        .pj-lbl { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: var(--brand-blue); margin: 14px 0 6px; }
        .pj-lbl:first-child { margin-top: 0; }
        .pj-text { font-size: 13px; color: var(--text); line-height: 1.5; white-space: pre-line; }
        .pj-statusbox { background: var(--surface-2); border-radius: 8px; padding: 10px 12px; }
        .pj-pending { font-size: 12px; color: var(--text-3); font-style: italic; }
        .pj-next { margin: 0; padding-left: 18px; font-size: 13px; color: var(--text); line-height: 1.6; }
        .pj-imgs { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
        .pj-imgs img { height: 140px; max-width: 280px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); }
        .pj-rich { font-size: 13px; color: var(--text); line-height: 1.5; overflow-x: auto; }
        .pj-rich table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
        .pj-rich th, .pj-rich td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
        .pj-rich thead th { background: var(--surface-2); font-weight: 700; }
        .pj-rich h1, .pj-rich h2, .pj-rich h3 { font-size: 13px; font-weight: 800; margin: 10px 0 4px; }
        .pj-rich p { margin: 4px 0; }
        .pj-rich img { max-width: 100%; border-radius: 6px; }
        .pj-sub__date { font-size: 10px; color: var(--text-3); white-space: nowrap; }
        .pj-sub__date--late { color: var(--red); font-weight: 700; }
        .pj-comments { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px; }
        .pj-mut { font-weight: 500; color: var(--text-3); text-transform: none; letter-spacing: 0; }
        .pj-comment { font-size: 12px; color: var(--text); background: var(--surface-2); border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
        .pj-comment__ts { display: block; font-size: 10px; color: var(--text-3); margin-top: 4px; }
        .pj-comment-add { display: flex; gap: 8px; margin-top: 8px; align-items: flex-start; }
        .pj-comment-txt { flex: 1; min-height: 48px; resize: vertical; font-size: 12px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--text); font-family: inherit; }
        .pj-notes { font-size: 12px; color: var(--text-2); margin: 10px 0; }
        .pj-subs { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
        .pj-sub { display: flex; align-items: center; gap: 10px; font-size: 12px; padding: 6px 0; border-bottom: 1px solid var(--border); }
        .pj-sub__ic { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; flex: 0 0 auto; }
        .pj-sub__ic.ms-done { background: var(--green-l); color: var(--green); }
        .pj-sub__ic.ms-doing { background: var(--brand-blue-l); color: var(--brand-blue); }
        .pj-sub__ic.ms-paused { background: var(--amber-l); color: var(--amber); }
        .pj-sub__ic.ms-pending { background: var(--surface-2); color: var(--text-3); }
        .pj-sub__name { flex: 1; color: var(--text); }
        .pj-sub__st { color: var(--text-3); font-size: 11px; }
        .pj-empty { font-size: 12px; color: var(--text-3); margin-top: 8px; }
      `}</style>
    </div>
  );
}

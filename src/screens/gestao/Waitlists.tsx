// Gestão › Waitlists — portado do dash-produto (loadWaitlistFromSheets + render*).
// 4 KPIs, filtro de período (7/15/30/todos/custom), tabela de Waitlists e tabela
// de Testes CTR com indicadores de performance coloridos, busca e ranking de
// melhor custo/lead. Fonte: planilha waitlist, abas BD + Testes CTR (gviz).
// Pendente (enhancement): carrossel de imagens do Drive ao clicar no produto.

import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { KPICard } from '../../components/KPICard';
import { Pager, paginate } from '../../components/Pager';
import {
  loadSheetViaJSONP, parseDateBR, parseSheetNum, GESTAO_CONFIG,
} from '../../data/gviz';
import { loadDriveImages, normalizeProductName, driveImageUrl } from '../../data/driveImages';

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtBRL2 = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtNum = (v: number) => v.toLocaleString('pt-BR');

type Row = Record<string, string>;
type Period = 'todos' | '7dias' | '15dias' | '30dias' | 'range';

interface Product {
  produto: string; cost: number; leads: number; clicks: number;
  avgCTR: number; avgCPC: number; custoLead: number; leadClick: number;
  preco: number; dias: number; firstDate: Date | null; lastRowIdx: number;
}

// ── Indicadores de performance ───────────────────────────────────────────
type Lvl = '' | 'hit' | 'bom' | 'med' | 'ruim';
const ctrLevel = (v: number): Lvl => (!v ? '' : v > 0.045 ? 'hit' : v >= 0.03 ? 'bom' : v >= 0.02 ? 'med' : 'ruim');
const cpcLevel = (v: number): Lvl => (!v ? '' : v < 0.2 ? 'hit' : v < 0.3 ? 'bom' : v < 0.45 ? 'med' : 'ruim');
const custoLeadLevel = (v: number): Lvl => (!v ? '' : v < 3 ? 'hit' : v < 6 ? 'bom' : v < 8 ? 'med' : 'ruim');
const leadClickLevel = (v: number): Lvl => (!v ? '' : v > 0.1 ? 'hit' : v >= 0.06 ? 'bom' : v >= 0.04 ? 'med' : 'ruim');

function Dot({ lvl }: { lvl: Lvl }) {
  if (!lvl) return null;
  if (lvl === 'hit') return <span title="Hit" style={{ marginLeft: 4 }}>🚀</span>;
  const title = lvl === 'bom' ? 'Bom' : lvl === 'med' ? 'Intermediário' : 'Ruim';
  return <span className={`perf-dot perf-dot--${lvl}`} title={title} />;
}

const pct = (v: number) => (v > 0 ? (v * 100).toFixed(2).replace('.', ',') + '%' : '—');
const brl = (v: number) => (v > 0 ? fmtBRL(v) : '—');
const brl2 = (v: number) => (v > 0 ? fmtBRL2(v) : '—');

function parsePctRaw(v: string): number {
  if (!v || v === '—') return 0;
  const n = parseFloat(String(v).trim().replace('%', '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function fmtCTRdisplay(raw: string): string {
  if (!raw || raw === '—') return '—';
  const s = String(raw).trim();
  if (s.includes('%')) {
    const n = parseFloat(s.replace('%', '').replace(/\./g, '').replace(',', '.'));
    return !n || isNaN(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }
  const n = parseFloat(s);
  if (!n || isNaN(n)) return '—';
  const p = n < 1 ? n * 100 : n;
  return p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; wl: Row[]; ctr: Row[]; updatedAt: string };

export function Waitlists() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [period, setPeriod] = useState<Period>('todos');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [wlSearch, setWlSearch] = useState('');
  const [ctrSearch, setCtrSearch] = useState('');
  const [ctrStatus, setCtrStatus] = useState<'todos' | 'ACTIVE' | 'PAUSED'>('todos');
  const [wlPage, setWlPage] = useState(0);
  const [ctrPage, setCtrPage] = useState(0);
  const [rankWlPage, setRankWlPage] = useState(0);
  const [rankCtrPage, setRankCtrPage] = useState(0);
  // Carrossel de imagens: null = fechado; loading | urls vazias = estados
  const [carousel, setCarousel] = useState<{ label: string; urls: string[]; idx: number; loading: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const sheetId = GESTAO_CONFIG.sheets.waitlist;
        const [wl, ctr] = await Promise.all([
          loadSheetViaJSONP({ sheetId, sheetName: 'BD', colNames: ['Produto', 'Dia', 'CTR', 'Custo', 'CPC', 'Lead', 'Número de cliques', 'Preço', 'Custo/Lead', 'Lead/Click', 'OBS'] }),
          loadSheetViaJSONP({ sheetId, sheetName: 'Testes CTR', tq: 'order by H desc', colNames: ['Teste', 'Investimento', 'Alcance', 'CTR(%)', 'CPC', 'Cliques no Link', 'CPM', 'Data de Criação', 'Status', 'Imagem'] }),
        ]);
        if (cancelled) return;
        setState({ kind: 'ready', wl, ctr, updatedAt: new Date().toLocaleString('pt-BR') });
      } catch (e: any) {
        if (cancelled) return;
        setState({ kind: 'error', message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Pre-warm: dispara o manifesto do Drive assim que a tela abre, pra mascarar
  // o cold start (~30s) — quando o usuário clicar no produto já está cacheado.
  useEffect(() => { loadDriveImages().catch(() => {}); }, []);

  // Abre carrossel de um produto Waitlist (imagens do Drive por nome normalizado)
  const openProduct = async (produto: string) => {
    setCarousel({ label: produto, urls: [], idx: 0, loading: true });
    try {
      const map = await loadDriveImages();
      const hit = map[normalizeProductName(produto)];
      const urls = hit?.ids?.length ? hit.ids.map((id) => driveImageUrl(id, 1200)) : [];
      setCarousel({ label: produto, urls, idx: 0, loading: false });
    } catch {
      setCarousel({ label: produto, urls: [], idx: 0, loading: false });
    }
  };
  // Abre imagem única de um teste CTR (URL direta da coluna Imagem)
  const openCtrImage = (nome: string, url: string) => {
    if (!url) return;
    setCarousel({ label: nome, urls: [url], idx: 0, loading: false });
  };

  const ready = state.kind === 'ready' ? state : null;

  // Agrega produtos por janela de período (mesma lógica do filterAndRenderWaitlist)
  const products = useMemo<Product[]>(() => {
    if (!ready) return [];
    const today = new Date(); today.setHours(23, 59, 59, 999);
    let activeNames: Set<string> | null = null;
    if (period === '7dias' || period === '15dias' || period === '30dias') {
      const days = period === '7dias' ? 6 : period === '15dias' ? 14 : 29;
      const cutoff = new Date(today); cutoff.setDate(today.getDate() - days); cutoff.setHours(0, 0, 0, 0);
      activeNames = new Set(
        ready.wl.filter((r) => { const d = parseDateBR(r['Dia']); return d && d >= cutoff && d <= today; })
          .map((r) => r['Produto']).filter(Boolean),
      );
    } else if (period === 'range' && (fromDate || toDate)) {
      const from = fromDate ? new Date(fromDate + 'T00:00:00') : new Date(0);
      const to = toDate ? new Date(toDate + 'T23:59:59') : today;
      activeNames = new Set(
        ready.wl.filter((r) => { const d = parseDateBR(r['Dia']); return d && d >= from && d <= to; })
          .map((r) => r['Produto']).filter(Boolean),
      );
    }
    const rows = activeNames ? ready.wl.filter((r) => r['Produto'] && activeNames!.has(r['Produto'])) : ready.wl;

    const map: Record<string, any> = {};
    let idx = 0;
    rows.forEach((row) => {
      const name = row['Produto'];
      if (!name) return;
      if (!map[name]) map[name] = { produto: name, cost: 0, leads: 0, clicks: 0, ctrSum: 0, ctrCount: 0, preco: 0, dias: new Set<string>(), firstDate: null as Date | null, lastRowIdx: 0 };
      const p = map[name];
      p.lastRowIdx = idx++;
      p.cost += parseSheetNum(row['Custo']);
      p.leads += parseInt(row['Lead']) || 0;
      p.clicks += parseInt(row['Número de cliques']) || 0;
      const ctrStr = String(row['CTR'] || '').trim();
      let ctr: number;
      if (ctrStr.includes('%')) ctr = (parseFloat(ctrStr.replace('%', '').replace(/\./g, '').replace(',', '.')) || 0) / 100;
      else { ctr = parseFloat(ctrStr.replace(',', '.')) || 0; if (ctr > 1) ctr = ctr / 100; }
      if (ctr > 0) { p.ctrSum += ctr; p.ctrCount++; }
      const pr = parseSheetNum(row['Preço']);
      if (pr > 0 && !p.preco) p.preco = pr;
      if (row['Dia']) {
        p.dias.add(row['Dia']);
        const d = parseDateBR(row['Dia']);
        if (d && (!p.firstDate || d < p.firstDate)) p.firstDate = d;
      }
    });
    return Object.values(map).map((p: any) => ({
      produto: p.produto, cost: p.cost, leads: p.leads, clicks: p.clicks,
      avgCTR: p.ctrCount > 0 ? p.ctrSum / p.ctrCount : 0,
      avgCPC: p.clicks > 0 ? p.cost / p.clicks : 0,
      custoLead: p.leads > 0 ? p.cost / p.leads : 0,
      leadClick: p.clicks > 0 ? p.leads / p.clicks : 0,
      preco: p.preco, dias: p.dias.size, firstDate: p.firstDate, lastRowIdx: p.lastRowIdx,
    })).sort((a, b) => b.lastRowIdx - a.lastRowIdx);
  }, [ready, period, fromDate, toDate]);

  // Intervalo de datas do período selecionado (null = todos) — usado pelas
  // tabelas/rankings de CTR (filtram por Data de Criação).
  const dateBounds = useMemo(() => {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (period === '7dias' || period === '15dias' || period === '30dias') {
      const days = period === '7dias' ? 6 : period === '15dias' ? 14 : 29;
      const from = new Date(today); from.setDate(today.getDate() - days); from.setHours(0, 0, 0, 0);
      return { from, to: today };
    }
    if (period === 'range' && (fromDate || toDate)) {
      return { from: fromDate ? new Date(fromDate + 'T00:00:00') : new Date(0), to: toDate ? new Date(toDate + 'T23:59:59') : today };
    }
    return null;
  }, [period, fromDate, toDate]);

  if (state.kind === 'loading') return <div className="g-status"><span className="spinner" /> Carregando Waitlists…</div>;
  if (state.kind === 'error') return (
    <div className="g-status g-status--err">⚠ Erro: {state.message}
      <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Tentar de novo</button></div>
  );

  const ctrRows = ready!.ctr;
  const inPeriod = (dateStr: string) => {
    if (!dateBounds) return true;
    const d = parseDateBR(dateStr);
    return !!d && d >= dateBounds.from && d <= dateBounds.to;
  };
  const ctrInPeriod = ctrRows.filter((r) => inPeriod(r['Data de Criação']));
  const totalLeads = products.reduce((s, p) => s + p.leads, 0);
  const totalCostWL = products.reduce((s, p) => s + p.cost, 0);
  const totalCostCTR = ctrInPeriod.reduce((s, r) => s + parseSheetNum(r['Investimento']), 0);
  const grandTotal = totalCostWL + totalCostCTR;

  const wlFiltered = products.filter((p) => !wlSearch || p.produto.toLowerCase().includes(wlSearch.toLowerCase()));
  const ctrFiltered = ctrInPeriod
    .filter((r) => ctrStatus === 'todos' || (r['Status'] || '').toUpperCase() === ctrStatus)
    .filter((r) => !ctrSearch || (r['Teste'] || '').toLowerCase().includes(ctrSearch.toLowerCase()));

  // Rankings (exclui investimento < R$ 50, como no original)
  const rankWl = [...products].filter((p) => p.leads > 0 && p.custoLead > 0 && p.cost >= 50)
    .sort((a, b) => a.custoLead - b.custoLead);
  const rankCtr = ctrInPeriod.filter((r) => parseSheetNum(r['Investimento']) >= 50)
    .sort((a, b) => parsePctRaw(b['CTR(%)']) - parsePctRaw(a['CTR(%)']));

  const periods: { id: Period; label: string }[] = [
    { id: 'todos', label: 'Todos' }, { id: '7dias', label: '7 dias' },
    { id: '15dias', label: '15 dias' }, { id: '30dias', label: '30 dias' },
  ];

  return (
    <div className="g-wl">
      <div className="g-eng__head">
        <h1 className="g-eng__title">Waitlists</h1>
        <div className="g-eng__meta">
          <span>Atualizado: {ready!.updatedAt}</span>
          <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Atualizar</button>
        </div>
      </div>

      <div className="g-eng__kpis">
        <KPICard label="Total de Leads" value={fmtNum(totalLeads)} icon="🎯" accent="green" />
        <KPICard label="Investimento Total" value={grandTotal > 0 ? fmtBRL(grandTotal) : '—'} icon="💰" accent="blue"
          hint={`WL ${brl(totalCostWL)} · CTR ${brl(totalCostCTR)}`} />
        <KPICard label="Testes de CTR" value={fmtNum(ctrInPeriod.length)} icon="🖱" accent="yellow" />
        <KPICard label="Testes de Waitlist" value={fmtNum(products.length)} icon="📋" accent="purple" />
      </div>

      <div className="g-rank2">
        <Card title="🏆 Melhores Testes de Waitlist" subtitle="Ranking por menor custo/lead · exclui investimento < R$ 50" noPadding>
          <div className="g-tablewrap">
            <table className="g-table">
              <thead><tr><th>#</th><th>Produto</th><th>Custo/Lead</th><th>Leads</th><th>CTR Médio</th><th>Dias</th></tr></thead>
              <tbody>
                {rankWl.length === 0 && <tr><td colSpan={6} className="g-empty">Sem produtos qualificados.</td></tr>}
                {paginate(rankWl, rankWlPage, 5).map((p, i) => (
                  <tr key={p.produto}>
                    <td className="c g-mut">{rankWlPage * 5 + i + 1}</td>
                    <td className="g-name">{p.produto}</td>
                    <td className="c g">{fmtBRL2(p.custoLead)}</td>
                    <td className="c b">{fmtNum(p.leads)}</td>
                    <td className="c"><span className={`ctr-cell ${ctrLevel(p.avgCTR) ? 'ctr-cell--' + ctrLevel(p.avgCTR) : ''}`}>{pct(p.avgCTR)}</span></td>
                    <td className="c m">{p.dias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={rankWlPage} total={rankWl.length} pageSize={5} onChange={setRankWlPage} />
        </Card>

        <Card title="📊 Melhores Testes de CTR" subtitle="Ranking por CTR% · exclui investimento < R$ 50" noPadding>
          <div className="g-tablewrap">
            <table className="g-table">
              <thead><tr><th>#</th><th>Teste</th><th>CTR (%)</th><th>Investimento</th><th>Cliques</th></tr></thead>
              <tbody>
                {rankCtr.length === 0 && <tr><td colSpan={5} className="g-empty">Sem testes qualificados.</td></tr>}
                {paginate(rankCtr, rankCtrPage, 5).map((r, i) => {
                  const ctrRaw = parsePctRaw(r['CTR(%)']) / 100;
                  const nome = (r['Teste'] || '').replace(/^\[|\]$/g, '');
                  return (
                    <tr key={nome + i}>
                      <td className="c g-mut">{rankCtrPage * 5 + i + 1}</td>
                      <td className="g-name">{nome}</td>
                      <td className="c"><span className={`ctr-cell ${ctrLevel(ctrRaw) ? 'ctr-cell--' + ctrLevel(ctrRaw) : ''}`}>{fmtCTRdisplay(r['CTR(%)'])}</span></td>
                      <td className="c m">{r['Investimento'] || '—'}</td>
                      <td className="c b">{r['Cliques no Link'] ? fmtNum(parseInt(r['Cliques no Link'])) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={rankCtrPage} total={rankCtr.length} pageSize={5} onChange={setRankCtrPage} />
        </Card>
      </div>

      <div className="g-periodbar">
        <span className="g-periodbar__lbl">Período</span>
        {periods.map((p) => (
          <button key={p.id} className={`g-chip ${period === p.id ? 'g-chip--on' : ''}`}
            onClick={() => { setPeriod(p.id); setWlPage(0); setCtrPage(0); }}>{p.label}</button>
        ))}
        <input type="date" className="g-input" value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPeriod('range'); setWlPage(0); setCtrPage(0); }} />
        <span className="g-mut">até</span>
        <input type="date" className="g-input" value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPeriod('range'); setWlPage(0); setCtrPage(0); }} />
        {(period === 'range' || fromDate || toDate) && (
          <button className="g-chip" onClick={() => { setPeriod('todos'); setFromDate(''); setToDate(''); setWlPage(0); setCtrPage(0); }}>× Limpar</button>
        )}
      </div>

      <Card title="Waitlists" subtitle={`${wlFiltered.length} produtos`}
        right={<input className="g-input" placeholder="Buscar produto…" value={wlSearch} onChange={(e) => { setWlSearch(e.target.value); setWlPage(0); }} />} noPadding>
        <div className="g-tablewrap">
          <table className="g-table">
            <thead><tr>
              <th>Produto</th><th>Preço</th><th>Investimento</th><th>Dias</th><th>Leads</th>
              <th>CTR</th><th>CPC</th><th>Custo/Lead</th><th>Lead/Click</th><th>1ª Data</th>
            </tr></thead>
            <tbody>
              {wlFiltered.length === 0 && <tr><td colSpan={10} className="g-empty">Nenhum produto no período/busca.</td></tr>}
              {paginate(wlFiltered, wlPage).map((p) => (
                <tr key={p.produto}>
                  <td className="g-name"><button className="g-link" onClick={() => openProduct(p.produto)}>{p.produto}</button></td>
                  <td className="c b">{p.preco ? fmtBRL2(p.preco) : '—'}</td>
                  <td className="c m">{brl(p.cost)}</td>
                  <td className="c b">{p.dias}</td>
                  <td className="c g">{p.leads ? fmtNum(p.leads) : '—'}</td>
                  <td className="c"><span className={`ctr-cell ${ctrLevel(p.avgCTR) ? 'ctr-cell--' + ctrLevel(p.avgCTR) : ''}`}>{pct(p.avgCTR)}</span><Dot lvl={ctrLevel(p.avgCTR)} /></td>
                  <td className="c m">{brl2(p.avgCPC)}<Dot lvl={cpcLevel(p.avgCPC)} /></td>
                  <td className="c b">{brl2(p.custoLead)}<Dot lvl={custoLeadLevel(p.custoLead)} /></td>
                  <td className="c m">{pct(p.leadClick)}<Dot lvl={leadClickLevel(p.leadClick)} /></td>
                  <td className="c m">{p.firstDate ? p.firstDate.toLocaleDateString('pt-BR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={wlPage} total={wlFiltered.length} onChange={setWlPage} />
      </Card>

      <div style={{ height: 14 }} />

      <Card title="Testes de CTR" subtitle={`${ctrFiltered.length} testes`}
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="g-input" value={ctrStatus} onChange={(e) => { setCtrStatus(e.target.value as any); setCtrPage(0); }}>
              <option value="todos">Todos status</option><option value="ACTIVE">Ativos</option><option value="PAUSED">Pausados</option>
            </select>
            <input className="g-input" placeholder="Buscar teste…" value={ctrSearch} onChange={(e) => { setCtrSearch(e.target.value); setCtrPage(0); }} />
          </div>
        } noPadding>
        <div className="g-tablewrap">
          <table className="g-table">
            <thead><tr>
              <th>Teste</th><th>Investimento</th><th>Alcance</th><th>CTR(%)</th><th>CPC</th>
              <th>Cliques</th><th>CPM</th><th>Data</th><th>Status</th>
            </tr></thead>
            <tbody>
              {ctrFiltered.length === 0 && <tr><td colSpan={9} className="g-empty">Nenhum teste encontrado.</td></tr>}
              {paginate(ctrFiltered, ctrPage).map((r, i) => {
                const ctrRaw = parsePctRaw(r['CTR(%)']) / 100;
                const nome = (r['Teste'] || '').replace(/^\[|\]$/g, '');
                const up = (r['Status'] || '').toUpperCase();
                return (
                  <tr key={nome + i}>
                    <td className="g-name">{r['Imagem'] ? <button className="g-link" onClick={() => openCtrImage(nome, r['Imagem'])}>{nome}</button> : nome}</td>
                    <td className="c m">{r['Investimento'] || '—'}</td>
                    <td className="c b">{r['Alcance'] ? fmtNum(parseInt(r['Alcance'])) : '—'}</td>
                    <td className="c"><span className={`ctr-cell ${ctrLevel(ctrRaw) ? 'ctr-cell--' + ctrLevel(ctrRaw) : ''}`}>{fmtCTRdisplay(r['CTR(%)'])}</span></td>
                    <td className="c m">{r['CPC'] || '—'}</td>
                    <td className="c g">{r['Cliques no Link'] ? fmtNum(parseInt(r['Cliques no Link'])) : '—'}</td>
                    <td className="c m">{r['CPM'] || '—'}</td>
                    <td className="c m">{r['Data de Criação'] || '—'}</td>
                    <td className="c">{up === 'ACTIVE' ? <span className="g-badge g-badge--on">🟢 ATIVO</span> : up === 'PAUSED' ? <span className="g-badge">⏸ PAUSADO</span> : <span className="m">{r['Status'] || '—'}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={ctrPage} total={ctrFiltered.length} onChange={setCtrPage} />
      </Card>

      {carousel && (
        <div className="g-modal" onClick={() => setCarousel(null)}>
          <div className="dimg" onClick={(e) => e.stopPropagation()}>
            <div className="dimg__head">
              <strong>{carousel.label}</strong>
              <button className="g-modal__x" onClick={() => setCarousel(null)}>✕</button>
            </div>
            <div className="dimg__body">
              {carousel.loading ? (
                <div className="dimg__status"><span className="spinner" /> Carregando imagens…</div>
              ) : carousel.urls.length === 0 ? (
                <div className="dimg__status">Nenhuma imagem encontrada no Drive para este produto.</div>
              ) : (
                <>
                  {carousel.urls.length > 1 && (
                    <button className="dimg__nav dimg__nav--prev"
                      onClick={() => setCarousel((c) => c && ({ ...c, idx: (c.idx - 1 + c.urls.length) % c.urls.length }))}>‹</button>
                  )}
                  <img className="dimg__img" src={carousel.urls[carousel.idx]} alt={carousel.label}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      // fallback: thumbnail → lh3 (id embutido no data-id)
                      const alt = el.getAttribute('data-alt');
                      if (alt && el.src !== alt) { el.src = alt; return; }
                      el.style.opacity = '0.2';
                    }}
                    data-alt={carousel.urls[carousel.idx]?.includes('drive.google.com/thumbnail')
                      ? 'https://lh3.googleusercontent.com/d/' + (carousel.urls[carousel.idx].match(/id=([^&]+)/)?.[1] || '') + '=w1200'
                      : ''} />
                  {carousel.urls.length > 1 && (
                    <button className="dimg__nav dimg__nav--next"
                      onClick={() => setCarousel((c) => c && ({ ...c, idx: (c.idx + 1) % c.urls.length }))}>›</button>
                  )}
                </>
              )}
            </div>
            {carousel.urls.length > 1 && <div className="dimg__counter">{carousel.idx + 1} / {carousel.urls.length}</div>}
          </div>
        </div>
      )}

      <style>{`
        .g-link { color: var(--brand-blue); font-weight: 600; text-align: left; }
        .g-link:hover { text-decoration: underline; }
        .dimg { background: var(--surface); border-radius: var(--r-md); width: 100%; max-width: 720px; box-shadow: var(--shadow-md); overflow: hidden; }
        .dimg__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); font-size: 14px; }
        .dimg__body { position: relative; display: flex; align-items: center; justify-content: center; min-height: 320px; background: var(--surface-2); padding: 16px; }
        .dimg__img { max-width: 100%; max-height: 60vh; border-radius: 8px; }
        .dimg__status { display: flex; align-items: center; gap: 10px; color: var(--text-2); font-size: 13px; }
        .dimg__nav { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 50%; background: rgba(15,23,42,0.55); color: #fff; font-size: 22px; display: flex; align-items: center; justify-content: center; }
        .dimg__nav--prev { left: 12px; } .dimg__nav--next { right: 12px; }
        .dimg__counter { text-align: center; padding: 10px; font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }
        .g-wl__period { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .g-chip { font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); }
        .g-chip--on { background: var(--brand-blue); border-color: var(--brand-blue); color: #fff; }
        .g-input { font-size: 12px; padding: 6px 10px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
        .g-tablewrap { overflow-x: auto; }
        .g-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .g-table th { text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-3); border-bottom: 1px solid var(--border); white-space: nowrap; position: sticky; top: 0; background: var(--surface); }
        .g-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; color: var(--text); }
        .g-table tr:hover td { background: var(--surface-2); }
        .g-table td.c { text-align: center; font-variant-numeric: tabular-nums; }
        .g-table td.b { font-weight: 700; }
        .g-table td.m { color: var(--text-2); }
        .g-table td.g { color: var(--green); font-weight: 700; }
        .g-name { font-weight: 600; max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
        .g-empty { text-align: center; padding: 28px; color: var(--text-3); font-size: 13px; }
        .perf-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 6px; vertical-align: middle; }
        .perf-dot--bom { background: var(--green); }
        .perf-dot--med { background: var(--amber); }
        .perf-dot--ruim { background: var(--red); }
        .ctr-cell { padding: 2px 7px; border-radius: 5px; font-weight: 700; }
        .ctr-cell--hit { background: var(--green-l); color: var(--green); }
        .ctr-cell--bom { background: var(--green-l); color: var(--green); }
        .ctr-cell--med { background: var(--amber-l); color: var(--amber); }
        .ctr-cell--ruim { background: var(--red-l); color: var(--red); }
        .g-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: var(--surface-2); color: var(--text-2); }
        .g-badge--on { background: var(--green-l); color: var(--green); }
        .g-rank { list-style: none; display: flex; flex-direction: column; gap: 2px; }
        .g-rank li { display: grid; grid-template-columns: 28px 1fr auto auto; align-items: center; gap: 12px; padding: 8px 6px; border-bottom: 1px solid var(--border); font-size: 13px; }
        .g-rank__pos { font-weight: 800; color: var(--text-3); text-align: center; }
        .g-rank__name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .g-rank__val { font-weight: 800; color: var(--green); font-variant-numeric: tabular-nums; }
        .g-rank__leads { font-size: 11px; color: var(--text-3); min-width: 70px; text-align: right; }
        .m { color: var(--text-3); }
        @media (max-width: 1000px) { .g-eng__kpis { grid-template-columns: repeat(2, 1fr); } }
      `}</style>
    </div>
  );
}

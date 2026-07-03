// Gestão › Estoque por Canais — consulta de estoque por SKU com quebra por
// local/canal. Fonte: snapshot public/data/estoque-canais.json (gerado por
// scripts/refresh-estoque-canais.cjs a partir do CSV da planilha de estoque —
// o gviz client-side trunca por causa de filtro ativo na planilha).

import { useEffect, useMemo, useState } from 'react';
import { PageHero } from '../../components/PageHero';
import { KPICard } from '../../components/KPICard';
import { Card } from '../../components/Card';
import { Pager, paginate } from '../../components/Pager';
import { MultiSelect } from '../../components/MultiSelect';

interface StockRow {
  linha: string; item: string; categoria: string; curva: string; status: string; chave: string;
  totalStock: number; extrema: number; itapevaTotal: number; itapevaB2B: number; extremaB2B: number;
  disponibilidade: string; ruptura: string; followUp: string; pls: string;
}
interface Snapshot { meta: { collectedAt: string; count: number }; rows: StockRow[]; }
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; snap: Snapshot };

const fmtN = (v: number) => (Number.isFinite(v) ? v.toLocaleString('pt-BR') : '—');
const raw = (v: string) => (v && v.trim() ? v.trim() : '—');

// colunas de estoque (numéricas) na ordem pedida
const STOCK_COLS = [
  { key: 'totalStock', label: 'Total Stock' },
  { key: 'itapevaTotal', label: 'Itapeva [Total]' },
  { key: 'itapevaB2B', label: 'Itapeva [B2B]' },
  { key: 'extrema', label: 'Estoque [Extrema]' },
  { key: 'extremaB2B', label: 'Extrema [B2B]' },
] as const;
const INFO_COLS = [
  { key: 'ruptura', label: 'Ruptura' },
  { key: 'followUp', label: 'Follow Up' },
  { key: 'pls', label: 'Pls' },
] as const;

function DispBadge({ v }: { v: string }) {
  const s = (v || '').toLocaleLowerCase('pt-BR');
  if (!s) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  let cls = 'ec-badge--neutral';
  if (s.includes('ok')) cls = 'ec-badge--ok';
  else if (s.includes('ruptura') || s.includes('zerad') || s.includes('crítico') || s.includes('critico')) cls = 'ec-badge--bad';
  else if (s.includes('baixo') || s.includes('atenç') || s.includes('atenc')) cls = 'ec-badge--warn';
  return <span className={`ec-badge ${cls}`}>{v}</span>;
}

export function EstoqueCanais() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [search, setSearch] = useState('');
  const [selSkus, setSelSkus] = useState<string[]>([]);
  const [fCat, setFCat] = useState('todos');
  const [fCurva, setFCurva] = useState('todos');
  const [fStatus, setFStatus] = useState('todos');
  const [fDisp, setFDisp] = useState('todos');
  const [sortKey, setSortKey] = useState<string>('totalStock');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/estoque-canais.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((snap: Snapshot) => { if (!cancelled) setState({ kind: 'ready', snap }); })
      .catch(() => { if (!cancelled) setState({ kind: 'error' }); });
    return () => { cancelled = true; };
  }, []);

  const snap = state.kind === 'ready' ? state.snap : null;

  const opts = useMemo(() => {
    const uniq = (f: (r: StockRow) => string) =>
      Array.from(new Set((snap?.rows || []).map(f).map((s) => s.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      cat: uniq((r) => r.categoria), curva: uniq((r) => r.curva),
      status: uniq((r) => r.status), disp: uniq((r) => r.disponibilidade),
    };
  }, [snap]);

  const skuOptions = useMemo(
    () => Array.from(new Set((snap?.rows || []).map((r) => r.item).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [snap],
  );

  const filtered = useMemo(() => {
    if (!snap) return [];
    const q = search.trim().toLocaleLowerCase('pt-BR');
    const arr = snap.rows.filter((r) =>
      (selSkus.length === 0 || selSkus.includes(r.item)) &&
      (fCat === 'todos' || r.categoria === fCat) &&
      (fCurva === 'todos' || r.curva === fCurva) &&
      (fStatus === 'todos' || r.status === fStatus) &&
      (fDisp === 'todos' || r.disponibilidade === fDisp) &&
      (q === '' || `${r.item} ${r.linha} ${r.chave}`.toLocaleLowerCase('pt-BR').includes(q)),
    );
    const numeric = STOCK_COLS.some((c) => c.key === sortKey);
    arr.sort((a, b) => {
      let cmp: number;
      if (numeric) cmp = (a as any)[sortKey] - (b as any)[sortKey];
      else cmp = String((a as any)[sortKey] || '').localeCompare(String((b as any)[sortKey] || ''), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [snap, search, selSkus, fCat, fCurva, fStatus, fDisp, sortKey, sortDir]);

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
    setPage(0);
  }

  if (state.kind === 'loading') return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>Carregando estoque…</div>;
  if (state.kind === 'error') return (
    <div style={{ padding: 40 }}>
      <Card><div style={{ padding: 28, textAlign: 'center' }}>
        <h3 style={{ marginBottom: 8 }}>📦 Sem snapshot de estoque</h3>
        <p style={{ color: 'var(--text-2)', fontSize: 13 }}>Rode <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>npm run refresh-estoque</code> pra gerar <code>public/data/estoque-canais.json</code>.</p>
      </div></Card>
    </div>
  );

  const sum = (k: keyof StockRow) => filtered.reduce((s, r) => s + (r[k] as number), 0);
  const totalStock = sum('totalStock');
  const itapevaTotal = sum('itapevaTotal');
  const extrema = sum('extrema');
  const b2b = sum('itapevaB2B') + sum('extremaB2B');
  const emRuptura = filtered.filter((r) => r.disponibilidade.toLocaleLowerCase('pt-BR').includes('ruptura')).length;
  const coletado = new Date(snap!.meta.collectedAt);
  const coletadoLbl = `${coletado.toLocaleDateString('pt-BR')} ${coletado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  const SortTh = ({ k, label }: { k: string; label: string }) => (
    <th className="c ec-th--sort" onClick={() => toggleSort(k)} title="Ordenar">
      {label}{sortKey === k && <span className="ec-sort">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
    </th>
  );

  return (
    <div className="ec">
      <PageHero
        breadcrumb="Produto Gocase · Estoque · Por Canais"
        title="Estoque por Canais"
        subtitle={`Posição de estoque por SKU e local/canal (Itapeva, Extrema, B2B) · ${snap!.meta.count} SKUs · snapshot ${coletadoLbl}`}
      />

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <KPICard label="Estoque Total" value={fmtN(totalStock)} icon="📦" accent="blue" hint={`${filtered.length} SKUs no filtro`} />
        <KPICard label="Itapeva [Total]" value={fmtN(itapevaTotal)} icon="🏭" accent="green" />
        <KPICard label="Estoque [Extrema]" value={fmtN(extrema)} icon="🏬" accent="purple" />
        <KPICard label="B2B (Itapeva + Extrema)" value={fmtN(b2b)} icon="🤝" accent="yellow" hint={emRuptura > 0 ? `${emRuptura} SKUs em ruptura` : 'sem ruptura no filtro'} />
      </div>

      <Card noPadding>
        <div className="ec-bar">
          <input className="ec-input ec-input--search" placeholder="Buscar SKU, linha ou chave…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <div className="ec-grp">
            <span className="ec-grp-lbl">SKU</span>
            <MultiSelect options={skuOptions} value={selSkus} onChange={(v) => { setSelSkus(v); setPage(0); }} allLabel="Todos" placeholder="Selecionar SKU" />
          </div>
          <select className="ec-input" value={fCat} onChange={(e) => { setFCat(e.target.value); setPage(0); }}>
            <option value="todos">Categoria: todas</option>{opts.cat.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="ec-input" value={fCurva} onChange={(e) => { setFCurva(e.target.value); setPage(0); }}>
            <option value="todos">Curva: todas</option>{opts.curva.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="ec-input" value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(0); }}>
            <option value="todos">Status: todos</option>{opts.status.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="ec-input" value={fDisp} onChange={(e) => { setFDisp(e.target.value); setPage(0); }}>
            <option value="todos">Disponibilidade: todas</option>{opts.disp.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="ec-tablewrap">
          <table className="ec-table">
            <thead>
              <tr>
                <th>SKU / Variação</th>
                <th>Linha</th>
                <th>Categoria</th>
                <th className="c">Curva</th>
                <th>Status</th>
                <th>Disponibilidade</th>
                {STOCK_COLS.map((c) => <SortTh key={c.key} k={c.key} label={c.label} />)}
                {INFO_COLS.map((c) => <SortTh key={c.key} k={c.key} label={c.label} />)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={14} className="ec-empty">Nenhum SKU no filtro.</td></tr>}
              {paginate(filtered, page, 40).map((r, i) => (
                <tr key={r.chave + i}>
                  <td className="ec-name" title={r.item}>{r.item}</td>
                  <td className="ec-mut">{raw(r.linha)}</td>
                  <td className="ec-mut">{raw(r.categoria)}</td>
                  <td className="c ec-mut">{raw(r.curva)}</td>
                  <td className="ec-mut">{raw(r.status)}</td>
                  <td><DispBadge v={r.disponibilidade} /></td>
                  {STOCK_COLS.map((c, ci) => (
                    <td key={c.key} className={`c ${ci === 0 ? 'ec-strong' : ''}`}>{fmtN((r as any)[c.key])}</td>
                  ))}
                  {INFO_COLS.map((c) => (
                    <td key={c.key} className="c ec-mut">{raw((r as any)[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={filtered.length} pageSize={40} onChange={setPage} />
      </Card>

      <style>{`
        .ec-bar { display: flex; gap: 8px; padding: 12px 14px; background: var(--surface-2); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
        .ec-input { font-size: 12px; padding: 7px 10px; border-radius: 7px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); outline: none; font-family: var(--font-sans); }
        .ec-input:focus { border-color: var(--brand-blue); }
        .ec-input--search { flex: 1; min-width: 200px; }
        .ec-grp { display: inline-flex; align-items: center; gap: 6px; }
        .ec-grp-lbl { font-size: 10px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px; }
        .ec-tablewrap { overflow-x: auto; }
        .ec-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .ec-table th { text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-3); border-bottom: 1.5px solid var(--border); white-space: nowrap; position: sticky; top: 0; background: var(--surface); z-index: 1; }
        /* Coluna SKU congelada (1ª coluna) */
        .ec-table th:first-child, .ec-table td:first-child { position: sticky; left: 0; background: var(--surface); box-shadow: 1px 0 0 var(--border); }
        .ec-table td:first-child { z-index: 1; }
        .ec-table th:first-child { z-index: 3; }
        .ec-table tr:hover td:first-child { background: var(--surface-2); }
        .ec-table th.c, .ec-table td.c { text-align: center; }
        .ec-th--sort { cursor: pointer; user-select: none; }
        .ec-th--sort:hover { color: var(--brand-blue); }
        .ec-sort { color: var(--brand-blue); }
        .ec-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; color: var(--text); font-variant-numeric: tabular-nums; }
        .ec-table tr:hover td { background: var(--surface-2); }
        .ec-name { font-weight: 600; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
        .ec-mut { color: var(--text-2); }
        .ec-strong { font-weight: 800; }
        .ec-empty { text-align: center; padding: 28px; color: var(--text-3); }
        .ec-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
        .ec-badge--ok { background: var(--green-l); color: var(--green); }
        .ec-badge--bad { background: var(--red-l); color: var(--red); }
        .ec-badge--warn { background: var(--amber-l, #fef3c7); color: var(--amber, #b45309); }
        .ec-badge--neutral { background: var(--surface-2); color: var(--text-2); }
      `}</style>
    </div>
  );
}

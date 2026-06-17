import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { StampedPayload, StampedProductAgg, StampedReviewRow, Ym } from '../data/types';
import { loadStamped } from '../data/loader';
import { fmtNum, shiftYm } from '../lib/format';
import { KPICard } from '../components/KPICard';
import { Card } from '../components/Card';
import { PageHero } from '../components/PageHero';
import { MonthRangePicker } from '../components/MonthRangePicker';

/** Fetch live via Edge Function — proxy que injeta a Private Key no server. */
async function fetchProductReviews(productId: number, take = 100): Promise<StampedReviewRow[]> {
  const r = await fetch(`/api/stamped-reviews?productId=${productId}&take=${take}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (j.reviews || []) as StampedReviewRow[];
}

/** Agrega reviews de múltiplos SKUs (uso: filtro por linha). */
async function fetchLinhaReviews(productIds: number[], take = 30): Promise<StampedReviewRow[]> {
  if (productIds.length === 0) return [];
  const ids = productIds.slice(0, 50).join(',');
  const r = await fetch(`/api/stamped-reviews?productIds=${ids}&take=${take}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (j.reviews || []) as StampedReviewRow[];
}

/** Temáticas/coleções que aparecem no prefixo mas NÃO são linha de produto Gocase
 *  (são estampas/coleções licenciadas). Manter o nome completo nesses casos. */
const TEMATICAS_NAO_AGRUPAR = new Set([
  'Flamengo', 'Corinthians', 'Palmeiras', 'São Paulo', 'Vasco', 'Santos',
  'Atlético-MG', 'Atlético MG', 'Atletico-MG', 'Grêmio', 'Internacional',
  'Botafogo', 'Fluminense', 'Cruzeiro', 'Bahia', 'Athletico-PR', 'Sport',
]);

/** Extrai a "linha-mãe" do productName.
 *  Convenção Gocase: `{Linha} - {Estampa}` (ex: "Tote Daily - Clear" → "Tote Daily").
 *  - Remove "+ Ebook" do nome (não é parte da linha — é brinde anexo).
 *  - Se o prefixo é uma temática licenciada (ex: time de futebol), mantém o nome completo
 *    (não agrupa todas as estampas de Flamengo como "Linha Flamengo"). */
function extractLinhaMae(name: string): string {
  let t = (name || '').trim();
  // Remove " + Ebook" (com ou sem espaços extras antes/depois)
  t = t.replace(/\s*\+\s*Ebook\b\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  // Remove " - " duplicado que possa ter sobrado pós-strip (ex: "Garrafa Fresh - " → "Garrafa Fresh")
  t = t.replace(/\s*-\s*$/, '').trim();
  const idx = t.indexOf(' - ');
  if (idx > 0) {
    const prefix = t.slice(0, idx).trim();
    if (TEMATICAS_NAO_AGRUPAR.has(prefix)) return t; // não agrupa temática
    return prefix;
  }
  return t;
}

interface LinhaAgg {
  linha: string;
  count: number;
  avgRating: number;
  dist: { 1: number; 2: number; 3: number; 4: number; 5: number };
  skusCount: number;
  topSku: { productId: number; productName: string; count: number } | null;
  productIds: number[];
}

const M_LABELS = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function ymLabel(ym: string) {
  const [y, m] = ym.split('-');
  return `${M_LABELS[+m]}/${y.slice(2)}`;
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span style={{ color: '#F59E0B', letterSpacing: 1, whiteSpace: 'nowrap' }} title={`${rating.toFixed(1)} estrelas`}>
      {'★'.repeat(full)}{'☆'.repeat(5 - full)}
    </span>
  );
}

export function Clientes() {
  const [data, setData] = useState<StampedPayload | null | 'loading'>('loading');
  useEffect(() => { loadStamped().then(setData); }, []);

  const [search, setSearch] = useState('');
  const [productLimit, setProductLimit] = useState(50);
  const [minReviews, setMinReviews] = useState(5);
  const [viewMode, setViewMode] = useState<'sku' | 'linha'>('sku');
  // Range de período pros KPIs/ranking/dist (não afeta o feed de Comentários).
  const [range, setRange] = useState<{ from: Ym; to: Ym } | null>(null);

  // Sort da tabela de Comentários
  type ReviewSortKey = 'rating' | 'date' | 'author' | 'product' | 'title' | 'message';
  const [reviewSortKey, setReviewSortKey] = useState<ReviewSortKey>('date');
  const [reviewSortDir, setReviewSortDir] = useState<'asc' | 'desc'>('desc');
  function toggleReviewSort(k: ReviewSortKey) {
    if (reviewSortKey === k) {
      setReviewSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setReviewSortKey(k);
      // Defaults úteis: rating asc (pior→melhor), date desc (recente→antigo)
      setReviewSortDir(k === 'rating' ? 'asc' : k === 'date' ? 'desc' : 'asc');
    }
  }
  function sortReviews(rows: StampedReviewRow[]): StampedReviewRow[] {
    const arr = rows.slice();
    arr.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (reviewSortKey) {
        case 'rating':  av = a.rating;       bv = b.rating;       break;
        case 'date':    av = a.date || '';   bv = b.date || '';   break;
        case 'author':  av = (a.author || '').toLocaleLowerCase('pt-BR');  bv = (b.author || '').toLocaleLowerCase('pt-BR');  break;
        case 'product': av = (a.productName || '').toLocaleLowerCase('pt-BR'); bv = (b.productName || '').toLocaleLowerCase('pt-BR'); break;
        case 'title':   av = (a.title || '').toLocaleLowerCase('pt-BR');   bv = (b.title || '').toLocaleLowerCase('pt-BR');   break;
        case 'message': av = (a.message || '').length; bv = (b.message || '').length; break;
      }
      if (av < bv) return reviewSortDir === 'asc' ? -1 : 1;
      if (av > bv) return reviewSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }

  // Filtros: linha + SKU (cascade)
  const [selectedLinha, setSelectedLinha] = useState<string | null>(null);
  const [linhaSearch, setLinhaSearch] = useState('');
  const [showLinhaList, setShowLinhaList] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [showProductList, setShowProductList] = useState(false);
  const [productReviews, setProductReviews] = useState<StampedReviewRow[] | 'loading' | 'error' | null>(null);
  const productInputRef = useRef<HTMLDivElement | null>(null);
  const linhaInputRef = useRef<HTMLDivElement | null>(null);

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (productInputRef.current && !productInputRef.current.contains(e.target as Node)) setShowProductList(false);
      if (linhaInputRef.current && !linhaInputRef.current.contains(e.target as Node)) setShowLinhaList(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Fetch reviews quando muda filtro (SKU específico OU Linha)
  useEffect(() => {
    let aborted = false;
    if (selectedProduct) {
      setProductReviews('loading');
      fetchProductReviews(selectedProduct.id, 100)
        .then((rows) => { if (!aborted) setProductReviews(rows); })
        .catch(() => { if (!aborted) setProductReviews('error'); });
    } else if (selectedLinha && data && data !== 'loading') {
      const pids = data.byProduct
        .filter((p) => extractLinhaMae(p.productName) === selectedLinha)
        .map((p) => p.productId);
      if (pids.length === 0) { setProductReviews([]); return; }
      setProductReviews('loading');
      fetchLinhaReviews(pids, 30)
        .then((rows) => { if (!aborted) setProductReviews(rows); })
        .catch(() => { if (!aborted) setProductReviews('error'); });
    } else {
      setProductReviews(null);
    }
    return () => { aborted = true; };
  }, [selectedProduct, selectedLinha, data]);

  // Meses disponíveis no snapshot + default do range (últimos 6 meses)
  const availableMonths = useMemo<Ym[]>(() => {
    if (!data || data === 'loading') return [];
    return data.byMonth.map((m) => m.ym).sort();
  }, [data]);
  const latestMonth = availableMonths[availableMonths.length - 1] || '';

  // Inicializa range no default (últimos 6 meses até latest)
  useEffect(() => {
    if (range || !latestMonth) return;
    const from = shiftYm(latestMonth, -5);
    setRange({ from: from < availableMonths[0] ? availableMonths[0] : from, to: latestMonth });
  }, [latestMonth, availableMonths, range]);

  /** Aplica o range em byProductMonth pra derivar byProduct no escopo do período.
   *  Se byProductMonth não estiver no JSON (snapshot antigo), faz fallback pro byProduct all-time. */
  const byProductFiltered = useMemo<StampedProductAgg[]>(() => {
    if (!data || data === 'loading') return [];
    if (!data.byProductMonth || !range) return data.byProduct;
    const nameById: Record<number, string> = {};
    for (const p of data.byProduct) nameById[p.productId] = p.productName;
    const out: StampedProductAgg[] = [];
    for (const [pidStr, months] of Object.entries(data.byProductMonth)) {
      let count = 0, sumRating = 0;
      const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as { 1: number; 2: number; 3: number; 4: number; 5: number };
      for (const [ym, cell] of Object.entries(months)) {
        if (ym < range.from || ym > range.to) continue;
        count += cell[0];
        sumRating += cell[1];
        dist[1] += cell[2]; dist[2] += cell[3]; dist[3] += cell[4]; dist[4] += cell[5]; dist[5] += cell[6];
      }
      if (count === 0) continue;
      const pid = Number(pidStr);
      out.push({
        productId: pid,
        productName: nameById[pid] || `#${pid}`,
        count,
        avgRating: count > 0 ? sumRating / count : 0,
        dist,
      });
    }
    return out.sort((a, b) => b.count - a.count);
  }, [data, range]);

  // byMonth filtrado pelo range (afeta o gráfico de evolução)
  const byMonthFiltered = useMemo(() => {
    if (!data || data === 'loading') return [];
    if (!range) return data.byMonth;
    return data.byMonth.filter((m) => m.ym >= range.from && m.ym <= range.to);
  }, [data, range]);

  // Agregado por linha-mãe (calculado on-the-fly de byProductFiltered)
  const byLinha = useMemo<LinhaAgg[]>(() => {
    if (!data || data === 'loading') return [];
    const map = new Map<string, LinhaAgg>();
    for (const p of byProductFiltered) {
      const linha = extractLinhaMae(p.productName);
      let agg = map.get(linha);
      if (!agg) {
        agg = { linha, count: 0, avgRating: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, skusCount: 0, topSku: null, productIds: [] };
        map.set(linha, agg);
      }
      agg.count += p.count;
      // Acumula sumRating temporariamente em avgRating (recalcula no final)
      agg.avgRating += p.avgRating * p.count;
      for (const k of [1, 2, 3, 4, 5] as const) agg.dist[k] += p.dist[k];
      agg.skusCount += 1;
      agg.productIds.push(p.productId);
      if (!agg.topSku || p.count > agg.topSku.count) {
        agg.topSku = { productId: p.productId, productName: p.productName, count: p.count };
      }
    }
    return Array.from(map.values())
      .map((a) => ({ ...a, avgRating: a.count > 0 ? a.avgRating / a.count : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [byProductFiltered]);

  const filteredSku = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return byProductFiltered
      .filter((p) => p.count >= minReviews)
      .filter((p) => q === '' || p.productName.toLocaleLowerCase('pt-BR').includes(q))
      .slice(0, productLimit);
  }, [byProductFiltered, search, productLimit, minReviews]);

  const filteredLinha = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return byLinha
      .filter((l) => l.count >= minReviews)
      .filter((l) => q === '' || l.linha.toLocaleLowerCase('pt-BR').includes(q))
      .slice(0, productLimit);
  }, [byLinha, search, productLimit, minReviews]);

  if (data === 'loading') {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>Carregando snapshot de reviews…</div>;
  }
  if (!data) {
    return (
      <div style={{ padding: 40 }}>
        <Card>
          <div style={{ padding: 28, textAlign: 'center' }}>
            <h3 style={{ marginBottom: 8 }}>📭 Sem snapshot de reviews</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 13 }}>
              Rode <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>npm run refresh-stamped</code> pra gerar <code>public/data/stamped.json</code>.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Piores e melhores (≥30 reviews pra significância; desempate por # reviews)
  const withMinReviews = byProductFiltered.filter((p) => p.count >= 30);
  const worstProducts = withMinReviews
    .slice()
    .sort((a, b) => a.avgRating - b.avgRating || b.count - a.count)
    .slice(0, 10);
  const bestProducts = withMinReviews
    .slice()
    .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count)
    .slice(0, 10);

  // Distribuição global no escopo do range
  const globalDist = byProductFiltered.reduce(
    (acc, p) => ({
      1: acc[1] + p.dist[1],
      2: acc[2] + p.dist[2],
      3: acc[3] + p.dist[3],
      4: acc[4] + p.dist[4],
      5: acc[5] + p.dist[5],
    }),
    { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
  );
  const totalInRange = globalDist[1] + globalDist[2] + globalDist[3] + globalDist[4] + globalDist[5];
  const avgRatingInRange = totalInRange > 0
    ? (globalDist[1] + 2 * globalDist[2] + 3 * globalDist[3] + 4 * globalDist[4] + 5 * globalDist[5]) / totalInRange
    : 0;
  const distData = [5, 4, 3, 2, 1].map((star) => ({
    star: `${star}★`,
    count: globalDist[star],
    pct: totalInRange > 0 ? (globalDist[star] / totalInRange) * 100 : 0,
  }));

  const monthSeries = byMonthFiltered.map((m) => ({
    ym: m.ym,
    label: ymLabel(m.ym),
    count: m.count,
    avgRating: m.avgRating,
  }));

  const collected = new Date(data.meta.collectedAt);
  const collectedLabel = `${collected.toLocaleDateString('pt-BR')} ${collected.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="cli">
      <PageHero
        breadcrumb="Unidade de negócio: Produto Gocase · Clientes"
        title="Voz do Cliente · Reviews Stamped"
        subtitle={
          <>
            Reviews via Stamped.io · snapshot coletado em {collectedLabel} ·
            base all-time: {fmtNum(data.meta.totalAllTime)} reviews · snapshot {fmtNum(data.meta.total)} desde {data.meta.dateFrom}.
            {!data.byProductMonth && (
              <span style={{ color: 'var(--text-3)' }}>{' '}<em>(filtro de período aguardando próxima geração do snapshot — atualmente mostrando all-time)</em></span>
            )}
          </>
        }
        right={
          range && availableMonths.length > 0 ? (
            <div className="cli__period">
              <span className="cli__period-lbl">Período</span>
              <MonthRangePicker available={availableMonths} value={range} onChange={setRange} />
            </div>
          ) : null
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <KPICard
          label="Reviews no período"
          icon="⭐"
          accent="blue"
          value={fmtNum(totalInRange)}
          hint={range ? `${range.from} → ${range.to}` : `desde ${data.meta.dateFrom}`}
        />
        <KPICard
          label="Rating médio"
          icon="🎯"
          accent={avgRatingInRange >= 4.5 ? 'green' : avgRatingInRange >= 4 ? 'yellow' : 'red'}
          value={avgRatingInRange.toFixed(2)}
          unit="★"
          hint={data.meta.ratingAllTime ? `${data.meta.ratingAllTime.toFixed(2)}★ all-time` : ''}
        />
        <KPICard
          label="Produtos avaliados"
          icon="📦"
          accent="purple"
          value={fmtNum(byProductFiltered.length)}
          hint={`${byProductFiltered.filter((p) => p.count >= 30).length} c/ ≥30 reviews`}
        />
        <KPICard
          label="% 5 estrelas"
          icon="🏆"
          accent="green"
          value={totalInRange > 0 ? ((globalDist[5] / totalInRange) * 100).toFixed(1) : '0.0'}
          unit="%"
          hint={`${fmtNum(globalDist[5])} reviews · ${totalInRange > 0 ? (((globalDist[1] + globalDist[2]) / totalInRange) * 100).toFixed(1) : '0.0'}% são 1-2★`}
        />
      </div>

      {/* Distribuição global + Evolução mensal */}
      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <Card title="Distribuição de notas" subtitle={`${fmtNum(data.meta.total)} reviews · 2025+`}>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData} layout="vertical" margin={{ top: 8, right: 28, bottom: 8, left: 24 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => fmtNum(v)} tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
                <YAxis type="category" dataKey="star" tick={{ fill: 'var(--text-2)', fontSize: 13, fontWeight: 700 }} width={40} />
                <Tooltip formatter={(v: number, _: string, p: any) => [`${fmtNum(v)} (${p.payload.pct.toFixed(1)}%)`, 'reviews']} />
                <Bar dataKey="count" fill="#F59E0B" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Volume mensal + rating" subtitle="Barras = # reviews · linha = nota média">
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthSeries} margin={{ top: 26, right: 28, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                <YAxis yAxisId="left" tickFormatter={(v) => fmtNum(v)} tick={{ fill: 'var(--text-3)', fontSize: 10 }} width={56} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[3.5, 5]} tick={{ fill: '#F59E0B', fontSize: 10 }} width={36} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number, _name: string, p: any) => {
                    if (p.dataKey === 'avgRating') return [v.toFixed(2) + '★', 'nota média'];
                    return [fmtNum(v), '# reviews'];
                  }}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
                  cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
                />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                <Bar yAxisId="left" dataKey="count" name="# reviews" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" formatter={(v: number) => (v > 0 ? fmtNum(v) : '')} fill="var(--text)" fontSize={10} fontWeight={700} />
                </Bar>
                <Line yAxisId="right" dataKey="avgRating" name="nota média" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3, fill: '#F59E0B' }}>
                  <LabelList dataKey="avgRating" position="top" formatter={(v: number) => v.toFixed(2)} fill="#B45309" fontSize={9} fontWeight={700} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Piores e melhores produtos lado a lado */}
      <div className="grid grid-2" style={{ marginTop: 4 }}>
        <Card
          title="🚨 Produtos com pior rating"
          subtitle="≥30 reviews · ordenado pela média (asc)"
        >
          <div className="tbl">
            <div className="tbl__wrap">
              <table className="tbl__table" style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Produto</th>
                    <th className="right">#</th>
                    <th className="right">Média</th>
                    <th className="right">% 1-2★</th>
                  </tr>
                </thead>
                <tbody>
                  {worstProducts.map((p, i) => {
                    const ruins = p.dist[1] + p.dist[2];
                    const ruinPct = (ruins / p.count) * 100;
                    return (
                      <tr key={p.productId}>
                        <td className="tbl__num">{i + 1}.</td>
                        <td className="tbl__primary">{p.productName}</td>
                        <td className="right tbl__strong">{fmtNum(p.count)}</td>
                        <td className="right">
                          <Stars rating={p.avgRating} />
                          <span style={{ color: 'var(--text-2)', marginLeft: 4 }}>{p.avgRating.toFixed(2)}</span>
                        </td>
                        <td className={`right ${ruinPct > 20 ? 'tbl__neg' : ruinPct > 10 ? 'tbl__warn' : 'tbl__muted'}`}>{ruinPct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card
          title="🏅 Produtos com melhor rating"
          subtitle="≥30 reviews · ordenado pela média (desc)"
        >
          <div className="tbl">
            <div className="tbl__wrap">
              <table className="tbl__table" style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Produto</th>
                    <th className="right">#</th>
                    <th className="right">Média</th>
                    <th className="right">% 5★</th>
                  </tr>
                </thead>
                <tbody>
                  {bestProducts.map((p, i) => {
                    const fivePct = (p.dist[5] / p.count) * 100;
                    return (
                      <tr key={p.productId}>
                        <td className="tbl__num">{i + 1}.</td>
                        <td className="tbl__primary">{p.productName}</td>
                        <td className="right tbl__strong">{fmtNum(p.count)}</td>
                        <td className="right">
                          <Stars rating={p.avgRating} />
                          <span style={{ color: 'var(--text-2)', marginLeft: 4 }}>{p.avgRating.toFixed(2)}</span>
                        </td>
                        <td className={`right ${fivePct >= 95 ? 'tbl__pos' : fivePct >= 90 ? 'tbl__muted' : 'tbl__warn'}`}>{fivePct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>

      {/* Ranking por # reviews */}
      <div className="section-title" style={{ marginTop: 18 }}>
        🏆 Ranking por volume de reviews
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          {viewMode === 'sku'
            ? `${data.byProduct.length} SKUs · top ${Math.min(filteredSku.length, productLimit)} no escopo`
            : `${byLinha.length} linhas · top ${Math.min(filteredLinha.length, productLimit)} no escopo`}
        </span>
      </div>
      <Card>
        <div className="cli__rank-bar">
          <div className="cli__rank-toggle">
            <button
              className={`cli__rank-pill ${viewMode === 'sku' ? 'on' : ''}`}
              onClick={() => setViewMode('sku')}
            >SKU</button>
            <button
              className={`cli__rank-pill ${viewMode === 'linha' ? 'on' : ''}`}
              onClick={() => setViewMode('linha')}
            >Linha</button>
          </div>
          <input
            className="cli__rank-search"
            placeholder={viewMode === 'sku' ? 'Filtrar por SKU…' : 'Filtrar por linha (ex: "Tote Daily")…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="cli__rank-limit" value={minReviews} onChange={(e) => setMinReviews(Number(e.target.value))}>
            <option value={1}>Min. 1 review</option>
            <option value={5}>Min. 5 reviews</option>
            <option value={10}>Min. 10 reviews</option>
            <option value={30}>Min. 30 reviews</option>
            <option value={100}>Min. 100 reviews</option>
          </select>
          <select className="cli__rank-limit" value={productLimit} onChange={(e) => setProductLimit(Number(e.target.value))}>
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
            <option value={500}>Top 500</option>
          </select>
        </div>
        <div className="tbl">
          <div className="tbl__wrap">
            {viewMode === 'sku' ? (
              <table className="tbl__table" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>SKU</th>
                    <th>Linha</th>
                    <th className="right"># reviews</th>
                    <th className="right">Média</th>
                    <th className="right">5★</th>
                    <th className="right">4★</th>
                    <th className="right">3★</th>
                    <th className="right">2★</th>
                    <th className="right">1★</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSku.map((p, i) => {
                    const linhaMae = extractLinhaMae(p.productName);
                    return (
                      <tr
                        key={p.productId}
                        className="cli__rank-row"
                        onClick={() => { setSelectedProduct({ id: p.productId, name: p.productName }); setProductSearch(''); }}
                        title="Clique pra ver os reviews"
                      >
                        <td className="tbl__num">{i + 1}.</td>
                        <td className="tbl__primary">{p.productName}</td>
                        <td className="tbl__muted">{linhaMae !== p.productName ? linhaMae : '—'}</td>
                        <td className="right tbl__strong">{fmtNum(p.count)}</td>
                        <td className="right">
                          <Stars rating={p.avgRating} />
                          <span style={{ color: 'var(--text-2)', marginLeft: 4 }}>{p.avgRating.toFixed(2)}</span>
                        </td>
                        <td className="right tbl__muted">{p.dist[5]}</td>
                        <td className="right tbl__muted">{p.dist[4]}</td>
                        <td className="right tbl__muted">{p.dist[3]}</td>
                        <td className="right tbl__muted">{p.dist[2]}</td>
                        <td className="right tbl__muted">{p.dist[1]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="tbl__table" style={{ minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Linha</th>
                    <th className="right">SKUs</th>
                    <th className="right"># reviews</th>
                    <th className="right">Média</th>
                    <th className="right">5★</th>
                    <th className="right">4★</th>
                    <th className="right">3★</th>
                    <th className="right">2★</th>
                    <th className="right">1★</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLinha.map((l, i) => (
                    <tr
                      key={l.linha}
                      className="cli__rank-row"
                      onClick={() => {
                        // Quando clicar numa linha, seleciona o SKU campeão dela pro feed de reviews
                        if (l.topSku) {
                          setSelectedProduct({ id: l.topSku.productId, name: l.topSku.productName });
                          setProductSearch('');
                        }
                      }}
                      title={l.topSku ? `Clique pra ver reviews do top SKU (${l.topSku.productName})` : ''}
                    >
                      <td className="tbl__num">{i + 1}.</td>
                      <td className="tbl__primary">{l.linha}</td>
                      <td className="right tbl__muted">{l.skusCount}</td>
                      <td className="right tbl__strong">{fmtNum(l.count)}</td>
                      <td className="right">
                        <Stars rating={l.avgRating} />
                        <span style={{ color: 'var(--text-2)', marginLeft: 4 }}>{l.avgRating.toFixed(2)}</span>
                      </td>
                      <td className="right tbl__muted">{l.dist[5]}</td>
                      <td className="right tbl__muted">{l.dist[4]}</td>
                      <td className="right tbl__muted">{l.dist[3]}</td>
                      <td className="right tbl__muted">{l.dist[2]}</td>
                      <td className="right tbl__muted">{l.dist[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>

      {/* Reviews — filtros de Linha + SKU + reviews mais recentes */}
      <div className="section-title" style={{ marginTop: 18 }}>
        💬 Comentários
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          {selectedProduct
            ? `SKU "${selectedProduct.name}"`
            : selectedLinha
              ? `linha "${selectedLinha}" (todos os SKUs)`
              : 'últimos 50 (todos os produtos)'}
        </span>
      </div>
      <Card>
        <div className="cli__filter-bar cli__filter-bar--dual">
          {/* Linha */}
          <div className="cli__filter-pick" ref={linhaInputRef}>
            <label className="cli__filter-lbl">Linha</label>
            <input
              className="cli__filter-input"
              placeholder="Ex: Tote Daily, Mini Tote…"
              value={selectedLinha || linhaSearch}
              onChange={(e) => {
                setLinhaSearch(e.target.value);
                setSelectedLinha(null);
                setShowLinhaList(true);
              }}
              onFocus={() => setShowLinhaList(true)}
            />
            {selectedLinha && (
              <button
                className="cli__filter-clear"
                onClick={() => { setSelectedLinha(null); setLinhaSearch(''); setSelectedProduct(null); setProductSearch(''); }}
                title="Limpar linha"
              >✕</button>
            )}
            {showLinhaList && !selectedLinha && (
              <div className="cli__filter-list">
                {(() => {
                  const q = linhaSearch.trim().toLocaleLowerCase('pt-BR');
                  const list = q === ''
                    ? byLinha.slice(0, 20)
                    : byLinha.filter((l) => l.linha.toLocaleLowerCase('pt-BR').includes(q)).slice(0, 20);
                  if (list.length === 0) {
                    return <div className="cli__filter-empty">Nenhuma linha encontrada.</div>;
                  }
                  return list.map((l) => (
                    <button
                      key={l.linha}
                      className="cli__filter-opt"
                      onClick={() => {
                        setSelectedLinha(l.linha);
                        setLinhaSearch('');
                        setShowLinhaList(false);
                        setSelectedProduct(null);
                        setProductSearch('');
                      }}
                    >
                      <span className="cli__filter-opt-name">{l.linha}</span>
                      <span className="cli__filter-opt-meta">
                        {l.skusCount} SKUs · {l.count} reviews · {l.avgRating.toFixed(2)}★
                      </span>
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* SKU (cascade) */}
          <div className="cli__filter-pick" ref={productInputRef}>
            <label className="cli__filter-lbl">SKU</label>
            <input
              className="cli__filter-input"
              placeholder={selectedLinha ? `Filtrar SKUs de "${selectedLinha}"…` : 'Digite pra buscar entre os SKUs…'}
              value={selectedProduct ? selectedProduct.name : productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setSelectedProduct(null);
                setShowProductList(true);
              }}
              onFocus={() => setShowProductList(true)}
            />
            {selectedProduct && (
              <button
                className="cli__filter-clear"
                onClick={() => { setSelectedProduct(null); setProductSearch(''); }}
                title="Limpar SKU"
              >✕</button>
            )}
            {showProductList && !selectedProduct && (
              <div className="cli__filter-list">
                {(() => {
                  const q = productSearch.trim().toLocaleLowerCase('pt-BR');
                  // Cascade: se linha selecionada, filtra só SKUs daquela linha
                  let pool = data.byProduct;
                  if (selectedLinha) {
                    pool = pool.filter((p) => extractLinhaMae(p.productName) === selectedLinha);
                  }
                  const matches = q === ''
                    ? pool.slice(0, 20)
                    : pool.filter((p) => p.productName.toLocaleLowerCase('pt-BR').includes(q)).slice(0, 20);
                  if (matches.length === 0) {
                    return <div className="cli__filter-empty">Nenhum SKU encontrado{selectedLinha ? ` em "${selectedLinha}"` : ''}.</div>;
                  }
                  return matches.map((p) => (
                    <button
                      key={p.productId}
                      className="cli__filter-opt"
                      onClick={() => {
                        setSelectedProduct({ id: p.productId, name: p.productName });
                        setProductSearch('');
                        setShowProductList(false);
                      }}
                    >
                      <span className="cli__filter-opt-name">{p.productName}</span>
                      <span className="cli__filter-opt-meta">
                        {p.count} reviews · {p.avgRating.toFixed(2)}★
                      </span>
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Tabela ordenável — feed live (linha ou SKU) vs default snapshot */}
        {(() => {
          const isLive = !!(selectedProduct || selectedLinha);
          const showProductCol = !selectedProduct; // esconde só quando 1 SKU específico
          let rows: StampedReviewRow[] | null = null;
          let stateBlock: React.ReactNode = null;
          if (isLive) {
            if (productReviews === 'loading') {
              stateBlock = <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)' }}>Buscando reviews na Stamped…</div>;
            } else if (productReviews === 'error') {
              stateBlock = <div style={{ padding: 28, textAlign: 'center', color: 'var(--red)' }}>Falha ao buscar reviews. Tente de novo.</div>;
            } else if (!productReviews || productReviews.length === 0) {
              stateBlock = <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>Sem reviews para este filtro.</div>;
            } else {
              rows = productReviews;
            }
          } else {
            rows = data.recent;
          }

          if (stateBlock) return stateBlock;
          if (!rows) return null;

          const sorted = sortReviews(rows);

          const Header = ({ k, label, align }: { k: ReviewSortKey; label: string; align?: 'right' }) => (
            <th
              className={`${align === 'right' ? 'right' : ''} ${reviewSortKey === k ? 'on' : ''}`}
              onClick={() => toggleReviewSort(k)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              {label}
              {reviewSortKey === k && <span className="tbl__sort">{reviewSortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
            </th>
          );

          const headerLine = isLive
            ? selectedProduct
              ? `${rows.length} reviews do SKU · via API`
              : `${rows.length} reviews agregadas da linha "${selectedLinha}" · via API`
            : `${rows.length} reviews no snapshot (todos produtos)`;

          return (
            <>
              <div className="cli__feed-hdr">
                {headerLine} · clique nos headers pra ordenar (rating ascendente = pior→melhor)
              </div>
              <div className="tbl">
                <div className="tbl__wrap">
                  <table className="tbl__table" style={{ minWidth: 980 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>#</th>
                        <Header k="rating" label="★" align="right" />
                        <Header k="date" label="Data" align="right" />
                        <Header k="author" label="Autor" />
                        {showProductCol && <Header k="product" label="Produto" />}
                        <Header k="title" label="Título" />
                        <Header k="message" label="Comentário" />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r, i) => (
                        <tr key={r.id}>
                          <td className="tbl__num">{i + 1}.</td>
                          <td className="right">
                            <Stars rating={r.rating} />
                            <span style={{ color: 'var(--text-2)', marginLeft: 4 }}>{r.rating}</span>
                          </td>
                          <td className="right tbl__muted" style={{ whiteSpace: 'nowrap' }}>
                            {r.date ? new Date(r.date).toLocaleDateString('pt-BR') : '—'}
                          </td>
                          <td className="tbl__primary" style={{ whiteSpace: 'nowrap' }}>
                            {r.author}
                            {r.verified && <span className="cli__review-verified" style={{ marginLeft: 6 }}>✓</span>}
                          </td>
                          {showProductCol && (
                            <td className="tbl__muted" style={{ maxWidth: 220 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.productName}>
                                {r.productName}
                              </div>
                            </td>
                          )}
                          <td className="tbl__strong" style={{ maxWidth: 200 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.title}>
                              {r.title || <span style={{ color: 'var(--text-3)' }}>—</span>}
                            </div>
                          </td>
                          <td className="tbl__muted" style={{ maxWidth: 380 }}>
                            <div className="cli__review-cell-msg" title={r.message}>{r.message || '—'}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        })()}
      </Card>

      <style>{`
        .cli__rank-bar {
          display: flex;
          gap: 8px;
          padding: 12px 14px;
          background: var(--surface-2);
          border-bottom: 1px solid var(--border);
          flex-wrap: wrap;
        }
        .cli__rank-search {
          flex: 1;
          min-width: 220px;
          padding: 6px 12px;
          font-size: 12px;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          outline: none;
        }
        .cli__rank-search:focus { border-color: var(--brand-blue); }
        .cli__rank-limit {
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          cursor: pointer;
          font-family: var(--font-sans);
        }
        .cli__reviews {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 12px;
        }
        .cli__review {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          padding: 14px;
        }
        .cli__review-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cli__review-author { font-size: 12px; font-weight: 700; color: var(--text); }
        .cli__review-verified {
          font-size: 9px;
          font-weight: 700;
          background: var(--brand-blue-l, #e0eaff);
          color: var(--brand-blue-d, #1d4fa3);
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.5px;
        }
        .cli__review-date { font-size: 11px; color: var(--text-3); margin-left: auto; }
        .cli__review-product { font-size: 11px; color: var(--text-2); margin-top: 6px; font-weight: 600; }
        .cli__review-title { font-size: 13px; font-weight: 700; color: var(--text); margin-top: 6px; }
        .cli__review-msg { font-size: 12px; color: var(--text-2); margin-top: 4px; line-height: 1.45; }
        .cli__rank-row { cursor: pointer; }
        .cli__rank-row:hover { background: var(--surface-2); }
        .cli__period { display: inline-flex; align-items: center; gap: 10px; }
        .cli__period-lbl {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--text-3);
        }
        .cli__rank-toggle {
          display: inline-flex;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 999px;
          padding: 2px;
        }
        .cli__rank-pill {
          padding: 5px 14px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-2);
          background: transparent;
          border: none;
          border-radius: 999px;
          letter-spacing: 0.3px;
          cursor: pointer;
        }
        .cli__rank-pill:hover { color: var(--text); }
        .cli__rank-pill.on {
          background: var(--brand-blue);
          color: #fff;
        }
        .cli__filter-bar {
          padding: 14px;
          background: var(--surface-2);
          border-bottom: 1px solid var(--border);
        }
        .cli__filter-bar--dual {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 720px) {
          .cli__filter-bar--dual { grid-template-columns: 1fr; }
        }
        .cli__filter-pick {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cli__filter-lbl {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-2);
          text-transform: uppercase;
          letter-spacing: 0.6px;
          white-space: nowrap;
        }
        .cli__filter-input {
          flex: 1;
          padding: 8px 12px;
          font-size: 13px;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          outline: none;
        }
        .cli__filter-input:focus { border-color: var(--brand-blue); }
        .cli__filter-clear {
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-2);
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 99px;
          cursor: pointer;
        }
        .cli__filter-clear:hover { color: var(--red); border-color: var(--red); }
        .cli__filter-list {
          position: absolute;
          top: calc(100% + 4px);
          left: 80px;
          right: 0;
          z-index: 20;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-md);
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          max-height: 320px;
          overflow-y: auto;
        }
        .cli__filter-opt {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          padding: 10px 14px;
          font-size: 12px;
          color: var(--text);
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border);
          text-align: left;
          cursor: pointer;
        }
        .cli__filter-opt:last-child { border-bottom: none; }
        .cli__filter-opt:hover { background: var(--surface-2); }
        .cli__filter-opt-name { font-weight: 600; }
        .cli__filter-opt-meta {
          font-size: 11px;
          color: var(--text-3);
          margin-left: 12px;
          white-space: nowrap;
        }
        .cli__filter-empty {
          padding: 16px;
          font-size: 12px;
          color: var(--text-3);
          text-align: center;
        }
        .cli__feed-hdr {
          font-size: 11px;
          color: var(--text-3);
          padding: 10px 14px;
          font-weight: 600;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
        }
      `}</style>
    </div>
  );
}

/*
 * refresh-stamped.cjs — puxa reviews Stamped.io (todos os ratings 1-5★)
 * desde 2025-01-01 via endpoint Dashboard (`/api/v2/{storeHash}/dashboard/reviews`)
 * com Basic Auth (publicKey:privateKey).
 *
 * Saída: public/data/stamped.json
 *   - meta (rating médio, total, dataInicio, coletadoEm)
 *   - byProduct (count, avgRating, distribuição 1-5★)
 *   - byMonth   (volume + rating médio por YYYY-MM)
 *   - recent    (últimas 500 reviews — pra feed)
 *
 * Uso: node scripts/refresh-stamped.cjs
 *      ou: npm run refresh-stamped
 *
 * Lê credenciais de .env.local (gitignored). Lê env vars do processo se setadas.
 */

const fs = require('fs');
const path = require('path');

// ── Carrega .env.local manualmente (sem dependência) ─────────────────
function loadEnv() {
  const p = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const PUBLIC_KEY  = process.env.STAMPED_PUBLIC_KEY;
const PRIVATE_KEY = process.env.STAMPED_PRIVATE_KEY;
const STORE_HASH  = process.env.STAMPED_STORE_HASH;
if (!PUBLIC_KEY || !PRIVATE_KEY || !STORE_HASH) {
  console.error('✗ Faltam env vars STAMPED_PUBLIC_KEY / STAMPED_PRIVATE_KEY / STAMPED_STORE_HASH');
  process.exit(1);
}

const DATE_FROM   = '2025-01-01';
const PAGE_SIZE   = 100;
const CONCURRENCY = 8;
const OUT_FILE    = path.resolve(__dirname, '../public/data/stamped.json');

const AUTH = 'Basic ' + Buffer.from(`${PUBLIC_KEY}:${PRIVATE_KEY}`).toString('base64');

/** Fetch resiliente. Em caso de 500 da Stamped (bug Unicode deles), tenta com take menor; se ainda falhar, retorna vazio. */
async function fetchPage(page, takeOverride) {
  const take = takeOverride || PAGE_SIZE;
  // O endpoint usa take+page (não offset), então ao reduzir take precisamos
  // recalcular qual fatia pegar. Estratégia: se o batch original (page,take)
  // cobre [start, end), buscamos com pageInner ∈ [1..N] mantendo a janela.
  const url = `https://stamped.io/api/v2/${STORE_HASH}/dashboard/reviews?take=${take}&page=${page}&dateFrom=${DATE_FROM}`;
  try {
    const r = await fetch(url, { headers: { Authorization: AUTH } });
    if (r.ok) return await r.json();
    if (r.status === 500 && take > 10) {
      // Bug de encoding da Stamped: divide pela metade e tenta de novo (2 sub-páginas)
      const half = Math.floor(take / 2);
      const url1 = `https://stamped.io/api/v2/${STORE_HASH}/dashboard/reviews?take=${half}&page=${(page - 1) * 2 + 1}&dateFrom=${DATE_FROM}`;
      const url2 = `https://stamped.io/api/v2/${STORE_HASH}/dashboard/reviews?take=${half}&page=${(page - 1) * 2 + 2}&dateFrom=${DATE_FROM}`;
      const [r1, r2] = await Promise.all([fetch(url1, { headers: { Authorization: AUTH } }), fetch(url2, { headers: { Authorization: AUTH } })]);
      const j1 = r1.ok ? await r1.json() : { results: [] };
      const j2 = r2.ok ? await r2.json() : { results: [] };
      if (!r1.ok) console.warn(`\n  ⚠ skip subpage ${page}/A (${r1.status})`);
      if (!r2.ok) console.warn(`\n  ⚠ skip subpage ${page}/B (${r2.status})`);
      return { results: [...(j1.results || []), ...(j2.results || [])], total: j1.total };
    }
    const txt = await r.text().catch(() => '');
    console.warn(`\n  ⚠ skip page ${page} (HTTP ${r.status}): ${txt.slice(0, 80)}`);
    return { results: [] };
  } catch (e) {
    console.warn(`\n  ⚠ skip page ${page} (${e.message})`);
    return { results: [] };
  }
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    // wrapper: chunk.map passa (item, index, array). Como fn é fetchPage(page, takeOverride),
    // sem o wrapper o index vira takeOverride e estraga o take.
    const res = await Promise.all(chunk.map((p) => fn(p)));
    out.push(...res);
    process.stdout.write(`\r  paginação: ${Math.min(i + size, items.length)}/${items.length}`);
  }
  process.stdout.write('\n');
  return out;
}

/** Normaliza um item do endpoint dashboard pra shape interno (igual ao snapshot anterior). */
function normalize(item) {
  const r = item.review || item;
  return {
    id: r.id,
    author: r.author || (item.customer?.name) || '—',
    title: r.title || '',
    message: r.body || '',
    rating: r.rating || 0,
    date: r.dateCreated || r.dateAdded || '',
    productId: r.productId,
    productName: (r.productTitle || '').trim(),
    location: r.location || (item.customer?.country) || '',
    verified: r.verifiedType === 2,
  };
}

async function main() {
  console.log('▶ Stamped Dashboard: pedindo página 1 pra descobrir total…');
  const first = await fetchPage(1);
  const total = first.total || 0;
  const totalPages = first.totalPages || Math.ceil(total / PAGE_SIZE);
  console.log(`  total: ${total} reviews · ${totalPages} páginas`);

  const allReviews = (first.results || []).map(normalize);

  if (totalPages > 1) {
    console.log(`▶ Puxando páginas 2..${totalPages} (concurrency ${CONCURRENCY})…`);
    const pages = [];
    for (let p = 2; p <= totalPages; p++) pages.push(p);
    const results = await inBatches(pages, CONCURRENCY, fetchPage);
    for (const r of results) {
      if (r?.results) allReviews.push(...r.results.map(normalize));
    }
  }

  console.log(`✓ Coletadas ${allReviews.length} reviews`);

  // ── Agregação por produto ────────────────────────────────────────────
  const byProductMap = {};
  for (const r of allReviews) {
    const pid = r.productId;
    if (!pid) continue;
    if (!byProductMap[pid]) {
      byProductMap[pid] = {
        productId: pid,
        productName: r.productName || '—',
        count: 0,
        sumRating: 0,
        dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }
    const p = byProductMap[pid];
    p.count += 1;
    p.sumRating += r.rating || 0;
    const rt = Math.round(r.rating || 0);
    if (rt >= 1 && rt <= 5) p.dist[rt] += 1;
  }
  // Linha-mãe derivada do prefixo antes do " - " (convenção Gocase: "{Linha} - {Estampa}")
  // - Remove " + Ebook" (brinde anexo, não parte do produto)
  // - Não agrupa temáticas licenciadas (times de futebol, etc.) como linha
  const TEMATICAS_NAO_AGRUPAR = new Set([
    'Flamengo', 'Corinthians', 'Palmeiras', 'São Paulo', 'Vasco', 'Santos',
    'Atlético-MG', 'Atlético MG', 'Atletico-MG', 'Grêmio', 'Internacional',
    'Botafogo', 'Fluminense', 'Cruzeiro', 'Bahia', 'Athletico-PR', 'Sport',
  ]);
  function extractLinhaMae(name) {
    let t = (name || '').trim();
    t = t.replace(/\s*\+\s*Ebook\b\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s*-\s*$/, '').trim();
    const i = t.indexOf(' - ');
    if (i > 0) {
      const prefix = t.slice(0, i).trim();
      if (TEMATICAS_NAO_AGRUPAR.has(prefix)) return t;
      return prefix;
    }
    return t;
  }
  const byProduct = Object.values(byProductMap).map((p) => ({
    productId: p.productId,
    productName: p.productName,
    linhaMae: extractLinhaMae(p.productName),
    count: p.count,
    avgRating: p.count > 0 ? p.sumRating / p.count : 0,
    dist: p.dist,
  })).sort((a, b) => b.count - a.count);

  // ── Agregação mensal (global) ────────────────────────────────────────
  const byMonthMap = {};
  for (const r of allReviews) {
    const ym = (r.date || '').slice(0, 7);
    if (!ym) continue;
    if (!byMonthMap[ym]) byMonthMap[ym] = { ym, count: 0, sumRating: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    const m = byMonthMap[ym];
    m.count += 1;
    m.sumRating += r.rating || 0;
    const rt = Math.round(r.rating || 0);
    if (rt >= 1 && rt <= 5) m.dist[rt] += 1;
  }
  const byMonth = Object.values(byMonthMap)
    .map((m) => ({ ym: m.ym, count: m.count, avgRating: m.count > 0 ? m.sumRating / m.count : 0, dist: m.dist }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  // ── Agregação por produto × mês (pra filtro de período no client) ───
  // Estrutura compacta: { [productId]: { [ym]: [count, sumRating, d1, d2, d3, d4, d5] } }
  const byProductMonth = {};
  for (const r of allReviews) {
    const pid = r.productId;
    const ym = (r.date || '').slice(0, 7);
    if (!pid || !ym) continue;
    if (!byProductMonth[pid]) byProductMonth[pid] = {};
    if (!byProductMonth[pid][ym]) byProductMonth[pid][ym] = [0, 0, 0, 0, 0, 0, 0];
    const cell = byProductMonth[pid][ym];
    cell[0] += 1;                                  // count
    cell[1] += r.rating || 0;                      // sumRating
    const rt = Math.round(r.rating || 0);
    if (rt >= 1 && rt <= 5) cell[1 + rt] += 1;     // dist[rt] → posições 2..6
  }

  // ── Top 500 reviews mais recentes (campos mínimos pra feed) ──────────
  const recent = allReviews
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 500)
    .map((r) => ({
      id: r.id,
      author: r.author,
      title: r.title,
      message: r.message,
      rating: r.rating,
      date: r.date,
      productId: r.productId,
      productName: r.productName,
      location: r.location,
      verified: r.verified,
    }));

  // ── Meta ────────────────────────────────────────────────────────────
  const sumRating = allReviews.reduce((s, r) => s + (r.rating || 0), 0);
  const meta = {
    collectedAt: new Date().toISOString(),
    dateFrom: DATE_FROM,
    total: allReviews.length,
    ratingMedio: allReviews.length > 0 ? sumRating / allReviews.length : 0,
    ratingAllTime: null,
    totalAllTime: total,
  };

  const out = { meta, byProduct, byProductMonth, byMonth, recent };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out));
  const sizeKb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`✓ Wrote ${OUT_FILE} (${sizeKb} KB)`);
  console.log(`  meta: ${meta.total} reviews · rating médio ${meta.ratingMedio.toFixed(2)}`);

  // Distribuição
  const distGlobal = byProduct.reduce(
    (a, p) => ({ 1: a[1] + p.dist[1], 2: a[2] + p.dist[2], 3: a[3] + p.dist[3], 4: a[4] + p.dist[4], 5: a[5] + p.dist[5] }),
    { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  );
  console.log(`  distribuição:`);
  for (const k of [5, 4, 3, 2, 1]) {
    const pct = (distGlobal[k] / meta.total * 100).toFixed(1);
    console.log(`    ${k}★: ${distGlobal[k]} (${pct}%)`);
  }
  console.log(`  byProduct: ${byProduct.length} produtos`);
  console.log(`  byMonth: ${byMonth.length} meses cobertos`);
  console.log(`  recent: ${recent.length} reviews com texto`);
}

main().catch((e) => { console.error('\n✗ Falhou:', e.message); process.exit(1); });

/**
 * Edge Function: proxy do endpoint Dashboard da Stamped.
 * Query params:
 *   - productId (singular) — busca de 1 SKU
 *   - productIds (plural, separado por vírgula, máx 50) — agrega de vários SKUs (uso: filtro por linha)
 *   - take (default 100, máx 100) — aplica a CADA chamada quando productIds tem vários
 * Auth Basic é montada no servidor — key NUNCA é exposta no client.
 */
export const config = { runtime: 'edge' };

const MAX_PRODUCT_IDS = 50;
const CONCURRENCY = 5;

export default async function handler(request: Request): Promise<Response> {
  const pub = process.env.STAMPED_PUBLIC_KEY;
  const priv = process.env.STAMPED_PRIVATE_KEY;
  const sh = process.env.STAMPED_STORE_HASH;
  if (!pub || !priv || !sh) {
    return jsonErr(500, 'Stamped env vars não configuradas no servidor');
  }

  const url = new URL(request.url);
  const productIdSingle = url.searchParams.get('productId');
  const productIdsList = url.searchParams.get('productIds');
  const take = clampInt(url.searchParams.get('take'), 1, 100, 100);

  let ids: string[] = [];
  if (productIdsList) {
    ids = productIdsList.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_PRODUCT_IDS);
  } else if (productIdSingle) {
    ids = [productIdSingle];
  }
  if (ids.length === 0) return jsonErr(400, 'productId ou productIds é obrigatório');

  const auth = 'Basic ' + btoa(`${pub}:${priv}`);

  async function fetchOne(pid: string): Promise<any[]> {
    const target = `https://stamped.io/api/v2/${sh}/dashboard/reviews?take=${take}&page=1&productId=${encodeURIComponent(pid)}`;
    const r = await fetch(target, { headers: { Authorization: auth } });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || []).map((item: any) => {
      const rv = item.review || item;
      return {
        id: rv.id,
        author: rv.author || (item.customer?.name) || '—',
        title: rv.title || '',
        message: rv.body || '',
        rating: rv.rating || 0,
        date: rv.dateCreated || rv.dateAdded || '',
        productId: rv.productId,
        productName: (rv.productTitle || '').trim(),
        location: rv.location || (item.customer?.country) || '',
        verified: rv.verifiedType === 2,
      };
    });
  }

  // Concurrency 5 — evita rate-limit da Stamped e estoura quota da Edge Function
  const all: any[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((p) => fetchOne(p)));
    for (const rows of results) all.push(...rows);
  }

  // Ordena do mais recente
  all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return new Response(
    JSON.stringify({ total: all.length, idsRequested: ids.length, reviews: all }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=300',
      },
    },
  );
}

function clampInt(raw: string | null, min: number, max: number, def: number): number {
  if (!raw) return def;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

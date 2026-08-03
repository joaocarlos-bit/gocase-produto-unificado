/**
 * Worker único do GoDeploy — substitui as 3 edge functions da Vercel
 * (api/comments, api/presence, api/stamped-reviews) e dispensa toda a
 * camada de auth própria (middleware.ts + api/auth/*).
 *
 * Autenticação: feita pelo gateway do GoDeploy (visibilidade `restricted`).
 * A identidade do usuário chega no header `X-Godeploy-User-Email`.
 *
 * Segredos: injetados em runtime via setAppSecret (env.X). Nada hardcoded.
 *   - FEEDBACK_SCRIPT_URL      (comments, presence)
 *   - FEEDBACK_SCRIPT_SECRET   (comments, presence)
 *   - STAMPED_PUBLIC_KEY       (stamped-reviews)
 *   - STAMPED_PRIVATE_KEY      (stamped-reviews)
 *   - STAMPED_STORE_HASH       (stamped-reviews)
 */

interface Env {
  FEEDBACK_SCRIPT_URL?: string;
  FEEDBACK_SCRIPT_SECRET?: string;
  STAMPED_PUBLIC_KEY?: string;
  STAMPED_PRIVATE_KEY?: string;
  STAMPED_STORE_HASH?: string;
  [key: string]: unknown;
}

interface Session {
  email: string;
  name: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Identidade vem do gateway. O nome é derivado do email (o Google login do
// gateway não repassa displayName), mantendo o mesmo fallback do código antigo.
function getSession(request: Request): Session | null {
  const email = request.headers.get('x-godeploy-user-email')?.trim().toLowerCase();
  if (!email) return null;
  const name = email.split('@')[0] || '—';
  return { email, name };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/comments') return handleComments(request, env);
    if (path === '/api/presence') return handlePresence(request, env);
    if (path === '/api/stamped-reviews') return handleStamped(request, env);

    // Qualquer outra rota é responsabilidade do asset layer / SPA fallback.
    return json(404, { error: 'Rota não encontrada' });
  },
};

/* ------------------------------------------------------------------ comments */

const MAX_LEN = 2000;

interface Comment {
  id: string;
  email: string;
  name: string;
  message: string;
  createdAt: string;
}

async function handleComments(request: Request, env: Env): Promise<Response> {
  const session = getSession(request);
  if (!session) return json(401, { error: 'Não autenticado' });

  const SCRIPT_URL = env.FEEDBACK_SCRIPT_URL;
  const SCRIPT_SECRET = env.FEEDBACK_SCRIPT_SECRET || '';
  if (!SCRIPT_URL) {
    return json(500, { error: 'Feed não configurado: defina FEEDBACK_SCRIPT_URL (e FEEDBACK_SCRIPT_SECRET) via setAppSecret.' });
  }

  if (request.method === 'GET') {
    try {
      const u = `${SCRIPT_URL}?action=list&secret=${encodeURIComponent(SCRIPT_SECRET)}`;
      const r = await fetch(u, { redirect: 'follow' });
      if (!r.ok) throw new Error(`Apps Script HTTP ${r.status}`);
      const j = await r.json();
      const comments = (j.comments || []) as Comment[];
      return json(200, { comments, total: comments.length, me: session });
    } catch (e) {
      return json(500, { error: 'Falha ao carregar comentários: ' + (e as Error).message });
    }
  }

  if (request.method === 'POST') {
    let body: { message?: unknown };
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'Body inválido' });
    }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return json(400, { error: 'Comentário vazio' });
    if (message.length > MAX_LEN) return json(400, { error: `Máximo de ${MAX_LEN} caracteres` });

    try {
      const r = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        body: JSON.stringify({
          action: 'create',
          secret: SCRIPT_SECRET,
          email: session.email,
          name: session.name,
          message,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || `Apps Script HTTP ${r.status}`);
      return json(201, { comment: j.comment as Comment });
    } catch (e) {
      return json(500, { error: 'Falha ao salvar: ' + (e as Error).message });
    }
  }

  if (request.method === 'DELETE') {
    let body: { id?: unknown };
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'Body inválido' });
    }
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return json(400, { error: 'id faltando' });
    try {
      const r = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        body: JSON.stringify({ action: 'delete', secret: SCRIPT_SECRET, id, email: session.email }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.error === 'forbidden') return json(403, { error: 'Você só pode excluir seus próprios comentários.' });
      if (j.error === 'not found') return json(404, { error: 'Comentário não encontrado.' });
      if (!r.ok || j.error) throw new Error(j.error || `Apps Script HTTP ${r.status}`);
      return json(200, { ok: true, id });
    } catch (e) {
      return json(500, { error: 'Falha ao excluir: ' + (e as Error).message });
    }
  }

  return json(405, { error: 'Método não suportado' });
}

/* ------------------------------------------------------------------ presence */

interface OnlineUser {
  email: string;
  name: string;
  lastSeen: string;
}

async function handlePresence(request: Request, env: Env): Promise<Response> {
  const session = getSession(request);
  if (!session) return json(401, { error: 'Não autenticado' });

  const SCRIPT_URL = env.FEEDBACK_SCRIPT_URL;
  const SCRIPT_SECRET = env.FEEDBACK_SCRIPT_SECRET || '';
  if (!SCRIPT_URL) {
    return json(200, { online: [{ email: session.email, name: session.name, lastSeen: '' }], me: session });
  }

  try {
    const r = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      body: JSON.stringify({ action: 'presence', secret: SCRIPT_SECRET, email: session.email, name: session.name }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `Apps Script HTTP ${r.status}`);
    return json(200, { online: (j.online || []) as OnlineUser[], me: session });
  } catch (e) {
    return json(200, { online: [{ email: session.email, name: session.name, lastSeen: '' }], me: session, warn: (e as Error).message });
  }
}

/* ------------------------------------------------------------ stamped-reviews */

const MAX_PRODUCT_IDS = 50;
const CONCURRENCY = 5;

async function handleStamped(request: Request, env: Env): Promise<Response> {
  // Protegido pelo gateway, mas mantém a checagem por consistência.
  if (!getSession(request)) return json(401, { error: 'Não autenticado' });

  const pub = env.STAMPED_PUBLIC_KEY;
  const priv = env.STAMPED_PRIVATE_KEY;
  const sh = env.STAMPED_STORE_HASH;
  if (!pub || !priv || !sh) {
    return json(500, { error: 'Stamped não configurado: defina STAMPED_PUBLIC_KEY / STAMPED_PRIVATE_KEY / STAMPED_STORE_HASH via setAppSecret.' });
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
  if (ids.length === 0) return json(400, { error: 'productId ou productIds é obrigatório' });

  const auth = 'Basic ' + btoa(`${pub}:${priv}`);

  async function fetchOne(pid: string): Promise<unknown[]> {
    const target = `https://stamped.io/api/v2/${sh}/dashboard/reviews?take=${take}&page=1&productId=${encodeURIComponent(pid)}`;
    const r = await fetch(target, { headers: { Authorization: auth } });
    if (!r.ok) return [];
    const data = await r.json();
    return ((data.results || []) as any[]).map((item: any) => {
      const rv = item.review || item;
      return {
        id: rv.id,
        author: rv.author || item.customer?.name || '—',
        title: rv.title || '',
        message: rv.body || '',
        rating: rv.rating || 0,
        date: rv.dateCreated || rv.dateAdded || '',
        productId: rv.productId,
        productName: (rv.productTitle || '').trim(),
        location: rv.location || item.customer?.country || '',
        verified: rv.verifiedType === 2,
      };
    });
  }

  const all: any[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((p) => fetchOne(p)));
    for (const rows of results) all.push(...rows);
  }

  all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return new Response(
    JSON.stringify({ total: all.length, idsRequested: ids.length, reviews: all }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } },
  );
}

function clampInt(raw: string | null, min: number, max: number, def: number): number {
  if (!raw) return def;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

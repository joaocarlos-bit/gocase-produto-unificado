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
 *   - SHEETS_API_KEY           (sheets — leitura via Google Sheets API v4)
 */

interface Env {
  FEEDBACK_SCRIPT_URL?: string;
  FEEDBACK_SCRIPT_SECRET?: string;
  STAMPED_PUBLIC_KEY?: string;
  STAMPED_PRIVATE_KEY?: string;
  STAMPED_STORE_HASH?: string;
  SHEETS_API_KEY?: string;
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
    if (path === '/api/sheets') return handleSheets(request, env);
    if (path === '/api/sales-proxy') return handleSalesProxy(request);

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

/* ------------------------------------------------------------------- sheets */
//
// Substitui a leitura via gviz (JSONP direto do navegador pro Google) por
// Google Sheets API v4, chamada aqui no worker com uma API key guardada em
// secret. Motivo: um Filtro comum (não "modo de exibição de filtro") aplicado
// na planilha esconde linhas também da leitura via gviz — a API v4 lê os
// valores "crus" da planilha, ignorando filtros.
//
// Cache em memória (por instância do worker) do mapeamento gid → título da
// aba, pra evitar uma chamada extra de metadata a cada request repetido no
// mesmo isolate. Best-effort — não é persistente entre deploys/instâncias.
const gidTitleCache = new Map<string, string>();

async function resolveSheetTitle(sheetId: string, gid: string, apiKey: string): Promise<string | null> {
  const cacheKey = `${sheetId}:${gid}`;
  const cached = gidTitleCache.get(cacheKey);
  if (cached) return cached;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties&key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data: any = await r.json().catch(() => null);
  const sheets = data?.sheets || [];
  const match = sheets.find((s: any) => String(s?.properties?.sheetId) === String(gid));
  const title = match?.properties?.title as string | undefined;
  if (title) gidTitleCache.set(cacheKey, title);
  return title || null;
}

async function handleSheets(request: Request, env: Env): Promise<Response> {
  if (!getSession(request)) return json(401, { error: 'Não autenticado' });

  const apiKey = env.SHEETS_API_KEY;
  if (!apiKey) {
    return json(500, { error: 'Sheets API não configurada: defina SHEETS_API_KEY via setAppSecret.' });
  }

  const url = new URL(request.url);
  const sheetId = url.searchParams.get('sheetId');
  const gid = url.searchParams.get('gid');
  let sheetName = url.searchParams.get('sheetName');

  if (!sheetId) return json(400, { error: 'sheetId é obrigatório' });
  if (!sheetName && !gid) return json(400, { error: 'sheetName ou gid é obrigatório' });

  try {
    if (!sheetName && gid) {
      sheetName = await resolveSheetTitle(sheetId, gid, apiKey);
      if (!sheetName) return json(404, { error: `Aba com gid ${gid} não encontrada nessa planilha.` });
    }

    const range = `'${(sheetName as string).replace(/'/g, "\\'")}'`;
    const target =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}` +
      `?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING&key=${encodeURIComponent(apiKey)}`;

    const r = await fetch(target);
    if (!r.ok) {
      const errBody: any = await r.json().catch(() => ({}));
      const msg = errBody?.error?.message || `Sheets API HTTP ${r.status}`;
      // 400 aqui geralmente significa "aba não existe" — repassa como 404
      // pra ficar consistente com o fluxo de tentativa-de-várias-abas do front.
      return json(r.status === 400 ? 404 : r.status, { error: msg });
    }

    const data: any = await r.json();
    const values: string[][] = data.values || [];
    return new Response(JSON.stringify({ values }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=30' },
    });
  } catch (e) {
    return json(500, { error: 'Falha ao ler planilha: ' + (e as Error).message });
  }
}

/* -------------------------------------------------------------- sales-proxy */
//
// Proxy do link público do Metabase (base de vendas do grupo inteiro). O
// endpoint do Metabase não manda cabeçalho CORS, então o navegador não
// consegue chamá-lo direto — o worker busca por ele e repassa só as linhas
// da Gocase (excluindo Marketplace, ainda não mapeado pra D2C/B2B/Lojas/
// Brindes), já no formato de colunas que o pipeline de agregação espera
// (mesmas chaves da aba "Sales" do Google Sheets, pra reaproveitar o parser
// no client sem mudanças). Usado por Visão Geral/Lançamentos/Produto/
// Portfólio/Estoque (via src/data/liveSnapshot.ts) pra manter os dados
// sempre atualizados, sem depender de rebuild manual.
const METABASE_SALES_URL = 'https://metabase.gocase.com.br/public/question/2e63a932-4ec5-4bac-b64a-365951bbf869.json';
const METABASE_EMPRESA = 'Gocase';
const METABASE_CANAIS_EXCLUIDOS = ['Marketplace'];

function normalizeStatus(s: unknown): string {
  const t = String(s || '').trim();
  return t.toLowerCase() === 'descontinuado' ? 'Descontinuado' : t;
}

// A pergunta pública do Metabase retorna a base de vendas do grupo inteiro,
// sem filtro por empresa (isso só acontece abaixo, depois do download) — o
// payload passa de 140MB+ e pode levar bem mais de um minuto pra baixar por
// completo. Sem timeout aqui, essa chamada pendura a requisição (às vezes a
// própria plataforma cancela), e a tela do cliente nunca sai de "Carregando
// snapshot", já que o fallback pro JSON estático só dispara quando o fetch
// FALHA — não quando ele está simplesmente lento. Falhando rápido aqui, o
// fallback funciona como pretendido. Fix definitivo: filtrar por empresa
// direto na pergunta do Metabase (fora do escopo deste worker).
const SALES_PROXY_TIMEOUT_MS = 10_000;

async function handleSalesProxy(request: Request): Promise<Response> {
  if (!getSession(request)) return json(401, { error: 'Não autenticado' });

  try {
    const r = await fetch(METABASE_SALES_URL, { signal: AbortSignal.timeout(SALES_PROXY_TIMEOUT_MS) });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return json(502, { error: `Metabase HTTP ${r.status}: ${txt.slice(0, 300)}` });
    }
    const rows: any[] = await r.json();
    if (!Array.isArray(rows)) return json(502, { error: 'Resposta do Metabase não é um array de linhas' });

    const filtered = rows
      .filter((row) => row.empresa === METABASE_EMPRESA && !METABASE_CANAIS_EXCLUIDOS.includes(row.canal))
      .map((row) => ({
        'Linha': row.linha || '',
        'Categoria': row.categoria || '',
        'SKU Único': row.chave || '',
        'Status': normalizeStatus(row.status),
        'Quantidade': row.quantidade,
        'Faturamento': row.faturamento,
        'Valor Unitário': row.ticket,
        'Mês': row.mes,
        'Ano': row.ano,
        'Data': row.data,
        'Canal': row.canal,
        'Natureza': row.natureza,
      }));

    return new Response(JSON.stringify({ rows: filtered }), {
      status: 200,
      // Cache curto na edge — a base de vendas é grande e não muda minuto a
      // minuto; evita martelar o Metabase a cada carregamento de página.
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=600' },
    });
  } catch (e) {
    return json(502, { error: 'Falha ao buscar vendas: ' + (e as Error).message });
  }
}

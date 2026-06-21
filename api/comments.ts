import { jwtVerify } from 'jose';

export const config = { runtime: 'edge' };

/*
 * Feed de Comentários & Feedbacks (seção "Geral").
 * - GET  → lista os comentários (mais recentes primeiro).
 * - POST → cria um comentário { message }. O autor (email/nome) vem do JWT
 *          da sessão (cookie auth_session), nunca do body → não tem spoof.
 *
 * Persistência: Google Sheets via Apps Script web app (sem produto de Storage
 * da Vercel). A URL e o segredo do script ficam em env vars server-side:
 *   - FEEDBACK_SCRIPT_URL    → URL do web app publicado
 *   - FEEDBACK_SCRIPT_SECRET → segredo compartilhado (impede POST anônimo)
 * O .gs pra publicar está em scripts/feedback-apps-script.gs.
 */

const MAX_LEN = 2000;

interface Comment {
  id: string;
  email: string;
  name: string;
  message: string;
  createdAt: string; // ISO
}

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getSession(request: Request): Promise<{ email: string; name: string } | null> {
  const token = parseCookie(request.headers.get('cookie') || '', 'auth_session');
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const email = (payload.email as string | undefined) || '';
    const name = (payload.name as string | undefined) || email.split('@')[0] || '—';
    if (!email) return null;
    return { email, name };
  } catch {
    return null;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export default async function handler(request: Request): Promise<Response> {
  const session = await getSession(request);
  if (!session) return json(401, { error: 'Não autenticado' });

  const SCRIPT_URL = process.env.FEEDBACK_SCRIPT_URL;
  const SCRIPT_SECRET = process.env.FEEDBACK_SCRIPT_SECRET || '';
  if (!SCRIPT_URL) {
    return json(500, { error: 'Feed não configurado: defina FEEDBACK_SCRIPT_URL (e FEEDBACK_SCRIPT_SECRET) nas env vars.' });
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

  return json(405, { error: 'Método não suportado' });
}

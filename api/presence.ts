import { jwtVerify } from 'jose';

export const config = { runtime: 'edge' };

/*
 * Presença online (heartbeat por polling).
 * POST → registra que o usuário da sessão está online (bate ponto) e devolve
 *        a lista de quem foi visto na janela recente.
 * Identidade (email/nome) vem do JWT da sessão (cookie auth_session).
 * Persistência: mesma planilha do feed via Apps Script (aba "Presenca").
 *   env: FEEDBACK_SCRIPT_URL / FEEDBACK_SCRIPT_SECRET.
 */

interface OnlineUser { email: string; name: string; lastSeen: string; }

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
  if (!SCRIPT_URL) return json(200, { online: [{ email: session.email, name: session.name, lastSeen: '' }], me: session });

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
    // Degrada: mostra ao menos o próprio usuário como online
    return json(200, { online: [{ email: session.email, name: session.name, lastSeen: '' }], me: session, warn: (e as Error).message });
  }
}

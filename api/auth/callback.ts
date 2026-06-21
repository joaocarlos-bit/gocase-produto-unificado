import { SignJWT } from 'jose';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return textResponse(400, `OAuth error: ${oauthError}`);
  }
  if (!code || !state) {
    return textResponse(400, 'Missing code or state');
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const stateCookie = parseCookie(cookieHeader, 'auth_state');
  const returnTo = parseCookie(cookieHeader, 'auth_return') || '/';

  if (!stateCookie || stateCookie !== state) {
    return textResponse(400, 'Invalid state (CSRF check failed)');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${url.origin}/api/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return textResponse(500, `Token exchange failed: ${errText}`);
  }

  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) {
    return textResponse(500, 'No id_token in response');
  }

  let payload: Record<string, unknown>;
  try {
    payload = decodeJwtPayload(tokens.id_token);
  } catch {
    return textResponse(500, 'Could not decode id_token');
  }

  const email = (payload.email as string | undefined)?.toLowerCase();
  const emailVerified = payload.email_verified as boolean | undefined;
  const hd = (payload.hd as string | undefined)?.toLowerCase();
  const name = payload.name as string | undefined;

  if (!email || !emailVerified) {
    return textResponse(403, 'Email não verificado pelo Google');
  }

  const allowedDomains = (process.env.ALLOWED_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const emailDomain = email.split('@')[1];
  const allowed =
    (hd && allowedDomains.includes(hd)) ||
    (emailDomain && allowedDomains.includes(emailDomain));

  if (!allowed) {
    return textResponse(
      403,
      `Acesso negado: ${email} não pertence a ${allowedDomains.join(' ou ')}.`,
    );
  }

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const sessionToken = await new SignJWT({ email, name, hd })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  const sevenDays = 60 * 60 * 24 * 7;
  const headers = new Headers();
  headers.set('Location', returnTo);
  headers.append(
    'Set-Cookie',
    `auth_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sevenDays}`,
  );
  headers.append('Set-Cookie', `auth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  headers.append('Set-Cookie', `auth_return=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);

  return new Response(null, { status: 302, headers });
}

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  // atob devolve uma binary string (Latin-1); decodificar como UTF-8 pra não
  // estragar acentos no nome (ex.: "João" → "JoÃ£o").
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

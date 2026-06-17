import { jwtVerify } from 'jose';

export const config = {
  matcher: '/((?!api/auth|_vercel|favicon\\.ico|robots\\.txt).*)',
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  const cookieHeader = request.headers.get('cookie') || '';
  const sessionToken = parseCookie(cookieHeader, 'auth_session');

  if (sessionToken) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
      await jwtVerify(sessionToken, secret);
      return;
    } catch {
      // fall through to redirect
    }
  }

  const loginUrl = new URL('/api/auth/login', request.url);
  loginUrl.searchParams.set('returnTo', url.pathname + url.search);
  return Response.redirect(loginUrl.toString(), 302);
}

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers();
  headers.set('Location', url.origin);
  headers.append('Set-Cookie', `auth_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return new Response(null, { status: 302, headers });
}

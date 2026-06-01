/*
 * graph-auth.cjs — autenticação Microsoft Graph via device-code flow.
 *
 * Substitui a API key pública do Google: o SharePoint/Excel só fala Graph,
 * que exige OAuth. Usamos o fluxo de "device code" (app público, sem secret):
 *   - 1ª vez: imprime um código + URL microsoft.com/devicelogin pra você logar.
 *   - depois: usa o refresh_token cacheado em ~/.gocase-graph-token.json,
 *     então os refreshes seguintes são silenciosos (sem login).
 *
 * App registration (Entra ID, tenant Gocase):
 *   - client_id / tenant_id vêm de .env.local (GRAPH_CLIENT_ID / GRAPH_TENANT_ID)
 *   - "Allow public client flows" = Yes
 *   - permissão delegada Microsoft Graph: Files.Read.All
 *
 * Exporta: getGraphToken({ clientId, tenantId }) -> Promise<accessToken>
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TOKEN_CACHE = path.join(os.homedir(), '.gocase-graph-token.json');
// offline_access = ganha refresh_token; Files.Read.All = ler o .xlsx no SharePoint.
const SCOPE = 'offline_access Files.Read.All User.Read';

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeCache(obj) {
  try {
    fs.writeFileSync(TOKEN_CACHE, JSON.stringify(obj, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn(`  (aviso) não consegui gravar cache de token: ${e.message}`);
  }
}

function tokenUrl(tenantId) {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Troca refresh_token por um access_token novo. Retorna null se falhar. */
async function tryRefresh(clientId, tenantId, refreshToken) {
  const res = await fetch(tokenUrl(tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
      scope: SCOPE,
    }),
  });
  const t = await res.json().catch(() => ({}));
  if (t.access_token) return t;
  return null;
}

/** Device-code flow interativo. Imprime código/URL e faz polling até logar. */
async function deviceCodeLogin(clientId, tenantId) {
  const dcRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: SCOPE }),
    },
  );
  const dc = await dcRes.json();
  if (!dc.device_code) {
    throw new Error(`devicecode falhou: ${JSON.stringify(dc)}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  LOGIN MICROSOFT NECESSÁRIO (só desta vez)');
  console.log('═'.repeat(60));
  console.log('  ' + (dc.message || `Abra ${dc.verification_uri} e digite o código ${dc.user_code}`));
  console.log('═'.repeat(60) + '\n');

  const intervalMs = (dc.interval || 5) * 1000;
  const deadline = Date.now() + (dc.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const res = await fetch(tokenUrl(tenantId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: dc.device_code,
      }),
    });
    const t = await res.json().catch(() => ({}));
    if (t.access_token) return t;
    if (t.error === 'authorization_pending') continue;
    if (t.error === 'slow_down') { await sleep(5000); continue; }
    throw new Error(`token: ${t.error_description || t.error || 'desconhecido'}`);
  }
  throw new Error('login expirou (device code). Rode de novo.');
}

/**
 * Retorna um access_token válido do Graph.
 * Ordem: refresh_token cacheado → device-code login interativo.
 */
async function getGraphToken({ clientId, tenantId }) {
  if (!clientId || !tenantId) {
    throw new Error('GRAPH_CLIENT_ID / GRAPH_TENANT_ID ausentes (.env.local).');
  }

  const cache = readCache();
  if (
    cache &&
    cache.refresh_token &&
    cache.clientId === clientId &&
    cache.tenantId === tenantId
  ) {
    const refreshed = await tryRefresh(clientId, tenantId, cache.refresh_token);
    if (refreshed && refreshed.access_token) {
      writeCache({
        clientId,
        tenantId,
        refresh_token: refreshed.refresh_token || cache.refresh_token,
      });
      console.log('  ✓ token renovado via cache (sem login)');
      return refreshed.access_token;
    }
    console.log('  (cache de token expirado — pedindo login)');
  }

  const t = await deviceCodeLogin(clientId, tenantId);
  writeCache({ clientId, tenantId, refresh_token: t.refresh_token });
  console.log('  ✓ login concluído e token cacheado');
  return t.access_token;
}

module.exports = { getGraphToken };

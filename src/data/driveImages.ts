// Imagens de criativos no Drive — portado do dash-produto (loadDriveImages).
// Um Apps Script publicado como Web App devolve, via JSONP, um manifesto
// { products: { nomeNorm: { label, ids[] } } }. As imagens carregam do CDN
// lh3.googleusercontent.com/d/{id}. Manifesto é cacheado por sessão; o cold
// start (~30s, 73 pastas) é mascarado pelo pre-warm na montagem da tela.

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTcYDRpDEw_P743elLmG3Y6i6hbLoi8laglW-x9QUaNgJ13n_4sYka9K5QP1jSKiIT0g/exec';
// Apps Script para imagens de Testes CTR (pasta: 1j4PKdBIptbsQOxn6CJTzuaOeghLj0thd).
// Publique scripts/ctr-images-apps-script.gs como Web App e cole a URL abaixo.
// Enquanto null, usa o manifesto do Waitlist + coluna "Imagem" da planilha como fallback.
const ENDPOINT_CTR: string | null = 'https://script.google.com/macros/s/AKfycbzBqSc6bZVpcX7O-up6bnEtN0L6XFeKUsYwxymGanBrunLfdw1EleIWEzhq7XijHWup/exec';

export interface DriveProduct { label: string; ids: string[]; }
export type DriveManifest = Record<string, DriveProduct>;

/** Manifesto de imagens locais gerado pelo build-standalone/refresh-ctr-images. */
export interface LocalCtrProduct { label: string; urls: string[]; }
export type LocalCtrManifest = Record<string, LocalCtrProduct>;

let _cache: Promise<DriveManifest> | null = null;
let _ctrCache: Promise<DriveManifest> | null = null;

/** Extrai o ID de arquivo do Drive de qualquer formato de URL comum. */
export function extractDriveId(url: string): string | null {
  if (!url) return null;
  // /file/d/{id}/ ou /d/{id}=
  let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // ?id={id} ou &id={id}
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // lh3.googleusercontent.com/d/{id} ou drive.google.com/.../d/{id}
  m = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
  if (m) return m[1];
  return null;
}

export function normalizeProductName(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Endpoint thumbnail do Drive — mais confiável p/ embed que lh3 (que bloqueia
// hotlink por referrer de outras origens). Combinar com referrerPolicy="no-referrer".
export function driveImageUrl(id: string, width = 1200): string {
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + width;
}
// Fallback alternativo (lh3) caso o thumbnail falhe pra algum arquivo.
export function driveImageUrlAlt(id: string, width = 1200): string {
  return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=w' + width;
}

/** Carrega (e cacheia) o manifesto de imagens do Drive via JSONP (Waitlist). */
export function loadDriveImages(): Promise<DriveManifest> {
  if (_cache) return _cache;
  _cache = new Promise<DriveManifest>((resolve, reject) => {
    const cb = '_dimgCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      done = true;
      try { delete w[cb]; } catch { w[cb] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    w[cb] = (data: any) => {
      if (done) return;
      cleanup();
      resolve((data && data.products) || {});
    };
    script.onerror = () => {
      if (done) return;
      cleanup();
      _cache = null;
      reject(new Error('Falha ao carregar manifesto de imagens'));
    };
    setTimeout(() => {
      if (done) return;
      cleanup();
      _cache = null;
      reject(new Error('Timeout ao carregar imagens do Drive'));
    }, 60000);
    const sep = ENDPOINT.indexOf('?') >= 0 ? '&' : '?';
    script.src = ENDPOINT + sep + 'callback=' + cb + '&t=' + Date.now();
    document.body.appendChild(script);
  });
  return _cache;
}

/**
 * Lê o manifesto de imagens CTR embutido no HTML pelo build-standalone.
 * Retorna null se não existir (modo servidor/dev).
 */
export function getLocalCtrImages(): LocalCtrManifest | null {
  const m = (window as unknown as Record<string, unknown>).__CTR_LOCAL_IMAGES__;
  if (m && typeof m === 'object') return m as LocalCtrManifest;
  return null;
}

/** Carrega (e cacheia) o manifesto de imagens de Testes CTR via JSONP.
 *  Retorna {} imediatamente se ENDPOINT_CTR não estiver configurado. */
export function loadCtrImages(): Promise<DriveManifest> {
  if (!ENDPOINT_CTR) return Promise.resolve({});
  if (_ctrCache) return _ctrCache;
  _ctrCache = new Promise<DriveManifest>((resolve, reject) => {
    const cb = '_ctrimgCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      done = true;
      try { delete w[cb]; } catch { w[cb] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    w[cb] = (data: any) => {
      if (done) return;
      cleanup();
      resolve((data && data.products) || {});
    };
    script.onerror = () => {
      if (done) return;
      cleanup();
      _ctrCache = null;
      reject(new Error('Falha ao carregar manifesto de imagens CTR'));
    };
    setTimeout(() => {
      if (done) return;
      cleanup();
      _ctrCache = null;
      reject(new Error('Timeout ao carregar imagens CTR'));
    }, 60000);
    const sep = ENDPOINT_CTR.indexOf('?') >= 0 ? '&' : '?';
    script.src = ENDPOINT_CTR + sep + 'callback=' + cb + '&t=' + Date.now();
    document.body.appendChild(script);
  });
  return _ctrCache;
}

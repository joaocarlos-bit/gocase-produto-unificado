// Imagens de criativos no Drive — portado do dash-produto (loadDriveImages).
// Um Apps Script publicado como Web App devolve, via JSONP, um manifesto
// { products: { nomeNorm: { label, ids[] } } }. As imagens carregam do CDN
// lh3.googleusercontent.com/d/{id}. Manifesto é cacheado por sessão; o cold
// start (~30s, 73 pastas) é mascarado pelo pre-warm na montagem da tela.

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTcYDRpDEw_P743elLmG3Y6i6hbLoi8laglW-x9QUaNgJ13n_4sYka9K5QP1jSKiIT0g/exec';

export interface DriveProduct { label: string; ids: string[]; }
export type DriveManifest = Record<string, DriveProduct>;

let _cache: Promise<DriveManifest> | null = null;

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

/** Carrega (e cacheia) o manifesto de imagens do Drive via JSONP. */
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
      _cache = null; // permite retry
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

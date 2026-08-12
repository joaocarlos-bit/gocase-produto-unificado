// Imagem do produto extraída do relatório (planilha) de teste — Engenharia.
// Um Apps Script publicado como Web App (scripts/report-image-apps-script.gs)
// abre a planilha do relatório, extrai a foto da coluna "IMAGE" e devolve,
// via JSONP, a URL de um thumbnail cacheado no Drive. Carregado sob demanda
// (por relatorioUrl, ao abrir o modal), não em massa — evita centenas de
// chamadas ao abrir a tela.

// Publique scripts/report-image-apps-script.gs como Web App e cole a URL
// (termina em /exec) abaixo. Enquanto null, o botão de imagem fica desabilitado.
const ENDPOINT: string | null = 'https://script.google.com/a/macros/gocase.com/s/AKfycbwtabDNhGggehYjnTmzsMlh5x1gXIZUiUWz5CC0FNQGNi7Bb4T4BrZkuE9yq2D4Lh92/exec';

const _cache = new Map<string, Promise<string | null>>();

export function reportImagesConfigured(): boolean {
  return !!ENDPOINT;
}

/** Carrega (e cacheia por sessão) a imagem do produto de um relatório. */
export function loadReportImage(relatorioUrl: string): Promise<string | null> {
  if (!ENDPOINT) return Promise.reject(new Error('Endpoint de imagens não configurado (src/data/reportImages.ts)'));
  const cached = _cache.get(relatorioUrl);
  if (cached) return cached;

  const p = new Promise<string | null>((resolve, reject) => {
    const cb = '_repimgCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
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
      if (data && data.error) { reject(new Error(data.error)); return; }
      resolve((data && data.imageUrl) || null);
    };
    script.onerror = () => {
      if (done) return;
      cleanup();
      _cache.delete(relatorioUrl);
      reject(new Error('Falha ao carregar imagem do relatório'));
    };
    setTimeout(() => {
      if (done) return;
      cleanup();
      _cache.delete(relatorioUrl);
      reject(new Error('Tempo esgotado ao carregar imagem do relatório'));
    }, 30000);
    const sep = ENDPOINT!.indexOf('?') >= 0 ? '&' : '?';
    script.src = ENDPOINT + sep + 'url=' + encodeURIComponent(relatorioUrl) + '&callback=' + cb;
    document.body.appendChild(script);
  });

  _cache.set(relatorioUrl, p);
  return p;
}

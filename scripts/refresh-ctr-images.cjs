/**
 * refresh-ctr-images.cjs
 * Atualiza o manifesto de imagens CTR no dashboard-gocase.html existente
 * sem precisar fazer um rebuild completo.
 *
 * Uso: npm run refresh-ctr-images
 *
 * Estrutura de pastas esperada:
 *   dist/imagens/testes/{Nome Exato do Teste}/foto1.jpg
 *   dist/imagens/testes/{Nome Exato do Teste}/foto2.png
 *   ...
 *
 * O nome da pasta deve ser igual ao nome do teste na planilha.
 */

const fs = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const IMG_DIR  = path.join(DIST_DIR, 'imagens', 'testes');
const OUT_FILE = path.join(DIST_DIR, 'dashboard-gocase.html');

const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

function normalizeProductName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ── Escaneia dist/imagens/testes/ ────────────────────────────────────────────
if (!fs.existsSync(IMG_DIR)) {
  console.log('⚠  dist/imagens/testes/ não encontrada. Crie as pastas e tente novamente.');
  console.log('   Exemplo: dist/imagens/testes/Tote Carry - duocolor/foto.jpg');
  process.exit(0);
}

const manifest = {};
const folders = fs.readdirSync(IMG_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)
  .sort();

for (const folder of folders) {
  const files = fs.readdirSync(path.join(IMG_DIR, folder), { withFileTypes: true })
    .filter(e => e.isFile() && IMG_EXTS.has(path.extname(e.name).toLowerCase()))
    .map(e => e.name)
    .sort();
  if (!files.length) continue;
  const key = normalizeProductName(folder);
  manifest[key] = { label: folder, urls: files.map(f => `imagens/testes/${folder}/${f}`) };
  console.log(`  ✓ ${folder}  (${files.length} imagem${files.length > 1 ? 'ns' : ''})`);
}

const count = Object.keys(manifest).length;
if (count === 0) {
  console.log('⚠  Nenhuma imagem encontrada em dist/imagens/testes/');
  console.log('   Verifique se as pastas contêm arquivos .jpg, .png, .webp ou similar.');
  process.exit(0);
}

// ── Injeta / substitui window.__CTR_LOCAL_IMAGES__ no HTML ───────────────────
if (!fs.existsSync(OUT_FILE)) {
  console.error(`✗ ${OUT_FILE} não encontrado.`);
  console.error('  Execute primeiro: npm run build:standalone');
  process.exit(1);
}

const manifestLine = `window.__CTR_LOCAL_IMAGES__ = ${JSON.stringify(manifest)};`;
let html = fs.readFileSync(OUT_FILE, 'utf8');

if (html.includes('window.__CTR_LOCAL_IMAGES__')) {
  html = html.replace(/window\.__CTR_LOCAL_IMAGES__\s*=\s*\{[^;]*\};/, manifestLine);
  console.log('\n↺ Manifesto CTR atualizado no HTML existente.');
} else {
  // Injeta no bloco <script> existente antes de </script></head>
  html = html.replace(/(<script>)([\s\S]*?)(window\.__GOCASE_STAMPED__)/, `$1$2${manifestLine}\n$3`);
  if (!html.includes('__CTR_LOCAL_IMAGES__')) {
    // Fallback: adiciona bloco separado antes de </head>
    html = html.replace('</head>', `<script>${manifestLine}</script>\n</head>`);
  }
  console.log('\n+ Manifesto CTR injetado no HTML.');
}

fs.writeFileSync(OUT_FILE, html, 'utf8');
console.log(`✅ ${count} pasta${count > 1 ? 's' : ''} de teste${count > 1 ? 's' : ''} indexada${count > 1 ? 's' : ''}.`);
console.log('   Recarregue o dashboard-gocase.html no navegador.\n');

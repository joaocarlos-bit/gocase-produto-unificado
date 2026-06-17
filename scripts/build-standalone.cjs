/**
 * build-standalone.cjs
 * Gera dashboard-gocase.html — arquivo único, abre direto no navegador sem servidor.
 *
 * Uso: npm run build:standalone
 *
 * O que faz:
 *   1. Roda "vite build" com BUILD_STANDALONE=1 (inline JS/CSS via vite-plugin-singlefile)
 *   2. Lê os JSONs de dados de public/data/
 *   3. Embute os dados como variáveis globais no HTML antes do </head>
 *   4. Salva o resultado em dist/dashboard-gocase.html
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

function normalizeProductName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scanCtrImages(imagesDir) {
  if (!fs.existsSync(imagesDir)) return {};
  const manifest = {};
  const folders = fs.readdirSync(imagesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
  for (const folder of folders) {
    const files = fs.readdirSync(path.join(imagesDir, folder), { withFileTypes: true })
      .filter(e => e.isFile() && IMG_EXTS.has(path.extname(e.name).toLowerCase()))
      .map(e => e.name)
      .sort();
    if (!files.length) continue;
    const key = normalizeProductName(folder);
    manifest[key] = { label: folder, urls: files.map(f => `imagens/testes/${folder}/${f}`) };
  }
  return manifest;
}

const ROOT = path.resolve(__dirname, '..');
const DIST_HTML = path.join(ROOT, 'dist', 'index.html');
const OUT_FILE  = path.join(ROOT, 'dist', 'dashboard-gocase.html');

const DATA_FILES = [
  { file: path.join(ROOT, 'public', 'data', 'processed-data.json'), global: '__GOCASE_PROCESSED__' },
  { file: path.join(ROOT, 'public', 'data', 'sales-by-sku.json'),   global: '__GOCASE_SKU__' },
  { file: path.join(ROOT, 'public', 'data', 'stamped.json'),        global: '__GOCASE_STAMPED__', optional: true },
];

// ── 1. Build ─────────────────────────────────────────────────────────────────
console.log('📦 Compilando (vite build standalone)…');
try {
  execSync('npx vite build', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, BUILD_STANDALONE: '1' },
  });
} catch {
  console.error('✗ Build falhou.');
  process.exit(1);
}

if (!fs.existsSync(DIST_HTML)) {
  console.error('✗ dist/index.html não encontrado após o build.');
  process.exit(1);
}

// ── 2. Lê dados ───────────────────────────────────────────────────────────────
let dataScript = '<script>\n';
for (const { file, global: varName, optional } of DATA_FILES) {
  if (!fs.existsSync(file)) {
    if (optional) {
      dataScript += `window.${varName} = null;\n`;
      console.warn(`⚠  ${path.basename(file)} não encontrado — ${varName} = null`);
    } else {
      console.error(`✗ Arquivo de dados obrigatório não encontrado: ${file}`);
      console.error('  Execute primeiro: npm run refresh');
      process.exit(1);
    }
    continue;
  }
  const raw = fs.readFileSync(file, 'utf8');
  dataScript += `window.${varName} = ${raw};\n`;
  const kb = (Buffer.byteLength(raw, 'utf8') / 1024).toFixed(1);
  console.log(`  ✓ ${path.basename(file)} (${kb} KB) → window.${varName}`);
}

// Imagens CTR locais: dist/imagens/testes/{nomeTeste}/
const CTR_IMAGES_DIR = path.join(ROOT, 'dist', 'imagens', 'testes');
const ctrManifest = scanCtrImages(CTR_IMAGES_DIR);
const ctrCount = Object.keys(ctrManifest).length;
dataScript += `window.__CTR_LOCAL_IMAGES__ = ${JSON.stringify(ctrManifest)};\n`;
if (ctrCount > 0) {
  console.log(`  ✓ ${ctrCount} pastas de testes CTR indexadas → window.__CTR_LOCAL_IMAGES__`);
} else {
  console.log('  ℹ  Nenhuma pasta em dist/imagens/testes/ — __CTR_LOCAL_IMAGES__ vazio');
}

dataScript += '</script>';

// ── 3. Injeta antes de </head> ────────────────────────────────────────────────
let html = fs.readFileSync(DIST_HTML, 'utf8');
if (html.includes('</head>')) {
  html = html.replace('</head>', `${dataScript}\n</head>`);
} else {
  html = dataScript + '\n' + html;
}

// ── 4. Salva ──────────────────────────────────────────────────────────────────
fs.writeFileSync(OUT_FILE, html, 'utf8');
const sizeMB = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
console.log(`\n✅ Arquivo gerado: dist/dashboard-gocase.html (${sizeMB} MB)`);
console.log('   Abra direto no Chrome com duplo clique!\n');

/**
 * Apps Script — Manifesto de imagens para Testes CTR
 *
 * COMO PUBLICAR:
 * 1. Acesse https://script.google.com e crie um novo projeto
 * 2. Cole todo este código no editor
 * 3. Clique em "Implantar" → "Nova implantação"
 * 4. Tipo: "Aplicativo da Web"
 * 5. Executar como: "Eu" | Quem tem acesso: "Qualquer pessoa"
 * 6. Copie a URL gerada e cole em driveImages.ts → ENDPOINT_CTR
 *
 * COMO ATUALIZAR (depois de editar o código, mantendo a mesma URL /exec):
 * 1. Cole o código novo no editor (substitua tudo) e salve.
 * 2. "Implantar" → "Gerenciar implantações" → ícone de lápis na implantação
 *    ativa → em "Versão", escolha "Nova versão" → "Implantar".
 *    (Criar uma "Nova implantação" geraria uma URL diferente da já usada.)
 *
 * ESTRUTURA DE PASTAS ESPERADA no Drive:
 * Pasta CTR (ID: 1j4PKdBIptbsQOxn6CJTzuaOeghLj0thd)
 *   ├── Tote Carry - duocolor/
 *   │     ├── foto1.jpg
 *   │     └── foto2.jpg
 *   ├── Mochila Voyage - Bicolor/
 *   │     └── criativo_a.png
 *   └── ...
 *
 * Cada subpasta = um teste CTR. O nome da pasta deve ser igual (ou próximo)
 * ao nome do teste na planilha.
 *
 * CACHE: varrer todas as subpastas do Drive é caro (~50s com ~70 pastas) e
 * antes era refeito em TODA requisição, deixando o carrossel de imagens
 * lento para qualquer usuário. Agora o resultado fica em CacheService por
 * até 6h (o máximo permitido) e só é reconstruído quando o cache expira ou
 * quando chamado com ?refresh=1 — use esse parâmetro logo depois de subir
 * imagens novas, para vê-las sem esperar o cache expirar sozinho.
 */

var CTR_FOLDER_ID = '1j4PKdBIptbsQOxn6CJTzuaOeghLj0thd';
var CACHE_KEY = 'ctr_manifest_v1';
var CACHE_TTL_SECONDS = 21600; // 6h — teto do CacheService
var CACHE_CHUNK_SIZE = 90000; // margem de segurança abaixo do limite de 100KB/chave

function doGet(e) {
  var callback = (e && e.parameter && e.parameter.callback) || 'callback';
  var forceRefresh = !!(e && e.parameter && e.parameter.refresh === '1');

  var json = forceRefresh ? null : readManifestCache();
  if (!json) {
    json = JSON.stringify({ products: buildManifest() });
    writeManifestCache(json);
  }

  var body = callback + '(' + json + ')';
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/** Varre o Drive de verdade (lento). Só roda em cache miss ou ?refresh=1. */
function buildManifest() {
  var products = {};

  try {
    var folder = DriveApp.getFolderById(CTR_FOLDER_ID);
    var subfolders = folder.getFolders();

    while (subfolders.hasNext()) {
      var sub = subfolders.next();
      var label = sub.getName();
      var normKey = normalizeName(label);
      var files = sub.getFiles();
      var ids = [];

      while (files.hasNext()) {
        var file = files.next();
        var mime = file.getMimeType();
        if (mime.indexOf('image/') === 0) {
          ids.push(file.getId());
        }
      }

      if (ids.length > 0) {
        products[normKey] = { label: label, ids: ids };
      }
    }
  } catch (err) {
    // Retorna vazio em caso de erro de permissão
  }

  return products;
}

/** Lê o manifesto do CacheService (dividido em pedaços de até 90KB). null se ausente/expirado/incompleto. */
function readManifestCache() {
  var cache = CacheService.getScriptCache();
  var countStr = cache.get(CACHE_KEY + '_count');
  if (!countStr) return null;

  var count = parseInt(countStr, 10);
  var chunks = [];
  for (var i = 0; i < count; i++) {
    var chunk = cache.get(CACHE_KEY + '_' + i);
    if (chunk === null) return null; // pedaço expirou individualmente → reconstrói tudo
    chunks.push(chunk);
  }
  return chunks.join('');
}

/** Grava o manifesto no CacheService, dividido em pedaços de até 90KB. */
function writeManifestCache(json) {
  var cache = CacheService.getScriptCache();
  var count = Math.ceil(json.length / CACHE_CHUNK_SIZE) || 1;
  var values = {};
  for (var i = 0; i < count; i++) {
    values[CACHE_KEY + '_' + i] = json.substring(i * CACHE_CHUNK_SIZE, (i + 1) * CACHE_CHUNK_SIZE);
  }
  values[CACHE_KEY + '_count'] = String(count);
  cache.putAll(values, CACHE_TTL_SECONDS);
}

/** Mesma normalização do frontend (driveImages.ts → normalizeProductName). */
function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêëẽ]/g, 'e')
    .replace(/[ìíîïĩ]/g, 'i')
    .replace(/[òóôõöø]/g, 'o')
    .replace(/[ùúûüũ]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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
 */

var CTR_FOLDER_ID = '1j4PKdBIptbsQOxn6CJTzuaOeghLj0thd';

function doGet(e) {
  var callback = (e && e.parameter && e.parameter.callback) || 'callback';
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

  var body = callback + '(' + JSON.stringify({ products: products }) + ')';
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
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

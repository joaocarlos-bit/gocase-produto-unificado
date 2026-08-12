/**
 * Apps Script — Imagem do produto extraída do relatório de teste (Engenharia).
 *
 * O relatório de cada teste (coluna "Relatorio Arquivo" do board Monday
 * "03 - Warehouse Samples") é uma planilha Google Sheets com uma coluna
 * "IMAGE" contendo a foto do produto — inserida direto na célula ou como
 * imagem flutuante sobre ela (não é uma URL de texto, por isso não dá pra
 * ler via gviz). Este script abre a planilha (rodando com a conta de quem
 * publicou, que já tem acesso de leitura), extrai essa imagem, salva uma
 * cópia numa pasta própria no Drive (compartilhada "qualquer pessoa com o
 * link") e devolve a URL de thumbnail — no mesmo formato que driveImageUrl()
 * já usa em src/data/driveImages.ts.
 *
 * COMO PUBLICAR (primeira vez):
 * 1. Acesse https://script.google.com e crie um novo projeto (com a conta
 *    Google que tem acesso de leitura às planilhas de relatório).
 * 2. Cole todo este código no editor.
 * 3. Clique em "Implantar" → "Nova implantação".
 * 4. Tipo: "Aplicativo da Web".
 * 5. Executar como: "Eu" | Quem tem acesso: quem for acessar o app (ex.:
 *    "Qualquer pessoa da gocase.com").
 * 6. Copie a URL gerada (termina em /exec) e cole em
 *    src/data/reportImages.ts → ENDPOINT.
 *
 * COMO ATUALIZAR (depois de editar o código, mantendo a mesma URL /exec):
 * 1. Cole o código novo no editor (substitua tudo) e salve.
 * 2. "Implantar" → "Gerenciar implantações" → ícone de lápis na implantação
 *    ativa → em "Versão", escolha "Nova versão" → "Implantar".
 *    (Criar uma "Nova implantação" geraria uma URL diferente da já usada.)
 *
 * PREMISSA: existe, em algum lugar das primeiras SCAN_ROWS linhas/colunas da
 * aba, uma célula de texto que começa com "image" (o cabeçalho da coluna de
 * foto) — a foto do produto fica numa das linhas seguintes, na mesma coluna
 * (célula ou imagem flutuante). Não presume linha/coluna fixa: alguns
 * relatórios têm banners/logos ocupando as primeiras linhas antes do
 * cabeçalho "real" aparecer.
 */

var SCAN_ROWS = 30; // procura o cabeçalho "image" nas primeiras N linhas da aba
var DATA_ROWS_AFTER_HEADER = 5; // procura a foto nas N linhas após o cabeçalho encontrado

function doGet(e) {
  var callback = (e && e.parameter && e.parameter.callback) || 'callback';
  var url = e && e.parameter && e.parameter.url;
  var result = { imageUrl: null, error: null, debug: null };

  try {
    if (!url) throw new Error('missing url param');
    var ssId = extractSpreadsheetId(url);
    if (!ssId) throw new Error('nao foi possivel extrair o ID da planilha do relatorioUrl');

    var ss = SpreadsheetApp.openById(ssId);
    var gid = extractGid(url);
    var sheet = gid ? findSheetByGid(ss, gid) : ss.getSheets()[0];
    if (!sheet) throw new Error('aba nao encontrada (gid ' + gid + ')');

    var cacheKey = ssId + '_' + sheet.getSheetId();
    var extracted = extractProductImage(sheet, cacheKey);
    result.imageUrl = extracted.imageUrl;
    result.debug = extracted.debug;
  } catch (err) {
    result.error = String((err && err.message) || err);
  }

  var body = callback + '(' + JSON.stringify(result) + ')';
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function extractSpreadsheetId(url) {
  var m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function extractGid(url) {
  var m = String(url).match(/[?&#]gid=(\d+)/);
  return m ? m[1] : null;
}

function findSheetByGid(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === String(gid)) return sheets[i];
  }
  return null;
}

/** Procura, nas primeiras SCAN_ROWS linhas, uma célula de texto que comece
 *  com "image" — devolve { row, col } (1-indexado) ou null. Não presume
 *  que o cabeçalho está na linha 1: banners/logos podem ocupar linhas antes. */
function findImageHeaderCell(sheet) {
  var lastCol = sheet.getLastColumn();
  var lastRow = Math.min(sheet.getLastRow(), SCAN_ROWS);
  if (lastCol < 1 || lastRow < 1) return null;
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      var v = String(values[r][c] || '').trim().toLowerCase();
      if (v.indexOf('image') === 0) return { row: r + 1, col: c + 1 };
    }
  }
  return null;
}

/** Extrai a foto do produto: imagem na célula, imagem flutuante, ou URL de texto.
 *  Devolve { imageUrl, debug } — debug ajuda a diagnosticar quando não acha nada. */
function extractProductImage(sheet, cacheKey) {
  var headerCell = findImageHeaderCell(sheet);
  if (!headerCell) return { imageUrl: null, debug: { reason: 'cabecalho "image" nao encontrado nas primeiras ' + SCAN_ROWS + ' linhas' } };

  var col = headerCell.col;
  var startRow = headerCell.row + 1;
  var endRow = startRow + DATA_ROWS_AFTER_HEADER - 1;
  var checkedRows = [];

  for (var row = startRow; row <= endRow; row++) {
    var value = sheet.getRange(row, col).getValue();
    checkedRows.push({ row: row, valueType: typeof value, hasContentUrl: !!(value && typeof value.getContentUrl === 'function') });

    // Caso 1: imagem inserida diretamente na célula (recurso "Inserir imagem na célula").
    if (value && typeof value.getContentUrl === 'function') {
      var contentUrl = value.getContentUrl();
      if (contentUrl) {
        var blob = UrlFetchApp.fetch(contentUrl).getBlob();
        return { imageUrl: saveToDriveAndGetPublicUrl(blob, cacheKey + '_r' + row), debug: null };
      }
    }

    // Caso 2: célula já contém uma URL de texto direto (raro, mas mais simples).
    if (typeof value === 'string' && /^https?:\/\//.test(value)) return { imageUrl: value, debug: null };
  }

  // Caso 3: imagem flutuante sobre a célula (não é valor da célula, é objeto solto na aba).
  var images = sheet.getImages();
  var floatingAnchors = [];
  for (var j = 0; j < images.length; j++) {
    var anchor = images[j].getAnchorCell();
    floatingAnchors.push({ row: anchor.getRow(), col: anchor.getColumn() });
    if (anchor.getColumn() === col && anchor.getRow() >= startRow && anchor.getRow() <= endRow) {
      return { imageUrl: saveToDriveAndGetPublicUrl(images[j].getBlob(), cacheKey + '_float' + anchor.getRow()), debug: null };
    }
  }

  return {
    imageUrl: null,
    debug: { headerCell: headerCell, checkedRows: checkedRows, floatingImageAnchors: floatingAnchors },
  };
}

/** Pasta de cache no Drive — criada automaticamente no primeiro uso. */
function getCacheFolder() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('CACHE_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) { /* pasta apagada: recria abaixo */ }
  }
  var name = 'Gocase - Imagens de Relatorios (cache)';
  var it = DriveApp.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty('CACHE_FOLDER_ID', folder.getId());
  return folder;
}

/** Salva o blob no cache (reaproveitando se já existir) e devolve a URL de thumbnail. */
function saveToDriveAndGetPublicUrl(blob, cacheKey) {
  var folder = getCacheFolder();
  var fileName = cacheKey + '.png';
  var existing = folder.getFilesByName(fileName);
  var file;
  if (existing.hasNext()) {
    file = existing.next();
  } else {
    file = folder.createFile(blob.setName(fileName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800';
}

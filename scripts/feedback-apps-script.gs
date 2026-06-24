/**
 * feedback-apps-script.gs — backend do Feed "Comentários & Feedbacks"
 * do app gocase-produto. Guarda os comentários numa planilha Google.
 *
 * COMO PUBLICAR:
 * 1) Crie uma planilha Google (ex.: "Feedback — Produto Gocase").
 * 2) Extensões → Apps Script. Cole este arquivo inteiro.
 * 3) Troque SECRET abaixo pelo MESMO valor que está na env var
 *    FEEDBACK_SCRIPT_SECRET na Vercel (NÃO commite o segredo real aqui).
 * 4) Implantar → Nova implantação → tipo "App da Web":
 *      - Executar como: Eu
 *      - Quem tem acesso: Qualquer pessoa
 *    Copie a URL do app da Web → vira a env var FEEDBACK_SCRIPT_URL na Vercel.
 *
 * A aba "Comentarios" é criada automaticamente com cabeçalho:
 *   id | createdAt | email | name | message
 */

var SECRET = 'TROQUE_ESTE_SEGREDO';   // == FEEDBACK_SCRIPT_SECRET na Vercel
var SHEET_NAME = 'Comentarios';
var MAX_RETURN = 500;                  // qtos comentários (mais recentes) o GET devolve

function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id', 'createdAt', 'email', 'name', 'message']);
  }
  return sh;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _checkSecret(given) {
  return SECRET && String(given || '') === SECRET;
}

// GET ?action=list&secret=...  → { comments: [...] } (mais recentes primeiro)
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!_checkSecret(p.secret)) return _json({ error: 'unauthorized' });
  var sh = _sheet();
  var last = sh.getLastRow();
  if (last < 2) return _json({ comments: [] });
  var values = sh.getRange(2, 1, last - 1, 5).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    out.push({
      id: String(row[0]),
      createdAt: row[1] instanceof Date ? row[1].toISOString() : String(row[1]),
      email: String(row[2]),
      name: String(row[3]),
      message: String(row[4]),
    });
  }
  out.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; });
  if (out.length > MAX_RETURN) out = out.slice(0, MAX_RETURN);
  return _json({ comments: out });
}

// POST roteia por body.action: 'create' (default) ou 'delete'.
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return _json({ error: 'bad json' }); }
  if (!_checkSecret(body.secret)) return _json({ error: 'unauthorized' });
  if (body.action === 'delete') return _delete(body);
  if (body.action === 'presence') return _presence(body);

  var message = String(body.message || '').trim();
  if (!message) return _json({ error: 'empty' });
  if (message.length > 2000) message = message.slice(0, 2000);
  var email = String(body.email || '').trim();
  var name = String(body.name || '').trim() || (email.split('@')[0] || '—');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var id = Utilities.getUuid();
    var createdAt = new Date().toISOString();
    _sheet().appendRow([id, createdAt, email, name, message]);
    return _json({ comment: { id: id, createdAt: createdAt, email: email, name: name, message: message } });
  } finally {
    lock.releaseLock();
  }
}

// Exclui um comentário por id. SÓ apaga se o email da linha == email do
// solicitante (o backend Vercel passa o email vindo do JWT da sessão).
// POST { action:'delete', secret, id, email } → { ok:true } | { error }
function _delete(body) {
  var id = String(body.id || '');
  var requester = String(body.email || '').trim().toLowerCase();
  if (!id) return _json({ error: 'empty id' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = _sheet();
    var last = sh.getLastRow();
    if (last < 2) return _json({ error: 'not found' });
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();    // col A = id
    var emails = sh.getRange(2, 3, last - 1, 1).getValues();  // col C = email
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) {
        if (String(emails[i][0]).trim().toLowerCase() !== requester) return _json({ error: 'forbidden' });
        sh.deleteRow(i + 2); // +2: linha 1 = cabeçalho, dados começam na 2
        return _json({ ok: true, id: id });
      }
    }
    return _json({ error: 'not found' });
  } finally {
    lock.releaseLock();
  }
}

// ── Presença online (heartbeat) ─────────────────────────────────────────────
var PRESENCE_SHEET = 'Presenca';
var ONLINE_WINDOW_MS = 45000; // visto nos últimos 45s = online

function _presenceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PRESENCE_SHEET);
  if (!sh) { sh = ss.insertSheet(PRESENCE_SHEET); sh.appendRow(['email', 'name', 'lastSeen']); }
  return sh;
}

// POST { action:'presence', secret, email, name } → { online:[{email,name,lastSeen}] }
function _presence(body) {
  var email = String(body.email || '').trim().toLowerCase();
  var name = String(body.name || '').trim();
  var now = new Date();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = _presenceSheet();
    var last = sh.getLastRow();
    var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
    // upsert da linha do usuário (1 linha por email)
    if (email) {
      var foundRow = -1;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toLowerCase() === email) { foundRow = i + 2; break; }
      }
      if (foundRow > 0) sh.getRange(foundRow, 2, 1, 2).setValues([[name, now.toISOString()]]);
      else { sh.appendRow([email, name, now.toISOString()]); }
    }
    // relê e filtra quem está dentro da janela
    last = sh.getLastRow();
    rows = last >= 2 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
    var online = [];
    for (var j = 0; j < rows.length; j++) {
      var ls = rows[j][2];
      var t = (ls instanceof Date) ? ls.getTime() : Date.parse(String(ls));
      if (!isNaN(t) && (now.getTime() - t) <= ONLINE_WINDOW_MS) {
        online.push({
          email: String(rows[j][0]),
          name: String(rows[j][1]),
          lastSeen: (ls instanceof Date) ? ls.toISOString() : String(ls),
        });
      }
    }
    return _json({ online: online });
  } finally {
    lock.releaseLock();
  }
}

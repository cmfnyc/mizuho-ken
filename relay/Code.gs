/**
 * 瑞穂県ホームページ — relay (Google Apps Script web app).
 *
 * - 掲示板: stores posts in the 掲示板 tab of this spreadsheet.
 * - 編集モード: checks the passcode, then saves content and photos to GitHub.
 *
 * Script properties (Project Settings → Script Properties):
 *   EDIT_PASSCODE  the passcode for 編集モード
 *   GITHUB_TOKEN   a fine-grained GitHub token for this one repository
 *                  (Repository permissions → Contents: Read and write)
 */
const REPO = 'cmfnyc/mizuho-ken';
const BRANCH = 'main';
const CONTENT_PATH = 'docs/content.js';
const SHEET_NAME = '掲示板';
const MAX_NAME = 30;
const MAX_BODY = 1000;
const MAX_POSTS = 1000;
const MAX_IMAGE_BASE64 = 6 * 1024 * 1024;
const MAX_CONTENT = 2 * 1024 * 1024;

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'posts') return json_({ ok: true, posts: getPosts_() });
  return json_({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  try {
    switch (req.action) {
      case 'post':
        return json_({ ok: true, posts: addPost_(req.name, req.body) });
      case 'content':
        checkPass_(req.passcode);
        return json_({ ok: true, content: readContent_().content });
      case 'save':
        checkPass_(req.passcode);
        return json_(save_(req));
      case 'deletePost':
        checkPass_(req.passcode);
        deletePost_(req.id);
        return json_({ ok: true, posts: getPosts_() });
      default:
        return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function props_() {
  return PropertiesService.getScriptProperties();
}

// Ten wrong passcodes lock 編集モード for ten minutes.
function checkPass_(pass) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= 10) throw new Error('locked');
  const real = props_().getProperty('EDIT_PASSCODE');
  if (!real || String(pass || '') !== real) {
    cache.put('fails', String(fails + 1), 600);
    throw new Error('auth');
  }
}

/* ---------------- 掲示板 ---------------- */

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['日時', '名前', 'メッセージ', 'ID']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getPosts_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - MAX_POSTS + 1);
  return sh.getRange(start, 1, last - start + 1, 4).getValues()
    .filter(r => String(r[2]) !== '')
    .map(r => ({
      id: String(r[3]),
      name: String(r[1]),
      body: String(r[2]),
      at: r[0] instanceof Date ? r[0].getTime() : Number(r[0]) || 0,
    }));
}

function addPost_(name, body) {
  name = String(name || '').trim().slice(0, MAX_NAME);
  body = String(body || '').trim();
  if (!body) throw new Error('empty');
  if (body.length > MAX_BODY) throw new Error('too_long');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_().appendRow([new Date(), plain_(name), plain_(body), Utilities.getUuid()]);
  } finally {
    lock.releaseLock();
  }
  return getPosts_();
}

function deletePost_(id) {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const ids = sh.getRange(2, 4, last - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) {
      sh.deleteRow(i + 2);
      return;
    }
  }
}

// Stops the sheet from treating a message like "=1+1" as a formula.
function plain_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* ---------------- 編集モード → GitHub ---------------- */

function gh_(method, path, payload) {
  const token = props_().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('no_token');
  const options = {
    method: method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    muteHttpExceptions: true,
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + path, options);
  const code = res.getResponseCode();
  if (code >= 300) throw new Error('github_' + code);
  return JSON.parse(res.getContentText());
}

function readContent_() {
  const file = gh_('get', '/contents/' + CONTENT_PATH + '?ref=' + BRANCH);
  const text = Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  const content = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  return { content: content };
}

function save_(req) {
  const content = req.content;
  if (!content || typeof content !== 'object' || !content.SITE) return { ok: false, error: 'bad_content' };
  const images = Array.isArray(req.images) ? req.images : [];
  for (const im of images) {
    if (!/^images\/[a-z0-9-]{1,60}\.jpg$/.test(String(im.path))) return { ok: false, error: 'bad_image_name' };
    if (typeof im.data !== 'string' || im.data.length > MAX_IMAGE_BASE64) return { ok: false, error: 'too_large' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const current = readContent_().content;
    const rev = Number((current.meta && current.meta.rev) || 0);
    if (!req.force && Number(req.rev) !== rev) return { ok: false, error: 'conflict' };

    content.meta = content.meta || {};
    content.meta.rev = rev + 1;
    content.meta.updated = new Date().toISOString();
    const text = '// 瑞穂県ホームページの内容 (Mizuho site content).\n' +
      '// Saving from 編集モード rewrites this file. If you edit it by hand, add 1 to meta.rev.\n' +
      'window.MIZUHO_CONTENT = ' + JSON.stringify(content, null, 2) + ';\n';
    if (text.length > MAX_CONTENT) return { ok: false, error: 'too_large' };

    // One commit for everything, so GitHub Pages rebuilds once.
    const ref = gh_('get', '/git/ref/heads/' + BRANCH);
    const parent = gh_('get', '/git/commits/' + ref.object.sha);
    const tree = [{ path: CONTENT_PATH, mode: '100644', type: 'blob', content: text }];
    for (const im of images) {
      const blob = gh_('post', '/git/blobs', { content: im.data, encoding: 'base64' });
      tree.push({ path: 'docs/' + im.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = gh_('post', '/git/trees', { base_tree: parent.tree.sha, tree: tree });
    const commit = gh_('post', '/git/commits', {
      message: '編集モードから更新 (rev ' + content.meta.rev + ')',
      tree: newTree.sha,
      parents: [ref.object.sha],
    });
    gh_('patch', '/git/refs/heads/' + BRANCH, { sha: commit.sha });
    return { ok: true, rev: content.meta.rev };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 每日儀錶板 — Google Apps Script 後端
 *
 * 安裝方式：
 *  1. 開一個新的 Google Sheet
 *  2. 上方選單 擴充功能 (Extensions) → Apps Script
 *  3. 把這整個檔案內容貼進去，存檔
 *  4. 在 Apps Script 編輯器選 setup 函式，按「執行」一次（會自動建好分頁與標題列，並要求授權）
 *  5. 右上「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *       - 執行身分：我（你自己）
 *       - 誰可以存取：任何人 (Anyone)
 *  6. 複製產生的網頁應用程式網址，貼到前端 js/config.js 的 API_URL
 *
 * 之後若修改本檔，要「部署 → 管理部署作業 → 編輯(鉛筆) → 版本選新版本」才會生效。
 */

const TZ = 'Asia/Taipei';

// 分頁名稱
const SHEET_TASKS = 'Tasks';
const SHEET_DONE = 'Completions';
const SHEET_NOTES = 'Notes';

// Tasks 欄位順序（請勿改動順序，前後端依賴）
const TASK_COLS = [
  'id', 'content', 'category', 'repeat', 'repeat_days',
  'priority', 'due', 'status', 'triaged', 'created_at', 'learning'
];

// ---------- 安裝：建立分頁與標題 ----------
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_TASKS, TASK_COLS);
  ensureSheet_(ss, SHEET_DONE, ['date', 'task_id', 'logged_at']);
  ensureSheet_(ss, SHEET_NOTES, ['id', 'content', 'created_at']);
  return 'setup done';
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const first = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  const empty = first.every(c => c === '' || c === null);
  if (empty) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------- HTTP 入口 ----------
function doGet(e) {
  return handle_(e, (e.parameter && e.parameter.action) || 'getState', e.parameter || {});
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    body = e.parameter || {};
  }
  return handle_(e, body.action, body);
}

function handle_(e, action, p) {
  try {
    let data;
    switch (action) {
      case 'getState':    data = getState_(); break;
      case 'capture':     data = capture_(p); break;
      case 'triage':      data = triage_(p); break;
      case 'complete':    data = complete_(p); break;
      case 'uncomplete':  data = uncomplete_(p); break;
      case 'updateTask':  data = updateTask_(p); break;
      case 'deleteTask':  data = deleteTask_(p); break;
      case 'addNote':     data = addNote_(p); break;
      case 'deleteNote':  data = deleteNote_(p); break;
      default: throw new Error('unknown action: ' + action);
    }
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- 工具 ----------
function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function readRows_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { headers: values[0] || [], rows: [] };
  const headers = values[0];
  const rows = values.slice(1).map((r, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, c) => o[h] = r[c]);
    return o;
  });
  return { headers, rows };
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function now_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function uid_() {
  return Utilities.getUuid().slice(0, 8);
}

// 今天的星期，1=一 ... 7=日
function weekdayToday_() {
  const d = parseInt(Utilities.formatDate(new Date(), TZ, 'u'), 10); // 1..7 (Mon..Sun)
  return d;
}

// ---------- 讀取整體狀態 ----------
function getState_() {
  const tasksData = readRows_(SHEET_TASKS);
  const doneData = readRows_(SHEET_DONE);
  const notesData = readRows_(SHEET_NOTES);
  const today = today_();
  const wd = String(weekdayToday_());

  // 今天已完成的 repeat 任務 id 集合
  const doneToday = {};
  doneData.rows.forEach(r => {
    if (String(r.date) === today) doneToday[String(r.task_id)] = true;
  });

  const inbox = [];
  const todayTasks = [];

  tasksData.rows.forEach(t => {
    if (!t.id) return;
    const task = {
      id: String(t.id),
      content: t.content,
      category: t.category || '',
      repeat: t.repeat || 'none',
      repeat_days: t.repeat_days ? String(t.repeat_days) : '',
      priority: t.priority || '',
      due: t.due ? Utilities.formatDate(new Date(t.due), TZ, 'yyyy-MM-dd') : (t.due_str || ''),
      status: t.status || 'open',
      triaged: t.triaged === true || t.triaged === 'TRUE' || t.triaged === 'true',
      learning: t.learning || ''
    };
    if (typeof t.due === 'string') task.due = t.due;

    if (!task.triaged) {
      inbox.push(task);
      return;
    }

    if (task.repeat === 'daily') {
      task.done = !!doneToday[task.id];
      todayTasks.push(task);
    } else if (task.repeat === 'weekly') {
      const days = task.repeat_days.split(',').map(s => s.trim());
      if (days.indexOf(wd) >= 0) {
        task.done = !!doneToday[task.id];
        todayTasks.push(task);
      }
    } else {
      // 一次性任務
      if (task.status !== 'done') {
        if (!task.due || task.due <= today) {
          task.done = false;
          todayTasks.push(task);
        }
      }
    }
  });

  // 排序：未完成優先，再按 priority(高>低)
  const prRank = { '高': 0, 'high': 0, '中': 1, 'mid': 1, '低': 2, 'low': 2, '': 3 };
  todayTasks.sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    return (prRank[a.priority] ?? 3) - (prRank[b.priority] ?? 3);
  });

  const notes = notesData.rows
    .filter(n => n.id)
    .map(n => ({
      id: String(n.id),
      content: n.content,
      created_at: n.created_at ? String(n.created_at) : ''
    }))
    .reverse();

  return { today, todayTasks, inbox, notes };
}

// ---------- 寫入動作 ----------
function capture_(p) {
  if (!p.content) throw new Error('content required');
  const sh = sheet_(SHEET_TASKS);
  const id = uid_();
  const row = TASK_COLS.map(c => {
    switch (c) {
      case 'id': return id;
      case 'content': return p.content;
      case 'repeat': return 'none';
      case 'status': return 'open';
      case 'triaged': return false;
      case 'created_at': return now_();
      default: return '';
    }
  });
  sh.appendRow(row);
  return { id };
}

function findTaskRow_(id) {
  const data = readRows_(SHEET_TASKS);
  const t = data.rows.find(r => String(r.id) === String(id));
  if (!t) throw new Error('task not found: ' + id);
  return t._row;
}

function colIndex_(name) {
  return TASK_COLS.indexOf(name) + 1;
}

function triage_(p) {
  const row = findTaskRow_(p.id);
  const sh = sheet_(SHEET_TASKS);
  if (p.category !== undefined) sh.getRange(row, colIndex_('category')).setValue(p.category);
  if (p.repeat !== undefined) sh.getRange(row, colIndex_('repeat')).setValue(p.repeat);
  if (p.repeat_days !== undefined) sh.getRange(row, colIndex_('repeat_days')).setValue(p.repeat_days);
  if (p.priority !== undefined) sh.getRange(row, colIndex_('priority')).setValue(p.priority);
  if (p.due !== undefined) sh.getRange(row, colIndex_('due')).setValue(p.due);
  sh.getRange(row, colIndex_('triaged')).setValue(true);
  return { id: p.id };
}

function updateTask_(p) {
  const row = findTaskRow_(p.id);
  const sh = sheet_(SHEET_TASKS);
  ['content', 'category', 'repeat', 'repeat_days', 'priority', 'due', 'learning'].forEach(f => {
    if (p[f] !== undefined) sh.getRange(row, colIndex_(f)).setValue(p[f]);
  });
  return { id: p.id };
}

function complete_(p) {
  const data = readRows_(SHEET_TASKS);
  const t = data.rows.find(r => String(r.id) === String(p.id));
  if (!t) throw new Error('task not found');
  const repeat = t.repeat || 'none';
  if (repeat === 'none') {
    sheet_(SHEET_TASKS).getRange(t._row, colIndex_('status')).setValue('done');
  } else {
    const done = sheet_(SHEET_DONE);
    const today = today_();
    const exist = readRows_(SHEET_DONE).rows
      .find(r => String(r.task_id) === String(p.id) && String(r.date) === today);
    if (!exist) done.appendRow([today, String(p.id), now_()]);
  }
  return { id: p.id };
}

function uncomplete_(p) {
  const data = readRows_(SHEET_TASKS);
  const t = data.rows.find(r => String(r.id) === String(p.id));
  if (!t) throw new Error('task not found');
  const repeat = t.repeat || 'none';
  if (repeat === 'none') {
    sheet_(SHEET_TASKS).getRange(t._row, colIndex_('status')).setValue('open');
  } else {
    const sh = sheet_(SHEET_DONE);
    const today = today_();
    const rows = readRows_(SHEET_DONE).rows
      .filter(r => String(r.task_id) === String(p.id) && String(r.date) === today)
      .sort((a, b) => b._row - a._row);
    rows.forEach(r => sh.deleteRow(r._row));
  }
  return { id: p.id };
}

function deleteTask_(p) {
  const row = findTaskRow_(p.id);
  sheet_(SHEET_TASKS).deleteRow(row);
  return { id: p.id };
}

function addNote_(p) {
  if (!p.content) throw new Error('content required');
  const id = uid_();
  sheet_(SHEET_NOTES).appendRow([id, p.content, now_()]);
  return { id };
}

function deleteNote_(p) {
  const data = readRows_(SHEET_NOTES);
  const n = data.rows.find(r => String(r.id) === String(p.id));
  if (n) sheet_(SHEET_NOTES).deleteRow(n._row);
  return { id: p.id };
}

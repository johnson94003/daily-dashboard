(function () {
  'use strict';

  const API_URL = window.API_URL || '';
  const DEMO = !API_URL; // 沒設定後端時跑離線示範資料

  let state = { today: '', todayTasks: [], inbox: [], notes: [] };
  let activeTab = 'today';

  // ---------------- 後端呼叫 ----------------
  // 用 text/plain 送 POST，避開 CORS 預檢
  async function api(action, params) {
    if (DEMO) return demoApi(action, params);
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, params || {}))
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'API error');
    return out.data;
  }

  async function refresh() {
    try {
      const data = await api('getState');
      state = data;
      render();
    } catch (e) {
      renderError(e);
    }
  }

  // ---------------- 渲染 ----------------
  const view = document.getElementById('view');

  function render() {
    updateBadge();
    if (activeTab === 'today') renderToday();
    else if (activeTab === 'inbox') renderInbox();
    else renderNotes();
  }

  function updateBadge() {
    const b = document.getElementById('inboxBadge');
    const n = state.inbox.length;
    b.textContent = n;
    b.classList.toggle('show', n > 0);
  }

  function renderError(e) {
    view.innerHTML =
      '<div class="banner error">連線失敗：' + escapeHtml(String(e)) +
      '<br><br>請確認 js/config.js 的 API_URL 已填入 Apps Script 網址，且部署權限設為「任何人」。</div>';
  }

  function renderToday() {
    let html = '';
    if (DEMO) html += '<div class="banner">示範模式：尚未連接 Google Sheet。資料只存在這次瀏覽，重新整理就消失。設定方式見 README。</div>';
    if (!state.todayTasks.length) {
      html += emptyState('🎉', '今天沒有待辦', '從上面捕捉，或到收件匣整理');
    } else {
      const open = state.todayTasks.filter(t => !t.done);
      const done = state.todayTasks.filter(t => t.done);
      // 依分類分組，組內按優先度排序
      const groups = {}, order = [];
      open.forEach(t => {
        const c = (t.category && t.category.trim()) ? t.category.trim() : '未分類';
        if (!groups[c]) { groups[c] = []; order.push(c); }
        groups[c].push(t);
      });
      order.forEach(c => groups[c].sort((a, b) => priRank(a.priority) - priRank(b.priority)));
      order.forEach(c => {
        html += '<h2 class="section">' + escapeHtml(c) + ' · ' + groups[c].length + '</h2>';
        groups[c].forEach(t => html += taskCard(t));
      });
      if (done.length) {
        html += '<h2 class="section">已完成 · ' + done.length + '</h2>';
        done.forEach(t => html += taskCard(t));
      }
    }
    view.innerHTML = html;
    bindTaskCards();
  }

  const PRI_RANK = { '高': 0, 'high': 0, '低': 2, 'low': 2, '': 3 };
  function priRank(p) { return PRI_RANK[p] != null ? PRI_RANK[p] : 3; }

  function allCategories() {
    const set = new Set();
    (state.todayTasks || []).forEach(t => { if (t.category && t.category.trim()) set.add(t.category.trim()); });
    (state.inbox || []).forEach(t => { if (t.category && t.category.trim()) set.add(t.category.trim()); });
    return Array.from(set);
  }

  function taskCard(t) {
    const repeatLabel = t.repeat === 'daily' ? '每天'
      : t.repeat === 'weekly' ? '每週' : '';
    let chips = '';
    if (t.category) chips += '<span class="chip">' + escapeHtml(t.category) + '</span>';
    if (repeatLabel) chips += '<span class="chip repeat">🔁 ' + repeatLabel + '</span>';
    if (t.priority) chips += '<span class="chip pri-' + escapeHtml(t.priority) + '">' + escapeHtml(t.priority) + '</span>';
    if (t.due) chips += '<span class="chip">📅 ' + escapeHtml(t.due) + '</span>';
    const learning = t.learning || '';
    const hasLearning = !!learning.trim();
    return '' +
      '<div class="card ' + (t.done ? 'done' : '') + '" data-id="' + t.id + '">' +
        '<button class="check ' + (t.done ? 'on' : '') + '" data-act="toggle">✓</button>' +
        '<div class="body" data-act="edit">' +
          '<div class="title">' + escapeHtml(t.content) + '</div>' +
          (chips ? '<div class="meta">' + chips + '</div>' : '') +
          (hasLearning ? '<div class="learn-mark">📝 ' + escapeHtml(learning) + '</div>' : '') +
        '</div>' +
        '<span class="edit-hint">›</span>' +
      '</div>';
  }

  function renderInbox() {
    let html = '';
    if (!state.inbox.length) {
      html += emptyState('📥', '收件匣是空的', '上面隨手記的東西會先進這裡');
    } else {
      html += '<h2 class="section">待整理 · ' + state.inbox.length + '</h2>';
      state.inbox.forEach(t => {
        html += '' +
          '<div class="card" data-id="' + t.id + '">' +
            '<div class="body">' +
              '<div class="title">' + escapeHtml(t.content) + '</div>' +
              '<div class="inbox-actions">' +
                '<button class="btn primary" data-act="triage">整理</button>' +
                '<button class="btn ghost" data-act="quickToday">直接今天做</button>' +
                '<button class="btn ghost danger" data-act="del">刪除</button>' +
              '</div>' +
            '</div>' +
          '</div>';
      });
    }
    view.innerHTML = html;
    bindInbox();
  }

  function renderNotes() {
    let html = '' +
      '<div class="card" style="display:block">' +
        '<textarea id="noteInput" class="note-input" placeholder="寫下心得、雜念、突然的想法…"></textarea>' +
        '<div class="inbox-actions" style="justify-content:flex-end">' +
          '<button class="btn primary" id="noteSave">記下來</button>' +
        '</div>' +
      '</div>';
    if (!state.notes.length) {
      html += emptyState('💭', '還沒有雜念', '');
    } else {
      html += '<h2 class="section">最近</h2>';
      state.notes.forEach(n => {
        html += '' +
          '<div class="note" data-id="' + n.id + '">' +
            '<div>' + escapeHtml(n.content).replace(/\n/g, '<br>') + '</div>' +
            '<div class="time">' + escapeHtml(n.created_at) +
              ' · <a href="#" data-act="delnote" style="color:var(--muted)">刪除</a></div>' +
          '</div>';
      });
    }
    view.innerHTML = html;
    bindNotes();
  }

  function emptyState(big, title, sub) {
    return '<div class="empty"><div class="big">' + big + '</div><div>' +
      escapeHtml(title) + '</div>' + (sub ? '<div style="font-size:14px;margin-top:6px">' + escapeHtml(sub) + '</div>' : '') + '</div>';
  }

  // ---------------- 事件 ----------------
  function bindTaskCards() {
    view.querySelectorAll('.card').forEach(card => {
      const id = card.dataset.id;
      const btn = card.querySelector('[data-act="toggle"]');
      if (btn) btn.onclick = async () => {
        const isDone = btn.classList.contains('on');
        btn.classList.toggle('on');
        card.classList.toggle('done');
        try {
          await api(isDone ? 'uncomplete' : 'complete', { id });
          await refresh();
        } catch (e) { toast('失敗：' + e); refresh(); }
      };

      const body = card.querySelector('[data-act="edit"]');
      if (body) body.onclick = () => {
        const task = state.todayTasks.find(x => x.id === id);
        if (task) openTriage(task, 'edit');
      };
    });
  }

  function bindInbox() {
    view.querySelectorAll('.card').forEach(card => {
      const id = card.dataset.id;
      const item = state.inbox.find(x => x.id === id);
      card.querySelector('[data-act="del"]').onclick = async () => {
        await api('deleteTask', { id }); toast('已刪除'); refresh();
      };
      card.querySelector('[data-act="quickToday"]').onclick = async () => {
        await api('triage', { id, repeat: 'none' }); toast('已加到今天'); refresh();
      };
      card.querySelector('[data-act="triage"]').onclick = () => openTriage(item);
    });
  }

  function bindNotes() {
    const input = document.getElementById('noteInput');
    document.getElementById('noteSave').onclick = async () => {
      const v = input.value.trim();
      if (!v) return;
      await api('addNote', { content: v });
      toast('已記下'); refresh();
    };
    view.querySelectorAll('[data-act="delnote"]').forEach(a => {
      a.onclick = async (e) => {
        e.preventDefault();
        const id = a.closest('.note').dataset.id;
        await api('deleteNote', { id }); refresh();
      };
    });
  }

  // ---------------- 捕捉列 ----------------
  const captureInput = document.getElementById('captureInput');
  async function doCapture() {
    const v = captureInput.value.trim();
    if (!v) return;
    captureInput.value = '';
    try {
      await api('capture', { content: v });
      toast('已收進收件匣');
      refresh();
    } catch (e) { toast('失敗：' + e); }
  }
  document.getElementById('captureBtn').onclick = doCapture;

  // ---------------- 分頁切換 ----------------
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      render();
    };
  });

  // ---------------- 整理彈窗 ----------------
  let triageState = null;
  function openTriage(item, mode) {
    mode = mode || 'triage';
    const repeat0 = item.repeat && item.repeat !== 'none' ? item.repeat : 'none';
    const days0 = item.repeat_days ? String(item.repeat_days).split(',').map(s => s.trim()).filter(Boolean) : [];
    triageState = {
      id: item.id, repeat: repeat0, repeat_days: days0,
      priority: item.priority || '', category: item.category || '', due: item.due || ''
    };
    const sel = (cond) => cond ? ' class="on"' : '';
    const wd = ['一', '二', '三', '四', '五', '六', '日'];
    const cats = allCategories();
    if (item.category && item.category.trim() && cats.indexOf(item.category.trim()) < 0) cats.push(item.category.trim());
    let catField;
    if (cats.length) {
      const opts = ['<option value="">（無分類）</option>']
        .concat(cats.map(c => '<option value="' + escapeHtml(c) + '"' + (c === item.category ? ' selected' : '') + '>' + escapeHtml(c) + '</option>'))
        .concat('<option value="__new__">＋ 新增分類…</option>').join('');
      catField = '<div class="field"><label>分類</label>' +
        '<select id="tCatSel">' + opts + '</select>' +
        '<input id="tCat" placeholder="輸入新分類" style="margin-top:8px;display:none">' +
        '</div>';
    } else {
      catField = '<div class="field"><label>分類</label><input id="tCat" placeholder="例如：雅思、訓練、工作"></div>';
    }
    const sheet = document.createElement('div');
    sheet.className = 'sheet-bg show';
    sheet.innerHTML =
      '<div class="sheet">' +
        '<h3>' + escapeHtml(item.content) + '</h3>' +
        catField +
        '<div class="field"><label>重複</label><div class="seg" id="tRepeat">' +
          '<button data-v="none"' + sel(repeat0 === 'none') + '>不重複</button>' +
          '<button data-v="daily"' + sel(repeat0 === 'daily') + '>每天</button>' +
          '<button data-v="weekly"' + sel(repeat0 === 'weekly') + '>每週</button>' +
        '</div></div>' +
        '<div class="field" id="tWeekWrap" style="display:' + (repeat0 === 'weekly' ? 'block' : 'none') + '"><label>星期幾</label><div class="weekdays" id="tWeek">' +
          wd.map((d, i) => '<button data-v="' + (i + 1) + '"' + sel(days0.indexOf(String(i + 1)) >= 0) + '>' + d + '</button>').join('') +
        '</div></div>' +
        '<div class="field" id="tDueWrap" style="display:' + (repeat0 === 'none' ? 'block' : 'none') + '"><label>截止日（可空）</label><input id="tDue" type="date"></div>' +
        '<div class="field"><label>優先</label><div class="seg" id="tPri">' +
          '<button data-v=""' + sel(!triageState.priority) + '>無</button>' +
          '<button data-v="高"' + sel(triageState.priority === '高') + '>高</button>' +
          '<button data-v="低"' + sel(triageState.priority === '低') + '>低</button>' +
        '</div></div>' +
        '<div class="field"><label>收穫 / 想法 / 靈感（可空）</label>' +
          '<textarea id="tLearn" class="learn-input" placeholder="這件事的收穫、突然想到的、靈感…"></textarea></div>' +
        '<div class="sheet-actions">' +
          '<button class="btn ghost" id="tCancel">取消</button>' +
          '<button class="btn primary" id="tSave">' + (mode === 'edit' ? '儲存' : '確認') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(sheet);
    const catSel = sheet.querySelector('#tCatSel');
    const catInput = sheet.querySelector('#tCat');
    if (catSel) {
      catSel.onchange = () => {
        const isNew = catSel.value === '__new__';
        catInput.style.display = isNew ? 'block' : 'none';
        if (isNew) { catInput.value = ''; catInput.focus(); }
      };
    } else {
      catInput.value = item.category || '';
    }
    if (triageState.due) sheet.querySelector('#tDue').value = triageState.due;
    if (item.learning) sheet.querySelector('#tLearn').value = item.learning;

    sheet.querySelector('#tRepeat').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      sheet.querySelectorAll('#tRepeat button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      triageState.repeat = b.dataset.v;
      sheet.querySelector('#tWeekWrap').style.display = b.dataset.v === 'weekly' ? 'block' : 'none';
      sheet.querySelector('#tDueWrap').style.display = b.dataset.v === 'none' ? 'block' : 'none';
    };
    sheet.querySelector('#tWeek').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      b.classList.toggle('on');
      const v = b.dataset.v;
      const i = triageState.repeat_days.indexOf(v);
      if (i >= 0) triageState.repeat_days.splice(i, 1); else triageState.repeat_days.push(v);
    };
    sheet.querySelector('#tPri').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      sheet.querySelectorAll('#tPri button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      triageState.priority = b.dataset.v;
    };
    const close = () => sheet.remove();
    sheet.querySelector('#tCancel').onclick = close;
    sheet.onclick = e => { if (e.target === sheet) close(); };
    sheet.querySelector('#tSave').onclick = async () => {
      const category = catSel
        ? (catSel.value === '__new__' ? catInput.value.trim() : catSel.value)
        : catInput.value.trim();
      const p = {
        id: triageState.id,
        category: category,
        repeat: triageState.repeat,
        repeat_days: triageState.repeat_days.join(','),
        priority: triageState.priority,
        due: triageState.repeat === 'none' ? sheet.querySelector('#tDue').value : '',
        learning: sheet.querySelector('#tLearn').value
      };
      close();
      const action = mode === 'edit' ? 'updateTask' : 'triage';
      try { await api(action, p); toast(mode === 'edit' ? '已更新' : '已整理'); refresh(); }
      catch (e) { toast('失敗：' + e); }
    };
  }

  // ---------------- 小工具 ----------------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ---------------- 示範資料（無後端時）----------------
  let demo = null;
  function demoSeed() {
    return {
      today: new Date().toISOString().slice(0, 10),
      todayTasks: [
        { id: 'd1', content: '雅思口說 Part 1 練 3 題', category: '雅思', repeat: 'daily', priority: '高', done: false },
        { id: 'd2', content: '晨間核心 10 分鐘', category: '訓練', repeat: 'daily', priority: '', done: true, learning: '棒式撐到 60 秒比較穩，核心收緊後下背不痠了。' },
        { id: 'd3', content: '回覆晨帆的飲食紀錄', category: '工作', repeat: 'none', priority: '中', done: false }
      ],
      inbox: [
        { id: 'i1', content: '查 UESCA 認證報名期限' },
        { id: 'i2', content: '個人品牌：寫一篇碳水補給的貼文' }
      ],
      notes: [
        { id: 'n1', content: '今天跑完覺得補給節奏抓對了，30K 沒掉速。', created_at: '2026-05-31 09:12' }
      ]
    };
  }
  function demoApi(action, p) {
    if (!demo) demo = demoSeed();
    const find = (arr, id) => arr.find(x => x.id === id);
    switch (action) {
      case 'getState': return Promise.resolve(JSON.parse(JSON.stringify(demo)));
      case 'capture': demo.inbox.push({ id: 'i' + Date.now(), content: p.content }); break;
      case 'deleteTask': demo.inbox = demo.inbox.filter(x => x.id !== p.id); demo.todayTasks = demo.todayTasks.filter(x => x.id !== p.id); break;
      case 'triage': {
        const idx = demo.inbox.findIndex(x => x.id === p.id);
        if (idx >= 0) {
          const it = demo.inbox.splice(idx, 1)[0];
          demo.todayTasks.push(Object.assign(it, { category: p.category, repeat: p.repeat, priority: p.priority, learning: p.learning || '', done: false }));
        }
        break;
      }
      case 'updateTask': { const t = find(demo.todayTasks, p.id); if (t) ['category','repeat','repeat_days','priority','due','learning'].forEach(f => { if (p[f] !== undefined) t[f] = p[f]; }); break; }
      case 'complete': { const t = find(demo.todayTasks, p.id); if (t) t.done = true; break; }
      case 'uncomplete': { const t = find(demo.todayTasks, p.id); if (t) t.done = false; break; }
      case 'addNote': demo.notes.unshift({ id: 'n' + Date.now(), content: p.content, created_at: new Date().toLocaleString('zh-TW') }); break;
      case 'deleteNote': demo.notes = demo.notes.filter(x => x.id !== p.id); break;
    }
    return Promise.resolve({ id: p && p.id });
  }

  // ---------------- 啟動 ----------------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // 回到前景自動刷新
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
})();

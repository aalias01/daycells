/* Daycells in-app feedback: Report sheet → Discord webhook (+ mailto / offline queue). */
window.Feedback = (() => {
  'use strict';

  const DB_NAME = 'daycells-feedback';
  const DB_STORE = 'queue';
  const DB_VER = 1;

  let onClose = null;
  let ctx = null;
  let draft = {
    text: '',
    category: 'Bug',
    name: '',
    email: '',
    blob: null,
    metaOpen: false,
    sending: false,
    status: '' // '' | 'ok' | 'err' | 'queued'
  };

  function cfg() {
    return (window.DC_CONFIG && typeof window.DC_CONFIG === 'object') ? window.DC_CONFIG : {};
  }

  function enabled() {
    return !!(String(cfg().feedbackEndpoint || '').trim());
  }

  function endpoint() {
    return String(cfg().feedbackEndpoint || '').trim();
  }

  function mailtoRecipient() {
    return String(cfg().feedbackMailto || '').trim();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function collectMeta(extra) {
    const ex = extra || {};
    let displayMode = 'browser';
    try {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        displayMode = 'pwa';
      }
    } catch (e) { /* ignore */ }
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
    return {
      version: window.DC_VERSION || 'unknown',
      screen: ex.screen || '',
      viewDate: ex.viewDate || '',
      viewport: Math.round(window.innerWidth) + 'x' + Math.round(window.innerHeight) + '@' + (window.devicePixelRatio || 1),
      displayMode,
      ua: navigator.userAgent || '',
      lang: navigator.language || '',
      tz,
      online: navigator.onLine !== false,
      syncEnabled: !!ex.syncEnabled,
      sampleLoaded: !!ex.sampleLoaded,
      ts: new Date().toISOString()
    };
  }

  function openIdb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('no idb')); return; }
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb open failed'));
    });
  }

  async function queuePut(item) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).add(item);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function queueAll() {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).getAll();
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async function queueDelete(id) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  function categoryColor(cat) {
    if (cat === 'Bug') return 0xe74c3c;
    if (cat === 'Confusing') return 0xf39c12;
    return 0x3498db;
  }

  function buildFormData(payload) {
    const text = String(payload.text || '').trim();
    const category = payload.category || 'Bug';
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim();
    const meta = payload.meta || {};
    const blob = payload.blob || null;

    const fields = [
      { name: 'Screen', value: meta.screen || '—', inline: true },
      { name: 'Viewport', value: meta.viewport || '—', inline: true },
      { name: 'Mode', value: meta.displayMode || '—', inline: true },
      { name: 'Sync', value: String(!!meta.syncEnabled), inline: true },
      { name: 'Sample', value: String(!!meta.sampleLoaded), inline: true },
      { name: 'TZ', value: meta.tz || '—', inline: true },
      { name: 'Name', value: name || '—', inline: true },
      { name: 'Email', value: email || '—', inline: true },
      { name: 'View date', value: meta.viewDate || '—', inline: true },
      { name: 'UA', value: String(meta.ua || '').slice(0, 1024) || '—' }
    ];

    const embed = {
      title: category,
      description: text.slice(0, 4000),
      color: categoryColor(category),
      fields,
      timestamp: meta.ts || new Date().toISOString()
    };

    const payloadJson = {
      content: '**' + category + '** · Daycells `' + (meta.version || '?') + '`',
      embeds: [embed]
    };
    if (blob) {
      payloadJson.attachments = [{ id: 0, filename: 'screenshot.jpg' }];
    }

    const form = new FormData();
    form.append('payload_json', JSON.stringify(payloadJson));
    if (blob) form.append('files[0]', blob, 'screenshot.jpg');
    return form;
  }

  async function postDiscord(payload) {
    const url = endpoint();
    if (!url) throw new Error('No feedback endpoint');
    const form = buildFormData(payload);
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('Discord ' + res.status + (body ? ': ' + body.slice(0, 120) : ''));
    }
  }

  function mailtoFallback(payload) {
    const to = mailtoRecipient();
    if (!to) {
      alert('Could not send. Ask the app owner to set FEEDBACK_MAILTO, or try again later.');
      return;
    }
    const meta = payload.meta || {};
    const lines = [
      String(payload.text || '').trim(),
      '',
      '---',
      'category: ' + (payload.category || ''),
      'name: ' + (payload.name || ''),
      'email: ' + (payload.email || ''),
      'version: ' + (meta.version || ''),
      'screen: ' + (meta.screen || ''),
      'viewDate: ' + (meta.viewDate || ''),
      'viewport: ' + (meta.viewport || ''),
      'mode: ' + (meta.displayMode || ''),
      'sync: ' + String(!!meta.syncEnabled),
      'sample: ' + String(!!meta.sampleLoaded),
      'tz: ' + (meta.tz || ''),
      'ua: ' + (meta.ua || '')
    ];
    let body = lines.join('\n');
    if (body.length > 1800) body = body.slice(0, 1800) + '\n…';
    const subject = 'Daycells feedback (' + (payload.category || 'Bug') + ')';
    const href = 'mailto:' + to +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
    if (payload.blob) {
      alert('Email may not include the screenshot. Attach it manually if needed.');
    }
    window.location.href = href;
  }

  async function send(payload) {
    const offline = navigator.onLine === false;
    if (offline) {
      await queuePut({
        text: payload.text,
        category: payload.category,
        name: payload.name,
        email: payload.email,
        meta: payload.meta,
        blob: payload.blob || null,
        queuedAt: Date.now()
      });
      return 'queued';
    }
    try {
      await postDiscord(payload);
      return 'ok';
    } catch (e) {
      const msg = String(e && e.message || e || '');
      const networkish = /failed to fetch|network|load failed|offline/i.test(msg);
      if (networkish) {
        try {
          await queuePut({
            text: payload.text,
            category: payload.category,
            name: payload.name,
            email: payload.email,
            meta: payload.meta,
            blob: payload.blob || null,
            queuedAt: Date.now()
          });
          return 'queued';
        } catch (qErr) { /* fall through */ }
      }
      throw e;
    }
  }

  async function flushQueue() {
    if (!enabled() || navigator.onLine === false) return;
    let items;
    try { items = await queueAll(); } catch (e) { return; }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        await postDiscord(item);
        await queueDelete(item.id);
      } catch (e) {
        break; // stop on first failure; retry later
      }
    }
  }

  function resetDraft(prefillEmail) {
    draft = {
      text: '',
      category: 'Bug',
      name: '',
      email: prefillEmail || '',
      blob: null,
      metaOpen: false,
      sending: false,
      status: ''
    };
  }

  function metaLines(meta) {
    return [
      'Version: ' + (meta.version || '—'),
      'Screen: ' + (meta.screen || '—'),
      'View date: ' + (meta.viewDate || '—'),
      'Viewport: ' + (meta.viewport || '—'),
      'Mode: ' + (meta.displayMode || '—'),
      'Sync: ' + String(!!meta.syncEnabled),
      'Sample: ' + String(!!meta.sampleLoaded),
      'TZ: ' + (meta.tz || '—')
    ].join('\n');
  }

  function sheetHTML(meta) {
    const cats = ['Bug', 'Confusing', 'Idea'];
    const chips = cats.map(c =>
      '<button type="button" class="fb-chip' + (draft.category === c ? ' on' : '') + '" data-cat="' + c + '">' + c + '</button>'
    ).join('');
    const thumb = draft.blob
      ? '<div class="fb-thumb-wrap">' +
          '<img class="fb-thumb" id="fb-thumb" alt="Screenshot preview">' +
          '<div class="btnrow" style="margin-top:8px">' +
            '<button type="button" class="btn ghost" id="fb-reedit">Edit again</button>' +
            '<button type="button" class="btn ghost" id="fb-remove">Remove</button>' +
          '</div></div>'
      : '';
    const status = draft.status === 'ok'
      ? '<p class="fb-status ok">Sent — thank you.</p>'
      : draft.status === 'queued'
        ? '<p class="fb-status ok">Saved offline — will send when you are back.</p>'
        : draft.status === 'err'
          ? '<p class="fb-status err">Couldn’t send.</p>'
          : '';
    const sendDisabled = draft.sending || !String(draft.text || '').trim() ? ' disabled' : '';
    return '<div class="overlay" id="ovl"><div class="sheet feedbacksheet"><div class="grab"></div>' +
      '<h2>Report a problem</h2>' +
      '<p class="mini" style="margin-top:0">Tell us what went wrong or felt confusing. Screenshot optional.</p>' +
      '<label class="fb-label" for="fb-text">What happened</label>' +
      '<textarea id="fb-text" class="fb-text" rows="4" placeholder="Describe the issue…" maxlength="4000">' + esc(draft.text) + '</textarea>' +
      '<div class="fb-chips" role="group" aria-label="Category">' + chips + '</div>' +
      '<label class="fb-label" for="fb-name">Name <span class="fb-opt">(optional)</span></label>' +
      '<input type="text" id="fb-name" class="fb-input" autocomplete="name" placeholder="Your name" value="' + esc(draft.name) + '">' +
      '<label class="fb-label" for="fb-email">Email <span class="fb-opt">(optional)</span></label>' +
      '<input type="email" id="fb-email" class="fb-input" autocomplete="email" placeholder="Email (optional)" value="' + esc(draft.email) + '">' +
      thumb +
      '<div class="btnrow">' +
        (draft.blob ? '' : '<button type="button" class="btn ghost" id="fb-shot">Add screenshot</button>') +
      '</div>' +
      '<p class="mini">On iPhone: take a screenshot first (Side + Volume Up), then choose it here. You can cover private areas before sending.</p>' +
      '<details class="fb-meta"' + (draft.metaOpen ? ' open' : '') + '>' +
        '<summary>Details attached automatically</summary>' +
        '<pre class="fb-meta-pre">' + esc(metaLines(meta)) + '</pre>' +
      '</details>' +
      status +
      '<div class="btnrow">' +
        '<button type="button" class="btn" id="fb-send"' + sendDisabled + '>' + (draft.sending ? 'Sending…' : 'Send') + '</button>' +
        (draft.status === 'err'
          ? '<button type="button" class="btn ghost" id="fb-retry">Retry</button>' +
            (mailtoRecipient() ? '<button type="button" class="btn ghost" id="fb-mailto">Email instead</button>' : '')
          : '') +
        '<button type="button" class="btn ghost" id="fb-cancel">Cancel</button>' +
      '</div>' +
      '<input type="file" id="fb-file" accept="image/*" class="hidden">' +
    '</div></div>';
  }

  function close() {
    draft.blob = null;
    if (typeof onClose === 'function') onClose();
  }

  function currentPayload(meta) {
    return {
      text: String(draft.text || '').trim(),
      category: draft.category || 'Bug',
      name: String(draft.name || '').trim(),
      email: String(draft.email || '').trim(),
      blob: draft.blob,
      meta
    };
  }

  function wire(root, meta) {
    const textEl = root.querySelector('#fb-text');
    if (textEl) {
      textEl.focus();
      textEl.addEventListener('input', () => {
        draft.text = textEl.value;
        const send = root.querySelector('#fb-send');
        if (send && !draft.sending) send.disabled = !String(draft.text || '').trim();
      });
    }
    const nameEl = root.querySelector('#fb-name');
    if (nameEl) nameEl.addEventListener('input', () => { draft.name = nameEl.value; });
    const emailEl = root.querySelector('#fb-email');
    if (emailEl) emailEl.addEventListener('input', () => { draft.email = emailEl.value; });

    function syncFields() {
      if (textEl) draft.text = textEl.value;
      if (nameEl) draft.name = nameEl.value;
      if (emailEl) draft.email = emailEl.value;
    }

    root.querySelectorAll('[data-cat]').forEach(b => {
      b.addEventListener('click', () => {
        syncFields();
        draft.category = b.dataset.cat;
        mount(document.getElementById('modal'), ctx);
      });
    });

    const details = root.querySelector('.fb-meta');
    if (details) {
      details.addEventListener('toggle', () => { draft.metaOpen = details.open; });
    }

    const cancel = root.querySelector('#fb-cancel');
    if (cancel) cancel.addEventListener('click', () => close());

    const ovl = root.querySelector('#ovl');
    if (ovl) ovl.addEventListener('click', ev => { if (ev.target === ovl) close(); });

    async function doSend() {
      const payload = currentPayload(meta);
      if (!payload.text) return;
      draft.sending = true;
      draft.status = '';
      mount(document.getElementById('modal'), ctx);
      try {
        const result = await send(payload);
        draft.sending = false;
        draft.status = result;
        mount(document.getElementById('modal'), ctx);
        if (result === 'ok' || result === 'queued') {
          setTimeout(() => close(), 1200);
        }
      } catch (e) {
        draft.sending = false;
        draft.status = 'err';
        mount(document.getElementById('modal'), ctx);
      }
    }

    const sendBtn = root.querySelector('#fb-send');
    if (sendBtn) sendBtn.addEventListener('click', doSend);
    const retry = root.querySelector('#fb-retry');
    if (retry) retry.addEventListener('click', doSend);
    const mailtoBtn = root.querySelector('#fb-mailto');
    if (mailtoBtn) mailtoBtn.addEventListener('click', () => mailtoFallback(currentPayload(meta)));

    const file = root.querySelector('#fb-file');
    const shot = root.querySelector('#fb-shot');
    if (shot && file) {
      shot.addEventListener('click', () => file.click());
    }
    if (file) {
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        file.value = '';
        if (!f || !window.Redact) return;
        const result = await window.Redact.open(f);
        if (!result || !result.blob) return;
        draft.blob = result.blob;
        mount(document.getElementById('modal'), ctx);
      });
    }

    const thumb = root.querySelector('#fb-thumb');
    if (thumb && draft.blob) {
      const u = URL.createObjectURL(draft.blob);
      thumb.src = u;
      thumb.onload = () => URL.revokeObjectURL(u);
    }
    const remove = root.querySelector('#fb-remove');
    if (remove) {
      remove.addEventListener('click', () => {
        draft.blob = null;
        mount(document.getElementById('modal'), ctx);
      });
    }
    const reedit = root.querySelector('#fb-reedit');
    if (reedit && draft.blob) {
      reedit.addEventListener('click', async () => {
        if (!window.Redact) return;
        const result = await window.Redact.open(draft.blob);
        if (!result || !result.blob) return;
        draft.blob = result.blob;
        mount(document.getElementById('modal'), ctx);
      });
    }
  }

  /**
   * Mount feedback sheet into #modal root.
   * @param {HTMLElement} root
   * @param {object} context from app (screen, viewDate, syncEnabled, sampleLoaded, prefillEmail)
   */
  function mount(root, context) {
    if (!root) return;
    ctx = context || ctx || {};
    const meta = collectMeta(ctx);
    root.innerHTML = sheetHTML(meta);
    wire(root, meta);
  }

  /**
   * @param {object} context
   * @param {() => void} closeCb — app clears feedbackOpen + render
   */
  function open(context, closeCb) {
    if (!enabled()) return;
    onClose = closeCb;
    ctx = context || {};
    resetDraft(ctx.prefillEmail || '');
    mount(document.getElementById('modal'), ctx);
  }

  function isOpen() {
    return !!(document.querySelector('.feedbacksheet'));
  }

  // Flush queued reports when back online / on load
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { flushQueue().catch(() => {}); });
    setTimeout(() => { flushQueue().catch(() => {}); }, 1500);
  }

  return {
    enabled,
    open,
    mount,
    isOpen,
    collectMeta,
    flushQueue
  };
})();

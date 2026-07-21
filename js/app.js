/* StreakGrid UI. Vanilla JS, no framework (house rule). */
(() => {
  'use strict';
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const EMOJIS = ['💪', '🏃', '📚', '🧘', '💧', '🌙', '✍️', '🎯', '🧩', '🥗', '🎸', '🤝'];

  let state = null;
  let activeTab = 'today';
  let syncStatus = { s: 'off', detail: '' };
  let detailId = null;   // open habit detail
  let editDraft = null;  // editor modal draft
  let presetsOpen = false;
  let mapPage = 0;       // detail streakmap paging: 0 = latest 52 weeks
  let viewDate = null;   // Today tab date; null = live today (so midnight rolls over)

  /* Preset library. Grounded in what people actually track (Loggd 2026 data:
     exercise, water, reading, journaling, meditation, sleep, vitamins lead)
     and phrased small on purpose: in the same data, tiny anchored habits
     (morning water, vitamins) outlast big effortful ones (the gym averages
     a 1.5-day streak). */
  const PRESETS = [
    { name: 'Morning glass of water', emoji: '💧', color: '#4c7fae', schedule: { kind: 'daily' }, starter: true },
    { name: 'Move 30 minutes', emoji: '🏃', color: '#3d9970', schedule: { kind: 'daily' }, starter: true },
    { name: 'Read 10 pages', emoji: '📖', color: '#c9a227', schedule: { kind: 'daily' }, starter: true },
    { name: 'Gym', emoji: '🏋️', color: '#d0703c', schedule: { kind: 'perWeek', target: 3 } },
    { name: '10,000 steps', emoji: '👟', color: '#3a9ea5', schedule: { kind: 'daily' } },
    { name: 'Stretch', emoji: '🤸', color: '#9b8ec4', schedule: { kind: 'daily' } },
    { name: 'Take vitamins', emoji: '💊', color: '#c06c9c', schedule: { kind: 'daily' } },
    { name: 'In bed by 10:30', emoji: '🌙', color: '#4c7fae', schedule: { kind: 'daily' } },
    { name: 'Journal', emoji: '✍️', color: '#3d9970', schedule: { kind: 'daily' } },
    { name: 'Meditate', emoji: '🧘', color: '#9b8ec4', schedule: { kind: 'daily' } },
    { name: 'No social media scroll', emoji: '📵', color: '#c0442e', schedule: { kind: 'daily' } },
    { name: 'No alcohol', emoji: '🚫', color: '#c0442e', schedule: { kind: 'daily' } },
    { name: 'Plan tomorrow', emoji: '🗓️', color: '#3a9ea5', schedule: { kind: 'daily' } },
    { name: 'Deep work session', emoji: '🎯', color: '#d0703c', schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4] } },
    { name: 'Practice a language', emoji: '🗣️', color: '#c9a227', schedule: { kind: 'perWeek', target: 5 } },
    { name: 'Practice coding', emoji: '💻', color: '#3d9970', schedule: { kind: 'perWeek', target: 4 } },
    { name: 'Eat a fruit', emoji: '🍎', color: '#c06c9c', schedule: { kind: 'daily' } },
    { name: 'Make bed', emoji: '🛏️', color: '#3a9ea5', schedule: { kind: 'daily' } }
  ];

  // ---------- color helpers ----------
  function hexToRgba(hex, a) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#3d9970');
    const r = m ? parseInt(m[1], 16) : 61, g = m ? parseInt(m[2], 16) : 153, b = m ? parseInt(m[3], 16) : 112;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function scheduleLabel(h) {
    const s = h.schedule || { kind: 'daily' };
    if (s.kind === 'daily') return 'Every day';
    if (s.kind === 'weekdays') {
      const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return (s.days || []).map(d => names[d]).join(' · ') || 'No days set';
    }
    return (s.target || 1) + '× / week';
  }

  // ---------- streakmap builders ----------
  function miniMap(h, weeks) {
    const cols = Logic.streakmapWeeks(h, state.cells, state.skips, weeks, Logic.todayISO());
    return '<div class="gridmini">' + cols.map(col =>
      '<div class="col">' + col.map(c => {
        let style = '';
        if (c.done) style = 'background:' + esc(h.color);
        else if (c.skip && !c.future) style = 'background:' + hexToRgba(h.color, .18);
        return '<span class="c' + (c.future ? ' future' : '') + '" style="' + style + '"></span>';
      }).join('') + '</div>').join('') + '</div>';
  }

  function fullMap(h, weeks, endISO) {
    const cols = Logic.streakmapWeeks(h, state.cells, state.skips, weeks, endISO || Logic.todayISO());
    const today = Logic.todayISO();
    return '<div class="gridfull">' + cols.map(col =>
      '<div class="col">' + col.map(c => {
        let style = '';
        const future = c.iso > today;
        if (c.done) style = 'background:' + esc(h.color);
        else if (c.skip && !future) style = 'background:' + hexToRgba(h.color, .18);
        return '<span class="c' + (future ? ' future' : '') + (c.iso === today ? ' today' : '') + '" data-cell="' + c.iso + '" style="' + style + '"></span>';
      }).join('') + '</div>').join('') + '</div>';
  }

  function applyTheme() {
    const t = (state.settings || {}).theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  // ---------- render root ----------
  function render() {
    state = Store.get();
    applyTheme();
    const y = window.scrollY; // keep scroll position across re-renders
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
    const dot = $('#syncdot');
    dot.className = 'syncdot ' + syncStatus.s;
    dot.title = syncStatus.detail || syncStatus.s;
    $('#subline').textContent = Sync.state().enabled && Sync.state().email ? Sync.state().email : 'local';
    if (activeTab === 'today') renderToday();
    else if (activeTab === 'analytics') renderAnalytics();
    else if (activeTab === 'help') renderHelp();
    else renderSettings();
    $('#fab').classList.toggle('hidden', activeTab !== 'today');
    renderModal();
    window.scrollTo(0, y);
  }

  // ---------- Today ----------
  function renderToday() {
    const today = Logic.todayISO();
    const iso = viewDate || today;         // the day the cards act on
    const isToday = iso === today;
    const rest = Logic.isSkip(state.skips, iso);
    const habits = Store.activeHabits();
    const nice = Logic.parseDate(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

    // day progress: scheduled habits done / due on the viewed day
    let due = 0, doneCount = 0;
    for (const h of habits) {
      const dn = Logic.isDone(state.cells, iso, h.id);
      if (dn) { doneCount++; due++; }
      else if (Logic.isRequired(h, iso, state.skips) && !Logic.isPerWeek(h)) due++;
    }
    const allDone = due > 0 && doneCount === due;

    let cards = habits.map(h => {
      const done = Logic.isDone(state.cells, iso, h.id);
      const req = Logic.isRequired(h, iso, state.skips);
      const streak = Logic.currentStreak(h, state.cells, state.skips, today);
      const perWeekNote = Logic.isPerWeek(h)
        ? ' · ' + Logic.weekDoneCount(h, state.cells, Logic.weekStartOf(iso), iso) + '/' + Logic.weekTarget(h) + ' this wk' : '';
      return '<div class="hcard" data-open="' + h.id + '" role="button" aria-label="' + esc(h.name) + ' details">' +
        '<div class="top">' +
          '<span class="emoji" style="background:' + hexToRgba(h.color, .16) + '">' + esc(h.emoji) + '</span>' +
          '<span class="nm"><div class="name">' + esc(h.name) + '</div>' +
            '<div class="meta">' + esc(scheduleLabel(h)) + perWeekNote + ' · ' + streak + Logic.streakUnit(h) + ' 🔥</div></span>' +
          '<button class="check' + (done ? ' done' : '') + (!req && !done ? ' optional' : '') + '" data-toggle="' + h.id + '"' +
            ' aria-label="' + esc(h.name) + (done ? ': done, tap to undo' : ': mark done') + '" aria-pressed="' + done + '"' +
            ' data-color="' + esc(h.color) + '"' +
            ' style="' + (done ? 'background:' + esc(h.color) + ';border-color:' + esc(h.color) : '') + '">✓</button>' +
        '</div>' + miniMap(h, 18) + '</div>';
    }).join('');

    if (!habits.length) {
      cards = '<div class="empty"><div class="big">🌱</div>No habits yet.<br>Tap + to add your first, or import a backup in Settings.</div>';
    }

    $('#view').innerHTML =
      '<div class="todayhead">' +
        '<span class="date">' + esc(nice) + (isToday ? '' : ' <small class="pastlbl">(past day)</small>') + '</span>' +
        (due > 0 ? '<span class="chip' + (allDone ? ' on' : '') + '">' + (allDone ? 'All done ✓' : doneCount + '/' + due) + '</span>' : '') +
        '<span class="chip toggle' + (rest ? ' on' : '') + '" id="restchip" role="button">' + (rest ? '☾ rest day' : 'mark rest day') + '</span>' +
        '<span class="datenav">' +
          '<button id="prevday" aria-label="previous day">‹</button>' +
          '<button id="nextday" aria-label="next day"' + (isToday ? ' disabled' : '') + '>›</button>' +
          (isToday ? '' : '<button id="jumptoday" aria-label="back to today">today</button>') +
        '</span>' +
      '</div>' +
      cards +
      '<div class="card"><h2>Note</h2><textarea class="note" id="daynote" placeholder="One line about this day (optional)">' + esc(Store.getNote(iso)) + '</textarea></div>';

    $('#view').dataset.day = today;

    document.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      const id = b.dataset.toggle;
      const nowDone = !Logic.isDone(state.cells, iso, id);
      // instant feedback, then reconcile with a full render
      b.classList.toggle('done', nowDone);
      b.classList.add('pop');
      if (nowDone) { b.style.background = b.dataset.color; b.style.borderColor = b.dataset.color; }
      else { b.style.background = ''; b.style.borderColor = ''; }
      if (nowDone && navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
      Store.toggleCell(iso, id);
      setTimeout(render, 160);
    }));
    document.querySelectorAll('[data-open]').forEach(c => c.addEventListener('click', () => { detailId = c.dataset.open; render(); }));
    $('#restchip').addEventListener('click', () => { Store.toggleSkip(iso); render(); });
    $('#daynote').addEventListener('change', ev => Store.setNote(iso, ev.target.value));
    $('#prevday').addEventListener('click', () => { viewDate = Logic.addDays(iso, -1); render(); });
    const nx = $('#nextday');
    if (nx) nx.addEventListener('click', () => {
      const next = Logic.addDays(iso, 1);
      viewDate = next >= today ? null : next;
      render();
    });
    const jt = $('#jumptoday');
    if (jt) jt.addEventListener('click', () => { viewDate = null; render(); });
  }

  // ---------- Analytics ----------
  function renderAnalytics() {
    const today = Logic.todayISO();
    const habits = Store.activeHabits();
    if (!habits.length) { $('#view').innerHTML = '<div class="empty"><div class="big">📊</div>Add habits to see analytics.</div>'; return; }

    let reqToday = 0, doneToday = 0, bestCur = 0, bestName = '';
    let rates = [];
    for (const h of habits) {
      const done = Logic.isDone(state.cells, today, h.id);
      if (done) { doneToday++; reqToday++; }
      else if (Logic.isRequired(h, today, state.skips)) reqToday++;
      const s = Logic.currentStreak(h, state.cells, state.skips, today);
      if (s > bestCur) { bestCur = s; bestName = h.name; }
      const r = Logic.completionRate(h, state.cells, state.skips, 30, today);
      if (r !== null) rates.push(r);
    }
    const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

    /* combined heatmap: dayScore levels in accent */
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3d9970';
    const cols = Logic.streakmapWeeks({ id: '__none__', schedule: { kind: 'daily' } }, {}, state.skips, 26, today);
    const hm = '<div class="gridfull">' + cols.map(col => '<div class="col">' + col.map(c => {
      if (c.future) return '<span class="c future"></span>';
      const sc = Logic.dayScore(habits, state.cells, state.skips, c.iso);
      let style = '';
      if (sc !== null) {
        const a = sc >= 1 ? 1 : sc >= .75 ? .75 : sc >= .5 ? .5 : sc > 0 ? .28 : 0;
        if (a) style = 'background:' + hexToRgba(accent, a);
      } else if (c.skip) style = 'opacity:.45';
      return '<span class="c' + (c.today ? ' today' : '') + '" style="' + style + '"></span>';
    }).join('') + '</div>').join('') + '</div>';

    /* overall day-of-week: average of per-habit shares */
    const dowTotals = [0, 0, 0, 0, 0, 0, 0];
    habits.forEach(h => Logic.dowBreakdown(h, state.cells).forEach((n, i) => dowTotals[i] += n));
    const dowMax = Math.max.apply(null, dowTotals.concat([1]));
    const dowBars = '<div class="bars">' + dowTotals.map((n, i) =>
      '<div class="b"><b>' + n + '</b><i style="height:' + Math.round(n / dowMax * 100) + '%;background:' + hexToRgba('#3d9970', .8) + '"></i><span>' + DOWS[i] + '</span></div>').join('') + '</div>';

    const rows = habits.map(h => {
      const st = Logic.strength(h, state.cells, state.skips, today);
      const r7 = Logic.completionRate(h, state.cells, state.skips, 7, today);
      const r30 = Logic.completionRate(h, state.cells, state.skips, 30, today);
      const f = v => v === null ? '·' : Math.round(v * 100) + '%';
      return '<div class="hrow"><span class="nm">' + esc(h.emoji) + ' ' + esc(h.name) + '</span>' +
        '<span class="strengthbar"><i style="width:' + Math.round(st * 100) + '%;background:' + esc(h.color) + '"></i></span>' +
        '<span class="m">' + f(r7) + '</span><span class="m">' + f(r30) + '</span></div>';
    }).join('');

    $('#view').innerHTML =
      '<div class="card"><h2>Overview</h2><div class="statgrid">' +
        '<div class="stat"><div class="v">' + doneToday + '/' + reqToday + '</div><div class="k">today</div></div>' +
        '<div class="stat"><div class="v">' + bestCur + '</div><div class="k">longest live streak' + (bestName ? ' · ' + esc(bestName) : '') + '</div></div>' +
        '<div class="stat"><div class="v">' + (avgRate === null ? '·' : Math.round(avgRate * 100) + '%') + '</div><div class="k">30-day rate</div></div>' +
        '<div class="stat"><div class="v">' + habits.length + '</div><div class="k">active habits</div></div>' +
      '</div></div>' +
      '<div class="card"><h2>All habits · 26 weeks</h2>' + hm +
        '<div class="maplegend">Cell shade = share of scheduled habits completed that day. Tap a habit on Today for its own streakmap.</div></div>' +
      '<div class="card"><h2>Completions by weekday</h2>' + dowBars + '</div>' +
      '<div class="card"><h2>Per habit · strength / 7d / 30d</h2>' + rows +
        '<div class="mini">Strength is an exponentially weighted average (Loop Habit Tracker model): a miss dents it, it never zeroes like a streak. Rest days never penalize.</div></div>';
  }

  // ---------- Help ----------
  function renderHelp() {
    const origin = location.origin;
    $('#view').innerHTML =
      '<div class="card help"><h2>What this app is</h2>' +
        '<p>StreakGrid tracks habits with a contribution grid. It runs entirely in your browser. Optional sync writes one JSON file to <em>your</em> Google Drive. There is no StreakGrid account.</p>' +
      '</div>' +
      '<div class="card help"><h2>Saving data</h2>' +
        '<ul>' +
          '<li><b>Browser:</b> every check-in is saved on this device automatically.</li>' +
          '<li><b>Export:</b> Settings → Export JSON (full backup) or Export CSV.</li>' +
          '<li><b>Drive sync:</b> phone + laptop, and recovery if you clear site data. Needs your own OAuth Client ID (below).</li>' +
        '</ul>' +
      '</div>' +
      '<div class="card help"><h2>Set up Google Drive sync</h2>' +
        '<p>About five minutes. Free for normal personal use. You need a Google account.</p>' +
        '<p class="originbox">Add this exact origin in Google Cloud (step 4):<br><code id="helporigin">' + esc(origin) + '</code>' +
        ' <button type="button" class="btn ghost" id="copyorigin">Copy</button></p>' +
        '<ol class="helpol">' +
          '<li>Open <a href="https://console.cloud.google.com" target="_blank" rel="noopener">console.cloud.google.com</a> and create a project (any name).</li>' +
          '<li><b>APIs &amp; Services → Library</b> → enable <b>Google Drive API</b>.</li>' +
          '<li><b>Google Auth Platform</b> (search “oauth” if you do not see it):' +
            '<ul>' +
              '<li><b>Branding:</b> app name (e.g. StreakGrid) and your email. Save.</li>' +
              '<li><b>Audience:</b> External. Stay in <b>Testing</b>. Add your Gmail under Test users. Save.</li>' +
              '<li><b>Data Access → Add or remove scopes:</b> use the <b>Filter</b> box at the top of the panel.' +
                '<ul>' +
                  '<li>Filter <code>userinfo</code> → check <code>.../auth/userinfo.email</code> (non-sensitive).</li>' +
                  '<li>Clear the filter, then filter <code>drive.file</code> → check <code>.../auth/drive.file</code> (sensitive; it will not appear under “non-sensitive”).</li>' +
                  '<li>If Drive API scopes do not show up, enable <b>Google Drive API</b> first (step 2), then reopen this panel.</li>' +
                  '<li>Click <b>Update</b> at the bottom of the panel (closes it). Then click <b>Save</b> on the main Data Access page. Update alone does not persist.</li>' +
                '</ul>' +
              '</li>' +
            '</ul>' +
          '</li>' +
          '<li><b>Clients → Create client → Web application.</b> Under Authorized JavaScript origins, add the origin shown above. Leave redirect URIs empty. Create. Copy the <b>Client ID</b> only. Ignore the Client Secret.</li>' +
          '<li>Back here: <b>Settings</b> → paste the Client ID → <b>Sign in with Google</b>.</li>' +
        '</ol>' +
        '<p class="mini">After sign-in, Drive should show a folder named <code>StreakGrid</code> with <code>streakgrid-data.json</code>. On a second device, paste the same Client ID once, sign in with the same Google account.</p>' +
      '</div>' +
      '<div class="card help"><h2>If something fails</h2>' +
        '<ul>' +
          '<li><b>Popup fails / origin error:</b> the origin above is missing from your OAuth client.</li>' +
          '<li><b>Access blocked:</b> your Gmail is not in Audience → Test users (or publish the OAuth app).</li>' +
          '<li><b>No Client ID configured:</b> paste it in Settings and wait a moment, then Sign in again.</li>' +
          '<li><b>Data missing after clearing the browser:</b> Sign in again to pull Drive, or import a JSON export.</li>' +
        '</ul>' +
        '<div class="btnrow"><button class="btn" id="helptosettings">Go to Settings</button></div>' +
      '</div>';

    $('#copyorigin').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(origin);
        const b = $('#copyorigin');
        b.textContent = 'Copied';
        setTimeout(() => { b.textContent = 'Copy'; }, 1500);
      } catch (e) {
        prompt('Copy this origin:', origin);
      }
    });
    $('#helptosettings').addEventListener('click', () => { activeTab = 'settings'; render(); window.scrollTo(0, 0); });
  }

  // ---------- Settings ----------
  function renderSettings() {
    const st = Sync.state();
    const reason = GDrive.unavailableReason ? GDrive.unavailableReason() : null;
    const driveBody = st.enabled
      ? '<div class="set-row"><span class="grow">Connected as <b>' + esc(st.email || '?') + '</b></span>' +
        '<button class="btn ghost" id="syncnow">Sync now</button><button class="btn ghost" id="disconnect">Disconnect</button></div>' +
        '<div class="mini">Your data lives in a "StreakGrid" folder in your own Google Drive as one JSON file. This app can only see files it created (drive.file scope).</div>'
      : '<div class="set-row"><span class="grow">Store your data in your own Google Drive and sync across devices.</span>' +
        '<button class="btn" id="connect">Sign in with Google</button></div>' +
        (reason ? '<div class="mini">' + esc(reason) + '</div>' : '<div class="mini">Nothing is sent anywhere except your own Drive. Tracking without sign-in still works.</div>');

    const habitRows = Store.activeHabits().map(h =>
      '<div class="set-row"><span class="grow">' + esc(h.emoji) + ' ' + esc(h.name) + '</span>' +
      '<button class="up" data-mv="-1" data-id="' + h.id + '">↑</button>' +
      '<button class="down" data-mv="1" data-id="' + h.id + '">↓</button>' +
      '<button class="btn ghost" data-edit="' + h.id + '">edit</button>' +
      '<button class="btn ghost" data-archive="' + h.id + '">archive</button></div>').join('') || '<div class="mini">No active habits.</div>';

    const archivedRows = Store.archivedHabits().map(h =>
      '<div class="set-row"><span class="grow" style="opacity:.6">' + esc(h.emoji) + ' ' + esc(h.name) + '</span>' +
      '<button class="btn ghost" data-restore="' + h.id + '">restore</button>' +
      '<button class="btn ghost" data-del="' + h.id + '">delete</button></div>').join('');

    $('#view').innerHTML =
      '<div class="card"><h2>Google Drive sync</h2>' + driveBody +
        '<div class="set-row"><span class="grow">OAuth Client ID</span>' +
        '<input type="text" id="clientid" placeholder="xxxx.apps.googleusercontent.com" value="' + esc(localStorage.getItem('sg_gclient') || '') + '"></div>' +
        '<div class="mini">Your own Client ID from Google Cloud. Paste it here (stays in this browser). Do not paste the Client Secret.</div>' +
        '<div class="mini"><button type="button" class="linkish" id="gotohelp">How to create a Client ID (Help) →</button></div>' +
      '</div>' +
      '<div class="card"><h2>Habits</h2>' + habitRows + (archivedRows ? '<h2 style="margin-top:14px">Archived</h2>' + archivedRows : '') + '</div>' +
      '<div class="card"><h2>Appearance</h2>' +
        '<div class="set-row"><span class="grow">Theme</span><span class="seg" id="themeseg">' +
        ['auto', 'light', 'dark'].map(t =>
          '<button data-theme-opt="' + t + '" class="' + (((state.settings || {}).theme || 'auto') === t ? 'on' : '') + '">' + t + '</button>').join('') +
        '</span></div>' +
      '</div>' +
      '<div class="card"><h2>Data</h2><div class="btnrow">' +
        '<button class="btn" id="exportjson">Export JSON</button>' +
        '<button class="btn ghost" id="exportcsv">Export CSV log</button>' +
        '<button class="btn ghost" id="importjson">Import JSON</button>' +
        '<button class="btn danger" id="reset">Reset all</button></div>' +
        '<div class="mini">This browser holds the working copy. Nothing is pruned. JSON is the full backup; CSV is a long-format log (date, habit, value, timestamp) for pandas or a spreadsheet.</div>' +
      '</div>' +
      '<div class="card"><h2>About</h2><div class="mini">StreakGrid is free and open source. Streak rules: only a missed scheduled day breaks a streak; rest days and unscheduled days carry; today stays pending until it is over. Weekly-target habits count streaks in weeks. See Help for Drive setup. <a href="https://github.com/aalias01/streakgrid" target="_blank" rel="noopener">GitHub</a></div></div>';

    const cn = $('#connect');
    if (cn) cn.addEventListener('click', async () => {
      try { await Sync.connect(); } catch (e) { alert(e.message); }
      render();
    });
    const gh = $('#gotohelp');
    if (gh) gh.addEventListener('click', () => { activeTab = 'help'; render(); window.scrollTo(0, 0); });
    const dc = $('#disconnect');
    if (dc) dc.addEventListener('click', () => { Sync.disconnect(); render(); });
    const sn = $('#syncnow');
    if (sn) sn.addEventListener('click', () => Sync.fullSync(true));
    $('#clientid').addEventListener('change', ev => { localStorage.setItem('sg_gclient', ev.target.value.trim()); render(); });
    document.querySelectorAll('[data-theme-opt]').forEach(b => b.addEventListener('click', () => {
      Store.setSetting('theme', b.dataset.themeOpt); render();
    }));
    document.querySelectorAll('[data-mv]').forEach(b => b.addEventListener('click', () => { Store.moveHabit(b.dataset.id, +b.dataset.mv); render(); }));
    document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(b.dataset.edit)));
    document.querySelectorAll('[data-archive]').forEach(b => b.addEventListener('click', () => { Store.updateHabit(b.dataset.archive, { archived: true }); render(); }));
    document.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', () => { Store.updateHabit(b.dataset.restore, { archived: false }); render(); }));
    document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (confirm('Delete this habit and keep its history out of view? This propagates to synced devices.')) { Store.deleteHabit(b.dataset.del); render(); }
    }));
    $('#exportjson').addEventListener('click', () => download('streakgrid-' + Logic.todayISO() + '.json', Store.exportJSON(), 'application/json'));
    $('#exportcsv').addEventListener('click', () => {
      /* long format for analysis: one row per logged event */
      const names = {};
      state.habits.forEach(h => names[h.id] = h.name);
      const lines = ['date,habit_id,habit_name,value,logged_at'];
      const q = s => '"' + String(s).replace(/"/g, '""') + '"';
      for (const k in state.cells) {
        const c = state.cells[k];
        lines.push(k.slice(0, 10) + ',' + q(k.slice(11)) + ',' + q(names[k.slice(11)] || '') + ',' + (c.v ? 1 : 0) + ',' + new Date(c.ts || 0).toISOString());
      }
      for (const iso in state.skips) {
        const s = state.skips[iso];
        if (s.v) lines.push(iso + ',_rest_day,_rest_day,1,' + new Date(s.ts || 0).toISOString());
      }
      download('streakgrid-log-' + Logic.todayISO() + '.csv', lines.join('\n'), 'text/csv');
    });
    $('#importjson').addEventListener('click', () => $('#importfile').click());
    $('#reset').addEventListener('click', () => {
      if (confirm('Erase all data in this browser? Export a backup first. (A connected Drive copy is NOT erased.)')) { Store.resetAll(); render(); }
    });
  }

  // ---------- detail + editor + preset modals ----------
  function renderModal() {
    const root = $('#modal');
    if (editDraft) { root.innerHTML = editorHTML(); wireEditor(); return; }
    if (presetsOpen) { root.innerHTML = presetsHTML(); wirePresets(); return; }
    if (detailId) {
      const h = Store.getHabit(detailId);
      if (!h || h.deleted) { detailId = null; root.innerHTML = ''; return; }
      root.innerHTML = detailHTML(h); wireDetail(h); return;
    }
    root.innerHTML = '';
  }

  // ---------- preset picker ----------
  function presetsHTML() {
    const existing = new Set(Store.activeHabits().map(h => h.name.toLowerCase()));
    const anyHabits = Store.activeHabits().length > 0;
    const rows = PRESETS.map((p, i) => {
      const dup = existing.has(p.name.toLowerCase());
      const checked = !anyHabits && p.starter && !dup;
      return '<label class="preset' + (dup ? ' dup' : '') + '">' +
        '<input type="checkbox" data-preset="' + i + '"' + (checked ? ' checked' : '') + (dup ? ' disabled' : '') + '>' +
        '<span class="emoji" style="background:' + hexToRgba(p.color, .16) + '">' + p.emoji + '</span>' +
        '<span class="pnm">' + esc(p.name) + (dup ? ' <small>added</small>' : '') + '</span>' +
        '<span class="psch">' + esc(scheduleLabel(p)) + '</span></label>';
    }).join('');
    return '<div class="overlay" id="ovl"><div class="sheet"><div class="grab"></div>' +
      '<div class="dhead"><span class="t"><div class="name">Add habits</div>' +
      '<div class="meta">Start with 1 to 3. Small habits survive; you can add more anytime.</div></span>' +
      '<button id="closepresets">✕</button></div>' +
      '<div class="presetlist">' + rows + '</div>' +
      '<div class="btnrow"><button class="btn" id="addpresets">Add selected</button>' +
      '<button class="btn ghost" id="customhabit">Create my own</button></div>' +
    '</div></div>';
  }

  function wirePresets() {
    $('#closepresets').addEventListener('click', () => { presetsOpen = false; render(); });
    $('#ovl').addEventListener('click', ev => { if (ev.target.id === 'ovl') { presetsOpen = false; render(); } });
    $('#customhabit').addEventListener('click', () => { presetsOpen = false; openEditor(null); });
    $('#addpresets').addEventListener('click', () => {
      const picked = [...document.querySelectorAll('[data-preset]:checked')].map(cb => PRESETS[+cb.dataset.preset]);
      if (!picked.length) { alert('Tick at least one, or create your own.'); return; }
      picked.forEach(p => Store.addHabit({ name: p.name, emoji: p.emoji, color: p.color, schedule: JSON.parse(JSON.stringify(p.schedule)) }));
      presetsOpen = false; render();
    });
  }

  function detailHTML(h) {
    const today = Logic.todayISO();
    const cur = Logic.currentStreak(h, state.cells, state.skips, today);
    const best = Logic.bestStreak(h, state.cells, state.skips, today);
    const total = Logic.totalDone(h, state.cells);
    const r30 = Logic.completionRate(h, state.cells, state.skips, 30, today);
    const stg = Logic.strength(h, state.cells, state.skips, today);
    const unit = Logic.streakUnit(h);
    const dow = Logic.dowBreakdown(h, state.cells);
    const dowMax = Math.max.apply(null, dow.concat([1]));
    const months = Logic.monthlyCounts(h, state.cells, 6, today);
    const moMax = Math.max.apply(null, months.map(m => m.count).concat([1]));
    return '<div class="overlay" id="ovl"><div class="sheet"><div class="grab"></div>' +
      '<div class="dhead">' +
        '<span class="emoji" style="background:' + hexToRgba(h.color, .16) + '">' + esc(h.emoji) + '</span>' +
        '<span class="t"><div class="name">' + esc(h.name) + '</div><div class="meta">' + esc(scheduleLabel(h)) + '</div></span>' +
        '<button id="editbtn">Edit</button><button id="closedetail">✕</button>' +
      '</div>' +
      '<div class="statgrid">' +
        '<div class="stat"><div class="v">' + cur + unit + '</div><div class="k">current streak</div></div>' +
        '<div class="stat"><div class="v">' + best + unit + '</div><div class="k">best streak</div></div>' +
        '<div class="stat"><div class="v">' + total + '</div><div class="k">total done</div></div>' +
        '<div class="stat"><div class="v">' + (r30 === null ? '·' : Math.round(r30 * 100) + '%') + '</div><div class="k">30-day rate</div></div>' +
        '<div class="stat"><div class="v">' + Math.round(stg * 100) + '</div><div class="k">strength</div></div>' +
      '</div>' +
      (() => {
        const today = Logic.todayISO();
        const endISO = Logic.addDays(today, -364 * mapPage);
        const startISO = Logic.addDays(Logic.weekStartOf(endISO), -7 * 51);
        const first = Logic.habitStartDate(h, state.cells);
        const olderExists = first && first < startISO;
        const rangeLbl = mapPage === 0 ? 'last 52 weeks'
          : startISO.slice(0, 10) + ' to ' + endISO.slice(0, 10);
        return '<div class="card" style="margin-top:12px"><h2>Streakmap · ' + rangeLbl + ' · tap to edit any day</h2>' +
          fullMap(h, 52, endISO) +
          '<div class="maplegend" style="display:flex;justify-content:space-between;align-items:center">' +
            '<span>Full color = done · faint = rest day</span>' +
            '<span><button class="pagebtn" id="mapolder"' + (olderExists ? '' : ' disabled') + '>‹ older</button>' +
            '<button class="pagebtn" id="mapnewer"' + (mapPage > 0 ? '' : ' disabled') + '>newer ›</button></span>' +
          '</div></div>';
      })() +
      '<div class="card"><h2>By weekday</h2><div class="bars">' + dow.map((n, i) =>
        '<div class="b"><b>' + n + '</b><i style="height:' + Math.round(n / dowMax * 100) + '%;background:' + esc(h.color) + '"></i><span>' + DOWS[i] + '</span></div>').join('') + '</div></div>' +
      '<div class="card"><h2>Last 6 months</h2><div class="bars">' + months.map(m =>
        '<div class="b"><b>' + m.count + '</b><i style="height:' + Math.round(m.count / moMax * 100) + '%;background:' + hexToRgba(h.color, .75) + '"></i><span>' + m.label + '</span></div>').join('') + '</div></div>' +
    '</div></div>';
  }

  function wireDetail(h) {
    $('#closedetail').addEventListener('click', () => { detailId = null; mapPage = 0; render(); });
    $('#ovl').addEventListener('click', ev => { if (ev.target.id === 'ovl') { detailId = null; mapPage = 0; render(); } });
    $('#editbtn').addEventListener('click', () => openEditor(h.id));
    const older = $('#mapolder'), newer = $('#mapnewer');
    if (older) older.addEventListener('click', () => { mapPage++; render(); });
    if (newer) newer.addEventListener('click', () => { mapPage = Math.max(0, mapPage - 1); render(); });
    document.querySelectorAll('#ovl [data-cell]').forEach(c => c.addEventListener('click', () => {
      if (c.dataset.cell > Logic.todayISO()) return;
      Store.toggleCell(c.dataset.cell, h.id); render();
    }));
  }

  function openEditor(id) {
    const h = id ? Store.getHabit(id) : null;
    editDraft = h
      ? { id: h.id, name: h.name, emoji: h.emoji, color: h.color, schedule: JSON.parse(JSON.stringify(h.schedule || { kind: 'daily' })) }
      : { id: null, name: '', emoji: '⭐', color: Store.PALETTE[Store.activeHabits().length % Store.PALETTE.length], schedule: { kind: 'daily' } };
    render();
  }

  function editorHTML() {
    const d = editDraft;
    const s = d.schedule;
    const swatches = Store.PALETTE.map(c =>
      '<button class="sw' + (c === d.color ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '"></button>').join('');
    const quicks = EMOJIS.map(e => '<button class="em" data-emoji="' + e + '">' + e + '</button>').join('');
    let schedUI = '';
    if (s.kind === 'weekdays') {
      schedUI = '<div class="dayschips">' + DOWS.map((l, i) =>
        '<button data-day="' + i + '" class="' + ((s.days || []).indexOf(i) !== -1 ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
    } else if (s.kind === 'perWeek') {
      schedUI = '<label class="f">Times per week</label><input type="number" id="target" min="1" max="7" value="' + (s.target || 3) + '">';
    }
    return '<div class="overlay" id="ovl"><div class="sheet editor"><div class="grab"></div>' +
      '<div class="dhead"><span class="t"><div class="name">' + (d.id ? 'Edit habit' : 'New habit') + '</div></span><button id="closeedit">✕</button></div>' +
      '<label class="f">Name</label><input type="text" id="hname" maxlength="40" placeholder="e.g. Morning run" value="' + esc(d.name) + '">' +
      '<label class="f">Icon</label><div style="display:flex;gap:8px;align-items:center"><input type="text" class="emojiin" id="hemoji" maxlength="4" value="' + esc(d.emoji) + '"><div class="pickrow" style="flex:1">' + quicks + '</div></div>' +
      '<label class="f">Color</label><div class="pickrow">' + swatches + '</div>' +
      '<label class="f">Schedule</label><div class="seg" id="kindseg">' +
        '<button data-kind="daily" class="' + (s.kind === 'daily' ? 'on' : '') + '">Every day</button>' +
        '<button data-kind="weekdays" class="' + (s.kind === 'weekdays' ? 'on' : '') + '">Weekdays</button>' +
        '<button data-kind="perWeek" class="' + (s.kind === 'perWeek' ? 'on' : '') + '">X per week</button></div>' +
      schedUI +
      '<div class="btnrow"><button class="btn" id="savehabit">' + (d.id ? 'Save' : 'Add habit') + '</button>' +
      '<button class="btn ghost" id="canceledit">Cancel</button></div>' +
    '</div></div>';
  }

  function wireEditor() {
    const d = editDraft;
    $('#closeedit').addEventListener('click', closeEd);
    $('#canceledit').addEventListener('click', closeEd);
    $('#ovl').addEventListener('click', ev => { if (ev.target.id === 'ovl') closeEd(); });
    function closeEd() { editDraft = null; render(); }
    $('#hname').addEventListener('input', ev => d.name = ev.target.value);
    $('#hname').addEventListener('keydown', ev => { if (ev.key === 'Enter') $('#savehabit').click(); });
    $('#hemoji').addEventListener('input', ev => d.emoji = ev.target.value || '⭐');
    document.querySelectorAll('[data-emoji]').forEach(b => b.addEventListener('click', () => { d.emoji = b.dataset.emoji; render(); }));
    document.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { d.color = b.dataset.color; render(); }));
    document.querySelectorAll('#kindseg [data-kind]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.kind;
      d.schedule = k === 'daily' ? { kind: 'daily' } : k === 'weekdays' ? { kind: 'weekdays', days: (d.schedule.days || [0, 1, 2, 3, 4]) } : { kind: 'perWeek', target: d.schedule.target || 3 };
      render();
    }));
    document.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.day;
      const days = d.schedule.days || [];
      d.schedule.days = days.indexOf(i) === -1 ? days.concat([i]).sort() : days.filter(x => x !== i);
      render();
    }));
    const tg = $('#target');
    if (tg) tg.addEventListener('change', ev => d.schedule.target = Math.min(7, Math.max(1, +ev.target.value || 3)));
    $('#savehabit').addEventListener('click', () => {
      if (!d.name.trim()) { alert('Give the habit a name.'); return; }
      if (d.schedule.kind === 'weekdays' && !(d.schedule.days || []).length) { alert('Pick at least one weekday.'); return; }
      if (d.id) Store.updateHabit(d.id, { name: d.name.trim(), emoji: d.emoji, color: d.color, schedule: d.schedule });
      else Store.addHabit({ name: d.name.trim(), emoji: d.emoji, color: d.color, schedule: d.schedule });
      editDraft = null; render();
    });
  }

  // ---------- misc ----------
  function download(name, content, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('#importfile').addEventListener('change', ev => {
    const f = ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { Store.importJSON(r.result); render(); alert('Imported.'); }
      catch (e) { alert('Import failed: ' + e.message); }
    };
    r.readAsText(f);
    ev.target.value = '';
  });

  $('#tabs').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    activeTab = b.dataset.tab;
    detailId = null; editDraft = null; presetsOpen = false; mapPage = 0; viewDate = null;
    render();
  });
  $('#fab').addEventListener('click', () => { presetsOpen = true; render(); });
  /* sync dot doubles as a manual sync / reconnect button */
  $('#syncdot').addEventListener('click', () => {
    if (!Sync.state().enabled) { activeTab = 'settings'; render(); return; }
    Sync.fullSync(true).catch(() => {});
  });

  // ---------- boot ----------
  Store.init(() => Sync.schedulePush());
  Sync.init({
    getDoc: () => Store.get(),
    applyDoc: doc => { Store.replaceState(doc); render(); },
    onStatus: (s, detail) => { syncStatus = { s, detail }; const dot = $('#syncdot'); if (dot) { dot.className = 'syncdot ' + s; dot.title = detail || s; } }
  });
  render();
  /* first run: open the preset picker instead of an empty screen */
  if (!Store.activeHabits().length && !localStorage.getItem('sg_presets_seen')) {
    localStorage.setItem('sg_presets_seen', '1');
    presetsOpen = true;
    render();
  }
  Sync.resume();
  /* offline + installability; no-op on file:// */
  if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  /* midnight rollover: refresh the Today view when the date changes */
  setInterval(() => {
    if (activeTab === 'today' && !viewDate && $('#view').dataset.day !== Logic.todayISO()) render();
  }, 60000);
})();

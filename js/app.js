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
  let detailId = null;   // open habit detail (legacy sheet; Today no longer opens it)
  let editDraft = null;  // editor modal draft
  let presetsOpen = false;
  let welcomeOpen = false;
  let sampleTipOpen = false;
  let signinBtnNudge = false;
  let mapPage = 0;       // detail streakmap paging: 0 = latest 52 weeks
  let analyticsMode = 'all';       // 'all' | 'focus'
  let analyticsFocusHabitId = null;
  let analyticsYear = null;        // null = current calendar year
  let analyticsMapPage = 0;        // focus inline 52-week map paging
  let viewDate = null;   // Today tab date; null = live today (so midnight rolls over)
  let calOpen = false;   // custom themed date picker
  let calMonth = null;   // 'YYYY-MM' while calendar is open
  let clientIdAdvanced = false;
  let clientIdReveal = false;
  let deferredInstall = null; // beforeinstallprompt event
  let installHintOpen = false; // iOS / fallback instructions toggle

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }
  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function canNativeInstall() { return !!deferredInstall; }
  function showInstallUi() { return !isStandalone(); }

  async function triggerInstall() {
    if (!deferredInstall) return false;
    const ev = deferredInstall;
    deferredInstall = null;
    ev.prompt();
    try { await ev.userChoice; } catch (e) {}
    render();
    return true;
  }

  function installCardHTML() {
    if (!showInstallUi()) {
      return '<div class="card"><h2>Home screen</h2><p class="mini" style="margin:0">Running as an installed app on this device.</p></div>';
    }
    if (canNativeInstall()) {
      return '<div class="card installcard"><h2>Home screen</h2>' +
        '<p>Add StreakGrid like an app for one-tap access. Works offline after install.</p>' +
        '<div class="btnrow"><button type="button" class="btn" id="installbtn">Install StreakGrid</button></div>' +
        '</div>';
    }
    if (isIos()) {
      return '<div class="card installcard"><h2>Home screen</h2>' +
        '<p>On iPhone/iPad, Safari cannot show a one-tap install dialog. Use Share instead.</p>' +
        '<div class="btnrow"><button type="button" class="btn" id="installhint">How to add</button></div>' +
        (installHintOpen
          ? '<ol class="installsteps"><li>Tap the <b>Share</b> button in Safari.</li>' +
            '<li>Scroll and tap <b>Add to Home Screen</b>.</li>' +
            '<li>Tap <b>Add</b>. Open StreakGrid from your home screen next time.</li></ol>'
          : '') +
        '</div>';
    }
    return '<div class="card installcard"><h2>Home screen</h2>' +
      '<p>Use your browser menu: <b>Install app</b> or <b>Add to Home screen</b>. Chrome and Edge on Android usually offer a direct install.</p>' +
      '<div class="btnrow"><button type="button" class="btn ghost" id="installhint">Show tips</button></div>' +
      (installHintOpen
        ? '<ol class="installsteps"><li>Open the browser menu (⋮).</li>' +
          '<li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>' +
          '<li>Confirm. Launch from the home screen icon afterward.</li></ol>'
        : '') +
      '</div>';
  }

  function wireInstallCard() {
    const btn = $('#installbtn');
    if (btn) btn.addEventListener('click', () => { triggerInstall(); });
    const hint = $('#installhint');
    if (hint) hint.addEventListener('click', () => { installHintOpen = !installHintOpen; render(); });
  }

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
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#2f6fed');
    const r = m ? parseInt(m[1], 16) : 47, g = m ? parseInt(m[2], 16) : 111, b = m ? parseInt(m[3], 16) : 237;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function accentHex() {
    return (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f6fed');
  }

  /** Fill color for streak cells / checks: theme accent or per-habit color. */
  function gridInk(h) {
    const mode = ((state.settings || {}).gridColor) || 'accent';
    return mode === 'habit' ? (h.color || accentHex()) : accentHex();
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

  const STREAK_CELEB_KEY = 'sg_streak_celebrate';
  const STREAK_TIER_RANK = { none: 0, mild: 1, hot: 2 };
  let streakCelebrated = {};
  try { streakCelebrated = JSON.parse(localStorage.getItem(STREAK_CELEB_KEY) || '{}'); } catch (e) { streakCelebrated = {}; }

  function streakHeatTier(h, streak) {
    if (Logic.isPerWeek(h)) {
      if (streak >= 4) return 'hot';
      if (streak >= 2) return 'mild';
      return 'none';
    }
    if (streak >= 7) return 'hot';
    if (streak >= 3) return 'mild';
    return 'none';
  }

  function streakHeatChipHTML(h, streak, habitId) {
    const tier = streakHeatTier(h, streak);
    if (tier === 'none') return '';
    const label = tier === 'hot' ? 'Hot' : 'Mild';
    return '<span class="streakchip ' + tier + '" data-streak-chip="' + esc(habitId || h.id) + '">' + label + '</span>';
  }

  function fmtPct(v) { return v === null ? '·' : Math.round(v * 100) + '%'; }

  function fmtDelta(v) {
    if (v === null) return '';
    const n = Math.round(v * 100);
    if (!n) return ' · flat';
    return ' · ' + (n > 0 ? '+' : '') + n + 'pp';
  }

  function fmtLastDone(iso) {
    if (!iso) return 'never';
    const d = Logic.parseDate(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function yearHeatHTML(cols, ink, mode) {
    /* mode: 'combined' uses score 0-1; 'habit' uses done/skip binary */
    return '<div class="gridfull yeargrid">' + cols.map(col =>
      '<div class="col">' + col.map(c => {
        if (c.outside) return '<span class="c outside"></span>';
        let style = '';
        if (mode === 'combined') {
          if (c.score !== null) {
            const sc = c.score;
            const a = sc >= 1 ? 1 : sc >= .75 ? .75 : sc >= .5 ? .5 : sc > 0 ? .28 : 0;
            if (a) style = 'background:' + hexToRgba(ink, a);
          } else if (c.skip) style = 'opacity:.45';
        } else {
          if (c.done) style = 'background:' + esc(ink);
          else if (c.skip && !c.future) style = 'background:' + hexToRgba(ink, .18);
        }
        return '<span class="c' + (c.future ? ' future' : '') + (c.today ? ' today' : '') + '" style="' + style + '"></span>';
      }).join('') + '</div>').join('') + '</div>';
  }

  function yearPickerHTML(years, selectedYear) {
    return '<div class="yearchips">' + years.map(y =>
      '<button type="button" class="yearchip' + (y === selectedYear ? ' on' : '') + '" data-year="' + y + '">' + y + '</button>'
    ).join('') + '</div>';
  }

  function heatLegendHTML() {
    return '<span class="heatswatch" style="background:var(--cell0)"></span>' +
      '<span class="heatswatch" style="background:var(--heat1)"></span>' +
      '<span class="heatswatch" style="background:var(--heat2)"></span>' +
      '<span class="heatswatch" style="background:var(--heat3)"></span>' +
      '<span class="heatswatch" style="background:var(--heat4)"></span>' +
      ' less → more';
  }

  function checkStreakCelebrations(habits) {
    const today = Logic.todayISO();
    const upgraded = [];
    let changed = false;
    habits.forEach(h => {
      const tier = streakHeatTier(h, Logic.currentStreak(h, state.cells, state.skips, today));
      const prev = streakCelebrated[h.id] || 'none';
      if (STREAK_TIER_RANK[tier] > STREAK_TIER_RANK[prev]) {
        upgraded.push({ id: h.id, tier });
        streakCelebrated[h.id] = tier;
        changed = true;
      } else if (STREAK_TIER_RANK[tier] < STREAK_TIER_RANK[prev]) {
        streakCelebrated[h.id] = tier;
        changed = true;
      }
    });
    if (changed) {
      try { localStorage.setItem(STREAK_CELEB_KEY, JSON.stringify(streakCelebrated)); } catch (e) {}
    }
    upgraded.forEach(u => {
      const el = document.querySelector('[data-streak-chip="' + u.id + '"]');
      if (el) {
        el.classList.add('celebrate', 'celebrate-' + u.tier);
        setTimeout(() => el.classList.remove('celebrate', 'celebrate-' + u.tier), 600);
      }
      if (navigator.vibrate) { try { navigator.vibrate(u.tier === 'hot' ? [10, 30, 10] : 12); } catch (e) {} }
    });
  }

  // ---------- streakmap builders ----------
  function miniMap(h, weeks) {
    const ink = gridInk(h);
    const cols = Logic.streakmapWeeks(h, state.cells, state.skips, weeks, Logic.todayISO());
    return '<div class="gridmini">' + cols.map(col =>
      '<div class="col">' + col.map(c => {
        let style = '';
        if (c.done) style = 'background:' + esc(ink);
        else if (c.skip && !c.future) style = 'background:' + hexToRgba(ink, .18);
        return '<span class="c' + (c.future ? ' future' : '') + '" style="' + style + '"></span>';
      }).join('') + '</div>').join('') + '</div>';
  }

  function fullMap(h, weeks, endISO) {
    const ink = gridInk(h);
    const upto = endISO || Logic.todayISO();
    let cols = Logic.streakmapWeeks(h, state.cells, state.skips, weeks, upto);
    /* Drop leading empty weeks before the habit's first activity so short histories
       (e.g. sample data) are not a blank left scroll of unused columns. */
    const start = Logic.habitStartDate(h, state.cells);
    if (start && cols.length) {
      const firstWk = Logic.weekStartOf(start);
      const windowEnd = cols[cols.length - 1][0].iso;
      if (firstWk <= windowEnd) {
        while (cols.length > 1 && cols[0][0].iso < firstWk) cols.shift();
      }
    }
    const today = Logic.todayISO();
    return '<div class="gridfull">' + cols.map(col =>
      '<div class="col">' + col.map(c => {
        let style = '';
        const future = c.iso > today;
        if (c.done) style = 'background:' + esc(ink);
        else if (c.skip && !future) style = 'background:' + hexToRgba(ink, .18);
        return '<span class="c' + (future ? ' future' : '') + (c.iso === today ? ' today' : '') + '" data-cell="' + c.iso + '" style="' + style + '"></span>';
      }).join('') + '</div>').join('') + '</div>';
  }

  function applyTheme() {
    const s = state.settings || {};
    const t = s.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    document.documentElement.setAttribute('data-accent', s.accent || 'cobalt');
  }

  // ---------- render root ----------
  function syncDotClass() {
    const enabled = Sync.state().enabled;
    const s = syncStatus.s;
    if (!enabled) return s === 'off' ? 'off' : s;
    if (s === 'syncing' || s === 'pending') return s;
    if (s === 'error') return 'error';
    return 'ok'; // signed in: green, even if a quiet re-auth is needed
  }

  function syncDotTitle() {
    const enabled = Sync.state().enabled;
    if (enabled && (syncStatus.s === 'ok' || syncStatus.s === 'off' || !syncStatus.s)) return 'Connected to Google Drive';
    if (enabled && syncStatus.s === 'auth') return syncStatus.detail || 'Connected. Tap to refresh Drive sync.';
    return syncStatus.detail || syncStatus.s;
  }

  function render() {
    state = Store.get();
    applyTheme();
    const y = window.scrollY; // keep scroll position across re-renders
    document.querySelectorAll('nav.tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
      b.classList.toggle('tab-nudge', b.dataset.tab === 'settings' && shouldShowSigninNudge());
    });
    const dot = $('#syncdot');
    dot.className = 'syncdot ' + syncDotClass();
    dot.title = syncDotTitle();
    $('#subline').textContent = Sync.state().enabled && Sync.state().email ? Sync.state().email : 'local';
    if (activeTab === 'settings' && shouldShowSigninNudge()) {
      signinBtnNudge = true;
      try { localStorage.setItem('sg_signin_nudge_seen', '1'); } catch (e) {}
    }
    if (activeTab === 'today') renderToday();
    else if (activeTab === 'analytics') renderAnalytics();
    else if (activeTab === 'help') renderHelp();
    else renderSettings();
    $('#fab').classList.toggle('hidden', activeTab !== 'today');
    renderModal();
    window.scrollTo(0, y);
  }

  function shouldShowSigninNudge() {
    if (Sync.state().enabled) return false;
    if (localStorage.getItem('sg_signin_nudge_seen')) return false;
    if (Store.activeHabits().length < 2) return false;
    const first = +(localStorage.getItem('sg_first_seen_at') || 0);
    if (!first) return false;
    return (Date.now() - first) >= 86400000;
  }

  async function doResetAll() {
    const connected = Sync.state().enabled;
    const msg = connected
      ? 'Erase this browser and overwrite your Google Drive StreakGrid file with empty data? A later sync will not bring the old habits back. Export a backup first if you want them.'
      : 'Erase all habits and checks in this browser? Export a backup first if you care about them.';
    if (!confirm(msg)) return false;
    Store.resetAll();
    sampleTipOpen = false;
    welcomeOpen = false;
    if (connected) {
      try { await Sync.overwriteRemoteBlank(); }
      catch (e) { alert('Local data cleared, but Drive overwrite failed: ' + (e.message || e)); }
    }
    presetsOpen = true;
    activeTab = 'today';
    detailId = null;
    editDraft = null;
    calOpen = false;
    mapPage = 0;
    viewDate = null;
    render();
    return true;
  }

  function loadSampleFromSettings() {
    const hasData = Store.activeHabits().length > 0 || Object.keys((Store.get().cells) || {}).length > 0;
    const connected = Sync.state().enabled;
    let msg = hasData
      ? 'Replace the data in this browser with sample habits? Export a backup first if you care about what is here.'
      : 'Load sample habits into this browser?';
    if (connected) msg += ' You are signed in; the next sync can push this sample to your Drive file.';
    if (!confirm(msg)) return;
    try {
      Store.importJSON(JSON.stringify(Sample.demoDoc()));
    } catch (e) {
      alert(e.message || 'Could not load sample data');
      return;
    }
    welcomeOpen = false;
    sampleTipOpen = false;
    presetsOpen = false;
    activeTab = 'today';
    detailId = null;
    editDraft = null;
    calOpen = false;
    mapPage = 0;
    viewDate = null;
    render();
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
      const ink = gridInk(h);
      const perWeekNote = Logic.isPerWeek(h)
        ? ' · ' + Logic.weekDoneCount(h, state.cells, Logic.weekStartOf(iso), iso) + '/' + Logic.weekTarget(h) + ' this wk' : '';
      return '<div class="hcard compact">' +
        '<div class="top">' +
          '<span class="emoji" style="background:' + hexToRgba(h.color, .16) + '">' + esc(h.emoji) + '</span>' +
          '<span class="nm"><div class="name">' + esc(h.name) + '</div>' +
            '<div class="meta">' + esc(scheduleLabel(h)) + perWeekNote + ' · ' + streak + Logic.streakUnit(h) + '</div></span>' +
          '<button class="check' + (done ? ' done' : '') + (!req && !done ? ' optional' : '') + '" data-toggle="' + h.id + '"' +
            ' aria-label="' + esc(h.name) + (done ? ': done, tap to undo' : ': mark done') + '" aria-pressed="' + done + '"' +
            ' data-color="' + esc(ink) + '"' +
            ' style="' + (done ? 'background:' + esc(ink) + ';border-color:' + esc(ink) : '') + '">✓</button>' +
        '</div></div>';
    }).join('');

    if (!habits.length) {
      cards = '<div class="empty"><div class="big">🌱</div>No habits yet.<br>Tap + to add your first.</div>';
    }

    $('#view').innerHTML =
      '<div class="todayhead">' +
        '<button type="button" class="date" id="pickday" aria-label="Jump to a date">' + esc(nice) + (isToday ? '' : ' <small class="pastlbl">(past day)</small>') + '</button>' +
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
    $('#restchip').addEventListener('click', () => { Store.toggleSkip(iso); render(); });
    $('#daynote').addEventListener('change', ev => Store.setNote(iso, ev.target.value));
    $('#pickday').addEventListener('click', () => {
      calMonth = iso.slice(0, 7);
      calOpen = true;
      render();
    });
    $('#prevday').addEventListener('click', () => { viewDate = Logic.addDays(iso, -1); render(); });
    const nx = $('#nextday');
    if (nx) nx.addEventListener('click', () => {
      const next = Logic.addDays(iso, 1);
      viewDate = next >= today ? null : next;
      render();
    });
    const jt = $('#jumptoday');
    if (jt) jt.addEventListener('click', () => { viewDate = null; render(); });
    wireInstallCard();
  }

  // ---------- Analytics ----------
  function renderAnalyticsAllOverview(habits, today) {
    const momentum = Logic.avgStrength(habits, state.cells, state.skips, today);
    const perfect = Logic.perfectDayStreak(habits, state.cells, state.skips, today);
    const r30 = Logic.aggregateRate(habits, state.cells, state.skips, 30, today);
    const r30prev = Logic.aggregateRate(habits, state.cells, state.skips, 30, Logic.addDays(today, -30));
    const r30delta = (r30 !== null && r30prev !== null) ? r30 - r30prev : null;
    const weak = Logic.weakestHabit(habits, state.cells, state.skips, today);
    const weakLabel = weak
      ? esc(weak.emoji) + ' ' + esc(weak.name)
      : '·';
    return '<div class="statgrid">' +
      '<div class="stat"><div class="v">' + Math.round(momentum * 100) + '</div><div class="k">momentum</div></div>' +
      '<div class="stat"><div class="v">' + perfect + 'd</div><div class="k">perfect-day streak</div></div>' +
      '<div class="stat"><div class="v">' + fmtPct(r30) + fmtDelta(r30delta) + '</div><div class="k">30-day rate</div></div>' +
      '<div class="stat"><div class="v stat-sm">' + weakLabel + '</div><div class="k">needs attention</div></div>' +
    '</div>';
  }

  function renderAnalyticsFocusOverview(h, today) {
    const cur = Logic.currentStreak(h, state.cells, state.skips, today);
    const best = Logic.bestStreak(h, state.cells, state.skips, today);
    const stg = Logic.strength(h, state.cells, state.skips, today);
    const r30 = Logic.completionRate(h, state.cells, state.skips, 30, today);
    const delta = Logic.rateDelta(h, state.cells, state.skips, 7, today);
    const unit = Logic.streakUnit(h);
    const chip = streakHeatChipHTML(h, cur, h.id);
    return '<div class="anafocushead">' +
      '<span class="emoji" style="background:' + hexToRgba(h.color, .16) + '">' + esc(h.emoji) + '</span>' +
      '<span class="grow"><div class="name">' + esc(h.name) + ' ' + chip + '</div>' +
        '<div class="meta">' + esc(scheduleLabel(h)) + ' · last done ' + fmtLastDone(Logic.lastDoneDate(h, state.cells, today)) + '</div></span>' +
      '<button type="button" class="btn ghost" id="inlineedit">Edit</button>' +
    '</div>' +
    '<div class="statgrid">' +
      '<div class="stat"><div class="v">' + cur + unit + '</div><div class="k">current streak</div></div>' +
      '<div class="stat"><div class="v">' + Math.round(stg * 100) + fmtDelta(delta) + '</div><div class="k">strength</div></div>' +
      '<div class="stat"><div class="v">' + fmtPct(r30) + '</div><div class="k">30-day rate</div></div>' +
      '<div class="stat"><div class="v">' + best + unit + '</div><div class="k">best streak</div></div>' +
    '</div>' +
    '<p class="mini" style="margin:8px 0 0">30-day rate: share of scheduled days done in the last 30 days. Strength: 0–100 rolling score (recent days count more; about a 2-week memory).</p>';
  }

  function renderAnalyticsFocusPanels(h, today, year) {
    const ink = gridInk(h);
    const dow = Logic.dowShareBreakdown(h, state.cells);
    const dowMax = Math.max.apply(null, dow.concat([.01]));
    const months = Logic.monthlyCounts(h, state.cells, 6, today);
    const moMax = Math.max.apply(null, months.map(m => m.count).concat([1]));
    const endISO = Logic.addDays(today, -364 * analyticsMapPage);
    const startISO = Logic.addDays(Logic.weekStartOf(endISO), -7 * 51);
    const first = Logic.habitStartDate(h, state.cells);
    const olderExists = first && first < startISO;
    const rangeLbl = analyticsMapPage === 0 ? 'last 52 weeks'
      : startISO.slice(0, 10) + ' to ' + endISO.slice(0, 10);
    return '<div class="card"><h2>Streakmap · ' + rangeLbl + ' · tap to edit any day</h2>' +
      fullMap(h, 52, endISO) +
      '<div class="maplegend" style="display:flex;justify-content:space-between;align-items:center">' +
        '<span>Full color = done · faint = rest day</span>' +
        '<span><button type="button" class="pagebtn" id="anamapolder"' + (olderExists ? '' : ' disabled') + '>‹ older</button>' +
        '<button type="button" class="pagebtn" id="anamapnewer"' + (analyticsMapPage > 0 ? '' : ' disabled') + '>newer ›</button></span>' +
      '</div></div>' +
      '<div class="card"><h2>By weekday</h2><div class="bars">' + dow.map((n, i) =>
        '<div class="b"><b>' + Math.round(n * 100) + '%</b><i style="height:' + Math.round(n / dowMax * 100) + '%;background:' + esc(h.color) + '"></i><span>' + DOWS[i] + '</span></div>').join('') + '</div>' +
      '<div class="mini">Share of completions on each weekday (not raw counts).</div></div>' +
      '<div class="card"><h2>Last 6 months</h2><div class="bars">' + months.map(m =>
        '<div class="b"><b>' + m.count + '</b><i style="height:' + Math.round(m.count / moMax * 100) + '%;background:' + hexToRgba(h.color, .75) + '"></i><span>' + m.label + '</span></div>').join('') + '</div></div>';
  }

  function renderAnalyticsAllRows(habits, today) {
    return habits.map(h => {
      const st = Logic.strength(h, state.cells, state.skips, today);
      const r7 = Logic.completionRate(h, state.cells, state.skips, 7, today);
      const r30 = Logic.completionRate(h, state.cells, state.skips, 30, today);
      const cur = Logic.currentStreak(h, state.cells, state.skips, today);
      const chip = streakHeatChipHTML(h, cur, h.id);
      return '<div class="hrow">' +
        '<span class="nm">' + esc(h.emoji) + ' ' + esc(h.name) + ' ' + chip + '</span>' +
        '<span class="strengthbar"><i style="width:' + Math.round(st * 100) + '%;background:' + esc(h.color) + '"></i></span>' +
        '<span class="m">' + fmtPct(r7) + '</span><span class="m">' + fmtPct(r30) + '</span></div>';
    }).join('');
  }

  function wireAnalytics(habits) {
    document.querySelectorAll('[data-analytics-mode]').forEach(b => b.addEventListener('click', () => {
      analyticsMode = b.dataset.analyticsMode;
      if (analyticsMode === 'focus' && !analyticsFocusHabitId && habits.length) {
        analyticsFocusHabitId = habits[0].id;
      }
      analyticsMapPage = 0;
      render();
    }));
    document.querySelectorAll('[data-focus-habit]').forEach(b => b.addEventListener('click', () => {
      analyticsMode = 'focus';
      analyticsFocusHabitId = b.dataset.focusHabit;
      analyticsMapPage = 0;
      render();
    }));
    document.querySelectorAll('[data-year]').forEach(b => b.addEventListener('click', () => {
      analyticsYear = +b.dataset.year;
      render();
    }));
    const edit = $('#inlineedit');
    if (edit) edit.addEventListener('click', () => openEditor(analyticsFocusHabitId));
    const older = $('#anamapolder'), newer = $('#anamapnewer');
    if (older) older.addEventListener('click', () => { analyticsMapPage++; render(); });
    if (newer) newer.addEventListener('click', () => { analyticsMapPage = Math.max(0, analyticsMapPage - 1); render(); });
    const focusH = habits.find(h => h.id === analyticsFocusHabitId);
    if (focusH) {
      document.querySelectorAll('#view [data-cell]').forEach(c => c.addEventListener('click', () => {
        if (c.dataset.cell > Logic.todayISO()) return;
        Store.toggleCell(c.dataset.cell, focusH.id);
        render();
      }));
    }
    const yg = document.querySelector('#view .yeargrid');
    if (yg) yg.scrollLeft = yg.scrollWidth;
    const gf = document.querySelector('#view .gridfull:not(.yeargrid)');
    if (gf) gf.scrollLeft = gf.scrollWidth;
    checkStreakCelebrations(habits);
  }

  function renderAnalytics() {
    const today = Logic.todayISO();
    const habits = Store.activeHabits();
    if (!habits.length) { $('#view').innerHTML = '<div class="empty"><div class="big">📊</div>Add habits to see analytics.</div>'; return; }

    if (analyticsMode === 'focus') {
      if (!analyticsFocusHabitId || !habits.some(h => h.id === analyticsFocusHabitId)) {
        analyticsFocusHabitId = habits[0].id;
      }
    }

    const years = Logic.dataYears(habits, state.cells);
    let year = analyticsYear || years[years.length - 1];
    if (years.indexOf(year) === -1) {
      year = years[years.length - 1];
      analyticsYear = year;
    }

    const accent = accentHex();
    const modeSeg = '<div class="seg analyticsseg" id="analyticsseg">' +
      '<button type="button" data-analytics-mode="all" class="' + (analyticsMode === 'all' ? 'on' : '') + '">All</button>' +
      '<button type="button" data-analytics-mode="focus" class="' + (analyticsMode === 'focus' ? 'on' : '') + '">Focus one</button>' +
    '</div>';

    const focusChips = analyticsMode === 'focus'
      ? '<div class="habitchips">' + habits.map(h =>
          '<button type="button" class="habitchip' + (h.id === analyticsFocusHabitId ? ' on' : '') + '" data-focus-habit="' + h.id + '">' +
            esc(h.emoji) + ' ' + esc(h.name) + '</button>').join('') + '</div>'
      : '';

    let yearHeat, heatTitle, heatLegendNote;
    if (analyticsMode === 'focus') {
      const h = habits.find(x => x.id === analyticsFocusHabitId);
      const cols = Logic.streakmapCalendarYear(h, state.cells, state.skips, year, today);
      yearHeat = yearHeatHTML(cols, gridInk(h), 'habit');
      heatTitle = esc(h.emoji) + ' ' + esc(h.name) + ' · ' + year;
      heatLegendNote = 'Full color = done · faint = rest day';
    } else {
      const cols = Logic.combinedYearHeat(habits, state.cells, state.skips, year, today);
      yearHeat = yearHeatHTML(cols, accent, 'combined');
      heatTitle = 'All habits · ' + year;
      heatLegendNote = 'Cell shade = share of scheduled habits completed that day';
    }

    const overview = analyticsMode === 'focus'
      ? renderAnalyticsFocusOverview(habits.find(x => x.id === analyticsFocusHabitId), today)
      : renderAnalyticsAllOverview(habits, today);

    const body = analyticsMode === 'focus'
      ? renderAnalyticsFocusPanels(habits.find(x => x.id === analyticsFocusHabitId), today, year)
      : '<div class="card"><h2>Per habit · strength / 7d / 30d</h2>' + renderAnalyticsAllRows(habits, today) +
        '<div class="mini">Strength is an exponentially weighted average (Loop Habit Tracker model): a miss dents it, it never zeroes like a streak. Rest days never penalize.</div></div>';

    $('#view').innerHTML =
      '<div class="card"><h2>Overview</h2>' + modeSeg + overview + '</div>' +
      focusChips +
      '<div class="card"><h2>' + heatTitle + '</h2>' +
        yearPickerHTML(years, year) +
        yearHeat +
        '<div class="maplegend">' + heatLegendHTML() + '<br>' + heatLegendNote + '</div></div>' +
      body;

    wireAnalytics(habits);
  }

  // ---------- Help ----------
  function renderHelp() {
    const st = Sync.state();
    const configured = GDrive.configured();

    let driveCard;
    if (st.enabled) {
      driveCard =
        '<div class="card help"><h2>Phone + laptop sync</h2>' +
        '<p>You are signed in as <b>' + esc(st.email || '?') + '</b>. Checks sync to Google Drive (folder <code>StreakGrid</code>). Use the same Google account on your other device.</p>' +
        '<div class="btnrow">' +
          '<button class="btn" id="help-sync">Sync now</button>' +
          '<button class="btn ghost" id="help-disconnect">Sign out</button>' +
        '</div>' +
        '<p class="mini">If the other device looks stale, open the app there and tap Sync now (or the green/gray dot in the header).</p>' +
        '</div>';
    } else if (configured && GDrive.onHttp()) {
      driveCard =
        '<div class="card help"><h2>Phone + laptop sync</h2>' +
        '<p>Optional. Keeps habits in your Google Drive so a second device (or a cleared browser) can restore them.</p>' +
        '<div class="btnrow"><button class="btn" id="help-connect">Sign in with Google</button></div>' +
        '<p class="mini">Google will ask for Drive access. Accept. Your habits stay in <em>your</em> Drive only.</p>' +
        '<p class="mini">If Google says access blocked, your Gmail is not on this app\'s test-user list. Ask the person who runs the Google Cloud project to add you, then try again.</p>' +
        '</div>';
    } else if (!GDrive.onHttp()) {
      driveCard =
        '<div class="card help"><h2>Phone + laptop sync</h2>' +
        '<p>Open this app from a website link (https), not as a downloaded file. Then you can sign in to Google Drive.</p>' +
        '</div>';
    } else {
      driveCard =
        '<div class="card help"><h2>Phone + laptop sync</h2>' +
        '<p>Optional. This copy of the app has no Client ID yet (common for forks or local serve). Paste one in Settings → Advanced, or create your own (link below).</p>' +
        '<div class="btnrow"><button class="btn" id="helptosettings">Go to Settings</button></div>' +
        '<p class="mini">After a Client ID is set, return here for <b>Sign in with Google</b>.</p>' +
        '<p class="mini">How to create a Client ID: <a href="https://github.com/aalias01/streakgrid#google-drive-setup-full-reference" target="_blank" rel="noopener">setup guide on GitHub</a>.</p>' +
        '</div>';
    }

    $('#view').innerHTML =
      '<div class="card help"><h2>Track habits</h2>' +
        '<ul>' +
          '<li>Tap <b>+</b> to add a habit (presets or your own). Schedules: every day, weekdays, or N× per week.</li>' +
          '<li>On <b>Today</b>, tap the <b>checkmark</b> to log it. Cards are compact check rows only.</li>' +
          '<li><b>Analytics</b> has an <b>All</b> portfolio view and a <b>Focus one</b> mode for a single habit\'s streakmap, stats, and calendar-year heat.</li>' +
          '<li>Forgot a day? Tap the date for a calendar, or use the arrows. Future days are blocked.</li>' +
          '<li>Need a break? Tap <b>mark rest day</b> so every habit is optional that day and streaks do not break.</li>' +
          '<li>Optional: add a one-line <b>note</b> under Today for that day.</li>' +
        '</ul>' +
        '<p class="mini">Streaks break only on a missed <em>scheduled</em> day. Rest days, off days, and unfinished today still count as carrying. <b>30-day rate</b> is how often you hit scheduled days in the last 30 days. <b>Strength</b> (0–100) is a rolling score that weights recent days more (about a 2-week memory). <b>Mild/Hot</b> chips flag streak momentum in Analytics.</p>' +
        '<p class="mini">This device already saves everything as you go. You do not need Google for that.</p>' +
      '</div>' +
      driveCard +
      '<div class="card help"><h2>Phone and look</h2>' +
        '<ul>' +
          '<li>Settings → <b>Appearance</b>: light/dark mode, accent (Cobalt / Ink / Teal / Fern / Violet / Amber), and whether streak grids use the accent or each habit\'s color.</li>' +
          '<li>Edit a habit to change its color (used when grids are <b>By habit</b>, and on emoji tiles / strength bars).</li>' +
          '<li>Settings → <b>Home screen</b>: on Android/Chrome tap <b>Install StreakGrid</b> when it appears; on iPhone use <b>How to add</b> (Safari Share → Add to Home Screen).</li>' +
        '</ul>' +
      '</div>' +
      '<div class="card help"><h2>Backup without Google</h2>' +
        '<p>Settings → <b>Export JSON</b> before you clear the browser or switch phones. Later use <b>Import JSON</b> to restore.</p>' +
        '<p class="mini">First visit: a prompt can load sample habits. Anytime later: Settings → <b>Load sample</b>. Clear with Settings → <b>Reset all</b>. If signed in, Reset also empties the Drive file. Export first if you want a backup.</p>' +
        '<div class="btnrow"><button class="btn ghost" id="helptosettings2">Open Settings</button></div>' +
      '</div>';

    const connect = $('#help-connect');
    if (connect) connect.addEventListener('click', async () => {
      try { await Sync.connect(); } catch (e) { alert(e.message); }
      render();
    });
    const syncBtn = $('#help-sync');
    if (syncBtn) syncBtn.addEventListener('click', () => { Sync.fullSync(true).catch(e => alert(e.message)); });
    const disc = $('#help-disconnect');
    if (disc) disc.addEventListener('click', () => { Sync.disconnect(); render(); });
    const toSet = $('#helptosettings');
    if (toSet) toSet.addEventListener('click', () => { activeTab = 'settings'; render(); window.scrollTo(0, 0); });
    const toSet2 = $('#helptosettings2');
    if (toSet2) toSet2.addEventListener('click', () => { activeTab = 'settings'; render(); window.scrollTo(0, 0); });
  }

  // ---------- Settings ----------
  function renderSettings() {
    const st = Sync.state();
    const reason = GDrive.unavailableReason ? GDrive.unavailableReason() : null;
    const override = (localStorage.getItem('sg_gclient') || '').trim();
    const baked = (((window.SG_CONFIG || {}).googleClientId) || '').trim();
    const configured = GDrive.configured();
    if (!configured) clientIdAdvanced = true;

    const driveBody = st.enabled
      ? '<div class="set-row"><span class="grow">Connected as <b>' + esc(st.email || '?') + '</b></span>' +
        '<button class="btn ghost" id="syncnow">Sync now</button><button class="btn ghost" id="disconnect">Disconnect</button></div>' +
        '<div class="mini">Your data lives in a "StreakGrid" folder in your own Google Drive as one JSON file. This app can only see files it created (drive.file scope).</div>'
      : '<div class="set-row"><span class="grow">Store your data in your own Google Drive and sync across devices.</span>' +
        '<button class="btn' + (signinBtnNudge ? ' btn-nudge' : '') + '" id="connect">Sign in with Google</button></div>' +
        (reason ? '<div class="mini">' + esc(reason) + '</div>' : '<div class="mini">Nothing is sent anywhere except your own Drive. Tracking without sign-in still works.</div>');
    signinBtnNudge = false;

    let clientBlock;
    if (configured && !override && baked) {
      clientBlock =
        '<div class="mini" style="margin-top:8px">Client ID is set for this app. Sign in above. Only Google accounts on the project\'s test-user list can connect.</div>';
    } else if (configured && override) {
      clientBlock =
        '<div class="mini" style="margin-top:8px">Using a Client ID override saved on this device. Sign in above.</div>';
    } else {
      clientBlock =
        '<div class="mini" style="margin-top:8px">No Client ID yet. Open Advanced to paste one (forks / local), or deploy with <code>GOOGLE_CLIENT_ID</code>.</div>';
    }

    const inputType = clientIdReveal ? 'text' : 'password';
    const advancedBody = clientIdAdvanced
      ? '<div class="advbody">' +
          '<div class="set-row"><span class="grow">Override Client ID</span></div>' +
          '<div class="set-row clientidrow">' +
            '<input type="' + inputType + '" id="clientid" autocomplete="off" spellcheck="false" ' +
              'placeholder="xxxx.apps.googleusercontent.com" value="' + esc(override) + '">' +
            '<button type="button" class="btn ghost" id="clientidtoggle">' + (clientIdReveal ? 'Hide' : 'Show') + '</button>' +
          '</div>' +
          '<div class="btnrow" style="margin-top:8px">' +
            (override ? '<button type="button" class="btn ghost" id="clientidclear">Clear override</button>' : '') +
          '</div>' +
          '<div class="mini">Override stays on this device only. Leave empty to use the app default when the deploy provides one. Creating a Client ID: see the GitHub README.</div>' +
        '</div>'
      : '';

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
        clientBlock +
        '<button type="button" class="linkish" id="clientidadv" style="margin-top:10px">' +
          (clientIdAdvanced ? 'Hide Advanced' : 'Advanced: override Client ID') +
        '</button>' +
        advancedBody +
      '</div>' +
      installCardHTML() +
      '<div class="card"><h2>Habits</h2>' + habitRows + (archivedRows ? '<h2 style="margin-top:14px">Archived</h2>' + archivedRows : '') + '</div>' +
      '<div class="card"><h2>Appearance</h2>' +
        '<div class="set-row"><span class="grow">Mode</span><span class="seg" id="themeseg">' +
        ['auto', 'light', 'dark'].map(t =>
          '<button data-theme-opt="' + t + '" class="' + (((state.settings || {}).theme || 'auto') === t ? 'on' : '') + '">' + t + '</button>').join('') +
        '</span></div>' +
        '<div class="set-row accentrow"><span class="set-label">Accent</span><span class="seg accentseg" id="accentseg">' +
        [
          { id: 'cobalt', label: 'Cobalt', sw: '#2f6fed' },
          { id: 'ink', label: 'Ink', sw: '#2a3344' },
          { id: 'teal', label: 'Teal', sw: '#1f8a8a' },
          { id: 'fern', label: 'Fern', sw: '#3d9970' },
          { id: 'violet', label: 'Violet', sw: '#6b5cff' },
          { id: 'amber', label: 'Amber', sw: '#c9922a' }
        ].map(a =>
          '<button data-accent-opt="' + a.id + '" class="' + (((state.settings || {}).accent || 'cobalt') === a.id ? 'on' : '') + '">' +
            '<span class="swatch" style="background:' + a.sw + '"></span><span class="alabel">' + a.label + '</span>' +
          '</button>').join('') +
        '</span></div>' +
        '<div class="set-row"><span class="grow">Streak grids</span><span class="seg" id="gridseg">' +
        [
          { id: 'accent', label: 'Accent' },
          { id: 'habit', label: 'By habit' }
        ].map(g =>
          '<button data-grid-opt="' + g.id + '" class="' + (((state.settings || {}).gridColor || 'accent') === g.id ? 'on' : '') + '">' + g.label + '</button>').join('') +
        '</span></div>' +
        '<div class="mini">Accent paints chrome and unified grids. <b>By habit</b> uses each habit\'s color (edit a habit to change it). Analytics overview always uses Accent.</div>' +
      '</div>' +
      '<div class="card"><h2>Data</h2><div class="btnrow">' +
        '<button class="btn" id="exportjson">Export JSON</button>' +
        '<button class="btn ghost" id="exportcsv">Export CSV log</button>' +
        '<button class="btn ghost" id="importjson">Import JSON</button>' +
        '<button class="btn ghost" id="loadsample">Load sample</button>' +
        '<button class="btn danger" id="reset">Reset all</button></div>' +
        '<div class="mini">This browser holds the working copy. Nothing is pruned. JSON is the full backup; CSV is a long-format log (date, habit, value, timestamp) for pandas or a spreadsheet. <b>Load sample</b> replaces this browser with demo habits. <b>Reset all</b> clears this browser; if signed in it also empties the Drive file, then opens the habit picker.</div>' +
      '</div>' +
      '<div class="card"><h2>About</h2><div class="mini">StreakGrid is free and open source. Streak rules: only a missed scheduled day breaks a streak; rest days and unscheduled days carry; today stays pending until it is over. Weekly-target habits count streaks in weeks. <a href="https://github.com/aalias01/streakgrid" target="_blank" rel="noopener">GitHub</a></div></div>';

    const cn = $('#connect');
    if (cn) cn.addEventListener('click', async () => {
      try { await Sync.connect(); } catch (e) { alert(e.message); }
      render();
    });
    wireInstallCard();
    const dc = $('#disconnect');
    if (dc) dc.addEventListener('click', () => { Sync.disconnect(); render(); });
    const sn = $('#syncnow');
    if (sn) sn.addEventListener('click', () => Sync.fullSync(true));
    $('#clientidadv').addEventListener('click', () => { clientIdAdvanced = !clientIdAdvanced; render(); });
    const cid = $('#clientid');
    if (cid) cid.addEventListener('change', ev => {
      const v = ev.target.value.trim();
      if (v) localStorage.setItem('sg_gclient', v);
      else localStorage.removeItem('sg_gclient');
      render();
    });
    const tog = $('#clientidtoggle');
    if (tog) tog.addEventListener('click', () => { clientIdReveal = !clientIdReveal; render(); });
    const clr = $('#clientidclear');
    if (clr) clr.addEventListener('click', () => {
      localStorage.removeItem('sg_gclient');
      clientIdReveal = false;
      render();
    });
    document.querySelectorAll('[data-theme-opt]').forEach(b => b.addEventListener('click', () => {
      Store.setSetting('theme', b.dataset.themeOpt); render();
    }));
    document.querySelectorAll('[data-accent-opt]').forEach(b => b.addEventListener('click', () => {
      Store.setSetting('accent', b.dataset.accentOpt); render();
    }));
    document.querySelectorAll('[data-grid-opt]').forEach(b => b.addEventListener('click', () => {
      Store.setSetting('gridColor', b.dataset.gridOpt); render();
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
    $('#loadsample').addEventListener('click', () => { loadSampleFromSettings(); });
    $('#reset').addEventListener('click', () => { doResetAll(); });
  }

  // ---------- detail + editor + sample prompts + calendar modals ----------
  function renderModal() {
    const root = $('#modal');
    if (editDraft) { root.innerHTML = editorHTML(); wireEditor(); return; }
    if (welcomeOpen) { root.innerHTML = welcomeHTML(); wireWelcome(); return; }
    if (sampleTipOpen) { root.innerHTML = sampleTipHTML(); wireSampleTip(); return; }
    if (presetsOpen) { root.innerHTML = presetsHTML(); wirePresets(); return; }
    if (calOpen) { root.innerHTML = calendarHTML(); wireCalendar(); return; }
    if (detailId) {
      const h = Store.getHabit(detailId);
      if (!h || h.deleted) { detailId = null; root.innerHTML = ''; return; }
      root.innerHTML = detailHTML(h); wireDetail(h); return;
    }
    root.innerHTML = '';
  }

  function shiftMonth(ym, delta) {
    const p = ym.split('-');
    let y = +p[0], m = +p[1] + delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  }

  function calendarHTML() {
    const today = Logic.todayISO();
    const selected = viewDate || today;
    const ym = calMonth || today.slice(0, 7);
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const firstISO = ym + '-01';
    const daysInMonth = new Date(y, m, 0).getDate();
    const startDow = Logic.dowMon(firstISO);
    const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const thisYm = today.slice(0, 7);
    const canNext = ym < thisYm;

    let cells = '';
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = ym + '-' + (d < 10 ? '0' : '') + d;
      const future = iso > today;
      const isSel = iso === selected;
      const isTod = iso === today;
      const cls = 'calcell' + (future ? ' future' : '') + (isSel ? ' selected' : '') + (isTod ? ' today' : '');
      /* Skip empty placeholder cells (they inflated the first row). Offset day 1 instead. */
      const col = (d === 1 && startDow > 0) ? ' style="grid-column-start:' + (startDow + 1) + '"' : '';
      cells += future
        ? '<span class="' + cls + '"' + col + '>' + d + '</span>'
        : '<button type="button" class="' + cls + '" data-calday="' + iso + '"' + col + '>' + d + '</button>';
    }

    return '<div class="overlay" id="ovl"><div class="sheet calsheet"><div class="grab"></div>' +
      '<div class="calhead">' +
        '<button type="button" class="calnavbtn" id="calprev" aria-label="previous month">‹</button>' +
        '<div class="caltitle">' + esc(monthLabel) + '</div>' +
        '<button type="button" class="calnavbtn" id="calnext" aria-label="next month"' + (canNext ? '' : ' disabled') + '>›</button>' +
        '<button type="button" class="calnavbtn calclose" id="calclose" aria-label="close">✕</button>' +
      '</div>' +
      '<div class="caldows">' + DOWS.map(d => '<span>' + d + '</span>').join('') + '</div>' +
      '<div class="calgrid">' + cells + '</div>' +
      '<div class="btnrow calfoot"><button class="btn ghost" id="caltoday">Jump to today</button></div>' +
    '</div></div>';
  }

  function wireCalendar() {
    const close = () => { calOpen = false; render(); };
    $('#calclose').addEventListener('click', close);
    $('#ovl').addEventListener('click', ev => { if (ev.target.id === 'ovl') close(); });
    $('#calprev').addEventListener('click', () => { calMonth = shiftMonth(calMonth || Logic.todayISO().slice(0, 7), -1); render(); });
    const nx = $('#calnext');
    if (nx) nx.addEventListener('click', () => {
      if (nx.disabled) return;
      calMonth = shiftMonth(calMonth || Logic.todayISO().slice(0, 7), 1);
      render();
    });
    $('#caltoday').addEventListener('click', () => { viewDate = null; calOpen = false; render(); });
    document.querySelectorAll('[data-calday]').forEach(b => b.addEventListener('click', () => {
      const today = Logic.todayISO();
      const v = b.dataset.calday;
      viewDate = v >= today ? null : v;
      calOpen = false;
      render();
    }));
  }

  // ---------- first-run sample prompt + post-sample tip ----------
  function welcomeHTML() {
    return '<div class="overlay" id="ovl"><div class="sheet welcomesheet"><div class="grab"></div>' +
      '<h2>Try sample data?</h2>' +
      '<div class="btnrow">' +
        '<button type="button" class="btn" id="welcome-sample">Try sample</button>' +
        '<button type="button" class="btn ghost" id="welcome-skip">Skip</button>' +
      '</div>' +
      '<p class="mini">You can clear sample (or any) data later with Settings → Reset all.</p>' +
    '</div></div>';
  }

  function markWelcomeSeen() {
    try {
      localStorage.setItem('sg_welcome_seen', '1');
      localStorage.setItem('sg_presets_seen', '1');
    } catch (e) {}
  }

  function wireWelcome() {
    $('#welcome-skip').addEventListener('click', () => {
      markWelcomeSeen();
      welcomeOpen = false;
      presetsOpen = true;
      render();
    });
    $('#welcome-sample').addEventListener('click', () => {
      try {
        Store.importJSON(JSON.stringify(Sample.demoDoc()));
      } catch (e) {
        alert(e.message || 'Could not load sample data');
        return;
      }
      markWelcomeSeen();
      welcomeOpen = false;
      presetsOpen = false;
      sampleTipOpen = true;
      activeTab = 'today';
      render();
    });
    /* Do not dismiss by tapping the dim overlay — force a choice. */
  }

  function sampleTipHTML() {
    return '<div class="overlay" id="ovl"><div class="sheet welcomesheet"><div class="grab"></div>' +
      '<h2>Sample data loaded</h2>' +
      '<p class="lead">Explore the grids, or start fresh with Reset all. You can always Reset later in Settings.</p>' +
      '<div class="btnrow">' +
        '<button type="button" class="btn" id="sample-skip">Explore</button>' +
        '<button type="button" class="btn danger" id="sample-reset">Reset all</button>' +
      '</div>' +
    '</div></div>';
  }

  function wireSampleTip() {
    $('#sample-skip').addEventListener('click', () => {
      sampleTipOpen = false;
      render();
    });
    $('#sample-reset').addEventListener('click', () => { doResetAll(); });
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
      '<p class="mini" style="margin:8px 0 0">30-day rate: share of scheduled days done in the last 30 days. Strength: 0–100 rolling score (recent days count more; about a 2-week memory).</p>' +
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
    /* Narrow sheets: keep the newest weeks in view (GitHub-style left=older). */
    const gf = document.querySelector('#ovl .gridfull');
    if (gf) gf.scrollLeft = gf.scrollWidth;
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
    /* Keep sample/welcome sheets open until Try/Skip/Reset — avoids flash when switching tabs. */
    if (welcomeOpen || sampleTipOpen) return;
    activeTab = b.dataset.tab;
    detailId = null; editDraft = null; presetsOpen = false; mapPage = 0; viewDate = null; calOpen = false;
    render();
  });
  $('#fab').addEventListener('click', () => {
    if (welcomeOpen || sampleTipOpen) return;
    presetsOpen = true; render();
  });
  /* sync dot doubles as a manual sync / reconnect button */
  $('#syncdot').addEventListener('click', () => {
    if (welcomeOpen || sampleTipOpen) return;
    if (!Sync.state().enabled) { activeTab = 'settings'; render(); return; }
    Sync.fullSync(true).catch(() => {});
  });

  // ---------- boot ----------
  try {
    if (!localStorage.getItem('sg_first_seen_at')) localStorage.setItem('sg_first_seen_at', String(Date.now()));
  } catch (e) {}
  Store.init(() => Sync.schedulePush());
  Sync.init({
    getDoc: () => Store.get(),
    applyDoc: doc => { Store.replaceState(doc); render(); },
    onStatus: (s, detail) => {
      syncStatus = { s, detail };
      const dot = $('#syncdot');
      if (dot) { dot.className = 'syncdot ' + syncDotClass(); dot.title = syncDotTitle(); }
    }
  });
  render();
  /* first run: sample prompt once when empty; Skip opens presets */
  if (!Store.activeHabits().length && !localStorage.getItem('sg_welcome_seen')) {
    welcomeOpen = true;
    render();
  } else if (!Store.activeHabits().length && !localStorage.getItem('sg_presets_seen')) {
    localStorage.setItem('sg_presets_seen', '1');
    presetsOpen = true;
    render();
  }
  Sync.resume();
  /* offline + installability; no-op on file:// */
  if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', ev => {
    ev.preventDefault();
    deferredInstall = ev;
    render();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    render();
  });
  /* midnight rollover: refresh the Today view when the date changes */
  setInterval(() => {
    if (activeTab === 'today' && !viewDate && $('#view').dataset.day !== Logic.todayISO()) render();
  }, 60000);
})();

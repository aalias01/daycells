/* Daycells state, persistence, and migration.
 * localStorage is the working copy; Drive (via Sync) is durability.
 * All mutations stamp `ts`/`updatedAt` so multi-device merge is last-write-wins
 * per cell/field, with tombstones for deleted habits.
 */
const Store = (() => {
  const LS_KEY = 'daycells-v2';
  const LEGACY_LS_KEY = 'streakgrid-v2'; // pre-rename StreakGrid key
  const OLD_KEY = 'ds-prep-habits-v1'; // v1 DS-prep tracker, migrated once
  const PALETTE = ['#3d9970', '#4c7fae', '#9b8ec4', '#d0703c', '#c9a227', '#3a9ea5', '#c06c9c', '#c0442e'];

  let state = null;
  let onChange = null;

  const now = () => Date.now();
  const uid = () => 'h' + now().toString(36) + Math.random().toString(36).slice(2, 6);

  function blank() {
    return {
      version: 2,
      updatedAt: 0,
      habits: [],      // {id,name,emoji,color,schedule,order,createdAt,updatedAt,archived,deleted}
      cells: {},       // 'iso|habitId' -> {v,ts}
      skips: {},       // iso -> {v,ts}
      notes: {},       // iso -> {text,ts}
      settings: { weekStart: 1, theme: 'light', accent: 'cobalt' },
      settingsUpdatedAt: 0
    };
  }

  // ---------- v1 migration (Alv's DS-prep data) ----------
  function migrateV1(raw) {
    let old;
    try { old = JSON.parse(raw); } catch (e) { return null; }
    if (!old || old.version !== 1 || !old.days) return null;
    const s = blank();
    const t = now();
    const mk = (name, emoji, schedule, i) => {
      const h = { id: uid() + i, name: name, emoji: emoji, color: PALETTE[i % PALETTE.length],
        schedule: schedule, order: i, createdAt: new Date(t).toISOString(), updatedAt: t, archived: false, deleted: false };
      s.habits.push(h); return h;
    };
    const core = [
      mk('A · LeetCode', '🧩', { kind: 'daily' }, 0),
      mk('B · SQL', '🗄️', { kind: 'daily' }, 1),
      mk('C · Deep block', '🎯', { kind: 'daily' }, 2),
      mk('D · Ace book', '📚', { kind: 'daily' }, 3),
      mk('E · Close-out', '✍️', { kind: 'daily' }, 4)
    ];
    const coreIds = ['a', 'b', 'c', 'd', 'e'];
    const supp = {};
    (old.support || []).forEach((h, j) => {
      if (h.archived) return;
      const emoji = { exercise: '💪', sleep: '🌙', meditation: '🧘', touch: '🤝' }[h.id] || '⭐';
      const schedule = h.id === 'touch' ? { kind: 'perWeek', target: 2 } : { kind: 'daily' };
      supp[h.id] = mk(h.label, emoji, schedule, 5 + j);
    });
    for (const iso in old.days) {
      const e = old.days[iso];
      if (e.dayType === 'Light' || e.dayType === 'Off') s.skips[iso] = { v: 1, ts: t };
      if (e.note) s.notes[iso] = { text: e.note, ts: t };
      const checks = e.checks || {};
      for (const k in checks) {
        if (!checks[k]) continue;
        const ci = coreIds.indexOf(k);
        const h = ci !== -1 ? core[ci] : supp[k];
        if (h) s.cells[iso + '|' + h.id] = { v: 1, ts: t };
      }
    }
    s.updatedAt = t;
    return s;
  }

  // ---------- load/save ----------
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { const s = JSON.parse(raw); if (s && s.version === 2) { state = Object.assign(blank(), s); return state; } }
    } catch (e) { /* fall through */ }
    try {
      const legacy = localStorage.getItem(LEGACY_LS_KEY);
      if (legacy) {
        const s = JSON.parse(legacy);
        if (s && s.version === 2) {
          state = Object.assign(blank(), s);
          save();
          try { localStorage.removeItem(LEGACY_LS_KEY); } catch (e) {}
          return state;
        }
      }
    } catch (e) { /* fall through */ }
    const old = (() => { try { return localStorage.getItem(OLD_KEY); } catch (e) { return null; } })();
    state = (old && migrateV1(old)) || blank();
    save();
    return state;
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
    if (onChange) onChange();
  }
  function replaceState(s) { state = Object.assign(blank(), s); try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

  // ---------- habit CRUD ----------
  function activeHabits() {
    return state.habits.filter(h => !h.archived && !h.deleted).sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  function archivedHabits() { return state.habits.filter(h => h.archived && !h.deleted).sort((a, b) => (a.order || 0) - (b.order || 0)); }
  function getHabit(id) { return state.habits.find(h => h.id === id) || null; }

  function addHabit(fields) {
    const h = {
      id: uid(), name: fields.name || 'Habit', emoji: fields.emoji || '⭐',
      color: fields.color || PALETTE[state.habits.length % PALETTE.length],
      schedule: fields.schedule || { kind: 'daily' },
      order: state.habits.length ? Math.max.apply(null, state.habits.map(h => h.order || 0)) + 1 : 0,
      createdAt: new Date().toISOString(), updatedAt: now(), archived: false, deleted: false
    };
    state.habits.push(h); save(); return h;
  }
  function updateHabit(id, fields) {
    const h = getHabit(id); if (!h) return;
    Object.assign(h, fields, { updatedAt: now() }); save();
  }
  function moveHabit(id, dir) {
    const list = activeHabits();
    const i = list.findIndex(h => h.id === id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= list.length) return;
    const oi = list[i].order; list[i].order = list[j].order; list[j].order = oi;
    list[i].updatedAt = now(); list[j].updatedAt = now();
    save();
  }
  /** Reorder active habits to match `orderedIds` (full active list). */
  function reorderHabits(orderedIds) {
    if (!orderedIds || !orderedIds.length) return;
    const t = now();
    const active = activeHabits();
    const idSet = new Set(active.map(h => h.id));
    if (orderedIds.length !== active.length || orderedIds.some(id => !idSet.has(id))) return;
    orderedIds.forEach((id, i) => {
      const h = getHabit(id);
      if (!h) return;
      if (h.order !== i) { h.order = i; h.updatedAt = t; }
    });
    save();
  }
  function deleteHabit(id) { const h = getHabit(id); if (h) { h.deleted = true; h.updatedAt = now(); save(); } }

  // ---------- day mutations ----------
  function toggleCell(iso, habitId) {
    const k = Logic.cellKey(iso, habitId);
    const cur = state.cells[k];
    state.cells[k] = { v: cur && cur.v ? 0 : 1, ts: now() };
    save();
  }
  function toggleSkip(iso) {
    const cur = state.skips[iso];
    state.skips[iso] = { v: cur && cur.v ? 0 : 1, ts: now() };
    save();
  }
  function setNote(iso, text) { state.notes[iso] = { text: text, ts: now() }; save(); }
  function getNote(iso) { const n = state.notes[iso]; return n ? n.text : ''; }

  // ---------- settings ----------
  function setSetting(key, val) { state.settings[key] = val; state.settingsUpdatedAt = now(); save(); }

  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(text) {
    const s = JSON.parse(text);
    if (!s || s.version !== 2 || !s.habits) throw new Error('not a Daycells backup');
    replaceState(s);
    if (onChange) onChange();
  }
  function resetAll() { replaceState(blank()); if (onChange) onChange(); }

  function init(cb) { onChange = cb; return load(); }
  const get = () => state;

  return { init, get, save, replaceState, PALETTE,
    activeHabits, archivedHabits, getHabit, addHabit, updateHabit, moveHabit, reorderHabits, deleteHabit,
    toggleCell, toggleSkip, setNote, getNote, setSetting, exportJSON, importJSON, resetAll, migrateV1, blank };
})();

if (typeof module !== 'undefined') module.exports = Store;

/* Sample demo document for first-run "Try sample data".
 * Always ends at Logic.todayISO() so the grids stay current.
 */
const Sample = (() => {
  const HABITS = [
    { id: 'h_water', name: 'Morning glass of water', emoji: '💧', color: '#4c7fae', schedule: { kind: 'daily' }, order: 0 },
    { id: 'h_move', name: 'Move 30 minutes', emoji: '🏃', color: '#3d9970', schedule: { kind: 'daily' }, order: 1 },
    { id: 'h_read', name: 'Read 10 pages', emoji: '📖', color: '#c9a227', schedule: { kind: 'daily' }, order: 2 },
    { id: 'h_gym', name: 'Gym', emoji: '🏋️', color: '#d0703c', schedule: { kind: 'perWeek', target: 3 }, order: 3 },
    { id: 'h_code', name: 'Practice coding', emoji: '💻', color: '#3d9970', schedule: { kind: 'perWeek', target: 4 }, order: 4 },
    { id: 'h_deep', name: 'Deep work session', emoji: '🎯', color: '#d0703c', schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4] }, order: 5 },
    { id: 'h_bed', name: 'In bed by 10:30', emoji: '🌙', color: '#4c7fae', schedule: { kind: 'daily' }, order: 6 }
  ];

  /* Deterministic pseudo-random in [0,1) from date + habit id. */
  function hash01(iso, id) {
    let h = 2166136261;
    const s = iso + '|' + id;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  function shouldFill(habit, iso) {
    const dow = Logic.dowMon(iso);
    const r = hash01(iso, habit.id);
    const kind = (habit.schedule || {}).kind || 'daily';
    if (kind === 'weekdays' && dow > 4) return false;
    if (kind === 'perWeek') {
      /* denser mid-week so weekly targets usually hit */
      if (dow === 5 || dow === 6) return r < 0.22;
      return r < 0.55;
    }
    if (habit.id === 'h_water') return r < 0.88;
    if (habit.id === 'h_bed') return r < 0.72;
    if (habit.id === 'h_read') return r < 0.68;
    if (habit.id === 'h_move') return r < 0.62;
    if (habit.id === 'h_deep') return r < 0.75;
    return r < 0.65;
  }

  function demoDoc() {
    const today = Logic.todayISO();
    const start = Logic.addDays(today, -(12 * 7 - 1)); /* ~12 weeks inclusive */
    const t = Date.now();
    const createdAt = new Date(Logic.parseDate(start).getTime()).toISOString();
    const habits = HABITS.map(h => Object.assign({}, h, {
      createdAt: createdAt,
      updatedAt: t,
      archived: false,
      deleted: false
    }));
    const cells = {};
    for (let iso = start; iso <= today; iso = Logic.addDays(iso, 1)) {
      const dayTs = Logic.parseDate(iso).getTime() + 12 * 3600000;
      habits.forEach(h => {
        if (shouldFill(h, iso)) cells[iso + '|' + h.id] = { v: 1, ts: dayTs };
      });
    }
    /* a couple of rest days in the middle of the window */
    const skips = {};
    const skipA = Logic.addDays(start, 21);
    const skipB = Logic.addDays(start, 56);
    skips[skipA] = { v: 1, ts: t };
    skips[skipB] = { v: 1, ts: t };

    return {
      version: 2,
      updatedAt: t,
      habits: habits,
      cells: cells,
      skips: skips,
      notes: {},
      settings: { weekStart: 1, theme: 'auto', accent: 'cobalt' },
      settingsUpdatedAt: t
    };
  }

  return { demoDoc };
})();

if (typeof module !== 'undefined') module.exports = Sample;

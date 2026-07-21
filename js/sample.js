/* Sample demo document for first-run "Try sample data".
 * Always ends at Logic.todayISO() so the grids stay current.
 * ~26 weeks of history with per-habit phases (ramps, slumps, hot streaks).
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

  /* Habit start offsets (days from demo window start). Some habits begin later. */
  const START_OFFSET = {
    h_water: 0,
    h_bed: 0,
    h_read: 7,
    h_move: 14,
    h_deep: 21,
    h_code: 28,
    h_gym: 35
  };

  /* Deterministic pseudo-random in [0,1) from date + habit id (+ salt). */
  function hash01(iso, id, salt) {
    let h = 2166136261;
    const s = iso + '|' + id + (salt ? '|' + salt : '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  /* Progress 0→1 across the demo window. */
  function phase(dayIndex, span) {
    return Math.min(1, Math.max(0, dayIndex / Math.max(1, span - 1)));
  }

  /* Base completion chance by habit + life phase (early struggle → mid consistency → late mix). */
  function baseRate(habit, p) {
    /* early / mid / late baselines */
    const profiles = {
      h_water: [0.55, 0.82, 0.92],
      h_bed: [0.40, 0.65, 0.78],
      h_read: [0.35, 0.70, 0.55],   /* strong mid, soft late */
      h_move: [0.30, 0.58, 0.72],
      h_deep: [0.45, 0.80, 0.68],
      h_code: [0.40, 0.75, 0.85],
      h_gym: [0.35, 0.55, 0.50]
    };
    const [a, b, c] = profiles[habit.id] || [0.45, 0.65, 0.70];
    if (p < 0.33) return a + (b - a) * (p / 0.33);
    if (p < 0.66) return b + (c - b) * ((p - 0.33) / 0.33);
    return c;
  }

  /* Temporary slumps / hot streaks keyed off window position. */
  function rateModifier(habit, dayIndex, span) {
    const p = phase(dayIndex, span);
    let m = 1;
    /* travel / sick week ~1/3 in */
    if (p > 0.30 && p < 0.38) m *= 0.35;
    /* strong streak window ~2/3 in */
    if (p > 0.58 && p < 0.72) m *= 1.25;
    /* recent wobble for a couple habits */
    if (p > 0.88) {
      if (habit.id === 'h_read' || habit.id === 'h_gym') m *= 0.55;
      if (habit.id === 'h_water' || habit.id === 'h_code') m *= 1.1;
    }
    /* weekend soft for move/bed */
    return m;
  }

  function shouldFill(habit, iso, dayIndex, span) {
    const startOff = START_OFFSET[habit.id] || 0;
    if (dayIndex < startOff) return false;

    const dow = Logic.dowMon(iso);
    const kind = (habit.schedule || {}).kind || 'daily';
    if (kind === 'weekdays' && dow > 4) return false;

    const p = phase(dayIndex - startOff, span - startOff);
    let rate = baseRate(habit, p) * rateModifier(habit, dayIndex, span);

    if (kind === 'perWeek') {
      /* denser mid-week so weekly targets often hit, weekends lighter */
      if (dow === 5 || dow === 6) rate *= 0.45;
      else rate *= 1.05;
      rate = Math.min(0.92, Math.max(0.12, rate));
      return hash01(iso, habit.id) < rate;
    }

    if (dow === 5 || dow === 6) {
      if (habit.id === 'h_move') rate *= 0.85;
      if (habit.id === 'h_bed') rate *= 0.7;
      if (habit.id === 'h_read') rate *= 1.05;
    }

    rate = Math.min(0.96, Math.max(0.08, rate));
    return hash01(iso, habit.id) < rate;
  }

  function demoDoc() {
    const today = Logic.todayISO();
    const span = 26 * 7; /* ~6 months inclusive-ish */
    const start = Logic.addDays(today, -(span - 1));
    const t = Date.now();

    const habits = HABITS.map(h => {
      const off = START_OFFSET[h.id] || 0;
      const first = Logic.addDays(start, off);
      return Object.assign({}, h, {
        createdAt: new Date(Logic.parseDate(first).getTime()).toISOString(),
        updatedAt: t,
        archived: false,
        deleted: false
      });
    });

    const cells = {};
    let dayIndex = 0;
    for (let iso = start; iso <= today; iso = Logic.addDays(iso, 1), dayIndex++) {
      const dayTs = Logic.parseDate(iso).getTime() + 12 * 3600000;
      habits.forEach(h => {
        if (shouldFill(h, iso, dayIndex, span)) cells[iso + '|' + h.id] = { v: 1, ts: dayTs };
      });
    }

    /* Rest days: travel week, a sick day, a long weekend, and a couple scattered */
    const skips = {};
    const restOffsets = [22, 23, 24, 25, 26, 27, 28, 55, 90, 91, 92, 120, 155];
    restOffsets.forEach(off => {
      const iso = Logic.addDays(start, off);
      if (iso <= today) skips[iso] = { v: 1, ts: t };
    });

    /* A few day notes so See all notes has something to show */
    const notes = {};
    const noteSpecs = [
      [24, 'Travel week — keeping it light.'],
      [56, 'Back into a rhythm after the slump.'],
      [95, 'Deep work felt easy this week.'],
      [140, 'Gym consistency dipped; restart next week.'],
      [span - 3, 'Solid stretch lately.']
    ];
    noteSpecs.forEach(([off, text]) => {
      const iso = Logic.addDays(start, Math.min(off, span - 1));
      if (iso <= today) notes[iso] = { text: text, ts: t };
    });

    return {
      version: 2,
      updatedAt: t,
      habits: habits,
      cells: cells,
      skips: skips,
      notes: notes,
      settings: { weekStart: 1, theme: 'auto', accent: 'cobalt' },
      settingsUpdatedAt: t
    };
  }

  return { demoDoc };
})();

if (typeof module !== 'undefined') module.exports = Sample;

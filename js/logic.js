/* Daycells pure logic. No DOM, unit-tested in node.
 * Schedules: {kind:'daily'} | {kind:'weekdays', days:[0..6 Mon-first]} | {kind:'perWeek', target:n}
 * Cells: { 'YYYY-MM-DD|habitId': {v:0|1, ts} }  Skips (rest days): { 'YYYY-MM-DD': {v:1, ts} }
 * Streak philosophy: a rest day never breaks anything; only a missed *required*
 * past day resets; today stays pending until it is over.
 */
const Logic = (() => {
  const EWMA_DAY = Math.pow(0.5, 1 / 13);  // half-life: 13 required days
  const EWMA_WEEK = Math.pow(0.5, 1 / 6);  // half-life: 6 weeks (perWeek habits)

  // ---------- dates ----------
  const pad2 = n => (n < 10 ? '0' : '') + n;
  const fmtDate = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const parseDate = iso => { const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return fmtDate(d); };
  const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const todayISO = () => fmtDate(new Date());
  const dowMon = iso => (parseDate(iso).getDay() + 6) % 7;            // 0=Mon .. 6=Sun
  const weekStartOf = iso => addDays(iso, -dowMon(iso));              // Monday of that week

  // ---------- cells ----------
  const cellKey = (iso, id) => iso + '|' + id;
  const isDone = (cells, iso, id) => { const c = cells[cellKey(iso, id)]; return !!(c && c.v); };
  const isSkip = (skips, iso) => { const s = skips[iso]; return !!(s && s.v); };

  // ---------- schedules ----------
  function isScheduled(habit, iso) {
    const s = habit.schedule || { kind: 'daily' };
    if (s.kind === 'daily') return true;
    if (s.kind === 'weekdays') {
      const days = (s.days || []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
      return days.indexOf(dowMon(iso)) !== -1;
    }
    return true; // perWeek: any day can count toward the target
  }
  function isRequired(habit, iso, skips) {
    if (isSkip(skips, iso)) return false;
    const s = habit.schedule || { kind: 'daily' };
    if (s.kind === 'perWeek') return false;
    return isScheduled(habit, iso);
  }
  const isPerWeek = habit => (habit.schedule || {}).kind === 'perWeek';
  const weekTarget = habit => Math.max(1, (habit.schedule || {}).target || 1);

  function habitStartDate(habit, cells) {
    let first = habit.createdAt ? habit.createdAt.slice(0, 10) : null;
    for (const k in cells) {
      const iso = k.slice(0, 10);
      if (k.slice(11) === habit.id && cells[k].v && (!first || iso < first)) first = iso;
    }
    return first;
  }

  function weekDoneCount(habit, cells, wkStart, uptoISO) {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const iso = addDays(wkStart, i);
      if (iso > uptoISO) break;
      if (isDone(cells, iso, habit.id)) n++;
    }
    return n;
  }

  // ---------- streaks ----------
  /* Daily/weekday habits: streak in days. */
  function dayStreak(habit, cells, skips, uptoISO, wantBest) {
    const start = habitStartDate(habit, cells);
    if (!start) return 0;
    let streak = 0, best = 0;
    for (let iso = start; iso <= uptoISO; iso = addDays(iso, 1)) {
      if (isDone(cells, iso, habit.id)) { streak++; if (streak > best) best = streak; }
      else if (isRequired(habit, iso, skips) && iso !== uptoISO) streak = 0;
      /* not required, or pending today: carry */
    }
    return wantBest ? best : streak;
  }

  /* perWeek habits: streak in whole weeks; the current week is pending. */
  function weekStreak(habit, cells, skips, uptoISO, wantBest) {
    const start = habitStartDate(habit, cells);
    if (!start) return 0;
    const target = weekTarget(habit);
    const curWk = weekStartOf(uptoISO);
    let streak = 0, best = 0;
    for (let wk = weekStartOf(start); wk <= curWk; wk = addDays(wk, 7)) {
      const n = weekDoneCount(habit, cells, wk, uptoISO);
      if (n >= target) { streak++; if (streak > best) best = streak; }
      else if (wk !== curWk) streak = 0; /* past week missed target */
      /* current week below target: pending, carry */
    }
    return wantBest ? best : streak;
  }

  const currentStreak = (h, c, s, upto) => isPerWeek(h) ? weekStreak(h, c, s, upto, false) : dayStreak(h, c, s, upto, false);
  const bestStreak = (h, c, s, upto) => isPerWeek(h) ? weekStreak(h, c, s, upto, true) : dayStreak(h, c, s, upto, true);
  const streakUnit = h => isPerWeek(h) ? 'wk' : 'd';

  // ---------- strength (Loop-style EWMA) ----------
  function strength(habit, cells, skips, uptoISO) {
    const start = habitStartDate(habit, cells);
    if (!start) return 0;
    let s = 0, seen = false;
    if (isPerWeek(habit)) {
      const target = weekTarget(habit), curWk = weekStartOf(uptoISO);
      for (let wk = weekStartOf(start); wk <= curWk; wk = addDays(wk, 7)) {
        if (wk === curWk) break; /* current week not judged yet */
        const f = Math.min(1, weekDoneCount(habit, cells, wk, uptoISO) / target);
        s = s * EWMA_WEEK + f * (1 - EWMA_WEEK); seen = true;
      }
      /* current week can only help */
      const f = Math.min(1, weekDoneCount(habit, cells, curWk, uptoISO) / target);
      if (f >= 1) { s = s * EWMA_WEEK + (1 - EWMA_WEEK); seen = true; }
    } else {
      for (let iso = start; iso <= uptoISO; iso = addDays(iso, 1)) {
        const done = isDone(cells, iso, habit.id);
        if (!done && !isRequired(habit, iso, skips)) continue;
        if (!done && iso === uptoISO) continue; /* pending today */
        s = s * EWMA_DAY + (done ? 1 : 0) * (1 - EWMA_DAY); seen = true;
      }
    }
    return seen ? s : 0;
  }

  // ---------- analytics ----------
  function completionRate(habit, cells, skips, nDays, uptoISO) {
    const start = habitStartDate(habit, cells);
    if (!start) return null;
    const from = addDays(uptoISO, -(nDays - 1));
    const lo = from > start ? from : start;
    if (isPerWeek(habit)) {
      const target = weekTarget(habit), curWk = weekStartOf(uptoISO);
      let hit = 0, weeks = 0;
      for (let wk = weekStartOf(lo); wk <= curWk; wk = addDays(wk, 7)) {
        if (wk === curWk && weekDoneCount(habit, cells, wk, uptoISO) < target) continue; /* pending */
        weeks++;
        if (weekDoneCount(habit, cells, wk, uptoISO) >= target) hit++;
      }
      return weeks ? hit / weeks : null;
    }
    let done = 0, req = 0;
    for (let iso = lo; iso <= uptoISO; iso = addDays(iso, 1)) {
      const d = isDone(cells, iso, habit.id);
      if (d) { done++; req++; continue; }
      if (!isRequired(habit, iso, skips)) continue;
      if (iso === uptoISO) continue; /* pending */
      req++;
    }
    return req ? done / req : null;
  }

  function totalDone(habit, cells) {
    let n = 0;
    for (const k in cells) if (k.slice(11) === habit.id && cells[k].v) n++;
    return n;
  }

  /* completions per weekday, Mon-first: [n0..n6] */
  function dowBreakdown(habit, cells) {
    const out = [0, 0, 0, 0, 0, 0, 0];
    for (const k in cells) if (k.slice(11) === habit.id && cells[k].v) out[dowMon(k.slice(0, 10))]++;
    return out;
  }

  /* last n calendar months: [{label:'Mar', count}] oldest→newest */
  function monthlyCounts(habit, cells, nMonths, uptoISO) {
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const upto = parseDate(uptoISO);
    const out = [];
    for (let i = nMonths - 1; i >= 0; i--) {
      const d = new Date(upto.getFullYear(), upto.getMonth() - i, 1);
      out.push({ key: d.getFullYear() + '-' + pad2(d.getMonth() + 1), label: names[d.getMonth()], count: 0 });
    }
    const map = {};
    out.forEach(m => map[m.key] = m);
    for (const k in cells) {
      if (k.slice(11) !== habit.id || !cells[k].v) continue;
      const m = map[k.slice(0, 7)];
      if (m) m.count++;
    }
    return out;
  }

  /* fraction of required habits completed on iso (overview heatmap); null if nothing required */
  function dayScore(habits, cells, skips, iso) {
    let req = 0, done = 0;
    for (const h of habits) {
      if (h.archived || h.deleted) continue;
      const d = isDone(cells, iso, h.id);
      const r = isPerWeek(h) ? d : isRequired(h, iso, skips);
      if (d) { done++; req++; }
      else if (r) req++;
    }
    return req ? done / req : null;
  }

  function yearWeekStarts(year) {
    const jan1 = year + '-01-01';
    const dec31 = year + '-12-31';
    const weeks = [];
    for (let wk = weekStartOf(jan1); wk <= dec31; wk = addDays(wk, 7)) weeks.push(wk);
    return weeks;
  }

  /* Calendar-year streakmap: week columns Mon-first, days outside the year are marked outside. */
  function streakmapCalendarYear(habit, cells, skips, year, uptoISO) {
    return yearWeekStarts(year).map(wk => {
      const col = [];
      for (let i = 0; i < 7; i++) {
        const iso = addDays(wk, i);
        if (+iso.slice(0, 4) !== year) {
          col.push({ iso, future: true, outside: true, done: false, skip: false, today: false });
          continue;
        }
        col.push({
          iso,
          future: iso > uptoISO,
          outside: false,
          done: isDone(cells, iso, habit.id),
          skip: isSkip(skips, iso),
          off: !isPerWeek(habit) && !isScheduled(habit, iso),
          today: iso === uptoISO
        });
      }
      return col;
    });
  }

  /* Combined year heat: score = dayScore across habits (null if nothing required). */
  function combinedYearHeat(habits, cells, skips, year, uptoISO) {
    const active = habits.filter(h => !h.archived && !h.deleted);
    return yearWeekStarts(year).map(wk => {
      const col = [];
      for (let i = 0; i < 7; i++) {
        const iso = addDays(wk, i);
        if (+iso.slice(0, 4) !== year) {
          col.push({ iso, future: true, outside: true, score: null, skip: false, today: false });
          continue;
        }
        const future = iso > uptoISO;
        col.push({
          iso,
          future,
          outside: false,
          skip: isSkip(skips, iso),
          today: iso === uptoISO,
          score: future ? null : dayScore(active, cells, skips, iso)
        });
      }
      return col;
    });
  }

  function dataYears(habits, cells) {
    const cur = new Date().getFullYear();
    let minY = cur;
    for (const h of habits) {
      const start = habitStartDate(h, cells);
      if (start) minY = Math.min(minY, +start.slice(0, 4));
    }
    const out = [];
    for (let y = minY; y <= cur; y++) out.push(y);
    return out;
  }

  function perfectDayStreak(habits, cells, skips, uptoISO) {
    const active = habits.filter(h => !h.archived && !h.deleted);
    let streak = 0;
    let iso = uptoISO;
    for (;;) {
      let req = 0, done = 0;
      for (const h of active) {
        const d = isDone(cells, iso, h.id);
        const r = isPerWeek(h) ? d : isRequired(h, iso, skips);
        if (d) { done++; req++; }
        else if (r) req++;
      }
      if (!req) { iso = addDays(iso, -1); if (iso < '2000-01-01') break; continue; }
      if (done === req) { streak++; iso = addDays(iso, -1); if (iso < '2000-01-01') break; continue; }
      if (iso === uptoISO) break;
      break;
    }
    return streak;
  }

  function lastDoneDate(habit, cells, uptoISO) {
    const start = habitStartDate(habit, cells);
    if (!start) return null;
    for (let iso = uptoISO; iso >= start; iso = addDays(iso, -1)) {
      if (isDone(cells, iso, habit.id)) return iso;
    }
    return null;
  }

  function dowShareBreakdown(habit, cells) {
    const counts = dowBreakdown(habit, cells);
    const total = counts.reduce((a, b) => a + b, 0);
    if (!total) return counts.map(() => 0);
    return counts.map(n => n / total);
  }

  function avgStrength(habits, cells, skips, uptoISO) {
    if (!habits.length) return 0;
    let sum = 0;
    for (const h of habits) sum += strength(h, cells, skips, uptoISO);
    return sum / habits.length;
  }

  function weakestHabit(habits, cells, skips, uptoISO) {
    let worst = null, worstS = Infinity;
    for (const h of habits) {
      const s = strength(h, cells, skips, uptoISO);
      if (s < worstS) { worstS = s; worst = h; }
    }
    return worst;
  }

  function aggregateRate(habits, cells, skips, nDays, uptoISO) {
    const rates = habits.map(h => completionRate(h, cells, skips, nDays, uptoISO)).filter(r => r !== null);
    return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  }

  function rateDelta(habit, cells, skips, nDays, uptoISO) {
    const r1 = completionRate(habit, cells, skips, nDays, uptoISO);
    const priorEnd = addDays(uptoISO, -nDays);
    const r0 = completionRate(habit, cells, skips, nDays, priorEnd);
    if (r1 === null || r0 === null) return null;
    return r1 - r0;
  }

  /* streakmap column data: nWeeks columns of 7, Monday-first, ending at uptoISO's week */
  function streakmapWeeks(habit, cells, skips, nWeeks, uptoISO) {
    const lastWk = weekStartOf(uptoISO);
    const cols = [];
    for (let w = nWeeks - 1; w >= 0; w--) {
      const wk = addDays(lastWk, -7 * w);
      const col = [];
      for (let i = 0; i < 7; i++) {
        const iso = addDays(wk, i);
        col.push({
          iso: iso,
          future: iso > uptoISO,
          done: isDone(cells, iso, habit.id),
          skip: isSkip(skips, iso),
          today: iso === uptoISO
        });
      }
      cols.push(col);
    }
    return cols;
  }

  return {
    EWMA_DAY, EWMA_WEEK,
    fmtDate, parseDate, addDays, diffDays, todayISO, dowMon, weekStartOf,
    cellKey, isDone, isSkip, isScheduled, isRequired, isPerWeek, weekTarget,
    habitStartDate, weekDoneCount, currentStreak, bestStreak, streakUnit,
    strength, completionRate, totalDone, dowBreakdown, dowShareBreakdown, monthlyCounts,
    dayScore, streakmapWeeks, streakmapCalendarYear, combinedYearHeat, dataYears,
    perfectDayStreak, lastDoneDate, avgStrength, weakestHabit, aggregateRate, rateDelta
  };
})();

if (typeof module !== 'undefined') module.exports = Logic;

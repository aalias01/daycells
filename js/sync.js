/* StreakGrid offline-first sync engine.
 * localStorage is the working copy; the user's Google Drive is durability.
 *
 * Merge model (conflict-free by construction):
 *  - habits merge by id, newest updatedAt wins; deletes are tombstones
 *    (deleted:true) so they propagate instead of resurrecting.
 *  - cells / skips / notes are per-key maps with a ts stamp → last write wins
 *    per key. Two devices ticking different days never conflict.
 *  - settings: newest settingsUpdatedAt wins.
 */
const Sync = (() => {
  const ENABLED_KEY = 'sg_sync_enabled';
  const EMAIL_KEY = 'sg_sync_email';
  const PUSH_DELAY = 4000;

  let deps = null;      // { getDoc, applyDoc, onStatus }
  let fileId = null;
  let timer = null;
  let running = false;
  let queued = false;
  let lastSync = null;

  const state = () => ({
    enabled: localStorage.getItem(ENABLED_KEY) === '1',
    email: localStorage.getItem(EMAIL_KEY) || '',
    lastSync
  });
  const setStatus = (s, detail) => deps && deps.onStatus && deps.onStatus(s, detail || '');

  // ---------- pure merge (unit-tested) ----------
  function mergeById(a, b) {
    const map = new Map();
    for (const h of [...(a || []), ...(b || [])]) {
      if (!h || !h.id) continue;
      const cur = map.get(h.id);
      if (!cur || (h.updatedAt || 0) > (cur.updatedAt || 0)) map.set(h.id, h);
    }
    return [...map.values()];
  }
  function mergeKeyed(a, b) {
    const out = {};
    for (const src of [a || {}, b || {}]) {
      for (const k in src) {
        const v = src[k];
        if (!v) continue;
        if (!out[k] || (v.ts || 0) > (out[k].ts || 0)) out[k] = v;
      }
    }
    return out;
  }
  function mergeDocs(local, remote) {
    const merged = {
      version: 2,
      updatedAt: Date.now(),
      habits: mergeById(local.habits, remote.habits),
      cells: mergeKeyed(local.cells, remote.cells),
      skips: mergeKeyed(local.skips, remote.skips),
      notes: mergeKeyed(local.notes, remote.notes),
      settings: (local.settingsUpdatedAt || 0) >= (remote.settingsUpdatedAt || 0) ? local.settings : remote.settings,
      settingsUpdatedAt: Math.max(local.settingsUpdatedAt || 0, remote.settingsUpdatedAt || 0)
    };
    return {
      doc: merged,
      differsFromLocal: fingerprint(merged) !== fingerprint(local),
      differsFromRemote: fingerprint(merged) !== fingerprint(remote)
    };
  }
  function fingerprint(doc) {
    const hb = (doc.habits || []).map(h => h.id + ':' + (h.updatedAt || 0) + ':' + (h.deleted ? 1 : 0)).sort().join(',');
    const keyed = m => Object.keys(m || {}).map(k => k + ':' + ((m[k] || {}).v !== undefined ? m[k].v : JSON.stringify(m[k])) + ':' + ((m[k] || {}).ts || 0)).sort().join(',');
    return hb + '|' + keyed(doc.cells) + '|' + keyed(doc.skips) + '|' + keyed(doc.notes) + '|' + (doc.settingsUpdatedAt || 0);
  }

  // ---------- sync cycles ----------
  async function fullSync(interactive) {
    if (running) { queued = true; return; }
    running = true;
    setStatus('syncing');
    try {
      if (!fileId) {
        const r = await GDrive.ensureFile(deps.getDoc());
        fileId = r.fileId;
        if (r.created) { done('ok'); return; }
      }
      const remote = await GDrive.readFile(fileId).catch(() => ({ version: 2, habits: [], cells: {}, skips: {}, notes: {} }));
      const { doc, differsFromLocal, differsFromRemote } = mergeDocs(deps.getDoc(), remote);
      if (differsFromLocal) deps.applyDoc(doc);
      if (differsFromRemote) await GDrive.writeFile(fileId, doc);
      done('ok');
    } catch (err) {
      running = false;
      const authy = /sign-in|401|none|credential/i.test(err.message || '');
      setStatus(authy ? 'auth' : 'error', err.message);
      if (authy && interactive) throw err;
    }
    function done(s) {
      running = false;
      lastSync = Date.now();
      setStatus(s);
      if (queued) { queued = false; schedulePush(); }
    }
  }

  function schedulePush() {
    if (!state().enabled) return;
    clearTimeout(timer);
    timer = setTimeout(() => fullSync(false), PUSH_DELAY);
    setStatus('pending');
  }

  async function connect() {
    await GDrive.getToken(true);
    const email = await GDrive.userEmail();
    localStorage.setItem(ENABLED_KEY, '1');
    localStorage.setItem(EMAIL_KEY, email);
    await fullSync(true);
    return email;
  }

  function disconnect() {
    localStorage.setItem(ENABLED_KEY, '0');
    localStorage.removeItem(EMAIL_KEY);
    GDrive.signOut();
    fileId = null;
    setStatus('off');
  }

  async function resume() {
    if (!state().enabled) { setStatus('off'); return; }
    if (!GDrive.canUse()) { setStatus('error', GDrive.unavailableReason()); return; }
    try {
      await GDrive.getToken(false);
      await fullSync(false);
    } catch (e) {
      setStatus('auth', 'Tap to re-connect Google Drive');
    }
  }

  function init(d) { deps = d; }

  return { init, connect, disconnect, resume, schedulePush, fullSync, state, mergeDocs, mergeById, mergeKeyed };
})();

if (typeof module !== 'undefined') module.exports = Sync;

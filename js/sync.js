/* Daycells offline-first sync engine.
 * localStorage is the working copy; the user's Google Drive is durability.
 *
 * Merge model (conflict-free by construction):
 *  - habits merge by id, newest updatedAt wins; deletes are tombstones
 *    (deleted:true) so they propagate instead of resurrecting.
 *  - cells / skips / notes are per-key maps with a ts stamp → last write wins
 *    per key. Two devices ticking different days never conflict.
 *  - settings: newest settingsUpdatedAt wins.
 *
 * Auth: background pushes never call GIS. Silent re-auth only via silentBoot
 * on resume/foreground. Interactive reconnect only from a user gesture.
 *
 * First connect (sync was off): if Drive already has habits, adopt remote only —
 * do not merge unsigned local data into an existing file. Reconnect / later syncs merge.
 */
const Sync = (() => {
  const ENABLED_KEY = 'dc_sync_enabled';
  const EMAIL_KEY = 'dc_sync_email';
  const LEGACY_ENABLED = 'sg_sync_enabled';
  const LEGACY_EMAIL = 'sg_sync_email';
  const PUSH_DELAY = 4000;
  const AUTH_DETAIL = 'Tap to re-connect Google Drive';

  let deps = null;      // { getDoc, applyDoc, onStatus }
  let fileId = null;
  let timer = null;
  let running = false;
  let queued = false;
  let dirtyPending = false;
  let lastSync = null;
  let visibilityWired = false;

  function migratePrefs() {
    try {
      if (localStorage.getItem(ENABLED_KEY) == null && localStorage.getItem(LEGACY_ENABLED) != null) {
        localStorage.setItem(ENABLED_KEY, localStorage.getItem(LEGACY_ENABLED));
        localStorage.removeItem(LEGACY_ENABLED);
      }
      if (localStorage.getItem(EMAIL_KEY) == null && localStorage.getItem(LEGACY_EMAIL) != null) {
        localStorage.setItem(EMAIL_KEY, localStorage.getItem(LEGACY_EMAIL));
        localStorage.removeItem(LEGACY_EMAIL);
      }
    } catch (e) { /* ignore */ }
  }

  const state = () => ({
    enabled: localStorage.getItem(ENABLED_KEY) === '1',
    email: localStorage.getItem(EMAIL_KEY) || '',
    lastSync
  });
  const setStatus = (s, detail) => deps && deps.onStatus && deps.onStatus(s, detail || '');

  function isAuthErr(err) {
    const m = (err && err.message) || '';
    return m === GDrive.NEEDS_AUTH || /sign-in|401|none|credential|needs-auth/i.test(m);
  }

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

  function remoteHasData(doc) {
    return ((doc && doc.habits) || []).some(h => h && h.id && !h.deleted);
  }

  // ---------- sync cycles ----------
  /** opts.adoptRemote: first-connect only — replace local with Drive when remote has habits. */
  async function fullSync(interactive, opts) {
    if (running) { queued = true; return; }
    running = true;
    setStatus('syncing');
    const wantInteractive = !!interactive;
    const adoptRemote = !!(opts && opts.adoptRemote);
    try {
      if (!fileId) {
        const r = await GDrive.ensureFile(deps.getDoc(), wantInteractive);
        fileId = r.fileId;
        if (r.created) { done('ok'); return; }
      }
      const remote = await GDrive.readFile(fileId, wantInteractive).catch(() => ({ version: 2, habits: [], cells: {}, skips: {}, notes: {} }));
      if (adoptRemote && remoteHasData(remote)) {
        deps.applyDoc(remote);
        dirtyPending = false;
        done('ok');
        return;
      }
      const { doc, differsFromLocal, differsFromRemote } = mergeDocs(deps.getDoc(), remote);
      if (differsFromLocal) deps.applyDoc(doc);
      if (differsFromRemote) await GDrive.writeFile(fileId, doc, wantInteractive);
      dirtyPending = false;
      done('ok');
    } catch (err) {
      running = false;
      const authy = isAuthErr(err);
      setStatus(authy ? 'auth' : 'error', authy ? AUTH_DETAIL : err.message);
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
    if (!GDrive.cachedToken()) {
      dirtyPending = true;
      clearTimeout(timer);
      timer = null;
      setStatus('auth', AUTH_DETAIL);
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => fullSync(false), PUSH_DELAY);
    setStatus('pending');
  }

  /* After Reset all: write blank local doc to Drive without merging (merge would resurrect remote data). */
  async function overwriteRemoteBlank() {
    if (!state().enabled) return;
    clearTimeout(timer);
    timer = null;
    queued = false;
    const blank = deps.getDoc();
    setStatus('syncing');
    try {
      if (!GDrive.cachedToken()) {
        setStatus('auth', AUTH_DETAIL);
        throw new Error(GDrive.NEEDS_AUTH);
      }
      if (!fileId) {
        const r = await GDrive.ensureFile(blank, false);
        fileId = r.fileId;
        if (r.created) {
          lastSync = Date.now();
          setStatus('ok');
          return;
        }
      }
      await GDrive.writeFile(fileId, blank, false);
      lastSync = Date.now();
      setStatus('ok');
    } catch (err) {
      const authy = isAuthErr(err);
      setStatus(authy ? 'auth' : 'error', authy ? AUTH_DETAIL : err.message);
      throw err;
    }
  }

  async function connect() {
    await GDrive.getToken(true);
    const email = await GDrive.userEmail();
    const wasEnabled = localStorage.getItem(ENABLED_KEY) === '1';
    localStorage.setItem(ENABLED_KEY, '1');
    localStorage.setItem(EMAIL_KEY, email);
    dirtyPending = false;
    await fullSync(true, wasEnabled ? undefined : { adoptRemote: true });
    return email;
  }

  function disconnect() {
    localStorage.setItem(ENABLED_KEY, '0');
    localStorage.removeItem(EMAIL_KEY);
    GDrive.signOut();
    fileId = null;
    dirtyPending = false;
    setStatus('off');
  }

  async function resume() {
    if (!state().enabled) { setStatus('off'); return; }
    if (!GDrive.canUse()) { setStatus('error', GDrive.unavailableReason()); return; }
    try {
      await GDrive.silentBoot();
      await fullSync(false);
      if (dirtyPending && GDrive.cachedToken()) await fullSync(false);
    } catch (e) {
      setStatus('auth', AUTH_DETAIL);
    }
  }

  async function onForeground() {
    if (!state().enabled || !GDrive.canUse()) return;
    if (GDrive.cachedToken()) {
      if (dirtyPending) schedulePush();
      return;
    }
    try {
      await GDrive.silentBoot();
      await fullSync(false);
    } catch (e) {
      setStatus('auth', AUTH_DETAIL);
    }
  }

  function wireVisibility() {
    if (visibilityWired || typeof document === 'undefined') return;
    visibilityWired = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onForeground();
    });
    window.addEventListener('pageshow', (ev) => {
      if (ev.persisted) onForeground();
    });
  }

  function init(d) {
    migratePrefs();
    deps = d;
    wireVisibility();
  }

  return { init, connect, disconnect, resume, schedulePush, fullSync, overwriteRemoteBlank, state, mergeDocs, mergeById, mergeKeyed };
})();

if (typeof module !== 'undefined') module.exports = Sync;

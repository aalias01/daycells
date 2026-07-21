/* Daycells: Google account + Drive storage (BYO cloud).
 * Google Identity Services token flow, client-side only, no app server.
 * Scope drive.file: the app can ONLY see files it created, one JSON doc
 * in a visible "Daycells" folder in the USER'S OWN Drive.
 * Legacy StreakGrid folder/file is renamed on first open after migrate.
 * Pattern shared with NutriChat (personal/nutrition tracker).
 *
 * Token rules: background paths never call requestAccessToken (avoids GIS
 * flash on every edit). Silent prompt:none only via silentBoot(); visible
 * auth only via getToken(true) from a user gesture.
 */
const GDrive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
  const FILE_NAME = 'daycells-data.json';
  const FOLDER_NAME = 'Daycells';
  const LEGACY_FILE = 'streakgrid-data.json';
  const LEGACY_FOLDER = 'StreakGrid';
  const TOKEN_KEY = 'dc_gtoken_v1'; // sessionStorage: survives reloads, not browser restarts
  const LEGACY_TOKEN = 'sg_gtoken_v1';
  const CLIENT_KEY = 'dc_gclient';
  const LEGACY_CLIENT = 'sg_gclient';
  const SILENT_COOLDOWN_MS = 60 * 1000;
  const NEEDS_AUTH = 'needs-auth';

  let tokenClient = null;
  let pending = null;
  let memToken = null; // { token, exp }
  let lastSilentAt = 0;

  function migrateClientPref() {
    try {
      if (localStorage.getItem(CLIENT_KEY) == null && localStorage.getItem(LEGACY_CLIENT) != null) {
        localStorage.setItem(CLIENT_KEY, localStorage.getItem(LEGACY_CLIENT));
        localStorage.removeItem(LEGACY_CLIENT);
      }
    } catch (e) { /* ignore */ }
  }

  function clientId() {
    migrateClientPref();
    return (localStorage.getItem(CLIENT_KEY) || '').trim() || ((window.DC_CONFIG || {}).googleClientId || '').trim();
  }
  const libReady = () => !!(window.google && google.accounts && google.accounts.oauth2);
  const onHttp = () => location.protocol === 'http:' || location.protocol === 'https:';
  const configured = () => !!clientId();
  const canUse = () => onHttp() && configured();

  function unavailableReason() {
    if (!onHttp()) return 'Google sign-in needs the app served over http(s). Run: python3 -m http.server 8080, or deploy it (Vercel, GitHub Pages).';
    if (!configured()) return 'No OAuth Client ID yet. Open Advanced below to paste one, or use a deploy that sets GOOGLE_CLIENT_ID.';
    if (!libReady()) return 'Google sign-in library is still loading. Try again in a moment.';
    return null;
  }

  function cacheToken(accessToken, expiresIn) {
    const exp = Date.now() + (Number(expiresIn || 3500) - 60) * 1000;
    memToken = { token: accessToken, exp };
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(memToken));
      sessionStorage.removeItem(LEGACY_TOKEN);
    } catch (e) {}
    return accessToken;
  }

  function clearCachedToken() {
    memToken = null;
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(LEGACY_TOKEN);
    } catch (e) {}
  }

  function readSessionToken() {
    try {
      let t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (!t) {
        t = JSON.parse(sessionStorage.getItem(LEGACY_TOKEN) || 'null');
        if (t) {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t));
          sessionStorage.removeItem(LEGACY_TOKEN);
        }
      }
      return t && t.exp > Date.now() ? t : null;
    } catch (e) { return null; }
  }

  /** Passive only — never calls GIS. */
  function cachedToken() {
    if (memToken && memToken.exp > Date.now()) return memToken.token;
    const t = readSessionToken();
    if (t) {
      memToken = t;
      return t.token;
    }
    memToken = null;
    return null;
  }

  function initClient() {
    if (tokenClient || !libReady() || !configured()) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      callback: (resp) => {
        const p = pending; pending = null;
        if (!p) return;
        if (resp && resp.access_token) {
          p.resolve(cacheToken(resp.access_token, resp.expires_in));
        } else p.reject(new Error((resp && resp.error) || 'Sign-in failed'));
      },
      error_callback: (err) => {
        const p = pending; pending = null;
        if (p) p.reject(new Error((err && err.type) === 'popup_closed' ? 'Sign-in cancelled' : 'Sign-in failed: ' + ((err && err.type) || 'unknown')));
      }
    });
  }

  function requestToken(prompt) {
    const reason = unavailableReason();
    if (reason) return Promise.reject(new Error(reason));
    initClient();
    if (!tokenClient) return Promise.reject(new Error('Sign-in not ready'));
    if (pending) return Promise.reject(new Error('Sign-in already in progress'));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      try { tokenClient.requestAccessToken({ prompt: prompt }); }
      catch (e) { pending = null; reject(e); }
    });
  }

  /**
   * interactive true: user gesture — may show GIS UI.
   * interactive false: cached token only; never calls requestAccessToken.
   */
  function getToken(interactive) {
    const t = cachedToken();
    if (t) return Promise.resolve(t);
    if (!interactive) return Promise.reject(new Error(NEEDS_AUTH));
    return requestToken('');
  }

  /** Single silent GIS attempt (prompt:none). Rate-limited; visibility-gated. */
  function silentBoot() {
    const t = cachedToken();
    if (t) return Promise.resolve(t);
    if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') {
      return Promise.reject(new Error(NEEDS_AUTH));
    }
    if (Date.now() - lastSilentAt < SILENT_COOLDOWN_MS) {
      return Promise.reject(new Error(NEEDS_AUTH));
    }
    lastSilentAt = Date.now();
    return requestToken('none').catch(() => Promise.reject(new Error(NEEDS_AUTH)));
  }

  function signOut() {
    const t = cachedToken();
    clearCachedToken();
    if (t && libReady()) { try { google.accounts.oauth2.revoke(t, () => {}); } catch (e) {} }
  }

  // ---------- authorized fetch ----------
  async function gfetch(url, opts, interactive) {
    const wantInteractive = !!interactive;
    let token = await getToken(wantInteractive);
    let res = await fetch(url, withAuth(opts, token));
    if (res.status === 401) {
      clearCachedToken();
      token = await getToken(wantInteractive);
      res = await fetch(url, withAuth(opts, token));
    }
    if (!res.ok) {
      let msg = 'Drive error ' + res.status;
      try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
      throw new Error(msg);
    }
    return res;
  }
  const withAuth = (opts = {}, token) => ({ ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token } });

  async function userEmail() {
    const res = await gfetch('https://www.googleapis.com/oauth2/v3/userinfo', undefined, true);
    const j = await res.json();
    return j.email || '';
  }

  // ---------- Drive file ops ----------
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

  async function findByName(name, mime, interactive) {
    const q = encodeURIComponent("name='" + name + "' and trashed=false" + (mime ? " and mimeType='" + mime + "'" : ''));
    const res = await gfetch(API + '/files?q=' + q + '&fields=files(id,name,modifiedTime)&pageSize=5', undefined, interactive);
    const j = await res.json();
    return (j.files || [])[0] || null;
  }

  async function patchFileMeta(fileId, body, interactive) {
    await gfetch(API + '/files/' + fileId + '?fields=id,name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, interactive);
  }

  async function ensureFolder(interactive) {
    let found = await findByName(FOLDER_NAME, 'application/vnd.google-apps.folder', interactive);
    if (found) return found.id;
    const legacy = await findByName(LEGACY_FOLDER, 'application/vnd.google-apps.folder', interactive);
    if (legacy) {
      try {
        await patchFileMeta(legacy.id, { name: FOLDER_NAME }, interactive);
        return legacy.id;
      } catch (e) { /* fall through to create */ }
    }
    const res = await gfetch(API + '/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    }, interactive);
    return (await res.json()).id;
  }

  async function ensureFile(initialDoc, interactive) {
    let found = await findByName(FILE_NAME, null, interactive);
    if (found) return { fileId: found.id, created: false };

    const legacy = await findByName(LEGACY_FILE, null, interactive);
    if (legacy) {
      try {
        await patchFileMeta(legacy.id, { name: FILE_NAME }, interactive);
        await ensureFolder(interactive);
        return { fileId: legacy.id, created: false };
      } catch (e) {
        return { fileId: legacy.id, created: false };
      }
    }

    const folderId = await ensureFolder(interactive);
    const meta = { name: FILE_NAME, parents: [folderId], mimeType: 'application/json' };
    const boundary = 'dcb' + Math.random().toString(36).slice(2);
    const body =
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n' +
      '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(initialDoc) + '\r\n--' + boundary + '--';
    const res = await gfetch(UPLOAD + '/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    }, interactive);
    return { fileId: (await res.json()).id, created: true };
  }

  async function readFile(fileId, interactive) {
    const res = await gfetch(API + '/files/' + fileId + '?alt=media', undefined, interactive);
    return res.json();
  }

  async function writeFile(fileId, doc, interactive) {
    await gfetch(UPLOAD + '/files/' + fileId + '?uploadType=media', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc)
    }, interactive);
  }

  return {
    canUse, configured, onHttp, unavailableReason, getToken, silentBoot, cachedToken,
    signOut, userEmail, ensureFile, readFile, writeFile, storedToken: cachedToken, clientId, NEEDS_AUTH
  };
})();

if (typeof module !== 'undefined') module.exports = GDrive;

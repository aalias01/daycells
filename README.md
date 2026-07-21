# StreakGrid

Habit tracker with a GitHub-style contribution grid per habit. Static site. No backend. Your data stays in your browser, and optionally in a JSON file in your own Google Drive.

**Live app:** [https://streakgrid.vercel.app](https://streakgrid.vercel.app)  
**Source:** [github.com/aalias01/streakgrid](https://github.com/aalias01/streakgrid) (MIT)

Open the URL, tap +, start checking habits. For phone + laptop sync, create a Google OAuth Client ID (steps below), paste it in Settings, and sign in. Do not put the Client Secret anywhere in the app. Leave `js/config.js` empty so each person pastes their own Client ID in Settings (stored only in that browser).

## Data

| Where | Notes |
|-------|--------|
| Browser | Saved automatically as you check habits. Clearing site data deletes it. |
| Export JSON / CSV | Settings → Export. Import JSON to restore. |
| Google Drive | Optional. One file: `StreakGrid/streakgrid-data.json` in **the signed-in account’s** Drive. |

The OAuth **Client ID** identifies the app/project. The **signed-in Google account** owns the Drive file. Two people can share one Client ID and still get separate Drive files if each signs in with their own Gmail.

Sync is offline-first: the browser is the working copy; Drive is durability. Pushes debounce about 4 seconds after a change. Merge is last-write-wins per habit/day (and habit tombstones for deletes).

## Use

- **+** adds habits (presets or custom). Schedules: every day, weekdays, or N× / week.
- Tap the check on a card to log today. Arrows next to the date fix past days.
- Tap a card for the 52-week map and stats. Rest day makes every habit optional without breaking streaks.
- Streak breaks only on a missed scheduled day. Rest days, off days, and unfinished today carry. Strength (0–100) is an EWMA with a 13-day half-life.
- Theme: Settings → Appearance (auto / light / dark).
- Phone: Share → Add to Home Screen.
- In-app **Help**: short start + a **Sign in with Google** button (requests Drive access). Full Cloud Console / Client ID steps live in this README, not in the app.

## Google Drive setup (full reference)

About five minutes. Free for normal personal use. The in-app **Help** tab only asks you to Sign in (or open Settings to paste a Client ID). Use **this README** when you need to create or fix the Google Cloud Client ID.

### Required (happy path)

1. Open [console.cloud.google.com](https://console.cloud.google.com) → create a project (any name, e.g. Habit Tracker).
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **Google Auth Platform** (search “oauth” in the console if the menu name differs):
   - **Branding:** app name (e.g. StreakGrid) + your email. Save.
   - **Audience:** External. Stay in **Testing**. Under Test users, add every Gmail that should be allowed to sign in (you, spouse, etc.; Testing allows up to 100). Save.
4. **Clients → Create client → Web application.**
   - Authorized JavaScript origins (no path, no trailing slash):
     - `https://streakgrid.vercel.app` (the live demo), and/or
     - your own deploy URL, and/or
     - `http://localhost:8080` for local serve
   - Leave **Authorized redirect URIs** empty.
   - Create. Copy the **Client ID** only (`….apps.googleusercontent.com`). Ignore the **Client Secret** (not used by this static app; never paste it into StreakGrid or git).
5. StreakGrid → **Settings** → paste Client ID → **Sign in with Google**. Accept Drive + email when Google asks.
6. Confirm Google Drive has folder **StreakGrid** / file **streakgrid-data.json**. On another device: paste the same Client ID once, sign in with the **same** Google account to sync that person’s data.

### Optional: Data Access (scopes in the console)

Data Access is part of the same OAuth project. It lists which permissions the app may request (`userinfo.email`, `drive.file`).

- **Not required for Testing sign-in.** StreakGrid requests those scopes in code when you click Sign in. Google can show the consent popup and grant access even if Data Access is empty.
- **Signing in does not auto-fill Data Access.** The console tables stay empty until you add scopes and Save.
- **Still worth doing** so the console matches reality, and before you **publish** the OAuth app.

If you want it registered:

1. Google Auth Platform → **Data Access** → **Add or remove scopes**.
2. Use **Filter**: `userinfo` → check `.../auth/userinfo.email`. Then filter `drive.file` → check `.../auth/drive.file`. (Both often appear under **Your non-sensitive scopes** after save. If `drive.file` is missing from the picker, enable Google Drive API first and reopen the panel.)
3. Click **Update** on the side panel, then **Save** on the main Data Access page. Update alone does not persist.

### Testing vs publish

| Mode | Who can sign in | When to use |
|------|-----------------|-------------|
| **Testing** (default) | Only Gmails listed as test users | Personal / household. Stay here. |
| **In production** (publish) | Any Google account | Only if you want strangers to use **your** Client ID on your origin. Free, but they share your project’s OAuth/Drive API quotas. You lose the test-user gate. |

Household tip: one Client ID is enough. Add each person’s Gmail under Audience → Test users. Each signs in with their own account → data goes to **their** Drive.

### Quotas (ballpark)

Defaults are per Google Cloud **project** (the one that owns the Client ID), not per Drive storage:

- OAuth token grants: often ~10,000 / day (see Auth Platform overview). You + a few devices use tens, not thousands.
- Drive API: high default query limits. StreakGrid does a few calls per sync (debounced). Normal habit use is negligible.

Abuse risk if you **publish**: strangers can sign in on your authorized origin and burn **your** project’s token/Drive quotas (sync fails for everyone on that Client ID). They still cannot read your personal Drive files (`drive.file` is only files the app created in **their** Drive).

## Deploy your own

Static files. Vercel / GitHub Pages / any static host. `vercel.json` is included. After code changes, bump `VERSION` in `sw.js` and redeploy (or hard-refresh) so PWAs pick up the new build.

Local serve (sign-in needs http, not `file://`):

```
python3 -m http.server 8080
```

Then add `http://localhost:8080` to the Client’s Authorized JavaScript origins.

## Customize

`PALETTE` in `js/store.js`, CSS variables in `css/style.css`, `PRESETS` / `EMOJIS` in `js/app.js`, EWMA half-lives in `js/logic.js`.

## Files

```
index.html            shell
css/style.css         theme
js/config.js          leave googleClientId empty for shared deploys
js/logic.js           dates, schedules, streaks, analytics
js/store.js           browser persistence
js/gdrive.js          Google Identity Services + Drive
js/sync.js            merge sync
sw.js                 service worker (bump VERSION per deploy)
manifest.webmanifest  PWA
icons/
```

## Troubleshoot

- Sign-in fails on a raw file open: serve over http(s).
- "No OAuth Client ID configured": paste yours in Settings.
- Popup fails / origin error: current origin missing from Authorized JavaScript origins (Help shows the exact origin to copy).
- Access blocked: add that Gmail under Audience → Test users, or publish the OAuth app.
- Data missing after clearing storage: reconnect Drive or import JSON.
- Devices diverge: same Google account on both; tap the header sync dot.
- Stale UI after deploy: bump `sw.js` VERSION or hard-refresh.
- Want Data Access filled in: add scopes manually (optional section above). Sign-in will not populate that page for you.

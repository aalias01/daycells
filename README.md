# StreakGrid

Habit tracker with a GitHub-style contribution grid per habit. Static site. No backend. Your data stays in your browser, and optionally in a JSON file in your own Google Drive.

**Live app:** [https://streakgrid.vercel.app](https://streakgrid.vercel.app)

Open the URL, tap +, start checking habits. For phone + laptop sync, use Settings → Help in the app (or the section below) to create your own Google OAuth Client ID, paste it in Settings, and sign in. Do not put the Client Secret anywhere in the app.

## Data

| Where | Notes |
|-------|--------|
| Browser | Saved automatically as you check habits. Clearing site data deletes it. |
| Export JSON / CSV | Settings → Export. Import JSON to restore. |
| Google Drive | Optional. One file: `StreakGrid/streakgrid-data.json` in your Drive. |

Each person brings their own Client ID (Settings field, or empty `js/config.js` for shared copies). If you use this demo URL, add `https://streakgrid.vercel.app` to your OAuth client's Authorized JavaScript origins.

## Use

- **+** adds habits (presets or custom). Schedules: every day, weekdays, or N× / week.
- Tap the check on a card to log today. Arrows next to the date fix past days.
- Tap a card for the 52-week map and stats. Rest day makes every habit optional without breaking streaks.
- Streak breaks only on a missed scheduled day. Rest days, off days, and unfinished today carry. Strength (0–100) is an EWMA with a 13-day half-life.
- Theme: Settings → Appearance (auto / light / dark).
- Phone: Share → Add to Home Screen.

## Google Drive setup (in the app: Settings → Help)

1. [Google Cloud Console](https://console.cloud.google.com) → new project.
2. Enable **Google Drive API**.
3. Google Auth Platform → Branding (app name + your email) → Audience (External, Testing, add your Gmail as a test user).
4. Clients → Web application. Authorized JavaScript origins: `https://streakgrid.vercel.app` (and `http://localhost:8080` if you develop locally). No redirect URI. Ignore the Client Secret.
5. StreakGrid → Settings → paste Client ID → Sign in with Google. Google will ask for Drive + email access; accept.

Sync is offline-first: browser is the working copy; Drive holds `StreakGrid/streakgrid-data.json` (files this app created only). Merges last-write-wins per habit/day.

## Deploy your own

Static files. Vercel / GitHub Pages / any static host. `vercel.json` is included. After code changes, bump `VERSION` in `sw.js`.

Local serve (sign-in needs http):

```
python3 -m http.server 8080
```

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
- Popup fails: current origin missing from Authorized JavaScript origins (Help shows the exact origin).
- Access blocked: add your Gmail under Audience → Test users, or publish the OAuth app.
- Data missing after clearing storage: reconnect Drive or import JSON.
- Devices diverge: tap the header sync dot; both must use the same Google account.
- Stale UI after deploy: bump `sw.js` VERSION or hard-refresh.

MIT. Source: [github.com/aalias01/streakgrid](https://github.com/aalias01/streakgrid)

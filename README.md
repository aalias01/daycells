# StreakGrid

A habit tracker that runs as a static site. Each habit gets a GitHub-style contribution grid: an 18-week strip on its card, a 52-week map on its detail page, unlimited history behind both. No server of yours, no accounts on anyone else's machine, no build step.

**Try it:** [https://streakgrid.vercel.app](https://streakgrid.vercel.app)

Anyone can open that URL. Your habits stay in *your* browser on that device. Optional Google Drive sync uses *your* Google account and *your* OAuth Client ID, not the host's. Clearing the site’s browser data wipes unsynced history, so turn on Drive sync or export a backup if you care about durability.

## Saving your data

| How | What it does |
|-----|----------------|
| **In the browser (automatic)** | Every check-in is saved on the device as you go. Works with no account. |
| **Export / import** | Settings → **Export JSON** (full restore later) or **Export CSV** (spreadsheet / pandas). Import JSON from Settings. |
| **Google Drive sync** | Paste your own OAuth Client ID in Settings, sign in. The app writes one JSON file in a `StreakGrid` folder in *your* Drive. Use this for phone + laptop and for surviving a cache clear. |

Drive sync is bring-your-own credentials: leave `js/config.js` empty; each person pastes their Client ID under Settings (stored only in that browser). Do not put the OAuth Client Secret in the app. If you use the shared demo at `https://streakgrid.vercel.app`, add that exact origin to *your* OAuth client's Authorized JavaScript origins. Or deploy your own copy and use your own origin.

## Use

Tap + to add habits. The picker offers 18 presets drawn from what people most commonly track (exercise, water, reading, journaling, meditation, sleep, vitamins), phrased small on purpose: in Loggd's published 2026 data across 6,700+ habits, "go to the gym" averaged a 1.5-day streak while small anchored habits like vitamins and morning water lasted 3 to 5 times longer. Start with 1 to 3. "Create my own" opens the full editor.

Schedules: every day, specific weekdays, or a times-per-week target. Weekly-target habits count streaks in weeks, not days.

Checking off takes one tap on the habit card, with instant visual feedback (and a light haptic on phones that support it). The header shows the day's progress and flips to "All done ✓" when everything scheduled is checked. Arrows next to the date step to past days, so forgetting to log yesterday is a two-tap fix; the same cards work on any past day. Tap a card for the detail page; tap any cell in its 52-week map to fix history, and page back with "older" through unlimited past years. "Mark rest day" makes every habit optional for the day without breaking streaks.

Theme follows the system by default; Settings → Appearance forces light or dark.

Streak rules: a streak breaks only when a scheduled day passes unchecked. Rest days, unscheduled days, and the not-yet-finished current day carry it. The strength score (0 to 100) is an exponentially weighted average with a 13-day half-life, so a single miss dents it instead of zeroing it.

Analytics: per habit, current and best streak, total completions, 7-day and 30-day rates, weekday breakdown, 6-month trend. The Analytics tab adds an all-habit grid and totals.

On a phone: open the URL → Share → Add to Home Screen for an installable PWA.

## Google Drive sync (optional, per person)

Off until you add **your own** OAuth Client ID. Setup once, about five minutes, free for normal personal use:

1. [console.cloud.google.com](https://console.cloud.google.com): create a project.
2. APIs & Services → Library → enable **Google Drive API**.
3. Google Auth Platform (OAuth):
   - **Branding:** app name + your email
   - **Audience:** External; stay in **Testing** and add your Gmail as a test user (keeps sign-in limited to you), or publish if you want anyone with the Client ID to sign in
   - **Data Access:** scopes `https://www.googleapis.com/auth/drive.file` and `https://www.googleapis.com/auth/userinfo.email`
4. **Clients** → Create client → **Web application**. Authorized JavaScript origins: the app URL(s) you will use, e.g. `https://streakgrid.vercel.app` and/or your own deploy URL. Leave redirect URIs empty. Ignore the Client Secret.
5. In StreakGrid: Settings → paste the Client ID → **Sign in with Google**.

The app creates a `StreakGrid` folder in your Drive containing `streakgrid-data.json`. The `drive.file` scope limits the app to files it created; it cannot read anything else in your Drive. Tokens sit in sessionStorage and expire on their own.

Sync is offline-first: the browser is the working copy, Drive is durability, pushes debounce 4 seconds after a change. Merging is conflict-free: habits merge by id with newest-edit-wins and deletion tombstones; every day-cell, rest-day mark, and note carries a timestamp and merges last-write-wins per key.

## Deploy your own copy

This repo is a static site. Push the folder to Vercel, GitHub Pages, or any static host (`vercel.json` is included). After you change app files, bump `VERSION` in `sw.js` so clients pick up the new build.

For local development (sign-in needs http, not `file://`):

```
python3 -m http.server 8080
```

Then add `http://localhost:8080` to your OAuth client's Authorized JavaScript origins.

## Customize

- Colors: `PALETTE` in `js/store.js`, CSS variables in `css/style.css` (light and dark).
- Presets: `PRESETS` in `js/app.js`.
- Quick-pick emoji: `EMOJIS` in `js/app.js`.
- Streak half-lives: `EWMA_DAY`, `EWMA_WEEK` in `js/logic.js`.

## Files

```
index.html            shell
css/style.css         theme (light/dark/manual)
js/config.js          optional private Client ID (leave empty for shared copies)
js/logic.js           dates, schedules, streaks, analytics (pure, node-testable)
js/store.js           state, browser persistence, migration
js/gdrive.js          Google Identity Services + Drive file ops
js/sync.js            offline-first merge sync
sw.js                 service worker (offline cache; bump VERSION per deploy)
manifest.webmanifest  PWA install metadata
icons/                app icons (generated, 180/192/512)
```

Vanilla JS. `js/logic.js` and the merge functions in `js/sync.js` run under node for testing.

## Troubleshoot

- Sign-in button does nothing or errors: the page must be served over http(s), not opened as a raw file.
- "No OAuth Client ID configured": paste yours in Settings (see Google Drive sync).
- Popup opens then fails: your current origin isn't in the Client ID's authorized JavaScript origins.
- "Access blocked" / not a test user: add your Gmail under Audience → Test users, or publish the OAuth app.
- Data gone after clearing browser storage: reconnect Drive to pull the synced copy, or import a JSON export.
- Two devices show different data: both sync to the same Drive account within seconds of a change; check the status dot in the header. Tapping the dot forces a sync.
- Deployed app shows an old version: the service worker is serving cache. Bump `VERSION` in `sw.js` and redeploy, or hard-refresh.

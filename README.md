# StreakGrid

A habit tracker that runs as a static site. Each habit gets a GitHub-style contribution grid: an 18-week strip on its card, a 52-week map on its detail page, unlimited history behind both. Data lives in the browser (localStorage) and, if you sign in with Google, in one JSON file in your own Drive. No server, no accounts on anyone else's machine, no build step.

## Run

Open `index.html` in a browser. That's the whole install.

To serve it (needed for Google sign-in):

```
python3 -m http.server 8080
```

To deploy: push the folder to any static host. Vercel and GitHub Pages both work as-is; `vercel.json` is included.

Deployed, it's an installable PWA: a service worker caches the app for offline use and fast loads, and `manifest.webmanifest` plus the bundled icons give it a proper home-screen install on iOS and Android. After changing app files, bump `VERSION` in `sw.js` so clients pick up the new build.

## Use

Tap + to add habits. The picker offers 18 presets drawn from what people most commonly track (exercise, water, reading, journaling, meditation, sleep, vitamins), phrased small on purpose: in Loggd's published 2026 data across 6,700+ habits, "go to the gym" averaged a 1.5-day streak while small anchored habits like vitamins and morning water lasted 3 to 5 times longer. Start with 1 to 3. "Create my own" opens the full editor.

Schedules: every day, specific weekdays, or a times-per-week target. Weekly-target habits count streaks in weeks, not days.

Checking off takes one tap on the habit card, with instant visual feedback (and a light haptic on phones that support it). The header shows the day's progress and flips to "All done ✓" when everything scheduled is checked. Arrows next to the date step to past days, so forgetting to log yesterday is a two-tap fix; the same cards work on any past day. Tap a card for the detail page; tap any cell in its 52-week map to fix history, and page back with "older" through unlimited past years. "Mark rest day" makes every habit optional for the day without breaking streaks.

Theme follows the system by default; Settings → Appearance forces light or dark.

Streak rules: a streak breaks only when a scheduled day passes unchecked. Rest days, unscheduled days, and the not-yet-finished current day carry it. The strength score (0 to 100) is an exponentially weighted average with a 13-day half-life, so a single miss dents it instead of zeroing it.

Analytics: per habit, current and best streak, total completions, 7-day and 30-day rates, weekday breakdown, 6-month trend. The Analytics tab adds an all-habit grid and totals.

## Google Drive sync

Off until an OAuth Client ID exists. Setup, once, about five minutes:

1. [console.cloud.google.com](https://console.cloud.google.com): create a project.
2. APIs & Services → Library → enable **Google Drive API**.
3. OAuth consent screen: External; add scopes `drive.file` and `userinfo.email`; add yourself as a test user or publish.
4. Credentials → Create credentials → OAuth client ID → Web application. Add your origins, e.g. `https://yourapp.vercel.app` and `http://localhost:8080`.
5. Paste the client ID into `js/config.js`, or into Settings → OAuth Client ID inside the app.

Sign in from Settings. The app creates a `StreakGrid` folder in your Drive containing `streakgrid-data.json`. The `drive.file` scope limits the app to files it created; it cannot read anything else in your Drive. Tokens sit in sessionStorage and expire on their own.

Sync is offline-first: localStorage is the working copy, Drive is durability, pushes debounce 4 seconds after a change. Merging is conflict-free: habits merge by id with newest-edit-wins and deletion tombstones; every day-cell, rest-day mark, and note carries a timestamp and merges last-write-wins per key.

## Data

Nothing is pruned. Every logged day stays, which is the point: the record gets more useful the longer it runs.

- Export JSON: the full state, re-importable.
- Export CSV log: long format (`date, habit_id, habit_name, value, logged_at`), loads straight into pandas or a spreadsheet.

## Customize

- Colors: `PALETTE` in `js/store.js`, CSS variables in `css/style.css` (light and dark).
- Presets: `PRESETS` in `js/app.js`.
- Quick-pick emoji: `EMOJIS` in `js/app.js`.
- Streak half-lives: `EWMA_DAY`, `EWMA_WEEK` in `js/logic.js`.

## Files

```
index.html            shell
css/style.css         theme (light/dark/manual)
js/config.js          deployment config (client ID)
js/logic.js           dates, schedules, streaks, analytics (pure, node-testable)
js/store.js           state, localStorage, migration
js/gdrive.js          Google Identity Services + Drive file ops
js/sync.js            offline-first merge sync
sw.js                 service worker (offline cache; bump VERSION per deploy)
manifest.webmanifest  PWA install metadata
icons/                app icons (generated, 180/192/512)
```

Vanilla JS. `js/logic.js` and the merge functions in `js/sync.js` run under node for testing.

## Troubleshoot

- Sign-in button does nothing or errors: the app is on `file://`. Serve it over http(s).
- "No OAuth Client ID configured": add one per the sync section.
- Popup opens then fails: your current origin isn't in the client ID's authorized JavaScript origins.
- Data gone after clearing browser storage: localStorage was the only copy. Reconnect Drive to pull the synced copy, or import a JSON export.
- Two devices show different data: both sync to the same Drive account within seconds of a change; check the status dot in the header. Tapping the dot forces a sync.
- Deployed app shows an old version: the service worker is serving cache. Bump `VERSION` in `sw.js` and redeploy, or hard-refresh.

# Daycells

Habit tracker with a GitHub-style contribution grid per habit. Static front end on Vercel, with a small optional auth API for always-connected Google Drive. Your data stays in your browser, and optionally in a JSON file in your own Google Drive.

**Live app:** [https://daycells.vercel.app](https://daycells.vercel.app)  
**Source:** [github.com/aalias01/daycells](https://github.com/aalias01/daycells) ([MIT](#license))

Open the live URL, tap +, start checking habits. On the live deploy, a Google OAuth Client ID is already set (via Vercel env at build time). If your Gmail is on the project’s test-user list, open Help or Settings and tap **Sign in with Google**. No paste needed.

Forks and your own deploys: leave committed `js/config.js` empty. Create your own OAuth client (steps below), set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `AUTH_SECRET` on Vercel for always-connected sync, or paste a Client ID under Settings → Advanced for the older popup fallback.

## License

Daycells is licensed under the [MIT License](LICENSE) (Copyright 2026 Alvin Alias). Keep the `LICENSE` file when you fork or redistribute. A “Based on [Daycells](https://github.com/aalias01/daycells)” credit in your README is appreciated but not required. Please don’t present a fork as the official [daycells.vercel.app](https://daycells.vercel.app) app.

## Data

| Where | Notes |
|-------|--------|
| Browser | Saved automatically as you check habits. Clearing site data deletes it. |
| Export JSON / CSV | Settings → Export. Import JSON to restore. |
| Google Drive | Optional. One file: `Daycells/daycells-data.json` in **the signed-in account’s** Drive. |

The OAuth **Client ID** identifies the app/project. The **signed-in Google account** owns the Drive file. Two people can share one Client ID and still get separate Drive files if each signs in with their own Gmail.

Sync is offline-first: the browser is the working copy; Drive is durability. Pushes debounce about 4 seconds after a change. Merge is last-write-wins per habit/day (and habit tombstones for deletes). **First sign-in** (this browser was not connected yet): if Drive already has habits, this device adopts the Drive copy and does not append unsigned local habits. **Reconnect** while already signed in merges local checks with Drive so offline edits are kept. On the live Vercel deploy, sign-in uses a small auth API that stores a Google **refresh token** in an httpOnly cookie, so Pixel/iPhone home-screen apps can stay connected across reopen without tapping Reconnect. Local checks always keep working if Drive ever pauses (revoked access, cleared site data, or Google Testing refresh expiry).

## Use

- **+** adds habits (presets or custom). Edit a row (✎) to change schedule before adding. Schedules: every day, weekdays, or N× / week.
- **Habits:** tap the check to log a day. Tap the habit row (icon or name) to edit. **Archive** in the editor (or Settings → Habits) hides the habit; restore or **delete forever** under Settings → Archived. Cards are compact check rows (no mini-grids). Use the date, arrows, or calendar for past days. Future days are blocked. The calendar shades each day by how much of that day’s scheduled habits were done (dashed = rest).
- **Rest day** makes every habit optional that day without breaking streaks.
- **Notes:** optional note under Habits for that day. **See all notes** lists older notes and jumps to that day.
- **Analytics:** the right rail starts on **All** (grid icon) for a portfolio overview across habits, plus per-habit rates. Tap a habit emoji to dig into that habit; tap the grid to return to All. Open **About these numbers** on each block for definitions. Past checks are edited on Habits (date picker or year-heat jump), not in Analytics.
- **Year heatmap:** on a phone, tap a day for details (then Open in Habits). On a laptop, click a day to open it in Habits.
- Streaks break only on a missed scheduled day. Rest days, off days, and unfinished today carry.
- **30-day rate:** share of scheduled days done in the last 30 days. Trends use **pp** (percentage points). At high rates, no change may read as holding strong.
- **Strength (0–100):** EWMA (Loop Habit Tracker style); recent days count more (~2-week memory). A miss dents it; it does not zero like a streak. Rest days never penalize.
- **Milestone chips:** **3d+** / **7d+** / **21d+** (or **2w+** / **4w+** for weekly habits) on Habits and Analytics when you hit them.
- Theme: defaults to light. Settings → Appearance (auto / light / dark) and accent. All-habits year heat uses the accent; a single-habit view and checks use each habit’s color.
- Settings → **Habits:** drag the grip handle to reorder.
- Phone: swipe left/right between tabs (page slide); tap the tab bar for an instant switch. Settings → **Home screen** (Install on Android/Chrome; Share steps on iPhone; **Share link** to send the site). See [Install](#install-home-screen).
- In-app **Help** covers daily use and Sign in. Full Cloud Console steps stay in this README.
- **Sample data:** first visit auto-loads demo habits (~6 months of history) and a short spotlight tour (Habits → Settings → Analytics). After the tour, the soft banner appears when you open Habits or Settings; **Start tracking** clears the demo and opens the habit picker (asks again if Google Drive is connected, since that also empties the Drive file). While sample is loaded, **+** prompts to clear demo first; **Keep exploring** opens the habit picker on top of the demo. Edits warn on the first change (not during the tour), then every 5 edits after that, until you clear sample. Later sessions also remind you (**Keep exploring** / **Start tracking**). Google sync nudge stays off until sample is cleared. Settings → **Reset all** clears this browser and, if signed in, overwrites the Drive file with empty data, then reloads the demo (and tour). Export first if you want a backup.

## Install (home screen)

Daycells is a progressive web app (PWA): after you add it to the home screen, it opens like an app icon and can work offline via the service worker. This is not an App Store download.

| Platform | What to do |
|----------|------------|
| **Android** (Chrome / Edge) | Settings → **Home screen** → **Install Daycells** when the button appears. Or browser menu → Install app. Prefer Chrome/Edge over Brave: Brave home-screen shortcuts often keep a browser badge and a weaker favicon. |
| **iPhone / iPad** (Safari) | Apple does not allow a one-tap install dialog. In Safari: Share → **Add to Home Screen** → Add. Settings → **Home screen** shows the same steps. |
| **Desktop** (Chrome / Edge) | Browser may offer Install in the address bar or menu; Settings → Home screen shows the same when available. |

Already installed (opened from the home-screen icon): Settings shows that you are running as an installed app.

After a deploy, hard-refresh or reopen the installed app so `sw.js` picks up the new `VERSION`. To refresh a phone home-screen icon, remove the old shortcut and install again (the OS often caches the old icon).

## Google Drive setup (full reference)

About five minutes. Free for normal personal use. Use this section when you **create** a Client ID (forks, local serve, or your own Vercel project). On [daycells.vercel.app](https://daycells.vercel.app), skip to Sign in if you are already a test user.

### Required (happy path for your own Client ID)

1. Open [console.cloud.google.com](https://console.cloud.google.com) → create a project (any name, e.g. Habit Tracker).
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **Google Auth Platform** (search “oauth” in the console if the menu name differs):
   - **Branding:** app name (e.g. Daycells) + your email. Save.
   - **Audience:** External. Stay in **Testing**. Under Test users, add every Gmail that should be allowed to sign in (you, spouse, etc.; Testing allows up to 100). Save.
4. **Clients → Create client → Web application.**
   - Authorized JavaScript origins (no path, no trailing slash):
     - your deploy URL (e.g. `https://your-app.vercel.app`), and/or
     - `http://localhost:3000` for `vercel dev` (and `http://localhost:8080` if you still use a static server + GIS fallback)
   - **Authorized redirect URIs** (required for always-connected auth):
     - `https://your-app.vercel.app/api/auth/callback`
     - `http://localhost:3000/api/auth/callback` for local `vercel dev`
   - Create. Copy the **Client ID** (`….apps.googleusercontent.com`) and the **Client Secret**. Never commit the secret or paste it into the browser UI.
5. Wire env on **Vercel** (Project → Settings → Environment Variables, Production):
   - `GOOGLE_CLIENT_ID` = Client ID (also injected into `js/config.js` at build)
   - `GOOGLE_CLIENT_SECRET` = Client Secret (server-only; used by `/api/auth/*`)
   - `AUTH_SECRET` = a long random string (e.g. `openssl rand -hex 32`) used to encrypt the refresh cookie
   - Redeploy. Do not commit filled `js/config.js`.
6. Confirm Google Drive has folder **Daycells** / file **daycells-data.json**. On another device: same Google account → **Sign in with Google** once.
7. **Forks / static-only hosts:** without `GOOGLE_CLIENT_SECRET` + `AUTH_SECRET`, Sign in falls back to the older Google Identity Services popup (session access token only; may ask to Reconnect after PWA reopen). Advanced → override Client ID still helps that fallback path.

### Data Access (scopes in the console)

Data Access is part of the same OAuth project. It lists which permissions the app may request (`userinfo.email`, `drive.file`).

- **Recommended for Testing**, and required before you **publish** the OAuth app. Registering scopes keeps the console aligned with what Daycells requests in code.
- Daycells also requests those scopes when you click Sign in. Google’s consent screen can still appear if Data Access is empty, but registering them avoids surprises.
- **Signing in does not auto-fill Data Access.** The console tables stay empty until you add scopes and Save.
- Google’s **granular consent** screen lists Drive as its own checkbox (often unchecked by default). Daycells requires Drive; if you continue without it, sign-in is rejected and sync will not enable.

To register scopes:

1. Google Auth Platform → **Data Access** → **Add or remove scopes**.
2. Use **Filter**: `userinfo` → check `.../auth/userinfo.email`. Then filter `drive.file` → check `.../auth/drive.file`. (Both often appear under **Your non-sensitive scopes** after save. If `drive.file` is missing from the picker, enable Google Drive API first and reopen the panel.)
3. Click **Update** on the side panel, then **Save** on the main Data Access page. Update alone does not persist.

### Testing vs publish

| Mode | Who can sign in | When to use |
|------|-----------------|-------------|
| **Testing** (default) | Only Gmails listed as test users | Personal / household. Stay here. |
| **In production** (publish) | Any Google account | Only if you want strangers to use **your** Client ID on your origin. Free, but they share your project’s OAuth/Drive API quotas. You lose the test-user gate. Verification may be required for broader use. |

Household tip: one Client ID is enough. Add each person’s Gmail under Audience → Test users. Each signs in with their own account → data goes to **their** Drive. Each browser gets its own refresh cookie after Sign in; testers benefit from always-connected sync the same way you do.

**Testing refresh tokens:** while the OAuth app stays in Testing, Google may expire refresh tokens after about **7 days**. Users then tap Sign in / Reconnect once more. Publishing the OAuth app (when you are ready) removes that Testing limit.

### Quotas (ballpark)

Defaults are per Google Cloud **project** (the one that owns the Client ID), not per Drive storage:

- OAuth token grants: often ~10,000 / day (see Auth Platform overview). You + a few devices use tens, not thousands.
- Drive API: high default query limits. Daycells does a few calls per sync (debounced). Normal habit use is negligible.

Abuse risk if you **publish**: strangers can sign in on your authorized origin and burn **your** project’s token/Drive quotas (sync fails for everyone on that Client ID). They still cannot read your personal Drive files (`drive.file` is only files the app created in **their** Drive).

## Deploy your own

Static files. Vercel / GitHub Pages / any static host. `vercel.json` runs `npm run build` (Client ID inject) before publish. After code changes, bump `VERSION` in `sw.js` and redeploy (or hard-refresh) so PWAs pick up the new build.

For live-style always-connected auth on **your** Vercel project:

```
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add AUTH_SECRET production
npx vercel --prod
```

Local with auth API (`vercel dev`, recommended):

```
npx vercel dev
```

Use the localhost origin/redirect URI you registered (often `http://localhost:3000`). Static-only `python3 -m http.server 8080` still works for UI work, but Sign in then uses the GIS fallback (no refresh cookie) unless the BFF is running.

## Customize

`PALETTE` in `js/store.js`, CSS variables in `css/style.css`, `PRESETS` / `EMOJIS` in `js/app.js`, EWMA half-lives in `js/logic.js`.

## Files

```
index.html            shell
css/style.css         theme
js/config.js          leave secrets empty in git (inject at deploy)
scripts/inject-client-id.js  writes config from env
package.json          npm run build → inject
js/logic.js           dates, schedules, streaks, analytics
js/store.js           browser persistence
js/sample.js          first-run sample document (~6 months, relative to today)
js/gdrive.js          Drive API + auth (BFF refresh, GIS fallback)
js/sync.js            merge sync
js/redact.js          screenshot cover-up editor (feedback)
js/feedback.js        in-app Report → Discord (via /api/feedback)
api/feedback.js       Vercel proxy to Discord webhook
api/auth/*            OAuth start/callback/refresh/logout (refresh cookie)
sw.js                 service worker (bump VERSION per deploy)
manifest.webmanifest  PWA
icons/
images/og-image.jpg  Open Graph / WhatsApp share preview (1200×630)
```

## Feedback (tester reports)

When `DISCORD_WEBHOOK_URL` is set on Vercel, the live app shows a **Report** button. Testers send a short note (optional screenshot; they can cover personal details first). Reports land in your Discord channel via `/api/feedback` (webhook stays server-side).

1. Discord → your private server → channel → Edit channel → Integrations → Webhooks → New Webhook → Copy URL.
2. Vercel → Project → Settings → Environment Variables:
   - `DISCORD_WEBHOOK_URL` = that URL (Production)
   - Optional: `FEEDBACK_MAILTO` = your email (mailto fallback if send fails)
3. Redeploy. Confirm **Report** appears in the header.

Local without the API: set `FEEDBACK_ENDPOINT` to a webhook URL and run `npm run build` (browser CORS to Discord may fail; prefer `vercel dev` with `DISCORD_WEBHOOK_URL`).

## Troubleshoot

- Sign-in fails on a raw file open: serve over http(s).
- "No OAuth Client ID configured": set `GOOGLE_CLIENT_ID` on the deploy, or paste under Settings → Advanced (creating one is in this README).
- Redirect / origin error: add the exact origin under Authorized JavaScript origins and `https://your-app.vercel.app/api/auth/callback` under Authorized redirect URIs.
- "Sign-in is not configured": set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `AUTH_SECRET` on Vercel and redeploy.
- Access blocked: add that Gmail under Audience → Test users, or publish the OAuth app.
- Google did not return a refresh token: Google Account → [Third-party access](https://myaccount.google.com/connections) → remove Daycells, then Sign in again (consent must include Drive).
- **"Google Drive permission was not granted"** on Sign in: Google’s consent screen left Drive unchecked. Sign in again and allow Drive access.
- **"Drive overwrite failed" / "insufficient authentication scopes"** on Reset all: this browser was signed in without Drive scope (granular consent). Local data is left intact. Fix:
  1. Settings → Google Drive → **Sign out**.
  2. Google Account → [Third-party access](https://myaccount.google.com/connections) → remove Daycells (or the OAuth app name).
  3. Recommended: Cloud Console → Data Access → add `userinfo.email` and `drive.file`, then Save.
  4. Sign in again and **check the Google Drive permission**.
  5. Confirm sync (check a habit or open Drive → `Daycells/daycells-data.json`), then retry **Reset all**.
- Data missing after clearing storage: reconnect Drive or import JSON.
- Devices diverge: same Google account on both; tap the header sync control (or Reconnect on the banner if Drive sync is paused).
- Drive sync paused after reopen: with BFF env set, reopen should refresh quietly. If it still pauses (Testing ~7-day refresh expiry, cleared site data, or revoked access), checks still save locally; tap **Reconnect**. The banner asks at most once per day; Hide dismisses it for the day.
- Stale UI after deploy: bump `sw.js` VERSION or hard-refresh (reopen the home-screen app if installed).
- No Install button on Android: use Chrome/Edge over https, wait a moment on the live site, or use the browser menu → Install app.
- iPhone Install button missing: expected. In Safari use Share → Add to Home Screen. Settings → Home screen shows the same steps.
- Want Data Access filled in: add scopes manually (Data Access section above). Sign-in will not populate that page for you.
- Fork Sign in does nothing useful with someone else’s Client ID on your domain: create your own Web client and origins.
- **Report** button missing: set `DISCORD_WEBHOOK_URL` on Vercel (Production) and redeploy so build injects `feedbackEndpoint: "/api/feedback"`. Forks with empty config hide Report on purpose.
- Feedback send fails with 503: `DISCORD_WEBHOOK_URL` missing on the Vercel function runtime (add it, redeploy).

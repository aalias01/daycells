# Daycells

Habit tracker with a GitHub-style contribution grid per habit. Static site. No backend. Your data stays in your browser, and optionally in a JSON file in your own Google Drive.

**Live app:** [https://daycells.vercel.app](https://daycells.vercel.app)  
**Source:** [github.com/aalias01/daycells](https://github.com/aalias01/daycells) (MIT)

Open the live URL, tap +, start checking habits. On the live deploy, a Google OAuth Client ID is already set (via Vercel env at build time). If your Gmail is on the project’s test-user list, open Help or Settings and tap **Sign in with Google**. No paste needed.

Forks and your own deploys: leave committed `js/config.js` empty. Create your own Client ID (steps below), then either set `GOOGLE_CLIENT_ID` on your host’s build env or paste it under Settings → Advanced.

## Data

| Where | Notes |
|-------|--------|
| Browser | Saved automatically as you check habits. Clearing site data deletes it. |
| Export JSON / CSV | Settings → Export. Import JSON to restore. |
| Google Drive | Optional. One file: `Daycells/daycells-data.json` in **the signed-in account’s** Drive. |

The OAuth **Client ID** identifies the app/project. The **signed-in Google account** owns the Drive file. Two people can share one Client ID and still get separate Drive files if each signs in with their own Gmail.

Sync is offline-first: the browser is the working copy; Drive is durability. Pushes debounce about 4 seconds after a change. Merge is last-write-wins per habit/day (and habit tombstones for deletes).

## Use

- **+** adds habits (presets or custom). Schedules: every day, weekdays, or N× / week.
- **Habits:** tap the check to log a day. Tap the left side of a habit (icon/name) to edit. Cards are compact check rows (no mini-grids). Use the date, arrows, or calendar for past days. Future days are blocked.
- **Rest day** makes every habit optional that day without breaking streaks.
- **Notes:** optional note under Habits for that day. **See all notes** lists older notes and jumps to that day.
- **Analytics → All:** portfolio overview across habits, plus per-habit rates. Open **About these numbers** on each block for definitions.
- **Analytics → Focus one:** dig into a single habit.
- Streaks break only on a missed scheduled day. Rest days, off days, and unfinished today carry.
- **30-day rate:** share of scheduled days done in the last 30 days. Trends use **pp** (percentage points). At high rates, no change may read as holding strong.
- **Strength (0–100):** EWMA (Loop Habit Tracker style); recent days count more (~2-week memory). A miss dents it; it does not zero like a streak. Rest days never penalize.
- **Milestone chips:** **3d+** / **7d+** (or **2w+** / **4w+** for weekly habits) on Habits and Analytics when you hit them.
- Theme: defaults to light. Settings → Appearance (auto / light / dark) and accent. All-habits year heat uses the accent; Focus one and checks use each habit’s color.
- Phone: Settings → **Home screen** (Install on Android/Chrome; Share steps on iPhone; **Share link** to send the site). See [Install](#install-home-screen).
- In-app **Help** covers daily use and Sign in. Full Cloud Console steps stay in this README.
- **Sample data:** first visit (no habits yet) offers **Try sample** or **Skip**. Anytime later: Settings → **Load sample** (~6 months of demo history ending today). After load, a bottom banner explains sample data (Hide anytime). After that, if you are not signed in, a similar banner can suggest Google sync (also Hide). **Reset all** in Settings clears this browser and, if signed in, overwrites the Drive file with empty data, then opens the habit picker. Export first if you want a backup.

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
     - `http://localhost:8080` for local serve
   - Leave **Authorized redirect URIs** empty.
   - Create. Copy the **Client ID** only (`….apps.googleusercontent.com`). Ignore the **Client Secret** (not used by this static app; never paste it into Daycells or git).
5. Wire the Client ID (pick one):
   - **Vercel:** Project → Settings → Environment Variables → `GOOGLE_CLIENT_ID` = that string (Production). Redeploy so `npm run build` injects it into `js/config.js`. Do not commit the filled file.
   - **Or** Daycells → Settings → **Advanced: override Client ID** → paste → **Sign in with Google**.
6. Confirm Google Drive has folder **Daycells** / file **daycells-data.json**. On another device: same account, Sign in (override paste once per browser if you are not using env inject).

### Optional: Data Access (scopes in the console)

Data Access is part of the same OAuth project. It lists which permissions the app may request (`userinfo.email`, `drive.file`).

- **Not required for Testing sign-in.** Daycells requests those scopes in code when you click Sign in. Google can show the consent popup and grant access even if Data Access is empty.
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
- Drive API: high default query limits. Daycells does a few calls per sync (debounced). Normal habit use is negligible.

Abuse risk if you **publish**: strangers can sign in on your authorized origin and burn **your** project’s token/Drive quotas (sync fails for everyone on that Client ID). They still cannot read your personal Drive files (`drive.file` is only files the app created in **their** Drive).

## Deploy your own

Static files. Vercel / GitHub Pages / any static host. `vercel.json` runs `npm run build` (Client ID inject) before publish. After code changes, bump `VERSION` in `sw.js` and redeploy (or hard-refresh) so PWAs pick up the new build.

For the live-style default Client ID on **your** Vercel project:

```
vercel env add GOOGLE_CLIENT_ID production
npx vercel --prod
```

Local serve (sign-in needs http, not `file://`):

```
python3 -m http.server 8080
```

Then add `http://localhost:8080` to the Client’s Authorized JavaScript origins, and paste the Client ID under Settings → Advanced (or run `GOOGLE_CLIENT_ID=... npm run build` once before serving).

## Customize

`PALETTE` in `js/store.js`, CSS variables in `css/style.css`, `PRESETS` / `EMOJIS` in `js/app.js`, EWMA half-lives in `js/logic.js`.

## Files

```
index.html            shell
css/style.css         theme
js/config.js          leave googleClientId empty in git (inject at deploy)
scripts/inject-client-id.js  writes config from GOOGLE_CLIENT_ID
package.json          npm run build → inject
js/logic.js           dates, schedules, streaks, analytics
js/store.js           browser persistence
js/sample.js          first-run sample document (~6 months, relative to today)
js/gdrive.js          Google Identity Services + Drive
js/sync.js            merge sync
sw.js                 service worker (bump VERSION per deploy)
manifest.webmanifest  PWA
icons/
images/og-image.jpg  Open Graph / WhatsApp share preview (1200×630)
```

## Troubleshoot

- Sign-in fails on a raw file open: serve over http(s).
- "No OAuth Client ID configured": set `GOOGLE_CLIENT_ID` on the deploy, or paste under Settings → Advanced (creating one is in this README).
- Popup fails / origin error: current origin missing from Authorized JavaScript origins (must match exactly, e.g. `https://daycells.vercel.app`).
- Access blocked: add that Gmail under Audience → Test users, or publish the OAuth app.
- Data missing after clearing storage: reconnect Drive or import JSON.
- Devices diverge: same Google account on both; tap the header sync dot.
- Stale UI after deploy: bump `sw.js` VERSION or hard-refresh (reopen the home-screen app if installed).
- No Install button on Android: use Chrome/Edge over https, wait a moment on the live site, or use the browser menu → Install app.
- iPhone Install button missing: expected. In Safari use Share → Add to Home Screen. Settings → Home screen shows the same steps.
- Want Data Access filled in: add scopes manually (optional section above). Sign-in will not populate that page for you.
- Fork Sign in does nothing useful with someone else’s Client ID on your domain: create your own Web client and origins.

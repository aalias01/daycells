/* StreakGrid deployment config.
 * Committed copy keeps googleClientId empty so public forks do not inherit
 * a project Client ID. The live deploy sets GOOGLE_CLIENT_ID on Vercel;
 * scripts/inject-client-id.js writes it into this file at build time.
 * Override per browser: Settings → Advanced, or leave empty and paste there.
 * The ID is origin-restricted and, in OAuth Testing mode, limited to listed
 * test users; it is still not a password. App works fully local-only when empty.
 */
window.SG_CONFIG = {
  googleClientId: ""
};

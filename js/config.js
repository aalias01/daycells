/* StreakGrid deployment config.
 * Leave googleClientId empty in the shared codebase. Each person pastes
 * their own OAuth Web Client ID in Settings (stored only in that browser's
 * localStorage). That keeps Drive sync personal: your Client ID never has
 * to ship in git, and forks bring their own Google Cloud credentials.
 * Optional: set googleClientId here for a private deploy only — never commit
 * someone else's ID into a public repo. The ID is origin-restricted and, in
 * OAuth Testing mode, limited to listed test users; it is still not a secret.
 * The app works fully local-only when this is empty.
 */
window.SG_CONFIG = {
  googleClientId: ""
};

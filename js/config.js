/* Daycells deployment config.
 * Committed copy keeps secrets empty so public forks do not inherit them.
 * The live deploy sets GOOGLE_CLIENT_ID / DISCORD_WEBHOOK_URL / FEEDBACK_MAILTO
 * on Vercel; scripts/inject-client-id.js writes client fields into this file at build.
 * When DISCORD_WEBHOOK_URL is set, feedbackEndpoint becomes "/api/feedback".
 * Override Client ID per browser: Settings → Advanced.
 * feedbackEndpoint set → Report UI shown; empty → hidden.
 * feedbackMailto → optional mailto: fallback recipient when Discord send fails.
 */
window.DC_CONFIG = {
  googleClientId: "",
  feedbackEndpoint: "",
  feedbackMailto: ""
};

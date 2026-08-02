/**
 * Clear refresh cookie and revoke the Google refresh token when possible.
 */
'use strict';

const lib = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    lib.noStore(res);
    res.status(204).end();
    return;
  }
  /* POST only — GET would allow cross-site top-level logout via SameSite=Lax. */
  if (req.method !== 'POST') {
    lib.json(res, 405, { error: 'Method not allowed' });
    return;
  }

  /* Clear this browser's cookie only. Do not revoke at Google — that would
   * invalidate refresh tokens on the user's other devices. */
  lib.setCookies(res, [
    lib.cookieHeader(lib.REFRESH_COOKIE, '', req, { clear: true }),
    lib.cookieHeader(lib.OAUTH_COOKIE, '', req, { clear: true })
  ]);
  lib.json(res, 200, { ok: true });
};

#!/usr/bin/env node
/**
 * Vercel (or local) build step: optionally inject GOOGLE_CLIENT_ID into
 * js/config.js. The committed file stays empty so public forks never copy
 * your Client ID. Runs on Vercel's build machines; does not need to dirty
 * your local working tree when you deploy with `vercel --prod`.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const id = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const out = path.join(__dirname, '..', 'js', 'config.js');

const body =
  '/* Daycells deployment config.\n' +
  ' * Committed copy keeps googleClientId empty. At deploy, scripts/inject-client-id.js\n' +
  ' * may fill this from the GOOGLE_CLIENT_ID env var (Vercel Production).\n' +
  ' * Forks: leave empty, or set your own env / paste in Settings.\n' +
  ' */\n' +
  'window.DC_CONFIG = {\n' +
  '  googleClientId: ' + JSON.stringify(id) + '\n' +
  '};\n';

fs.writeFileSync(out, body);
console.log(id
  ? 'inject-client-id: wrote googleClientId from GOOGLE_CLIENT_ID'
  : 'inject-client-id: GOOGLE_CLIENT_ID unset; wrote empty googleClientId');

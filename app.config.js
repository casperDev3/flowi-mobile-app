/**
 * app.config.js — тонкий шар над app.json (app.json лишається джерелом істини).
 *
 * Лише значення, що належать акаунту власника, а не коду:
 *  - FLOWI_APPLE_TEAM_ID — Team ID нового Apple Developer акаунта (10 символів).
 *    Без нього prebuild не пропише DEVELOPMENT_TEAM, і Xcode попросить обрати
 *    команду вручну (Signing & Capabilities). Не секрет, але й не хардкодимо
 *    старий акаунт.
 *
 * Див. docs/release-rc1/identity-signing-domains.md, scripts/owner-setup-wizard.sh.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = ({ config }) => {
  const teamId = (process.env.FLOWI_APPLE_TEAM_ID || '').trim();
  if (teamId) {
    if (!/^[A-Z0-9]{10}$/.test(teamId)) {
      throw new Error(`FLOWI_APPLE_TEAM_ID має бути 10 символів A-Z0-9, отримано "${teamId}"`);
    }
    config.ios = { ...(config.ios || {}), appleTeamId: teamId };
  }
  // FCM (нативний токен Android, getDevicePushTokenAsync) потребує
  // google-services.json нового Firebase-проєкту з package app.flowi.mobile.
  // Файл не комітимо: FLOWI_GOOGLE_SERVICES_JSON або ~/.flowi-signing/google-services.json.
  const gsCandidates = [
    process.env.FLOWI_GOOGLE_SERVICES_JSON,
    path.join(os.homedir(), '.flowi-signing', 'google-services.json'),
  ].filter(Boolean);
  const gs = gsCandidates.find((p) => fs.existsSync(p));
  if (gs) {
    config.android = { ...(config.android || {}), googleServicesFile: gs };
  }
  return config;
};

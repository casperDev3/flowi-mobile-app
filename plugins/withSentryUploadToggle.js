/**
 * plugins/withSentryUploadToggle.js
 *
 * Release-збірка iOS має два кроки, які вантажать у Sentry source maps і
 * debug-символи. Без організації, проєкту й токена Sentry (SENTRY_ORG /
 * SENTRY_PROJECT / SENTRY_AUTH_TOKEN) sentry-cli падає і валить усю збірку
 * («An organization ID or slug is required»).
 *
 * Плагін переживає `expo prebuild`:
 *  - якщо SENTRY_AUTH_TOKEN не заданий під час prebuild — дописує
 *    `export SENTRY_DISABLE_AUTO_UPLOAD=true` у ios/.xcode.env.local;
 *  - крок «Upload Debug Symbols to Sentry» сам .xcode.env.local не читає,
 *    тож додаємо йому `source` цього файлу (як у кроці бандлування).
 * Коли токен з'явиться — prebuild прапорець не додасть і завантаження
 * запрацює як звичайно. Краш-репорти Sentry від цього не залежать.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');

const FLAG = 'export SENTRY_DISABLE_AUTO_UPLOAD=true';
const SOURCE_LOCAL = 'if [[ -f \\"$PODS_ROOT/../.xcode.env.local\\" ]]; then\\n  source \\"$PODS_ROOT/../.xcode.env.local\\"\\nfi\\n';

function withEnvLocal(config) {
  return withDangerousMod(config, ['ios', (cfg) => {
    const file = path.join(cfg.modRequest.platformProjectRoot, '.xcode.env.local');
    let current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    // Xcode із GUI не бачить PATH Homebrew — без NODE_BINARY кроки з node падають.
    if (!/^export NODE_BINARY=/m.test(current)) {
      current = `export NODE_BINARY=${process.execPath}\n${current}`;
      fs.writeFileSync(file, current);
    }
    if (process.env.SENTRY_AUTH_TOKEN) return cfg;
    if (!current.includes(FLAG)) {
      const sep = current && !current.endsWith('\n') ? '\n' : '';
      fs.writeFileSync(file, `${current}${sep}\n# Немає токена Sentry — не вантажимо source maps / символи (withSentryUploadToggle)\n${FLAG}\n`);
    }
    return cfg;
  }]);
}

function withDebugFilesSourcesEnv(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase || {};
    for (const key of Object.keys(phases)) {
      const phase = phases[key];
      if (!phase || typeof phase !== 'object' || typeof phase.shellScript !== 'string') continue;
      const script = phase.shellScript;
      if (!script.includes('sentry-xcode-debug-files.sh') || script.includes('.xcode.env.local')) continue;
      // shellScript зберігається як рядок у лапках: вставляємо після відкривної.
      phase.shellScript = script.startsWith('"') ? `"${SOURCE_LOCAL}${script.slice(1)}` : `${SOURCE_LOCAL}${script}`;
    }
    return cfg;
  });
}

module.exports = function withSentryUploadToggle(config) {
  return withDebugFilesSourcesEnv(withEnvLocal(config));
};

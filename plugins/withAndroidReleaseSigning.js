/**
 * plugins/withAndroidReleaseSigning.js
 *
 * Локальна release-збірка Android (без EAS) підписується upload-ключем власника,
 * що лежить ПОЗА репозиторієм (~/.flowi-signing/flowi-upload.jks). Шлях і паролі
 * приходять із Gradle properties — зазвичай ~/.gradle/gradle.properties
 * (шаблон: scripts/android-signing.gradle.properties.example):
 *
 *   FLOWI_UPLOAD_STORE_FILE=/Users/<you>/.flowi-signing/flowi-upload.jks
 *   FLOWI_UPLOAD_STORE_PASSWORD=…
 *   FLOWI_UPLOAD_KEY_ALIAS=flowi-upload
 *   FLOWI_UPLOAD_KEY_PASSWORD=…
 *
 * Плагін переживає `expo prebuild`: дописує в android/app/build.gradle
 * signingConfigs.release і перемикає buildTypes.release на нього. Якщо
 * значень немає, а запитано release-задачу (assembleRelease / bundleRelease /
 * installRelease …) — збірка ПАДАЄ з поясненням, а не тихо підписує
 * debug-ключем (стандартний шаблон Expo саме так і робить). Debug-збірки
 * властивостей не потребують.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// @flowi-release-signing';

const SIGNING_BLOCK = `
        release {
            ${MARKER}
            def flowiStore = findProperty('FLOWI_UPLOAD_STORE_FILE')
            if (flowiStore) {
                storeFile file(flowiStore)
                storePassword findProperty('FLOWI_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('FLOWI_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('FLOWI_UPLOAD_KEY_PASSWORD')
            }
        }`;

const GUARD_BLOCK = `
${MARKER}-guard
// Release без upload-ключа — помилка, а не тихий підпис debug-ключем.
gradle.taskGraph.whenReady { graph ->
    def wantsRelease = graph.allTasks.any { t ->
        t.project == project && t.name.toLowerCase().contains('release') &&
            (t.name.startsWith('assemble') || t.name.startsWith('bundle') ||
             t.name.startsWith('install') || t.name.startsWith('package') ||
             t.name.startsWith('sign'))
    }
    if (!wantsRelease) return
    def missing = ['FLOWI_UPLOAD_STORE_FILE', 'FLOWI_UPLOAD_STORE_PASSWORD',
                   'FLOWI_UPLOAD_KEY_ALIAS', 'FLOWI_UPLOAD_KEY_PASSWORD'].findAll { !findProperty(it) }
    if (!missing.isEmpty()) {
        throw new GradleException("Flowi release signing: не задано " + missing.join(', ') +
            ". Додайте їх у ~/.gradle/gradle.properties (шаблон scripts/android-signing.gradle.properties.example," +
            " майстер scripts/owner-setup-wizard.sh).")
    }
    def store = file(findProperty('FLOWI_UPLOAD_STORE_FILE'))
    if (!store.exists()) {
        throw new GradleException("Flowi release signing: keystore не знайдено: " + store.absolutePath)
    }
}
`;

function applySigning(src) {
  if (src.includes(MARKER)) return src;
  let out = src;
  // 1) signingConfigs { debug { … } } → додаємо release поруч.
  const sc = out.match(/signingConfigs\s*\{\s*\n(\s*)debug\s*\{[^}]*\}/);
  if (!sc) throw new Error('withAndroidReleaseSigning: signingConfigs.debug не знайдено в app/build.gradle');
  out = out.replace(sc[0], sc[0] + SIGNING_BLOCK);
  // 2) buildTypes.release: signingConfig signingConfigs.debug → release.
  const bt = out.match(/buildTypes\s*\{[\s\S]*?\n(\s*)release\s*\{([\s\S]*?)signingConfig signingConfigs\.debug/);
  if (!bt) throw new Error('withAndroidReleaseSigning: buildTypes.release.signingConfig не знайдено');
  out = out.replace(bt[0], bt[0].replace(/signingConfig signingConfigs\.debug$/, 'signingConfig signingConfigs.release'));
  // 3) Гард наприкінці файлу.
  out = `${out.trimEnd()}\n${GUARD_BLOCK}`;
  return out;
}

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withAndroidReleaseSigning: очікується Groovy app/build.gradle');
    }
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applySigning = applySigning;

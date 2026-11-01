/**
 * modules/flowi-ios-bridge/app.plugin.js — файли, що мусять жити в ЦІЛІ
 * ЗАСТОСУНКУ, а не в pod-і модуля (docs/specs/watch-lockscreen-v1.md §7.2):
 *
 *   • FlowiStopTimerIntent.swift — LiveActivityIntent «Стоп». Система виконує
 *     його perform() у процесі застосунку, і метадані App Intents
 *     витягуються лише з цілі застосунку;
 *   • FlowiTimerAttributes.swift — тип активності, на який посилається інтент.
 *
 * Обидва — побайтові копії зі спеки; джерело — `app-target/` поруч. Плагін
 * копіює їх у `ios/<Project>/` і додає в Sources головної цілі. Ідемпотентний:
 * повторний prebuild лише оновлює вміст файлів, посилання не дублюються.
 *
 * Додатково — слабке лінкування AppIntents/ActivityKit для головної цілі:
 * мінімальна iOS застосунку нижча за 16, а обидва фреймворки з'явились пізніше.
 */
/* global __dirname */
const fs = require('fs');
const path = require('path');
const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

const SOURCE_DIR = path.join(__dirname, 'app-target');
const FILES = ['FlowiTimerAttributes.swift', 'FlowiStopTimerIntent.swift'];
const WEAK_FRAMEWORKS = ['AppIntents', 'ActivityKit'];

function unquote(value) {
  return typeof value === 'string' ? value.replace(/^"(.*)"$/, '$1') : value;
}

/** Головна ціль застосунку — не годинник (той теж `application`) і не віджет. */
function findAppTarget(project, projectName) {
  const targets = project.pbxNativeTargetSection();
  for (const [uuid, target] of Object.entries(targets)) {
    if (uuid.endsWith('_comment') || !target || typeof target !== 'object') continue;
    if (unquote(target.productType) !== 'com.apple.product-type.application') continue;
    if (unquote(target.name) === projectName) return { uuid, target };
  }
  const fallback = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
  return { uuid: fallback.uuid, target: fallback.target };
}

function addWeakFrameworks(project, target) {
  const lists = project.pbxXCConfigurationList();
  const list = lists[target.buildConfigurationList];
  if (!list) return;
  const configs = project.pbxXCBuildConfigurationSection();
  for (const ref of list.buildConfigurations || []) {
    const config = configs[ref.value];
    if (!config || !config.buildSettings) continue;
    const settings = config.buildSettings;
    let flags = settings.OTHER_LDFLAGS;
    if (flags === undefined) flags = ['"$(inherited)"'];
    else if (!Array.isArray(flags)) flags = [flags];
    const present = flags.map(unquote).join(' ');
    for (const framework of WEAK_FRAMEWORKS) {
      if (present.includes(`-weak_framework ${framework}`)) continue;
      flags.push('"-weak_framework"', `"${framework}"`);
    }
    settings.OTHER_LDFLAGS = flags;
  }
}

function withFlowiIosBridge(config) {
  return withXcodeProject(config, cfg => {
    const project = cfg.modResults;
    const projectName = cfg.modRequest.projectName
      || IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const nativeRoot = cfg.modRequest.platformProjectRoot;
    const { uuid: targetUuid, target } = findAppTarget(project, projectName);

    for (const name of FILES) {
      const filePath = path.join(projectName, name);
      const contents = fs.readFileSync(path.join(SOURCE_DIR, name), 'utf8');
      const absolute = path.join(nativeRoot, filePath);
      // Завжди перезаписуємо: джерело правди — app-target/, а не ios/ (CNG).
      if (!fs.existsSync(absolute) || fs.readFileSync(absolute, 'utf8') !== contents) {
        fs.writeFileSync(absolute, contents, 'utf8');
      }
      if (!project.hasFile(filePath)) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath: filePath,
          groupName: projectName,
          project,
          targetUuid,
        });
      }
    }

    addWeakFrameworks(project, target);
    return cfg;
  });
}

module.exports = withFlowiIosBridge;

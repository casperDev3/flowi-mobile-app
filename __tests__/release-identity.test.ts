/**
 * rc1 (2026-11-22): ідентичність застосунку, схеми, verified links, підпис, номер збірки.
 * docs/release-rc1/identity-signing-domains.md
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

jest.mock('@expo/config-plugins', () => ({ withAppBuildGradle: jest.fn() }));

const ROOT = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applySigning } = require('../plugins/withAndroidReleaseSigning');

describe('release identity', () => {
  it('iOS bundle та Android package — app.flowi.mobile', () => {
    expect(app.ios.bundleIdentifier).toBe('app.flowi.mobile');
    expect(app.android.package).toBe('app.flowi.mobile');
    expect(app.ios.entitlements['com.apple.security.application-groups']).toEqual(['group.app.flowi.mobile']);
    expect(app.ios.appleTeamId).toBeUndefined(); // приходить з FLOWI_APPLE_TEAM_ID (app.config.js)
  });

  it('схема flowi:// головна, ftrackingapp:// — аліас', () => {
    expect(app.scheme).toEqual(['flowi', 'ftrackingapp']);
  });

  it('verified links лише на app.flowi.com.ua: /invite* та /app/*', () => {
    expect(app.ios.associatedDomains).toContain('applinks:app.flowi.com.ua');
    expect(app.ios.associatedDomains.join(',')).not.toMatch(/casperdev/);
    const filter = app.android.intentFilters.find((f: { autoVerify?: boolean }) => f.autoVerify);
    expect(filter.data).toEqual([
      { scheme: 'https', host: 'app.flowi.com.ua', pathPrefix: '/invite' },
      { scheme: 'https', host: 'app.flowi.com.ua', pathPrefix: '/app/' },
    ]);
  });

  it('версія = package.json (rc1: 1.4.x), номер збірки YYMMDDn однаковий для iOS і Android', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(app.version).toBe(pkg.version);
    expect(app.version).toMatch(/^1\.4\.\d+$/);
    expect(String(app.android.versionCode)).toMatch(/^\d{7}$/);
    expect(app.ios.buildNumber).toBe(String(app.android.versionCode));
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/set-build-number.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('нативні цілі не посилаються на стару App Group', () => {
    for (const f of [
      'targets/widget/Snapshot.swift',
      'targets/widget/FlowiStopTimerIntent.swift',
      'targets/widget/generated.entitlements',
      'modules/flowi-ios-bridge/ios/FlowiPendingQueue.swift',
      'modules/flowi-ios-bridge/app-target/FlowiStopTimerIntent.swift',
      'utils/widgetSnapshot.ts',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src).not.toMatch(/com\.casper3/);
      expect(src).toMatch(/group\.app\.flowi\.mobile/);
    }
  });
});

describe('withAndroidReleaseSigning', () => {
  const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution!
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

  it('release підписується upload-ключем з gradle properties і падає без них', () => {
    const out = applySigning(TEMPLATE);
    expect(out).toMatch(/release \{\s*\n\s*\/\/ @flowi-release-signing/);
    expect(out).toContain("findProperty('FLOWI_UPLOAD_STORE_FILE')");
    expect(out).toMatch(/release \{\s*\n\s*\/\/ Caution!\s*\n\s*signingConfig signingConfigs\.release/);
    expect(out).toContain('throw new GradleException("Flowi release signing');
    // debug не чіпаємо
    expect(out).toMatch(/debug \{\s*\n\s*signingConfig signingConfigs\.debug/);
  });

  it('ідемпотентний (повторний prebuild не дублює блоки)', () => {
    const once = applySigning(TEMPLATE);
    expect(applySigning(once)).toBe(once);
  });
});

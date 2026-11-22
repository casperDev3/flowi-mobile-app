#!/usr/bin/env node
/**
 * scripts/set-build-number.mjs — номер збірки YYMMDDn, ОДНАКОВИЙ для iOS
 * (buildNumber / CFBundleVersion / CURRENT_PROJECT_VERSION усіх таргетів:
 * застосунок, віджет, годинник) і Android (versionCode).
 *
 *   node scripts/set-build-number.mjs              # сьогодні; n = 1 або +1, якщо сьогодні вже збирали
 *   node scripts/set-build-number.mjs --n 3        # явний n (1..9)
 *   node scripts/set-build-number.mjs --date 2026-11-22
 *   node scripts/set-build-number.mjs --check      # лише перевірити, що всі місця узгоджені
 *   node scripts/set-build-number.mjs --version 1.4.1  # заодно змінити marketing-версію
 *
 * Джерело істини — app.json (його читає `expo prebuild`). Якщо локальні
 * ios/ та android/ уже згенеровані, скрипт патчить і їх, щоб не робити
 * prebuild заради одного числа. Відсутні нативні файли просто пропускаються.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  appJson: path.join(ROOT, 'app.json'),
  gradle: path.join(ROOT, 'android/app/build.gradle'),
  pbxproj: path.join(ROOT, 'ios/Flowi.xcodeproj/project.pbxproj'),
  plist: path.join(ROOT, 'ios/Flowi/Info.plist'),
  pkg: path.join(ROOT, 'package.json'),
};

export function datePrefix(d) {
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** Наступний номер: той самий день → n+1, інший день → n=1. */
export function nextBuildNumber(current, date, explicitN) {
  const prefix = datePrefix(date);
  let n;
  if (explicitN != null) n = explicitN;
  else {
    const cur = String(current ?? '');
    n = cur.length === 7 && cur.startsWith(prefix) ? Number(cur.slice(6)) + 1 : 1;
  }
  if (!Number.isInteger(n) || n < 1 || n > 9) {
    throw new Error(`n має бути 1..9 (отримано ${n}); більше 9 збірок на день не передбачено`);
  }
  return Number(`${prefix}${n}`);
}

function parseArgs(argv) {
  const out = { n: null, date: null, check: false, version: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') out.check = true;
    else if (a === '--n') out.n = Number(argv[++i]);
    else if (a === '--date') out.date = argv[++i];
    else if (a === '--version') out.version = argv[++i];
    else throw new Error(`Невідомий аргумент: ${a}`);
  }
  return out;
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, v) { fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); }

function collect() {
  const app = readJson(FILES.appJson).expo;
  const found = [
    ['app.json ios.buildNumber', String(app.ios?.buildNumber)],
    ['app.json android.versionCode', String(app.android?.versionCode)],
  ];
  const versions = [['app.json version', app.version], ['package.json version', readJson(FILES.pkg).version]];
  if (fs.existsSync(FILES.gradle)) {
    const g = fs.readFileSync(FILES.gradle, 'utf8');
    found.push(['build.gradle versionCode', (g.match(/versionCode\s+(\d+)/) || [])[1]]);
    versions.push(['build.gradle versionName', (g.match(/versionName\s+"([^"]+)"/) || [])[1]]);
  }
  if (fs.existsSync(FILES.pbxproj)) {
    const x = fs.readFileSync(FILES.pbxproj, 'utf8');
    for (const m of x.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)) found.push(['pbxproj CURRENT_PROJECT_VERSION', m[1]]);
    for (const m of x.matchAll(/MARKETING_VERSION = ([^;]+);/g)) versions.push(['pbxproj MARKETING_VERSION', m[1]]);
  }
  if (fs.existsSync(FILES.plist)) {
    const p = fs.readFileSync(FILES.plist, 'utf8');
    const v = (p.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/) || [])[1];
    if (v && !v.startsWith('$(')) found.push(['Info.plist CFBundleVersion', v]);
    const s = (p.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/) || [])[1];
    if (s && !s.startsWith('$(')) versions.push(['Info.plist CFBundleShortVersionString', s]);
  }
  return { found, versions, current: app.ios?.buildNumber };
}

function apply(build, version) {
  const appJson = readJson(FILES.appJson);
  appJson.expo.ios.buildNumber = String(build);
  appJson.expo.android.versionCode = build;
  if (version) appJson.expo.version = version;
  writeJson(FILES.appJson, appJson);
  if (version) {
    const pkg = readJson(FILES.pkg);
    pkg.version = version;
    writeJson(FILES.pkg, pkg);
  }
  if (fs.existsSync(FILES.gradle)) {
    let g = fs.readFileSync(FILES.gradle, 'utf8');
    g = g.replace(/versionCode\s+\d+/, `versionCode ${build}`);
    if (version) g = g.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
    fs.writeFileSync(FILES.gradle, g);
  }
  if (fs.existsSync(FILES.pbxproj)) {
    let x = fs.readFileSync(FILES.pbxproj, 'utf8');
    x = x.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
    if (version) x = x.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
    fs.writeFileSync(FILES.pbxproj, x);
  }
  if (fs.existsSync(FILES.plist)) {
    let p = fs.readFileSync(FILES.plist, 'utf8');
    p = p.replace(/(<key>CFBundleVersion<\/key>\s*<string>)(?!\$\()[^<]+(<\/string>)/, `$1${build}$2`);
    if (version) p = p.replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)(?!\$\()[^<]+(<\/string>)/, `$1${version}$2`);
    fs.writeFileSync(FILES.plist, p);
  }
}

function report({ found, versions }) {
  const builds = new Set(found.map(([, v]) => v));
  const vers = new Set(versions.map(([, v]) => v));
  for (const [k, v] of [...found, ...versions]) console.log(`  ${k.padEnd(42)} ${v}`);
  const ok = builds.size === 1 && vers.size === 1 && /^\d{7}$/.test([...builds][0] ?? '');
  console.log(ok ? 'OK: номер збірки й версія узгоджені' : 'РОЗБІЖНІСТЬ: номер збірки/версія різняться або не YYMMDDn');
  return ok;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    process.exit(report(collect()) ? 0 : 1);
  }
  if (args.version && !/^\d+\.\d+\.\d+$/.test(args.version)) throw new Error(`--version має бути X.Y.Z: ${args.version}`);
  const date = args.date ? new Date(`${args.date}T12:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error(`--date некоректна: ${args.date}`);
  const build = nextBuildNumber(collect().current, date, args.n);
  apply(build, args.version);
  console.log(`Номер збірки: ${build}${args.version ? `, версія ${args.version}` : ''}`);
  process.exit(report(collect()) ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`set-build-number: ${e.message}`); process.exit(2); }
}

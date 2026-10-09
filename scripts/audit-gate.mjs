import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const audit = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (![0, 1].includes(audit.status)) throw new Error('Audit service failed: ' + audit.stderr);
const report = JSON.parse(audit.stdout);
if (!report.vulnerabilities || report.error) throw new Error('Invalid audit result');
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/npm-audit.json', JSON.stringify(report, null, 2));
// No vendor patch exists for these toolchain-only advisories on 2026-10-09.
// Expiry forces a new review. Runtime source maps below must exclude the packages.
const reviewed = new Map([
  ['https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', 'braces'],
  ['https://github.com/advisories/GHSA-86w9-cpqp-85rv', 'node-forge'],
]);
const blocking = [];
for (const vulnerability of Object.values(report.vulnerabilities)) {
  for (const advisory of vulnerability.via) {
    if (typeof advisory === 'string' || !['high', 'critical'].includes(advisory.severity)) continue;
    if (Date.now() >= Date.parse('2026-11-09') || reviewed.get(advisory.url) !== advisory.name) blocking.push(advisory.url);
  }
}
if (blocking.length) throw new Error('Unreviewed high/critical: ' + [...new Set(blocking)].join(', '));
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const maps = files('artifacts/export').filter(f => f.endsWith('.map'));
if (!maps.length) throw new Error('Release source maps are required for reachability evidence');
let sourceCount = 0;
function check(map) {
 for (const source of map.sources ?? []) {
  sourceCount++;
  if (/(?:^|\/)(?:node-forge|braces|shell-quote)(?:\/|$)/.test(source)) throw new Error('Toolchain risk entered release bundle: ' + source);
 }
 for (const section of map.sections ?? []) check(section.map);
}
for (const file of maps) check(JSON.parse(readFileSync(file, 'utf8')));
console.log(JSON.stringify({ maps: maps.length, sourceCount, reviewedToolchainOnly: [...reviewed.keys()], expires: '2026-11-09' }));

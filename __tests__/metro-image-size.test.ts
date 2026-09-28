import { execFileSync } from 'node:child_process';

it('Metro can read asset dimensions from both a path and bytes using patched parsers', () => {
  const result = execFileSync(process.execPath, ['-e', `
    const { createRequire } = require('module');
    const { readFileSync } = require('fs');
    const size = createRequire(require.resolve('metro/package.json'))('image-size');
    const filename = 'node_modules/expo-router/assets/unmatched.png';
    const fromPath = size(filename);
    const fromBytes = size(readFileSync(filename));
    process.stdout.write(JSON.stringify({ fromPath, fromBytes }));
  `], { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 });
  const { fromPath, fromBytes } = JSON.parse(result);
  expect(fromPath).toEqual(fromBytes);
  expect(fromPath.type).toBe('png');
  expect(fromPath.width).toBeGreaterThan(0);
  expect(fromPath.height).toBeGreaterThan(0);
});

import { execFileSync } from 'node:child_process';

// Exercise the actual CommonJS dependency used by Expo Router's query-string.
// A child process with a timeout prevents the old exponential decoder from
// hanging the entire test runner if the security override is lost.
describe('Expo Router URL decoder compatibility', () => {
  it('decodes Unicode and plus separators through query-string', () => {
    const result = execFileSync(process.execPath, ['-e', `
      const query = require('query-string');
      process.stdout.write(JSON.stringify(query.parse('name=%D0%9C%D0%B5%D0%BD%D1%8E+Flowi&token=abc%2B123')));
    `], { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 });
    expect(JSON.parse(result)).toEqual({ name: 'Меню Flowi', token: 'abc+123' });
  });

  it('handles a long malformed percent-encoded URL without exponential work', () => {
    const result = execFileSync(process.execPath, ['-e', `
      const query = require('query-string');
      const malformed = '%FF'.repeat(5000);
      const parsed = query.parse('token=' + malformed);
      process.stdout.write(String(parsed.token === malformed));
    `], { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 });
    expect(result).toBe('true');
  });
});

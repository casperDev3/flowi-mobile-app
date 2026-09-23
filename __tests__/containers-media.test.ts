/**
 * __tests__/containers-media.test.ts — SHA-256 і черга вивантаження фото.
 * Черга не здається ніколи: єдина копія фото може бути лише на пристрої.
 */

import {
  backoffMs,
  dueJobs,
  enqueueJob,
  markDone,
  markFailed,
  parseQueue,
  sha256Hex,
  type UploadJob,
} from '@/utils/containersMedia';

const bytes = (text: string) => Uint8Array.from(Buffer.from(text, 'utf8'));

describe('sha256Hex', () => {
  it('збігається з еталонами FIPS 180-4', () => {
    expect(sha256Hex(bytes(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('довгі дані через кілька блоків — як у node:crypto', () => {
    const { createHash } = require('crypto') as typeof import('crypto');
    const big = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 31 + 7) & 255);
    expect(sha256Hex(big)).toBe(createHash('sha256').update(big).digest('hex'));
  });
});

describe('черга вивантаження', () => {
  const job = (assetId: string): UploadJob => ({
    assetId, sha256: 'x', localPath: `file:///m/${assetId}.jpg`, tries: 0, createdAt: '',
  });

  it('затримка росте і має стелю в годину', () => {
    expect(backoffMs(0)).toBe(5_000);
    expect(backoffMs(3)).toBe(40_000);
    expect(backoffMs(50)).toBe(3_600_000);
  });

  it('не дублює той самий asset і не здається після багатьох невдач', () => {
    let q = enqueueJob([], job('a'));
    q = enqueueJob(q, job('a'));
    expect(q).toHaveLength(1);
    for (let i = 0; i < 30; i++) q = markFailed(q, 'a', 'offline', 1000);
    expect(q).toHaveLength(1);
    expect(q[0].tries).toBe(30);
    expect(q[0].lastError).toBe('offline');
    expect(dueJobs(q, 1000)).toHaveLength(0);
    expect(dueJobs(q, 1000 + 3_600_000)).toHaveLength(1);
    expect(markDone(q, 'a')).toHaveLength(0);
  });

  it('фото з іншого workspace не вантажиться на поточний сервер', () => {
    const q = [{ ...job('a'), workspaceId: 'ws1' }, { ...job('b'), workspaceId: 'ws2' }, job('legacy')];
    expect(dueJobs(q, 0, 'ws1').map(j => j.assetId)).toEqual(['a', 'legacy']);
  });

  it('биті дані в ключі — порожня черга, а не падіння', () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue([{ assetId: 1 }, job('b'), 'x'])).toEqual([job('b')]);
  });
});

/**
 * __tests__/feedback-queue.test.ts — клієнтська черга подання
 * (flowi-server-app/docs/specs/feedback-inbox.md §4, §10.5, §11.2).
 *
 * Головне, що тут охороняється: «Надіслано» ставиться ЛИШЕ після 2xx від
 * сервера, офлайн нічого не губить і не шле, 4xx не ретраїться, вкладення
 * вантажаться на `upload_url` свого сервера й прибираються з диска після `stored`.
 */

import * as api from '@/store/api';
import * as appMode from '@/store/app-mode';
import {
  FEEDBACK_FILES_KEY,
  FEEDBACK_QUEUE_KEY,
  __resetFeedbackQueueForTests,
  enqueueFeedback,
  processFeedbackQueue,
  resolveUploadUrl,
  statusesFromReports,
} from '@/api/feedback';
import type { Bug, FeedbackContext } from '@/components/feedback/model';

const mockMem = new Map<string, unknown>();
const mockDeleted: string[] = [];

jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => (mockMem.has(key) ? JSON.parse(JSON.stringify(mockMem.get(key))) : fallback)),
  saveData: jest.fn(async (key: string, value: unknown) => { mockMem.set(key, JSON.parse(JSON.stringify(value))); }),
}));

jest.mock('@/store/synced-storage', () => ({
  updateSynced: jest.fn(async (key: string, mutate: (fresh: unknown[]) => unknown[]) => {
    const fresh = (mockMem.get(key) as unknown[] | undefined) ?? [];
    const next = mutate(JSON.parse(JSON.stringify(fresh)));
    mockMem.set(key, JSON.parse(JSON.stringify(next)));
    return next;
  }),
}));

jest.mock('@/store/app-mode', () => ({
  isOnlineMode: jest.fn(() => true),
  subscribeOnlineMode: jest.fn(() => () => {}),
}));

jest.mock('@/store/api-config', () => ({
  CLIENT_HEADER_VALUE: 'mobile/1.1.0 (ios)',
  getApiBase: () => 'https://ws.example/api',
}));

jest.mock('@/store/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(httpStatus: number, errorCode: string, message: string) {
      super(message);
      this.status = httpStatus;
      this.code = errorCode;
    }
  }
  class OfflineError extends Error {}
  return {
    ApiError,
    OfflineError,
    apiFetch: jest.fn(),
    getAccessToken: jest.fn(async () => 'token'),
    getFreshAccessToken: jest.fn(async () => 'token'),
  };
});

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map(p => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() { return true; }
    get name() { return this.uri.split('/').pop() ?? ''; }
    get size() { return 1; }
    delete() { mockDeleted.push(this.uri); }
    copy() {}
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map(p => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() { return true; }
    create() {}
  }
  return { File, Directory, Paths: { document: { uri: 'file:///doc' } } };
});


const apiFetch = api.apiFetch as jest.Mock;
const isOnline = appMode.isOnlineMode as jest.Mock;
const ApiErrorCtor = api.ApiError as unknown as new (s: number, c: string, m: string) => Error;

const ctx: FeedbackContext = { platform: 'mobile', deviceType: 'phone', appVersion: '1.1.0', screen: '/feedback' };

function seedBug(over: Partial<Bug> = {}): Bug {
  const bug: Bug = {
    id: 'b1', title: 'Не зберігається', description: '', severity: 'major', fixed: false,
    createdAt: '2026-09-20T10:00:00.000Z', steps: '1', expected: '2', actual: '3',
    attachments: [{ uid: 'att1', kind: 'image', name: 's.png', bytes: 5, mime: 'image/png', state: 'local' }],
    ...over,
  };
  mockMem.set('bugs', [bug]);
  mockMem.set(FEEDBACK_FILES_KEY, { att1: { uri: 'file:///doc/feedback/att1.png', mime: 'image/png', bytes: 5, addedAt: '2026-09-20' } });
  return bug;
}

const storedBug = () => (mockMem.get('bugs') as Bug[])[0];
const queue = () => (mockMem.get(FEEDBACK_QUEUE_KEY) as { attempts: number; nextAttemptAt: number }[] | undefined) ?? [];

const fetchMock = jest.fn();

beforeEach(() => {
  mockMem.clear();
  mockDeleted.length = 0;
  apiFetch.mockReset();
  fetchMock.mockReset();
  isOnline.mockReturnValue(true);
  global.fetch = fetchMock as unknown as typeof fetch;
  __resetFeedbackQueueForTests();
});

afterAll(() => __resetFeedbackQueueForTests());

describe('черга подання', () => {
  it('офлайн: запис у стані queued, жодного мережевого виклику', async () => {
    isOnline.mockReturnValue(false);
    seedBug();
    await enqueueFeedback('bug', 'b1', ctx);
    await processFeedbackQueue();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storedBug().submitState).toBe('queued');
    expect(storedBug().context).toEqual(ctx);
    expect(queue()).toHaveLength(1);
  });

  it('2xx: «Надіслано» + reportUid, файл PUT-ом на upload_url свого сервера, потім геть із диска', async () => {
    seedBug();
    apiFetch.mockResolvedValue({
      report_uid: 'rep-1',
      delivery_state: 'queued',
      attachments: [{ client_uid: 'att1', upload_url: '/api/feedback/reports/rep-1/attachments/att1/', max_bytes: 10, state: 'pending' }],
    });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await enqueueFeedback('bug', 'b1', ctx);
    await processFeedbackQueue();

    expect(apiFetch).toHaveBeenCalledWith('/feedback/reports/', expect.objectContaining({ method: 'POST' }));
    const body = apiFetch.mock.calls[0][1].body;
    expect(body).toMatchObject({ kind: 'bug', collection: 'bugs', local_id: 'b1', steps: '1' });
    expect(body.attachments).toEqual([{ client_uid: 'att1', kind: 'image', name: 's.png', bytes: 5, mime: 'image/png' }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://ws.example/api/feedback/reports/rep-1/attachments/att1/');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');

    expect(storedBug()).toMatchObject({ submitState: 'sent', reportUid: 'rep-1' });
    expect(storedBug().attachments?.[0].state).toBe('uploaded');
    expect(storedBug()).not.toHaveProperty('sentToDev');
    expect(mockDeleted).toContain('file:///doc/feedback/att1.png');
    expect(mockMem.get(FEEDBACK_FILES_KEY)).toEqual({});
    expect(queue()).toHaveLength(0);
  });

  it('5xx: лишається в черзі з backoff, «Надіслано» НЕ ставиться', async () => {
    seedBug({ attachments: undefined });
    apiFetch.mockRejectedValue(new ApiErrorCtor(503, 'unavailable', 'Service unavailable'));
    await enqueueFeedback('bug', 'b1', ctx);
    await processFeedbackQueue();
    expect(storedBug().submitState).toBe('queued');
    expect(storedBug().reportUid).toBeUndefined();
    expect(queue()).toHaveLength(1);
    expect(queue()[0].attempts).toBe(1);
    expect(queue()[0].nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it('4xx: failed із причиною, з черги прибрано (повтор лише спалить ліміт)', async () => {
    seedBug({ attachments: undefined });
    apiFetch.mockRejectedValue(new ApiErrorCtor(400, 'invalid_request', 'Потрібна назва.'));
    await enqueueFeedback('bug', 'b1', ctx);
    await processFeedbackQueue();
    expect(storedBug()).toMatchObject({ submitState: 'failed', submitError: 'Потрібна назва.' });
    expect(queue()).toHaveLength(0);
  });

  it('вкладення, що впало на мережі, тримає запис у черзі; текст уже «Надіслано»', async () => {
    seedBug();
    apiFetch.mockResolvedValue({
      report_uid: 'rep-2', delivery_state: 'queued',
      attachments: [{ client_uid: 'att1', upload_url: '/api/feedback/reports/rep-2/attachments/att1/', max_bytes: 10, state: 'pending' }],
    });
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await enqueueFeedback('bug', 'b1', ctx);
    await processFeedbackQueue();
    expect(storedBug()).toMatchObject({ submitState: 'sent', reportUid: 'rep-2' });
    expect(storedBug().attachments?.[0].state).toBe('local');
    expect(queue()).toHaveLength(1);
    expect(mockDeleted).toHaveLength(0);
  });

  it('видалений запис просто випадає з черги', async () => {
    seedBug();
    isOnline.mockReturnValue(false);
    await enqueueFeedback('bug', 'b1', ctx);
    await processFeedbackQueue();
    mockMem.set('bugs', []);
    isOnline.mockReturnValue(true);
    await processFeedbackQueue();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(queue()).toHaveLength(0);
  });
});

describe('допоміжне', () => {
  it('upload_url — лише відносний, від кореня сервера воркспейсу', () => {
    expect(resolveUploadUrl('https://ws.example/api', '/api/feedback/x/')).toBe('https://ws.example/api/feedback/x/');
    expect(resolveUploadUrl('https://ws.example/api/', '/api/feedback/x/')).toBe('https://ws.example/api/feedback/x/');
    expect(resolveUploadUrl('https://ws.example/api', 'https://evil.example/upload')).toBeNull();
  });

  it('статуси з GET зводяться за ключем <kind>:<local_id>', () => {
    const map = statusesFromReports([{
      report_uid: 'r', kind: 'idea', collection: 'ideas', local_id: '42', delivery_state: 'delivered',
      status: 'done', status_comment: 'Готово в 1.2', duplicate_of: null, task_linked: true, status_updated_at: null,
    }]);
    expect(map['idea:42']).toEqual({
      reportUid: 'r', deliveryState: 'delivered', status: 'done', comment: 'Готово в 1.2',
      duplicateOf: null, taskLinked: true, updatedAt: null,
    });
  });
});

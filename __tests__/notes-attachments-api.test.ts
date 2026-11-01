/**
 * Клієнт файлів нотатки: помилки квоти й прибирання файлів видаленої нотатки.
 * jest.mock піднімається babel-jest над імпортами.
 */
import { ApiError } from '@/store/api';
import {
  AttachmentQuotaError,
  AttachmentTooLargeError,
  purgeNoteAttachments,
  uploadNoteAttachment,
} from '@/components/notes/noteAttachmentsApi';

const mockApiFetch = jest.fn();
let mockOnline = true;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('@/store/app-mode', () => ({ isOnlineMode: () => mockOnline }));
jest.mock('@/store/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(statusValue: number, codeValue: string, message: string) {
      super(message);
      this.status = statusValue;
      this.code = codeValue;
    }
  }
  class OfflineError extends Error {}
  return { ApiError, OfflineError, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

const file = { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg', size: 10 };

beforeEach(() => { mockApiFetch.mockReset(); mockOnline = true; });

describe('uploadNoteAttachment errors', () => {
  it('maps 413 storage quota to AttachmentQuotaError', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(413, 'storage_quota_exceeded', 'quota'));
    await expect(uploadNoteAttachment({ id: 'n1' }, file)).rejects.toBeInstanceOf(AttachmentQuotaError);
  });

  it('maps the per-note 100 MB cap (400 quota) to AttachmentQuotaError', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(400, 'quota', 'quota'));
    await expect(uploadNoteAttachment({ id: 'n1' }, file)).rejects.toBeInstanceOf(AttachmentQuotaError);
  });

  it('keeps 400 invalid_size as AttachmentTooLargeError', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(400, 'invalid_size', 'size'));
    await expect(uploadNoteAttachment({ id: 'n1' }, file)).rejects.toBeInstanceOf(AttachmentTooLargeError);
  });
});

describe('purgeNoteAttachments', () => {
  it('deletes every file of the note in its scope and swallows failures', async () => {
    mockApiFetch.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network'));
    await expect(purgeNoteAttachments({ id: 'n1', projectId: 'p1', attachments: [{ id: 'a1' }, { id: 'a2' }] })).resolves.toBeUndefined();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/notes/n1/attachments/a1/?projectId=p1');
    expect(mockApiFetch.mock.calls[0][1]).toEqual({ method: 'DELETE' });
  });

  it('does nothing offline or without files', async () => {
    await purgeNoteAttachments({ id: 'n1' });
    mockOnline = false;
    await purgeNoteAttachments({ id: 'n1', attachments: [{ id: 'a1' }] });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

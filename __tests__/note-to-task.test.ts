/**
 * __tests__/note-to-task.test.ts — «Перетворити на задачу» (utils/noteToTask.ts):
 * ті самі правила, що й вебовий lib/note-to-task.ts.
 */
import {
  NOTE_TASK_TITLE_MAX,
  noteAfterConversion,
  noteTaskFields,
  noteTaskHref,
  noteTaskRecord,
} from '@/utils/noteToTask';
import type { Note } from '@/utils/notes';

const NOW = '2026-10-01T10:00:00.000Z';
const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1', title: 'Купити фарбу', body: 'Біла матова\n- [ ] 2 банки', createdAt: NOW, updatedAt: NOW, ...over,
});

describe('noteTaskFields', () => {
  test('назва — назва нотатки, опис — увесь текст, проєкт — проєкт нотатки', () => {
    expect(noteTaskFields(note({ projectId: 'p1' }))).toEqual({
      title: 'Купити фарбу', description: 'Біла матова\n- [ ] 2 банки', projectId: 'p1',
    });
  });

  test('без назви — перший непорожній рядок без розмітки', () => {
    expect(noteTaskFields(note({ title: '  ', body: '\n\n## **Зателефонувати** майстру\nдалі' })).title)
      .toBe('Зателефонувати майстру');
  });

  test('особиста нотатка — без проєкту; легасі-текст старого вебу читається', () => {
    const legacy = { id: 'l', title: '', text: '- [x] Старий пункт', createdAt: NOW, updatedAt: NOW } as unknown as Note;
    expect(noteTaskFields(legacy)).toEqual({ title: 'Старий пункт', description: '- [x] Старий пункт', projectId: null });
  });

  test('назва обрізається до стелі', () => {
    expect(noteTaskFields(note({ title: 'я'.repeat(300) })).title).toHaveLength(NOTE_TASK_TITLE_MAX);
  });
});

describe('noteTaskRecord', () => {
  test('порожня назва — нічого не зберігаємо', () => {
    expect(noteTaskRecord({ title: '   ', description: 'x', projectId: null }, { id: 't', now: NOW })).toBeNull();
  });

  test('особиста задача: активна, без опису, якщо він порожній, без автора', () => {
    expect(noteTaskRecord({ title: ' Фарба ', description: '  ', projectId: null }, { id: 't', now: NOW, userId: 'u1' })).toEqual({
      id: 't', title: 'Фарба', status: 'active', subtasks: [], createdAt: NOW, updatedAt: NOW,
    });
  });

  test('проєктна задача отримує автора (§3.3)', () => {
    expect(noteTaskRecord({ title: 'Фарба', description: 'Біла', projectId: 'p1' }, { id: 't', now: NOW, userId: 42 as unknown as string })).toEqual({
      id: 't', title: 'Фарба', description: 'Біла', status: 'active', subtasks: [], createdAt: NOW, updatedAt: NOW,
      projectId: 'p1', createdBy: '42',
    });
  });
});

describe('noteAfterConversion', () => {
  const later = '2026-10-01T11:00:00.000Z';
  test('видалити — якщо людина так обрала', () => {
    expect(noteAfterConversion(note(), 't', true, later)).toEqual({ action: 'delete' });
  });
  test('інакше — зв\'язок із новою задачею', () => {
    expect(noteAfterConversion(note(), 't', false, later)).toEqual({
      action: 'link', next: { ...note(), linkedTaskId: 't', updatedAt: later },
    });
  });
  test('наявний зв\'язок не перезаписується', () => {
    expect(noteAfterConversion(note({ linkedTaskId: 'old' }), 't', false, later)).toEqual({ action: 'keep' });
  });
});

describe('noteTaskHref', () => {
  test('особиста — вкладка «Завдання», проєктна — завдання її проєкту', () => {
    expect(noteTaskHref({ id: 't 1' })).toBe('/(tabs)?open=t%201');
    expect(noteTaskHref({ id: 't1', projectId: 'p1' })).toBe('/project/p1/tasks?open=t1');
  });
});

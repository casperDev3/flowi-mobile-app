/**
 * components/notes/noteToTaskStrings.ts — підписи «Перетворити на задачу» і
 * станів зон нотаток на планшеті. Маленький словник поруч із компонентом (як
 * components/shared/sidebar-strings.ts): телефон цих рядків не бачить, тож
 * спільний store/translations.ts не роздуваємо. Тексти — як у вебі
 * (components/notes/note-to-task-dialog.tsx).
 */
import { useI18n } from '@/store/i18n';

const uk = {
  convert: 'Перетворити на задачу',
  convertIntro: 'Перевірте поля — задача з’явиться в «Завданнях» на всіх пристроях.',
  titleLabel: 'Назва задачі',
  titlePlaceholder: 'Що треба зробити',
  titleRequired: 'Вкажіть назву задачі',
  descriptionLabel: 'Опис',
  descriptionHint: 'Текст нотатки. Розмітку чек-листів буде збережено як текст.',
  projectLabel: 'Проєкт',
  noProject: 'Без проєкту (особиста)',
  noteProject: 'Проєкт нотатки',
  deleteNote: 'Видалити нотатку після перетворення',
  deleteNoteOn: 'Нотатку буде видалено з web і з mobile.',
  deleteNoteOff: 'Нотатка лишиться й отримає зв’язок із новою задачею.',
  cancel: 'Скасувати',
  submit: 'Створити задачу',
  saving: 'Створюємо…',
  createError: 'Не вдалося створити задачу. Спробуйте ще раз.',
  noteUpdateError: 'Задачу створено, але нотатку не оновлено.',
  created: (title: string) => `Задачу створено: ${title}`,
  openTask: 'Відкрити задачу',
  dismiss: 'Сховати',
  staticToday: 'Сьогодні',
  staticPinned: 'Закріплені',
  staticRecent: 'Нещодавні',
  staticTags: 'Теги',
  notFound: 'Нотатку не знайдено',
  notFoundHint: 'Її могли видалити на іншому пристрої або вона поза цим простором.',
  close: 'Закрити',
};

type NoteToTaskStrings = typeof uk;

const en: NoteToTaskStrings = {
  convert: 'Convert to task',
  convertIntro: 'Check the fields — the task will appear in Tasks on all devices.',
  titleLabel: 'Task title',
  titlePlaceholder: 'What needs to be done',
  titleRequired: 'Enter a task title',
  descriptionLabel: 'Description',
  descriptionHint: 'The note text. Checklist markup is kept as text.',
  projectLabel: 'Project',
  noProject: 'No project (personal)',
  noteProject: 'Note project',
  deleteNote: 'Delete the note after converting',
  deleteNoteOn: 'The note will be deleted on web and mobile.',
  deleteNoteOff: 'The note stays and gets linked to the new task.',
  cancel: 'Cancel',
  submit: 'Create task',
  saving: 'Creating…',
  createError: 'Could not create the task. Try again.',
  noteUpdateError: 'The task was created, but the note was not updated.',
  created: (title: string) => `Task created: ${title}`,
  openTask: 'Open task',
  dismiss: 'Dismiss',
  staticToday: 'Today',
  staticPinned: 'Pinned',
  staticRecent: 'Recent',
  staticTags: 'Tags',
  notFound: 'Note not found',
  notFoundHint: 'It may have been deleted on another device or belongs to another space.',
  close: 'Close',
};

export function noteToTaskStrings(lang: string): NoteToTaskStrings {
  return lang === 'en' ? en : uk;
}

export function useNoteToTaskStrings(): NoteToTaskStrings {
  const { lang } = useI18n();
  return noteToTaskStrings(lang);
}

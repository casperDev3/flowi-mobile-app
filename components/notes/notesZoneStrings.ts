/**
 * components/notes/notesZoneStrings.ts — підписи станів зон нотаток на
 * планшеті (статична зона, «не знайдено», смуга після перетворення).
 * Маленький словник поруч із компонентом (як components/shared/sidebar-strings.ts):
 * телефон цих рядків не бачить, тож спільний store/translations.ts не роздуваємо.
 */
import { useI18n } from '@/store/i18n';

const uk = {
  taskCreated: (title: string) => `Задачу створено: ${title}`,
  meetingCreated: (title: string) => `Зустріч створено: ${title}`,
  openTask: 'Відкрити задачу',
  openMeeting: 'Відкрити зустріч',
  dismiss: 'Сховати',
  staticToday: 'Сьогодні',
  staticPinned: 'Закріплені',
  staticRecent: 'Нещодавні',
  staticTags: 'Теги',
  notFound: 'Нотатку не знайдено',
  notFoundHint: 'Її могли видалити на іншому пристрої або вона поза цим простором',
  close: 'Закрити',
};

type NotesZoneStrings = typeof uk;

const en: NotesZoneStrings = {
  taskCreated: (title: string) => `Task created: ${title}`,
  meetingCreated: (title: string) => `Meeting created: ${title}`,
  openTask: 'Open task',
  openMeeting: 'Open meeting',
  dismiss: 'Dismiss',
  staticToday: 'Today',
  staticPinned: 'Pinned',
  staticRecent: 'Recent',
  staticTags: 'Tags',
  notFound: 'Note not found',
  notFoundHint: 'It may have been deleted on another device or belongs to another space',
  close: 'Close',
};

export function notesZoneStrings(lang: string): NotesZoneStrings {
  return lang === 'en' ? en : uk;
}

export function useNotesZoneStrings(): NotesZoneStrings {
  const { lang } = useI18n();
  return notesZoneStrings(lang);
}

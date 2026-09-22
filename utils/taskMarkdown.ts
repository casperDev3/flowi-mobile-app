/**
 * utils/taskMarkdown.ts — завдання як Markdown-текст для буфера обміну.
 *
 * «Копіювати» у Flowi означає покласти в буфер ТЕКСТ, а не створити дублікат
 * завдання: людина вставляє його в месенджер, нотатку чи issue. Формат той
 * самий, що й у вебі, тож вставлене з телефона й з браузера виглядає однаково:
 *
 *   **Назва**
 *   Проєкт: Сайт · Спринт: Спринт 3
 *   Статус: У процесі · Дедлайн: 21.09
 *
 *   Опис
 *
 *   Підзавдання:
 *   - [x] зроблене
 *   - [ ] відкрите
 *
 * Порожні поля не пишуться зовсім — ні підпис, ні зайвий « · », ні порожній
 * рядок: «Проєкт: » без назви в тексті, який читатиме інша людина, — шум.
 *
 * formatTaskMarkdown чиста й нічого не знає про id: назви проєкту/спринта/
 * статусу приходять готовими. taskToMarkdown — зручна обгортка для екранів,
 * яка розвʼязує їх зі списків тим самим правилом, що й бейджі на картках.
 */
import { findSprint, type Sprint } from './sprintUtils';
import { taskStatusColumn, type TaskStatusColumn } from './taskStatuses';
import type { Status } from './taskUtils';

export interface TaskMarkdownLabels {
  project: string;
  sprint: string;
  status: string;
  deadline: string;
  subtasks: string;
}

export interface TaskMarkdownTask {
  title: string;
  description?: string | null;
  deadline?: string | null;
  subtasks?: readonly { title: string; done: boolean }[] | null;
}

export interface TaskMarkdownContext {
  projectName?: string | null;
  sprintName?: string | null;
  statusLabel?: string | null;
}

const META_SEPARATOR = ' · ';

/**
 * Дедлайн як dd.MM. Рядок-дата 'YYYY-MM-DD' розбирається вручну: через
 * new Date() він став би північчю UTC і в західних часових поясах показав би
 * попередній день.
 */
export function formatDeadlineDayMonth(value: string | null | undefined): string {
  if (!value) return '';
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (plain) return `${plain[3]}.${plain[2]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function metaLine(parts: readonly [label: string, value: string | null | undefined][]): string {
  return parts
    .map(([label, value]) => [label, (value ?? '').trim()] as const)
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => `${label}: ${value}`)
    .join(META_SEPARATOR);
}

export function formatTaskMarkdown(
  task: TaskMarkdownTask,
  context: TaskMarkdownContext,
  labels: TaskMarkdownLabels,
): string {
  const head: string[] = [`**${task.title.trim()}**`];
  const where = metaLine([[labels.project, context.projectName], [labels.sprint, context.sprintName]]);
  if (where) head.push(where);
  const state = metaLine([[labels.status, context.statusLabel], [labels.deadline, formatDeadlineDayMonth(task.deadline)]]);
  if (state) head.push(state);

  const blocks: string[] = [head.join('\n')];

  const description = (task.description ?? '').trim();
  if (description) blocks.push(description);

  const subtasks = (task.subtasks ?? []).filter(sub => sub.title.trim().length > 0);
  if (subtasks.length > 0) {
    blocks.push([
      `${labels.subtasks}:`,
      ...subtasks.map(sub => `- [${sub.done ? 'x' : ' '}] ${sub.title.trim()}`),
    ].join('\n'));
  }

  return blocks.join('\n\n');
}

/** Словник екрана → підписи формату (ключі copyMd* у store/translations.ts). */
export function taskMarkdownLabels(tr: {
  copyMdProject: string; copyMdSprint: string; copyMdStatus: string; copyMdDeadline: string; copyMdSubtasks: string;
}): TaskMarkdownLabels {
  return {
    project: tr.copyMdProject,
    sprint: tr.copyMdSprint,
    status: tr.copyMdStatus,
    deadline: tr.copyMdDeadline,
    subtasks: tr.copyMdSubtasks,
  };
}

export function taskToMarkdown(
  task: TaskMarkdownTask & { status: Status; kanbanColumnId?: string; projectId?: string; sprintId?: string },
  lookups: {
    projects: readonly { id: string; name: string }[];
    sprints: readonly Sprint[];
    columns: TaskStatusColumn[];
  },
  labels: TaskMarkdownLabels,
): string {
  const project = task.projectId ? lookups.projects.find(p => p.id === task.projectId) : undefined;
  return formatTaskMarkdown(task, {
    projectName: project?.name,
    sprintName: findSprint(lookups.sprints, task.sprintId)?.name,
    statusLabel: taskStatusColumn(task, lookups.columns).name,
  }, labels);
}

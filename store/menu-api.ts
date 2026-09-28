import { apiFetch } from "./api";
export const meals = {
  breakfast: "Сніданок",
  lunch: "Обід",
  dinner: "Вечеря",
  snack: "Перекус",
};
export type Meal = keyof typeof meals;
export interface MenuSpace {
  id: string;
  name: string;
  is_owner: boolean;
  timezone: string;
  meals: Meal[];
  archived: boolean;
  today: string;
}
export interface MenuEntry {
  id: number;
  date: string;
  meal: Meal;
  title: string;
  description: string;
  has_photo: boolean;
  updated_at: string;
}
export interface MenuFeedback {
  id: number;
  week: string;
  date: string | null;
  meal: Meal | "";
  kind: "proposal" | "complaint";
  text: string;
  description: string;
  has_photo: boolean;
  status: string;
  response: string;
  author: string;
  is_mine: boolean;
  updated_at: string;
  snapshot: Partial<MenuEntry>;
  dish_changed: boolean;
  entry_id: number | null;
}
export interface MenuDetail extends MenuSpace {
  week: string;
  week_meals: Meal[];
  published_at: string | null;
  entries: MenuEntry[];
  feedback: MenuFeedback[];
  members: { id: number; name: string; owner: boolean }[];
  invites: {
    id: string;
    email: string;
    expires_at: string;
    revoked: boolean;
  }[];
}
export interface DishInput {
  date: string;
  meal: Meal;
  title: string;
  description: string;
  photo?: string;
  copy_id?: number;
  version?: string;
  confirm?: boolean;
}
export interface FeedbackInput {
  kind?: "proposal" | "complaint";
  text?: string;
  description?: string;
  photo?: string;
  date?: string | null;
  meal?: Meal | "";
  entry_id?: number;
  status?: string;
  response?: string;
  replace_id?: number;
  version?: string;
  confirm?: boolean;
}
const base = (id: string) => `/menus/${encodeURIComponent(id)}/`;
export const feedbackStatus: Record<string, string> = {
  pending: "На розгляді",
  approved: "Додано в меню",
  rejected: "Відхилено",
  resolved: "Опрацьовано",
  withdrawn: "Відкликано",
  member_left: "Учасник більше не в групі",
  expired: "Не розглянуто — тиждень завершився",
};
export const menuApi = {
  list: () => apiFetch<{ results: MenuSpace[] }>("/menus/"),
  create: (name: string, options: Partial<MenuSpace> = {}) =>
    apiFetch<MenuSpace>("/menus/", {
      method: "POST",
      body: { name, ...options },
    }),
  get: (id: string, week = "") =>
    apiFetch<MenuDetail>(base(id) + (week ? `?week=${week}` : "")),
  settings: (id: string, body: Partial<MenuSpace>) =>
    apiFetch<MenuSpace>(base(id), { method: "PATCH", body }),
  save: (id: string, body: DishInput, entry?: number) =>
    apiFetch<MenuEntry>(base(id) + `entries/${entry ? entry + "/" : ""}`, {
      method: entry ? "PATCH" : "POST",
      body,
    }),
  remove: (id: string, entry: MenuEntry, confirm = false) =>
    apiFetch(base(id) + `entries/${entry.id}/`, {
      method: "DELETE",
      body: { confirm, version: entry.updated_at },
    }),
  photo: (id: string, item: number, feedback = false) =>
    apiFetch<{ photo: string }>(
      base(id) + `${feedback ? "feedback" : "entries"}/${item}/`,
    ),
  library: (id: string, q: string) =>
    apiFetch<{ results: MenuEntry[] }>(
      base(id) + `entries/?q=${encodeURIComponent(q)}`,
    ),
  publish: (id: string, week: string, allow_empty = false) =>
    apiFetch(base(id) + "publish/", {
      method: "POST",
      body: { week, allow_empty },
    }),
  feedback: (id: string, body: FeedbackInput) =>
    apiFetch<MenuFeedback>(base(id) + "feedback/", { method: "POST", body }),
  review: (id: string, item: number, body: FeedbackInput) =>
    apiFetch<MenuFeedback>(base(id) + `feedback/${item}/`, {
      method: "PATCH",
      body,
    }),
  leave: (id: string, member: number) =>
    apiFetch(base(id) + `members/${member}/`, { method: "DELETE" }),
  invite: (id: string, email = "") =>
    apiFetch<{
      id?: string;
      url?: string;
      deep_link?: string;
      email_sent?: boolean;
      kind?: string;
      expires_at?: string;
    }>(base(id) + "invites/", { method: "POST", body: { email } }),
  revoke: (id: string, invite: string) =>
    apiFetch(base(id) + `invites/${invite}/`, { method: "DELETE" }),
  preview: (token: string) =>
    apiFetch<{ name: string; email_restricted: boolean }>(
      "/menus/invites/preview/",
      { method: "POST", body: { token }, auth: false },
    ),
  accept: (token: string) =>
    apiFetch<MenuSpace>("/menus/invites/accept/", {
      method: "POST",
      body: { token },
    }),
};
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(day: string, count: number) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + count);
  return localDate(d);
}
export function weekDays(day: string) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(localDate(d), i));
}

export function menuError(error: unknown): string {
  const e = error as { body?: unknown; details?: unknown; message?: string };
  const data = e?.body || e?.details;
  if (data && typeof data === "object") {
    const labels: Record<string, string> = {
      name: "Назва",
      title: "Назва страви",
      text: "Текст",
      date: "Дата",
      meal: "Прийом їжі",
      photo: "Фото",
      response: "Відповідь",
      timezone: "Часовий пояс",
      meals: "Прийоми їжі",
      version: "Збереження",
      confirm: "Підтвердження",
    };
    const messages = Object.entries(data)
      .filter(([, v]) => typeof v === "string" || Array.isArray(v))
      .map(
        ([k, v]) =>
          (labels[k] ? labels[k] + ": " : "") +
          (Array.isArray(v) ? v.join(" ") : String(v)),
      );
    if (messages.length) return messages.join("\n");
  }
  return e?.message || "Не вдалося виконати дію. Спробуйте ще раз.";
}

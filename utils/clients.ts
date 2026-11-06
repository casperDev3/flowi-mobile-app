/**
 * utils/clients.ts — клієнти (CRM-картка) і все, що їх повʼязує з рештою даних.
 *
 * Клієнт — ОСОБИСТА колекція 'clients' (POST /api/sync/user/v2/), id = local_id
 * = `cl-<uuid4>`. Сервер тіла запису не розбирає, тож форма запису тримається
 * тут і на вебі (lib/…) однаково, а невідомі поля зберігаються спредом —
 * клієнт новішої збірки не втрачає того, чого ця не знає.
 *
 * Видалення — звичайний тумбстоун (запис зникає з масиву → saveSynced ставить
 * deleted=true, дані лишаються на сервері для кошика). Архів — окремий стан
 * `status: 'archived'`, а не видалення.
 *
 * Звʼязки (рішення власника, ROADMAP «Клієнти»):
 *  - проєкт → клієнт: `project.clientId` (опційне). Для СПІЛЬНОГО проєкту
 *    сервер тримає звʼязок у Project.client_id і віддає ключ лише власнику;
 *    ВІДʼЄДНАННЯ — це явний `clientId: null` (відсутній ключ = «лишити як є»);
 *  - зустріч / операція / нотатка → клієнт: власне `clientId`. У потоці
 *    ПРОЄКТУ сервер зберігає його лише на transactions/subscriptions/
 *    recurring_incomes, з решти — прибирає, тож для зустрічі й нотатки з
 *    проєктом клієнт ВИВОДИТЬСЯ з проєкту, а не пишеться ({@link derivedClientId}).
 *
 * Чисті функції без сховища — їх читають екрани й тести.
 */
import { uuidV4 } from './uuid';

export const CLIENTS_KEY = 'clients';

/** Межа сервера для clientId (рядок ≤ 64 символів). */
export const CLIENT_ID_MAX = 64;

export type ClientStatus = 'active' | 'potential' | 'archived';

export const CLIENT_STATUSES: readonly ClientStatus[] = ['active', 'potential', 'archived'];

export interface ClientContact {
  id?: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  telegram?: string;
}

export interface ClientRequisites {
  legalName?: string;
  edrpou?: string;
  ipn?: string;
  iban?: string;
  bank?: string;
  legalAddress?: string;
}

export const REQUISITE_FIELDS: readonly (keyof ClientRequisites)[] = [
  'legalName', 'edrpou', 'ipn', 'iban', 'bank', 'legalAddress',
];

export interface Client {
  id: string;
  name: string;
  /** '#RRGGBB' */
  color: string;
  status: ClientStatus;
  contacts: ClientContact[];
  requisites: ClientRequisites;
  website?: string;
  address?: string;
  links: string[];
  tags: string[];
  createdAt: string;
  updatedAt?: string;
}

export function newClientId(): string {
  return `cl-${uuidV4()}`;
}

const str = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const strList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = str(item);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
};

export function isClientStatus(value: unknown): value is ClientStatus {
  return value === 'active' || value === 'potential' || value === 'archived';
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const DEFAULT_CLIENT_COLOR = '#0EA5E9';

function normalizeContact(raw: unknown): ClientContact | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const contact: ClientContact = { ...(src as object), name: str(src.name) ?? '' } as ClientContact;
  for (const key of ['role', 'phone', 'email', 'telegram'] as const) {
    const value = str(src[key]);
    if (value) contact[key] = value;
    else delete contact[key];
  }
  const id = str(src.id);
  if (id) contact.id = id;
  else delete contact.id;
  if (!contact.name && !contact.phone && !contact.email && !contact.telegram && !contact.role) return null;
  return contact;
}

/**
 * Запис зі сховища → клієнт для показу. Не обʼєкт / без id / без назви —
 * null. Невідомі поля лишаються в записі (спред), щоб правка з цієї збірки
 * їх не стерла.
 */
export function normalizeClient(raw: unknown): Client | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const id = str(src.id);
  if (!id) return null;
  const requisitesSrc = src.requisites && typeof src.requisites === 'object' && !Array.isArray(src.requisites)
    ? (src.requisites as Record<string, unknown>)
    : {};
  const requisites: ClientRequisites = {};
  for (const key of REQUISITE_FIELDS) {
    const value = str(requisitesSrc[key]);
    if (value) requisites[key] = value;
  }
  const contacts = Array.isArray(src.contacts)
    ? src.contacts.map(normalizeContact).filter((c): c is ClientContact => !!c)
    : [];
  const color = typeof src.color === 'string' && HEX_COLOR.test(src.color) ? src.color : DEFAULT_CLIENT_COLOR;
  return {
    ...(src as object),
    id,
    name: str(src.name) ?? '',
    color,
    status: isClientStatus(src.status) ? src.status : 'active',
    contacts,
    requisites,
    website: str(src.website),
    address: str(src.address),
    links: strList(src.links),
    tags: strList(src.tags),
    createdAt: str(src.createdAt) ?? str(src.updatedAt) ?? new Date(0).toISOString(),
    updatedAt: str(src.updatedAt),
  } as Client;
}

export function normalizeClients(raw: unknown): Client[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, Client>();
  for (const item of raw) {
    const client = normalizeClient(item);
    if (client) byId.set(client.id, client);
  }
  return [...byId.values()];
}

/** Дані форми клієнта (усе — рядки, як у полях вводу). */
export interface ClientDraft {
  name: string;
  color: string;
  status: ClientStatus;
  contacts: ClientContact[];
  requisites: ClientRequisites;
  website: string;
  address: string;
  /** По одному на рядок. */
  links: string;
  /** Через кому. */
  tags: string;
}

export function emptyClientDraft(color: string = DEFAULT_CLIENT_COLOR): ClientDraft {
  return {
    name: '', color, status: 'active', contacts: [], requisites: {},
    website: '', address: '', links: '', tags: '',
  };
}

export function clientToDraft(client: Client): ClientDraft {
  return {
    name: client.name,
    color: client.color,
    status: client.status,
    contacts: client.contacts.map(c => ({ ...c })),
    requisites: { ...client.requisites },
    website: client.website ?? '',
    address: client.address ?? '',
    links: client.links.join('\n'),
    tags: client.tags.join(', '),
  };
}

export function parseTagsText(text: string): string[] {
  return strList(text.split(/[,\n]/));
}

export function parseLinksText(text: string): string[] {
  return strList(text.split(/\n/));
}

/**
 * Форма → запис. `base` — наявний запис (його невідомі поля лишаються),
 * null — новий клієнт. Порожні необовʼязкові поля не пишуться зовсім.
 */
export function draftToClient(
  draft: ClientDraft,
  base: Record<string, unknown> | null,
  now: string = new Date().toISOString(),
  id: string = newClientId(),
): Client {
  const requisites: ClientRequisites = {};
  for (const key of REQUISITE_FIELDS) {
    const value = str(draft.requisites[key]);
    if (value) requisites[key] = value;
  }
  const contacts = draft.contacts
    .map(normalizeContact)
    .filter((c): c is ClientContact => !!c)
    .map(c => (c.id ? c : { ...c, id: `cc-${uuidV4()}` }));
  const record: Record<string, unknown> = {
    ...(base ?? {}),
    id: typeof base?.id === 'string' ? base.id : id,
    name: draft.name.trim(),
    color: HEX_COLOR.test(draft.color) ? draft.color : DEFAULT_CLIENT_COLOR,
    status: draft.status,
    contacts,
    requisites,
    links: parseLinksText(draft.links),
    tags: parseTagsText(draft.tags),
    createdAt: typeof base?.createdAt === 'string' ? base.createdAt : now,
    updatedAt: now,
  };
  const website = str(draft.website);
  const address = str(draft.address);
  if (website) record.website = website; else delete record.website;
  if (address) record.address = address; else delete record.address;
  return record as unknown as Client;
}

export function setClientStatus<T extends Record<string, unknown>>(client: T, status: ClientStatus): T {
  return { ...client, status };
}

const STATUS_ORDER: Record<ClientStatus, number> = { active: 0, potential: 1, archived: 2 };

/** Активні → потенційні → архів, у межах — за назвою. */
export function sortClients<T extends Pick<Client, 'name' | 'status'>>(list: readonly T[], locale = 'uk'): T[] {
  return [...list].sort((a, b) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, locale));
}

export type ClientStatusFilter = 'all' | ClientStatus;

/** Пошук по назві, тегах, контактах і реквізитах; 'all' ховає лише архів. */
export function filterClients<T extends Client>(
  list: readonly T[],
  query: string,
  status: ClientStatusFilter,
): T[] {
  const q = query.trim().toLowerCase();
  return list.filter(client => {
    if (status === 'all' ? client.status === 'archived' : client.status !== status) return false;
    if (!q) return true;
    const hay = [
      client.name, client.website, client.address, ...client.tags,
      ...client.contacts.flatMap(c => [c.name, c.role, c.phone, c.email, c.telegram]),
      ...REQUISITE_FIELDS.map(key => client.requisites[key]),
    ];
    return hay.some(value => typeof value === 'string' && value.toLowerCase().includes(q));
  });
}

// ─── Посилання для дотику ─────────────────────────────────────────────────────

/** `tel:` — лише цифри й провідний «+». Порожньо → null. */
export function phoneUrl(phone: string | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

export function emailUrl(email: string | undefined): string | null {
  const value = email?.trim();
  if (!value || !value.includes('@')) return null;
  return `mailto:${value}`;
}

/**
 * Telegram: `@user`, `user`, `t.me/user`, `https://t.me/user` → https://t.me/user;
 * номер телефону (`+380…`) → https://t.me/+380… .
 */
export function telegramUrl(handle: string | undefined): string | null {
  let value = handle?.trim();
  if (!value) return null;
  value = value.replace(/^https?:\/\//i, '').replace(/^(www\.)?(t\.me|telegram\.me)\//i, '');
  if (value.startsWith('@')) value = value.slice(1);
  if (/^\+?[\d\s()-]{7,}$/.test(value)) {
    const digits = value.replace(/[^\d]/g, '');
    return digits ? `https://t.me/+${digits}` : null;
  }
  const user = value.split(/[/?#\s]/)[0];
  return /^[A-Za-z0-9_]{3,}$/.test(user) ? `https://t.me/${user}` : null;
}

/** Сайт без схеми отримує https://. */
export function websiteUrl(site: string | undefined): string | null {
  const value = site?.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  if (/^(mailto|tel):/i.test(value)) return value;
  return `https://${value}`;
}

export function hasRequisites(requisites: ClientRequisites | undefined): boolean {
  return !!requisites && REQUISITE_FIELDS.some(key => !!str(requisites[key]));
}

/**
 * Текст для «Скопіювати все»: «Підпис: значення» по рядку на кожне
 * заповнене поле, у порядку {@link REQUISITE_FIELDS}.
 */
export function requisitesText(
  requisites: ClientRequisites,
  labels: Record<keyof ClientRequisites, string>,
): string {
  return REQUISITE_FIELDS
    .map(key => {
      const value = str(requisites[key]);
      return value ? `${labels[key]}: ${value}` : null;
    })
    .filter((line): line is string => !!line)
    .join('\n');
}

// ─── clientId на інших записах ────────────────────────────────────────────────

/** Значення, придатне для clientId: непорожній рядок ≤ 64 символи. */
export function sanitizeClientId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= CLIENT_ID_MAX ? trimmed : undefined;
}

/**
 * Записати (або прибрати) clientId на ОСОБИСТОМУ записі — зустрічі, операції,
 * нотатці. Порожнє значення ПРИБИРАЄ ключ: для особистого потоку сервер тіла
 * не розбирає, і відсутній ключ — це просто «без клієнта».
 *
 * Для запису проєкту (`projects`) не годиться — там відʼєднання = явний null,
 * див. {@link withProjectClient}.
 */
export function withClientId<T extends object>(record: T, clientId: string | null | undefined): T {
  const next = sanitizeClientId(clientId);
  const current = (record as { clientId?: unknown }).clientId;
  if (next) return current === next ? record : { ...record, clientId: next };
  if (!('clientId' in record)) return record;
  const { clientId: _removed, ...rest } = record as T & { clientId?: unknown };
  void _removed;
  return rest as T;
}

/**
 * Привʼязати проєкт до клієнта. Відʼєднання — ЯВНИЙ `null`: сервер трактує
 * відсутній ключ як «лишити поточний звʼязок», тож видалити ключ означало б
 * не відʼєднати нічого.
 */
export function withProjectClient<T extends object>(project: T, clientId: string | null | undefined): T {
  const next = sanitizeClientId(clientId) ?? null;
  const current = (project as { clientId?: unknown }).clientId;
  if ((current ?? null) === next && 'clientId' in project) return project;
  return { ...project, clientId: next };
}

interface ProjectRef { id: string; clientId?: string | null }

/** Клієнт проєкту, або undefined — проєкт без клієнта чи невідомий. */
export function projectClientId(
  projects: readonly ProjectRef[],
  projectId: string | null | undefined,
): string | undefined {
  if (!projectId) return undefined;
  return sanitizeClientId(projects.find(p => p.id === projectId)?.clientId);
}

/**
 * Клієнт зустрічі чи нотатки: з проєкту, якщо проєкт є (у потоці проєкту
 * власного clientId сервер не зберігає), інакше — власний.
 */
export function derivedClientId(
  record: { projectId?: string | null; clientId?: unknown },
  projects: readonly ProjectRef[],
): string | undefined {
  if (record.projectId) return projectClientId(projects, record.projectId);
  return sanitizeClientId(record.clientId);
}

/** Операції: власний clientId, а без нього — клієнт проєкту. */
export function transactionClientId(
  tx: { projectId?: string | null; clientId?: unknown },
  projects: readonly ProjectRef[],
): string | undefined {
  return sanitizeClientId(tx.clientId) ?? projectClientId(projects, tx.projectId);
}

// ─── Картка клієнта: що йому належить ─────────────────────────────────────────

export function clientProjectIds(projects: readonly ProjectRef[], clientId: string): Set<string> {
  return new Set(projects.filter(p => p.clientId === clientId).map(p => p.id));
}

const inProjects = (projectId: unknown, ids: ReadonlySet<string>) =>
  typeof projectId === 'string' && ids.has(projectId);

/**
 * Зустрічі: clientId == клієнт АБО зустріч у проєкті клієнта. Лише оригінали;
 * зустрічі в кошику (deletedAt / скасовані в Google) не показуються.
 */
export function clientMeetings<T extends { projectId?: string; clientId?: unknown; _origId?: string; deletedAt?: unknown; integrationCancelled?: unknown }>(
  meetings: readonly T[],
  clientId: string,
  projectIds: ReadonlySet<string>,
): T[] {
  return meetings.filter(m => !m._origId && !m.deletedAt && m.integrationCancelled !== true
    && (m.clientId === clientId || inProjects(m.projectId, projectIds)));
}

/** Операції: clientId == клієнт АБО операція в проєкті клієнта. */
export function clientTransactions<T extends { projectId?: string; clientId?: unknown }>(
  txs: readonly T[],
  clientId: string,
  projectIds: ReadonlySet<string>,
): T[] {
  return txs.filter(tx => tx.clientId === clientId || inProjects(tx.projectId, projectIds));
}

export interface ClientCurrencyTotals { income: number; expense: number }

/** Доходи й витрати по валютах; перекази не рахуються (гроші не прийшли й не пішли). */
export function clientFinanceTotals<T extends { type: string; amount: number; currency?: string }>(
  txs: readonly T[],
  currencyOf: (tx: T) => string = tx => tx.currency || 'UAH',
): Record<string, ClientCurrencyTotals> {
  const totals: Record<string, ClientCurrencyTotals> = {};
  for (const tx of txs) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount)) continue;
    const code = currencyOf(tx);
    const bucket = totals[code] ?? (totals[code] = { income: 0, expense: 0 });
    bucket[tx.type] += amount;
  }
  return totals;
}

/** Відкриті завдання з проєктів клієнта. */
export function clientOpenTasks<T extends { projectId?: string; status?: string; integrationArchived?: boolean }>(
  tasks: readonly T[],
  projectIds: ReadonlySet<string>,
): T[] {
  return tasks.filter(t => t.status !== 'done' && !t.integrationArchived && inProjects(t.projectId, projectIds));
}

/** Нотатки: з проєктів клієнта + власні нотатки клієнта (clientId без projectId). */
export function clientNotes<T extends { projectId?: string; clientId?: unknown; archived?: boolean }>(
  notes: readonly T[],
  clientId: string,
  projectIds: ReadonlySet<string>,
): T[] {
  return notes.filter(n => !n.archived && (
    inProjects(n.projectId, projectIds) || (!n.projectId && n.clientId === clientId)
  ));
}

/** Нова нотатка клієнта — особиста (без projectId) з clientId. */
export function newClientNote(
  clientId: string,
  title: string,
  body: string,
  now: string = new Date().toISOString(),
  id: string = uuidV4(),
): { id: string; title: string; body: string; createdAt: string; updatedAt: string; clientId: string } {
  return { id, title: title.trim(), body, createdAt: now, updatedAt: now, clientId };
}

/** Клієнти для вибору: живі + поточний, навіть якщо його заархівували. */
export function pickableClients<T extends Pick<Client, 'id' | 'status'>>(
  clients: readonly T[],
  currentId: string | null | undefined,
): T[] {
  return clients.filter(c => c.status !== 'archived' || c.id === currentId);
}

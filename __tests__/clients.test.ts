import {
  clientFinanceTotals,
  clientMeetings,
  clientNotes,
  clientOpenTasks,
  clientProjectIds,
  clientToDraft,
  clientTransactions,
  derivedClientId,
  draftToClient,
  emailUrl,
  emptyClientDraft,
  filterClients,
  newClientId,
  newClientNote,
  normalizeClient,
  normalizeClients,
  phoneUrl,
  pickableClients,
  requisitesText,
  sanitizeClientId,
  sortClients,
  telegramUrl,
  transactionClientId,
  websiteUrl,
  withClientId,
  withProjectClient,
  type Client,
} from '@/utils/clients';
import { SYNC_ARRAY_KEYS } from '@/store/sync-contract';
import { BACKUP_KEYS } from '@/store/backup-keys';
import { normalizeNote } from '@/utils/notes';

const NOW = '2026-11-06T10:00:00.000Z';

function client(partial: Partial<Client> & { id: string }): Client {
  return normalizeClient({ name: partial.id, ...partial })!;
}

describe('колекція clients у контракті', () => {
  it('синхронізується як особистий масив і потрапляє в бекапи', () => {
    expect(SYNC_ARRAY_KEYS).toContain('clients');
    expect(BACKUP_KEYS).toContain('clients');
  });
});

describe('id і нормалізація', () => {
  it('id нового клієнта — cl-<uuid4>', () => {
    expect(newClientId()).toMatch(/^cl-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('заповнює дефолти й зберігає невідомі поля', () => {
    const c = normalizeClient({ id: 'cl-1', name: ' ТОВ Ромашка ', futureField: 42, color: 'red', status: 'weird' })!;
    expect(c.name).toBe('ТОВ Ромашка');
    expect(c.status).toBe('active');
    expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(c.contacts).toEqual([]);
    expect(c.requisites).toEqual({});
    expect((c as unknown as Record<string, unknown>).futureField).toBe(42);
  });

  it('відкидає записи без id і зводить дублікати', () => {
    expect(normalizeClient({ name: 'x' })).toBeNull();
    expect(normalizeClient(null)).toBeNull();
    expect(normalizeClients([{ id: 'a', name: '1' }, { id: 'a', name: '2' }, 'junk']).map(c => c.name)).toEqual(['2']);
  });
});

describe('форма ↔ запис', () => {
  it('draftToClient прибирає порожнє, ставить id контактам і тримає поля бази', () => {
    const draft = {
      ...emptyClientDraft('#10B981'),
      name: '  Acme ',
      status: 'potential' as const,
      contacts: [{ name: 'Іван', phone: ' +380 67 123 45 67 ' }, { name: '' }],
      requisites: { edrpou: ' 12345678 ', iban: '' },
      website: ' acme.ua ',
      links: 'https://a.ua\n\nhttps://b.ua\nhttps://a.ua',
      tags: 'ІТ, b2b, ,ІТ',
    };
    const c = draftToClient(draft, { id: 'cl-old', createdAt: '2026-01-01', extra: true }, NOW);
    expect(c.id).toBe('cl-old');
    expect(c.name).toBe('Acme');
    expect(c.createdAt).toBe('2026-01-01');
    expect(c.updatedAt).toBe(NOW);
    expect(c.contacts).toHaveLength(1);
    expect(c.contacts[0].phone).toBe('+380 67 123 45 67');
    expect(c.contacts[0].id).toMatch(/^cc-/);
    expect(c.requisites).toEqual({ edrpou: '12345678' });
    expect(c.links).toEqual(['https://a.ua', 'https://b.ua']);
    expect(c.tags).toEqual(['ІТ', 'b2b']);
    expect(c.website).toBe('acme.ua');
    expect('address' in c).toBe(false);
    expect((c as unknown as Record<string, unknown>).extra).toBe(true);
  });

  it('новий клієнт отримує свіжий cl-id', () => {
    const c = draftToClient({ ...emptyClientDraft(), name: 'X' }, null, NOW);
    expect(c.id).toMatch(/^cl-/);
    expect(c.createdAt).toBe(NOW);
  });

  it('clientToDraft — зворотне перетворення', () => {
    const c = client({ id: 'cl-1', links: ['a', 'b'], tags: ['x', 'y'] });
    const d = clientToDraft(c);
    expect(d.links).toBe('a\nb');
    expect(d.tags).toBe('x, y');
  });
});

describe('список', () => {
  const list = [
    client({ id: 'b', name: 'Бета', status: 'potential' }),
    client({ id: 'a', name: 'Альфа', tags: ['vip'] }),
    client({ id: 'z', name: 'Архівний', status: 'archived', contacts: [{ name: 'Петро', email: 'p@x.ua' }] }),
  ];

  it('сортування: активні → потенційні → архів', () => {
    expect(sortClients(list).map(c => c.id)).toEqual(['a', 'b', 'z']);
  });

  it('«Усі» ховає архів; пошук іде і по контактах', () => {
    expect(filterClients(list, '', 'all').map(c => c.id).sort()).toEqual(['a', 'b']);
    expect(filterClients(list, 'vip', 'all').map(c => c.id)).toEqual(['a']);
    expect(filterClients(list, 'p@x', 'archived').map(c => c.id)).toEqual(['z']);
    expect(filterClients(list, 'p@x', 'all')).toEqual([]);
  });

  it('pickableClients лишає поточного навіть в архіві', () => {
    expect(pickableClients(list, null).map(c => c.id).sort()).toEqual(['a', 'b']);
    expect(pickableClients(list, 'z').map(c => c.id).sort()).toEqual(['a', 'b', 'z']);
  });
});

describe('посилання контактів', () => {
  it('телефон → tel: лише з цифрами', () => {
    expect(phoneUrl('+380 (67) 123-45-67')).toBe('tel:+380671234567');
    expect(phoneUrl('067 123')).toBe('tel:067123');
    expect(phoneUrl('—')).toBeNull();
  });

  it('email → mailto:', () => {
    expect(emailUrl(' a@b.ua ')).toBe('mailto:a@b.ua');
    expect(emailUrl('nope')).toBeNull();
  });

  it('telegram: нік, @нік, t.me-посилання, номер', () => {
    expect(telegramUrl('@ivan_k')).toBe('https://t.me/ivan_k');
    expect(telegramUrl('ivan_k')).toBe('https://t.me/ivan_k');
    expect(telegramUrl('https://t.me/ivan_k')).toBe('https://t.me/ivan_k');
    expect(telegramUrl('t.me/ivan_k?x=1')).toBe('https://t.me/ivan_k');
    expect(telegramUrl('+380 67 123 45 67')).toBe('https://t.me/+380671234567');
    expect(telegramUrl('@')).toBeNull();
  });

  it('сайт без схеми отримує https://', () => {
    expect(websiteUrl('acme.ua')).toBe('https://acme.ua');
    expect(websiteUrl('http://acme.ua')).toBe('http://acme.ua');
    expect(websiteUrl('')).toBeNull();
  });
});

describe('реквізити', () => {
  it('«Скопіювати все» — лише заповнені поля в сталому порядку', () => {
    const labels = { legalName: 'Назва', edrpou: 'ЄДРПОУ', ipn: 'ІПН', iban: 'IBAN', bank: 'Банк', legalAddress: 'Адреса' };
    expect(requisitesText({ iban: 'UA12', legalName: 'ТОВ А', bank: ' ' }, labels)).toBe('Назва: ТОВ А\nIBAN: UA12');
  });
});

describe('clientId на інших записах', () => {
  it('sanitizeClientId: рядок до 64 символів', () => {
    expect(sanitizeClientId(' cl-1 ')).toBe('cl-1');
    expect(sanitizeClientId('x'.repeat(65))).toBeUndefined();
    expect(sanitizeClientId(5)).toBeUndefined();
    expect(sanitizeClientId('')).toBeUndefined();
  });

  it('withClientId ставить або ПРИБИРАЄ ключ', () => {
    expect(withClientId({ id: 'm' }, 'cl-1')).toEqual({ id: 'm', clientId: 'cl-1' });
    expect(withClientId({ id: 'm', clientId: 'cl-1' }, undefined)).toEqual({ id: 'm' });
    const same = { id: 'm', clientId: 'cl-1' };
    expect(withClientId(same, 'cl-1')).toBe(same);
  });

  it('withProjectClient відʼєднує ЯВНИМ null (відсутній ключ = «лишити як є»)', () => {
    expect(withProjectClient({ id: 'p', clientId: 'cl-1' }, null)).toEqual({ id: 'p', clientId: null });
    expect(withProjectClient({ id: 'p' }, '')).toEqual({ id: 'p', clientId: null });
    expect(withProjectClient({ id: 'p' }, 'cl-2')).toEqual({ id: 'p', clientId: 'cl-2' });
  });

  it('зустріч проєкту бере клієнта з проєкту, без проєкту — власного', () => {
    const projects = [{ id: 'p1', clientId: 'cl-1' }, { id: 'p2', clientId: null }];
    expect(derivedClientId({ projectId: 'p1', clientId: 'cl-x' }, projects)).toBe('cl-1');
    expect(derivedClientId({ projectId: 'p2', clientId: 'cl-x' }, projects)).toBeUndefined();
    expect(derivedClientId({ clientId: 'cl-x' }, projects)).toBe('cl-x');
  });

  it('операція: власний clientId перемагає клієнта проєкту', () => {
    const projects = [{ id: 'p1', clientId: 'cl-1' }];
    expect(transactionClientId({ projectId: 'p1', clientId: 'cl-2' }, projects)).toBe('cl-2');
    expect(transactionClientId({ projectId: 'p1' }, projects)).toBe('cl-1');
  });

  it('нотатка зберігає clientId при нормалізації', () => {
    expect(normalizeNote({ id: 'n', clientId: 'cl-1', title: 't' })?.clientId).toBe('cl-1');
  });
});

describe('картка клієнта', () => {
  const projects = [
    { id: 'p1', clientId: 'cl-1' },
    { id: 'p2', clientId: 'cl-2' },
    { id: 'p3' },
  ];
  const ids = clientProjectIds(projects, 'cl-1');

  it('проєкти клієнта', () => {
    expect([...ids]).toEqual(['p1']);
  });

  it('зустрічі: власні або з проєктів клієнта, без розгорнутих екземплярів', () => {
    const meetings = [
      { id: 'm1', clientId: 'cl-1' },
      { id: 'm2', projectId: 'p1' },
      { id: 'm3', projectId: 'p2' },
      { id: 'm4' },
      { id: 'm2_2026-11-07', projectId: 'p1', _origId: 'm2' },
    ];
    expect(clientMeetings(meetings, 'cl-1', ids).map(m => m.id)).toEqual(['m1', 'm2']);
  });

  it('фінанси: операції клієнта і його проєктів, підсумки по валютах без переказів', () => {
    const txs = [
      { id: 't1', type: 'income', amount: 1000, clientId: 'cl-1', currency: 'UAH' },
      { id: 't2', type: 'expense', amount: 200, projectId: 'p1', currency: 'UAH' },
      { id: 't3', type: 'income', amount: 50, projectId: 'p1', currency: 'USD' },
      { id: 't4', type: 'transfer', amount: 999, clientId: 'cl-1', currency: 'UAH' },
      { id: 't5', type: 'income', amount: 7, projectId: 'p2', currency: 'UAH' },
    ];
    const mine = clientTransactions(txs, 'cl-1', ids);
    expect(mine.map(t => t.id)).toEqual(['t1', 't2', 't3', 't4']);
    expect(clientFinanceTotals(mine)).toEqual({
      UAH: { income: 1000, expense: 200 },
      USD: { income: 50, expense: 0 },
    });
  });

  it('відкриті завдання лише з проєктів клієнта', () => {
    const tasks = [
      { id: 'a', projectId: 'p1', status: 'active' },
      { id: 'b', projectId: 'p1', status: 'done' },
      { id: 'c', projectId: 'p2', status: 'active' },
      { id: 'd', status: 'active' },
    ];
    expect(clientOpenTasks(tasks, ids).map(t => t.id)).toEqual(['a']);
  });

  it('нотатки: з проєктів + власні без projectId; архів не показується', () => {
    const notes = [
      { id: 'n1', projectId: 'p1' },
      { id: 'n2', clientId: 'cl-1' },
      { id: 'n3', clientId: 'cl-1', projectId: 'p3' },
      { id: 'n4', clientId: 'cl-1', archived: true },
      { id: 'n5', clientId: 'cl-2' },
    ];
    expect(clientNotes(notes, 'cl-1', ids).map(n => n.id)).toEqual(['n1', 'n2']);
  });

  it('нова нотатка клієнта — особиста, з clientId і без projectId', () => {
    const note = newClientNote('cl-1', '  Дзвінок ', 'тіло', NOW, 'n-1');
    expect(note).toEqual({ id: 'n-1', title: 'Дзвінок', body: 'тіло', createdAt: NOW, updatedAt: NOW, clientId: 'cl-1' });
    expect('projectId' in note).toBe(false);
  });
});

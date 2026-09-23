/**
 * __tests__/subscriptions-parity-web.test.ts — паритет upcomingPayments з вебом
 * (пункт 9: «Найближчі оплати»).
 *
 * Фікстура `fixtures/subscriptions-parity-web.json` — ПОБАЙТОВА копія
 * flowi-web-app/lib/__fixtures__/subscriptions-parity.json; там той самий
 * `expected` проганяє lib/subscriptions.ts. Зміна формули починається з
 * фікстури на вебі; копія сюди правиться в тому самому заході.
 */
import fs from 'fs';
import path from 'path';

import { upcomingPayments, type Subscription, type UpcomingPayment } from '@/utils/subscriptions';

interface ParityCase {
  name: string;
  today: string;
  withinDays: number | null;
  subscriptions: Subscription[];
  expected: { id: string; daysUntil: number; status: UpcomingPayment['status'] }[];
}

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'subscriptions-parity-web.json');
const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
const fixture = JSON.parse(raw) as { cases: ParityCase[] };

const project = (items: UpcomingPayment[]) =>
  items.map(item => ({ id: item.subscription.id, daysUntil: item.daysUntil, status: item.status }));

describe('upcomingPayments — паритет з вебом', () => {
  test.each(fixture.cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const items = c.withinDays === null
      ? upcomingPayments(c.subscriptions, c.today)
      : upcomingPayments(c.subscriptions, c.today, c.withinDays);
    expect(project(items)).toEqual(c.expected);
  });

  test('фікстура — побайтова копія вебової', () => {
    const web = path.join(__dirname, '..', '..', 'flowi-web-app', 'lib', '__fixtures__', 'subscriptions-parity.json');
    if (!fs.existsSync(web)) return; // репозиторії можуть лежати окремо
    expect(fs.readFileSync(web, 'utf8')).toBe(raw);
  });
});

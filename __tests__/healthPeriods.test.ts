import { HealthEntry } from '@/utils/healthUtils';
import { buildTrend } from '@/utils/healthPeriods';

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MS = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
const daysAgoIso = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

describe('healthPeriods.buildTrend', () => {
  test('тиждень — 7 бакетів, sum', () => {
    const entries: HealthEntry[] = [];
    for (let i = 0; i < 7; i++) entries.push({ id: `s${i}`, type: 'steps', value: 1000, date: daysAgoIso(i) });
    const t = buildTrend(entries, 'steps', 'week', 'sum', WD, MS);
    expect(t.buckets).toHaveLength(7);
    expect(t.total).toBe(7000);
    expect(t.hasData.filter(Boolean)).toHaveLength(7);
  });

  test('кількість бакетів по періодах', () => {
    const e: HealthEntry[] = [];
    expect(buildTrend(e, 'steps', 'day', 'sum', WD, MS).buckets).toHaveLength(1);
    expect(buildTrend(e, 'steps', 'week', 'sum', WD, MS).buckets).toHaveLength(7);
    expect(buildTrend(e, 'steps', 'month', 'sum', WD, MS).buckets).toHaveLength(30);
    expect(buildTrend(e, 'steps', 'quarter', 'sum', WD, MS).buckets).toHaveLength(13);
    expect(buildTrend(e, 'steps', 'year', 'sum', WD, MS).buckets).toHaveLength(12);
  });

  test('avg та delta для last-типу (вага)', () => {
    const entries: HealthEntry[] = [
      { id: 'w0', type: 'weight', value: 79, date: daysAgoIso(0) }, // найсвіжіша
      { id: 'w6', type: 'weight', value: 81, date: daysAgoIso(6) }, // найраніша в тижні
    ];
    const t = buildTrend(entries, 'weight', 'week', 'avg', WD, MS);
    expect(t.first).toBe(81);
    expect(t.latest).toBe(79);
    expect(t.delta).toBe(-2);
  });

  test('порожньо — без даних', () => {
    const t = buildTrend([], 'water', 'week', 'sum', WD, MS);
    expect(t.total).toBe(0);
    expect(t.hasData.some(Boolean)).toBe(false);
  });
});

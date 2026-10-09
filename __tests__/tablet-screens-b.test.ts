/**
 * Рішення 6 (планшет), область «екрани B»: чисті правила компонування
 * здоровʼя, розділів проєкту й рукописних модалок.
 */
import { wideModalStyles } from '@/components/finance/wideModal';
import { HEALTH_TWO_COLUMN_FROM, healthTwoColumn } from '@/components/health/HealthLayout';
import { projectContentStyle } from '@/components/projects/ProjectLayout';
import { Layout } from '@/constants/tokens';

jest.mock('expo-router', () => ({ usePathname: () => '/' }));

describe('healthTwoColumn', () => {
  it('телефон і вузький портрет iPad mini з рейкою — одна колонка', () => {
    expect(healthTwoColumn(390)).toBe(false);
    expect(healthTwoColumn(744 - Layout.railWidth)).toBe(false);
  });

  it('iPad портрет з рейкою і ландшафт — дві колонки', () => {
    expect(healthTwoColumn(820 - Layout.railWidth)).toBe(true);
    expect(healthTwoColumn(HEALTH_TWO_COLUMN_FROM)).toBe(true);
    expect(healthTwoColumn(1180 - 232)).toBe(true);
  });
});

describe('projectContentStyle', () => {
  it('на телефоні — лише поля 20pt, без стелі', () => {
    expect(projectContentStyle('wide', false)).toEqual({ paddingHorizontal: 20 });
    expect(projectContentStyle('reading', false)).toEqual({ paddingHorizontal: 20 });
  });

  it('на планшеті — центрована колонка з потрібною стелею', () => {
    expect(projectContentStyle('wide', true)).toMatchObject({ maxWidth: Layout.wideMaxWidth, alignSelf: 'center' });
    expect(projectContentStyle('reading', true)).toMatchObject({ maxWidth: Layout.readingMaxWidth, alignSelf: 'center' });
  });
});

describe('wideModalStyles (рукописні модалки здоровʼя/проєктів)', () => {
  it('планшет: діалог по центру, не ширший за Layout.dialogMaxWidth', () => {
    const wm = wideModalStyles(true);
    expect(wm.overlay).toMatchObject({ justifyContent: 'center' });
    expect(wm.column).toMatchObject({ maxWidth: Layout.dialogMaxWidth });
  });

  it('телефон: оверлей не змінюється (лист знизу)', () => {
    expect(wideModalStyles(false).overlay).toEqual({});
  });
});

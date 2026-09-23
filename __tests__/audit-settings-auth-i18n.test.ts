/**
 * __tests__/audit-settings-auth-i18n.test.ts — знахідки зони «мови і
 * нотифікації», що живуть у розмітці екранів.
 *
 * Перевіряється джерело, а не рендер: усе це — одно-рядкові регреси, які
 * дешевше стерегти текстом файлу, ніж піднімати цілий екран з десятком
 * контекстів. Рендер-перевірка цих екранів — окремий етап на пристрої.
 *
 *  - NAT-15: рядок «Режим роботи» показував «Онлайн», а підпис під ним —
 *    «Дані лише на пристрої… онлайн-функції вимкнено»;
 *  - I18N-09: підпис різався за КІЛЬКІСТЮ СИМВОЛІВ (`slice(0,18)`) — посеред
 *    слова в обох мовах і незалежно від ширини екрана та розміру шрифту;
 *  - I18N-06: `accessibilityLabel` українським літералом в англійському
 *    інтерфейсі (WCAG 3.1.2);
 *  - ERR-03: гілка 429 у всіх чотирьох екранах, що ходять відром `auth`;
 *  - A11Y-01/03/04: імена й ролі там, де їх бракувало в моїх файлах.
 */

import fs from 'fs';
import path from 'path';

import { allTranslations } from '@/store/translations';

const ROOT = path.join(__dirname, '..');
const CYR = /[Ѐ-ӿ]/;

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SETTINGS = 'app/(tabs)/settings.tsx';
/** Файли зони — усі мають бути чисті на кириличні accessibilityLabel. */
const ZONE_SCREENS = [
  SETTINGS,
  'app/notifications.tsx',
  'app/account.tsx',
  'app/workspace.tsx',
  'app/login.tsx',
  'app/register.tsx',
  'app/register-pending.tsx',
  'app/forgot-password.tsx',
  'app/welcome.tsx',
];

describe('NAT-15: підпис режиму роботи мусить відповідати значенню', () => {
  it('екран обирає підпис за станом, а не малює офлайновий безумовно', () => {
    const src = read(SETTINGS);
    expect(src).toMatch(/\{online \? tr\.onlineDesc : tr\.offlineDesc\}/);
    expect(src).not.toMatch(/>\s*\{tr\.offlineDesc\}\s*</);
  });

  it('ключ onlineDesc є в обох мовах і не дублює офлайновий', () => {
    for (const lang of ['uk', 'en'] as const) {
      const tr = allTranslations[lang];
      expect(typeof tr.onlineDesc).toBe('string');
      expect(tr.onlineDesc.length).toBeGreaterThan(0);
      expect(tr.onlineDesc).not.toBe(tr.offlineDesc);
    }
    // Англійський не мусить містити кирилиці — саме цього ключа раніше не було.
    expect(CYR.test(allTranslations.en.onlineDesc)).toBe(false);
  });
});

describe('I18N-09: різати має ширина, а не лічильник символів', () => {
  it('slice по підпису зник', () => {
    const src = read(SETTINGS);
    expect(src).not.toMatch(/syncGuestHint\.slice/);
    expect(src).toMatch(/return tr\.syncGuestHint;/);
  });

  it('значення рядка обрізає RN: numberOfLines + ellipsizeMode', () => {
    const src = read(SETTINGS);
    const row = src.slice(src.indexOf('const SettingRow'));
    expect(row).toMatch(/numberOfLines=\{1\}/);
    expect(row).toMatch(/ellipsizeMode="tail"/);
    // Без flexShrink довге значення розпирало б рядок замість обрізатись.
    expect(row).toMatch(/flexShrink: 1/);
  });

  it('обидві мови справді довші за колишні 18 символів — обрізання не вигадане', () => {
    expect(allTranslations.uk.syncGuestHint.length).toBeGreaterThan(18);
    expect(allTranslations.en.syncGuestHint.length).toBeGreaterThan(18);
  });
});

describe('I18N-03: дати не форматуються жорстко в uk-UA', () => {
  // Список локальних нагадувань переїхав з екрана в компонент вкладки
  // «Нагадування» центру сповіщень — перевіряється там, де тепер живе дата.
  it.each(['components/notifications/ScheduledReminders.tsx', SETTINGS])('%s — локаль залежить від мови', (file) => {
    const src = read(file);
    const hard = src.match(/toLocale\w*\('uk-UA'/g) ?? [];
    expect(hard).toEqual([]);
    expect(src).toMatch(/lang === 'uk' \? 'uk-UA' : 'en-US'/);
  });
});

describe('I18N-06: accessibilityLabel не пишеться літералом', () => {
  it.each(ZONE_SCREENS)('%s — жодного кириличного accessibilityLabel', (file) => {
    const src = read(file);
    const labels = src.match(/accessibilityLabel=(?:"[^"]*"|'[^']*'|\{[^}]*\})/g) ?? [];
    const cyrillic = labels.filter(l => CYR.test(l));
    expect(cyrillic).toEqual([]);
  });

  it('ключі «показати/сховати пароль» є в обох мовах', () => {
    for (const lang of ['uk', 'en'] as const) {
      expect(allTranslations[lang].authShowPassword.length).toBeGreaterThan(0);
      expect(allTranslations[lang].authHidePassword.length).toBeGreaterThan(0);
    }
    expect(CYR.test(allTranslations.en.authShowPassword)).toBe(false);
  });
});

describe('ERR-03: 429 розрізняється в усіх чотирьох екранах відра `auth`', () => {
  it.each([
    'app/login.tsx',
    'app/register.tsx',
    'app/forgot-password.tsx',
    'app/account.tsx',
  ])('%s — має гілку 429 і не падає в «невірний пароль»', (file) => {
    const src = read(file);
    expect(src).toMatch(/status === 429/);
    expect(src).toMatch(/throttleMessage\(tr, e\)/);
    expect(src).toMatch(/from '@\/store\/auth-throttle'/);
  });
});

describe('A11Y: імена й ролі, яких бракувало в моїх файлах', () => {
  it('усі чотири «ока» на екрані акаунта мають ім\'я', () => {
    const src = read('app/account.tsx');
    const eyes = src.match(/name=\{show\w* \? 'eye\.slash' : 'eye'\}/g) ?? [];
    expect(eyes.length).toBe(4);
    const labels = src.match(/accessibilityLabel=\{show\w* \? tr\.authHidePassword : tr\.authShowPassword\}/g) ?? [];
    expect(labels.length).toBe(4);
  });

  it('обидва «ока» відновлення пароля мають ім\'я (раніше — єдиний екран без нього)', () => {
    const src = read('app/forgot-password.tsx');
    const labels = src.match(/accessibilityLabel=\{show\w* \? tr\.authHidePassword : tr\.authShowPassword\}/g) ?? [];
    expect(labels.length).toBe(2);
  });

  it('спільний ToggleRow дає перемикачу ім\'я і стан', () => {
    const src = read(SETTINGS);
    const toggle = src.slice(src.indexOf('const ToggleRow'));
    expect(toggle).toMatch(/accessibilityLabel=\{label\}/);
    expect(toggle).toMatch(/accessibilityState=\{\{ checked: value \}\}/);
  });

  it('глобальний тумблер локальних нагадувань теж названий', () => {
    // Тумблер вимикає саме ЛОКАЛЬНІ нагадування (серверні — на екрані
    // налаштувань сповіщень), тож і підпис тепер про них.
    const src = read('components/notifications/ScheduledReminders.tsx');
    expect(src).toMatch(/accessibilityLabel=\{tr\.ncLocalRemindersToggle\}/);
  });

  it('кнопки «назад» у зоні мають роль і локалізоване ім\'я', () => {
    for (const file of ['app/login.tsx', 'app/forgot-password.tsx', 'app/workspace.tsx']) {
      const src = read(file);
      expect(src).toMatch(/accessibilityLabel=\{tr\.back\}/);
    }
  });

  /*
   * «Акаунт» віддав стрілку спільному ScreenHeader: роль і ім'я тепер
   * ставить сам хедер (`back.label` → accessibilityLabel кнопки, див.
   * __tests__/screen-header-back.test.tsx), а екран лише каже, куди йти.
   * Тому тут перевіряємо не розмітку, а що підпис так само зі словника й
   * дійсно дійшов до хедера.
   */
  it('«Акаунт» передає локалізований підпис «назад» у спільний хедер', () => {
    const src = read('app/account.tsx');
    expect(src).toMatch(/<ScreenHeader/);
    expect(src).toMatch(/back=\{\{[\s\S]{0,160}?label: tr\.back/);
  });
});

describe('NAT-01: аркуші Налаштувань не тримають стелю у відсотках', () => {
  it('ні в StyleSheet, ні інлайном', () => {
    const src = read(SETTINGS);
    expect(src).not.toMatch(/maxHeight:\s*['"]\d+%['"]/);
    expect(src).toMatch(/useSheetSurface/);
  });

  it('обгортка аркуша вміє стискатись', () => {
    const src = read(SETTINGS);
    const line = src.match(/^\s*sheetWrapper:.*$/m)?.[0];
    expect(line).toBeDefined();
    expect(line).toMatch(/flexShrink: 1/);
  });

  it('NAT-03: обгортки stopPropagation не склеюють аркуш в один елемент', () => {
    const src = read(SETTINGS);
    const wrappers = src.match(/<Pressable[\s\S]{0,200}?e\.stopPropagation\(\)[\s\S]{0,200}?>/g) ?? [];
    expect(wrappers.length).toBeGreaterThan(0);
    for (const w of wrappers) {
      expect(w).toMatch(/accessible=\{false\}/);
      expect(w).toMatch(/accessibilityViewIsModal/);
    }
  });
});

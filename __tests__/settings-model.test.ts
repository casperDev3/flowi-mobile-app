/**
 * __tests__/settings-model.test.ts — порядок секцій «Налаштувань» (погоджено
 * власником 07.10.2026) і дрібна логіка картки профілю.
 */
import fs from 'fs';
import path from 'path';

import {
  SETTINGS_SECTION_ORDER,
  profileInitials,
  profileTitle,
  settingsColumnCount,
  settingsSectionLayout,
  settingsSectionsFor,
} from '@/components/settings/model';

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app/(tabs)/settings.tsx'), 'utf8');

describe('порядок секцій', () => {
  it('вигляд → дані → підтримка → акаунт', () => {
    expect(SETTINGS_SECTION_ORDER).toEqual(['look', 'data', 'support', 'account']);
  });

  it('без входу секції «Акаунт» немає — вхід/реєстрація у картці профілю', () => {
    expect(settingsSectionsFor(false)).toEqual(['look', 'data', 'support']);
    expect(settingsSectionsFor(true)).toEqual(['look', 'data', 'support', 'account']);
  });

  it('«Акаунт» не в масонрі — окремо після колонок, щоб стояти внизу на планшеті', () => {
    expect(settingsSectionLayout(true)).toEqual({ columns: ['look', 'data', 'support'], tail: ['account'] });
    expect(settingsSectionLayout(false)).toEqual({ columns: ['look', 'data', 'support'], tail: [] });
    const masonry = SRC.indexOf('<MasonryColumns');
    const tail = SRC.indexOf('sectionLayout.tail.map');
    expect(tail).toBeGreaterThan(masonry);
  });

  it('телефон — одна колонка, планшет — дві (масонрі, не flexWrap 48%)', () => {
    expect(settingsColumnCount(false)).toBe(1);
    expect(settingsColumnCount(true)).toBe(2);
    expect(SRC).toMatch(/<MasonryColumns/);
    expect(SRC).not.toMatch(/width:\s*'48%'/);
  });

  it('профіль і інструменти стоять над секціями', () => {
    const profile = SRC.indexOf('<ProfileCard');
    const tools = SRC.indexOf('<ToolTiles');
    const masonry = SRC.indexOf('<MasonryColumns');
    expect(profile).toBeGreaterThan(-1);
    expect(profile).toBeLessThan(tools);
    expect(tools).toBeLessThan(masonry);
  });

  it('реклама — у «Підтримці», а не над усім екраном', () => {
    const support = SRC.indexOf("case 'support':");
    const account = SRC.indexOf("case 'account':");
    const ads = SRC.indexOf('<AdvertisingSettings');
    expect(ads).toBeGreaterThan(support);
    expect(ads).toBeLessThan(account);
  });

  it('«Завантажити все на сервер/з сервера» досяжні — під розкривачем у «Даних»', () => {
    const data = SRC.slice(SRC.indexOf("case 'data':"), SRC.indexOf("case 'support':"));
    expect(data).toMatch(/tr\.syncPushAll/);
    expect(data).toMatch(/tr\.syncPullAll/);
    expect(data.indexOf('tr.dataManagement')).toBeLessThan(data.indexOf('tr.syncPushAll'));
  });

  it('інструменти зберігають гейт модулів', () => {
    expect(SRC).toMatch(/TOOL_ROWS\.filter\(tool => isModuleEnabled\(disabledModules, tool\.module\)\)/);
  });
});

describe('картка профілю', () => {
  it('ініціали з імені, інакше з пошти', () => {
    expect(profileInitials('Ігор Лялюк', 'x@y.z')).toBe('ІЛ');
    expect(profileInitials('  ігор  ', 'x@y.z')).toBe('І');
    expect(profileInitials('', 'mail@x.com')).toBe('M');
    expect(profileInitials(undefined, undefined)).toBe('?');
    expect(profileInitials('😀 Smile', '')).toBe('😀S');
  });

  it('заголовок — ім\'я, без нього пошта', () => {
    expect(profileTitle('Ann', 'a@b.c')).toBe('Ann');
    expect(profileTitle('  ', 'a@b.c')).toBe('a@b.c');
  });
});

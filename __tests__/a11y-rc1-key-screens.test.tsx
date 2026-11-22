/**
 * __tests__/a11y-rc1-key-screens.test.tsx — S3-09, доступність ключових
 * потоків RC1 (вхід, інвайт, задачі/підзадачі, здача результату, фінанси,
 * налаштування). Протокол і журнал — docs/release-rc1/a11y-wcag22.md.
 *
 * 1. Статичний «лінт» по AST ключових файлів (дешевий замінник
 *    eslint-plugin-react-native-a11y, якого в проєкті немає):
 *    · натискний елемент (Pressable/Touchable*) без тексту всередині мусить
 *      мати accessibilityLabel — інакше VoiceOver каже лише «кнопка»;
 *    · TextInput мусить мати accessibilityLabel — placeholder на кшталт
 *      «you@example.com» не є назвою поля (WCAG 1.3.1 / 4.1.2);
 *    · allowFontScaling={false} у ключових екранах заборонено (1.4.4).
 * 2. useAnnounce: помилка форми озвучується один раз (4.1.3), бо
 *    accessibilityRole="alert" у RN сам нічого не говорить.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import { parse } from '@babel/parser';

import { announce, useAnnounce } from '@/hooks/use-announce';

const ROOT = path.resolve(__dirname, '..');

const KEY_FILES = [
  'app/login.tsx',
  'app/invite.tsx',
  'app/(tabs)/index.tsx',
  'app/(tabs)/explore.tsx',
  'app/(tabs)/settings.tsx',
  'components/projects/TeamTaskPanel.tsx',
  'components/projects/TeamResultFiles.tsx',
  'components/tasks/TaskSubtasks.tsx',
  'components/tasks/CalendarGrid.tsx',
  'components/tasks/PriorityFilterChips.tsx',
  'components/finance/SubscriptionForm.tsx',
  'components/shared/FormField.tsx',
];

const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight']);

type Node = { type: string; [k: string]: any };

function elName(n: Node | undefined): string {
  if (!n) return '';
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${elName(n.object)}.${n.property.name}`;
  return '';
}

/** Чи є всередині будь-що, що читач екрана озвучить як назву. */
function hasSpokenContent(children: Node[]): boolean {
  let found = false;
  const walk = (n: Node | null | undefined) => {
    if (!n || found) return;
    if (n.type === 'JSXText') { if (n.value.trim()) found = true; return; }
    if (n.type === 'JSXExpressionContainer') {
      const e = n.expression;
      if (['JSXElement', 'JSXFragment', 'LogicalExpression', 'ConditionalExpression'].includes(e.type)) walk(e);
      else if (e.type !== 'JSXEmptyExpression') found = true; // {sub.title} тощо
      return;
    }
    if (n.type === 'LogicalExpression') { walk(n.right); return; }
    if (n.type === 'ConditionalExpression') { walk(n.consequent); walk(n.alternate); return; }
    if (n.type === 'JSXFragment') { n.children.forEach(walk); return; }
    if (n.type === 'JSXElement') {
      const nm = elName(n.openingElement.name);
      if (/Text$/.test(nm)) { found = true; return; }
      n.children.forEach(walk);
    }
  };
  children.forEach(walk);
  return found;
}

function scan(rel: string) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const problems: string[] = [];
  const visit = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n.type === 'JSXElement') {
      const nm = elName(n.openingElement.name);
      const attrs = n.openingElement.attributes as Node[];
      const spread = attrs.some(a => a.type === 'JSXSpreadAttribute');
      const names = attrs.filter(a => a.type === 'JSXAttribute').map(a => a.name.name as string);
      const at = `${rel}:${n.loc.start.line}`;
      const hidden = names.includes('accessible') && attrs.some(a =>
        a.type === 'JSXAttribute' && a.name.name === 'accessible' &&
        a.value?.expression?.type === 'BooleanLiteral' && a.value.expression.value === false);
      if (!spread && !hidden && PRESSABLES.has(nm) && names.includes('onPress')
        && !names.includes('accessibilityLabel') && !hasSpokenContent(n.children)) {
        problems.push(`${at} ${nm}: icon-only, no accessibilityLabel`);
      }
      if (!spread && nm === 'TextInput' && !names.includes('accessibilityLabel')) {
        problems.push(`${at} TextInput: no accessibilityLabel`);
      }
      if (names.includes('allowFontScaling') && attrs.some(a =>
        a.type === 'JSXAttribute' && a.name.name === 'allowFontScaling' &&
        a.value?.expression?.type === 'BooleanLiteral' && a.value.expression.value === false)) {
        problems.push(`${at} ${nm}: allowFontScaling={false}`);
      }
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc') continue;
      const v = n[k];
      if (v && typeof v === 'object') visit(v);
    }
  };
  visit(ast.program);
  return problems;
}

describe('S3-09 a11y: ключові екрани (статично)', () => {
  it.each(KEY_FILES)('%s — іконки-кнопки й поля мають назви, шрифт масштабується', rel => {
    expect(scan(rel)).toEqual([]);
  });

  it('у ключових екранах фіксована висота не обрізає підпис при великому шрифті', () => {
    const chips = fs.readFileSync(path.join(ROOT, 'components/tasks/PriorityFilterChips.tsx'), 'utf8');
    expect(chips).toMatch(/minHeight: 34/);
    expect(chips).not.toMatch(/\n\s+height: 34,/);
  });

  it('підзадача — чекбокс зі станом і діями замість вкладених кнопок', () => {
    const src = fs.readFileSync(path.join(ROOT, 'components/tasks/TaskSubtasks.tsx'), 'utf8');
    expect(src).toMatch(/accessibilityRole="checkbox"/);
    expect(src).toMatch(/accessibilityState=\{\{ checked: !!sub\.done \}\}/);
    expect(src).toMatch(/name: 'copy'/);
    expect(src).toMatch(/name: 'actions'/);
  });

  it('нові ключі a11y є в обох мовах', () => {
    const { allTranslations: translations } = require('@/store/translations');
    for (const key of ['a11yPrevMonth', 'a11yNextMonth', 'a11yClearDate', 'a11ySubtaskActions', 'a11ySaveSubtask']) {
      expect(typeof translations.uk[key]).toBe('string');
      expect(typeof translations.en[key]).toBe('string');
      expect(translations.uk[key]).not.toEqual(translations.en[key]);
    }
  });
});

describe('S3-09 a11y: useAnnounce (WCAG 4.1.3)', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  function Probe({ msg }: { msg: string }) {
    useAnnounce(msg);
    return null;
  }

  it('озвучує непорожнє повідомлення один раз, повтор — ні, після очищення — знову', () => {
    let r: any;
    act(() => { r = create(<Probe msg="" />); });
    expect(spy).not.toHaveBeenCalled();
    act(() => { r.update(<Probe msg="Невірний пароль" />); });
    act(() => { r.update(<Probe msg="Невірний пароль" />); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith('Невірний пароль');
    act(() => { r.update(<Probe msg="" />); });
    act(() => { r.update(<Probe msg="Невірний пароль" />); });
    expect(spy).toHaveBeenCalledTimes(2);
    act(() => { r.unmount(); });
  });

  it('announce ігнорує порожні й пробільні рядки', () => {
    announce('  ');
    announce(null);
    expect(spy).not.toHaveBeenCalled();
  });
});

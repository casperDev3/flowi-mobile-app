/**
 * __tests__/screen-header.test.tsx — спільний хедер таб-екранів.
 *
 * Два регреси під охороною:
 *  · відступ зверху рахується в JS і справді залежить від інсету (раніше це
 *    робив нативний SafeAreaView, і на першому кадрі відступу не було);
 *  · заголовок стискається, а кнопки — ні. На 320pt від рядка лишається
 *    ~158pt після трьох кнопок, і заголовок із flex:1 без numberOfLines
 *    обрізався посеред слова.
 */

const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

// Провайдера safe-area в тестовому дереві немає — віддаємо метрики iPhone.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => INSETS,
}));

import React from 'react';
import { Text, View } from 'react-native';

import {
  HEADER_BUTTON_HIT_SLOP,
  HeaderButton,
  ScreenHeader,
  TITLE_MAX_FONT_SCALE,
} from '@/components/shared/ScreenHeader';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

function render(node: React.ReactElement) {
  let tree: any;
  act(() => { tree = create(node); });
  return tree;
}

/** Зведений стиль вузла: у RN style буває масивом із вкладеними масивами. */
function flat(style: any): any {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style ?? {};
}

const withActions = (
  <ScreenHeader
    title="Завдання"
    color="#111"
    actions={
      <>
        <HeaderButton onPress={() => {}} accessibilityLabel="Календар">
          <View />
        </HeaderButton>
        <HeaderButton onPress={() => {}} accessibilityLabel="Фільтри">
          <View />
        </HeaderButton>
        <HeaderButton onPress={() => {}} accessibilityLabel="Опції">
          <View />
        </HeaderButton>
      </>
    }
  />
);

describe('ScreenHeader', () => {
  it('верхній відступ = інсет + 14', () => {
    const tree = render(withActions);
    const container = tree.root.findAll((n: any) => typeof n.type === 'string')[0];
    expect(flat(container.props.style).paddingTop).toBe(INSETS.top + 14);
  });

  it('заголовок в один рядок і з обмеженим масштабуванням шрифту', () => {
    // 32pt × 3 (Dynamic Type) не влазить у жодну ширину, а без numberOfLines
    // RN обрізає рядок мовчки.
    const tree = render(withActions);
    const title = tree.root.findAll(
      (n: any) => n.props?.children === 'Завдання' && n.props?.numberOfLines !== undefined,
    )[0];
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.maxFontSizeMultiplier).toBe(TITLE_MAX_FONT_SCALE);
  });

  it('заголовок стискається, група кнопок — ні', () => {
    const tree = render(withActions);
    const hosts = tree.root.findAll((n: any) => typeof n.type === 'string');

    const titleBox = hosts.find((n: any) => flat(n.props.style).flexShrink === 1);
    expect(titleBox).toBeDefined();

    const actions = hosts.find((n: any) => {
      const st = flat(n.props.style);
      return st.flexDirection === 'row' && st.flexShrink === 0 && st.gap === 7;
    });
    expect(actions).toBeDefined();
  });

  it('кожна кнопка — доступна ціль дотику 44pt', () => {
    const tree = render(withActions);
    const buttons = tree.root.findAll((n: any) => n.props?.accessibilityRole === 'button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);

    for (const b of buttons) {
      expect(b.props.hitSlop).toEqual(HEADER_BUTTON_HIT_SLOP);
      expect(typeof b.props.accessibilityLabel).toBe('string');
      expect(b.props.accessibilityLabel.length).toBeGreaterThan(0);
      const st = flat(b.props.style);
      // 36 + 4 + 4 = 44pt, мінімум HIG; і кнопка не має права стискатися.
      expect(st.width + b.props.hitSlop.left + b.props.hitSlop.right).toBe(44);
      expect(st.flexShrink).toBe(0);
    }
  });

  it('бічний інсет ландшафтного вирізу додається до 20pt', () => {
    INSETS.left = 44;
    INSETS.right = 0;
    try {
      const tree = render(withActions);
      const container = tree.root.findAll((n: any) => typeof n.type === 'string')[0];
      expect(flat(container.props.style).paddingHorizontal).toBe(64);
    } finally {
      INSETS.left = 0;
    }
  });

  it('хедер без кнопок не малює порожній контейнер дій', () => {
    const tree = render(<ScreenHeader title="Здоровʼя" color="#111" />);
    const actions = tree.root.findAll(
      (n: any) => typeof n.type === 'string' && flat(n.props.style).gap === 7,
    );
    expect(actions).toHaveLength(0);
  });

  it('рядок над заголовком і власний titleStyle доходять до рендеру', () => {
    // Екран «Сьогодні»: привітання над датою, кегль 26 замість 32.
    const tree = render(
      <ScreenHeader
        title="Понеділок, 31 серпня"
        color="#111"
        titleStyle={{ fontSize: 26 }}
        eyebrow={<Text>Доброго ранку</Text>}
      />,
    );
    expect(tree.root.findAll(
      (n: any) => typeof n.type === 'string' && n.props?.children === 'Доброго ранку',
    )).toHaveLength(1);

    const title = tree.root.findAll(
      (n: any) => n.props?.numberOfLines === 1 && n.props?.children?.startsWith?.('Понеділок'),
    )[0];
    expect(flat(title.props.style).fontSize).toBe(26);
  });
});

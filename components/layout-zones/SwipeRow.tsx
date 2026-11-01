/**
 * components/layout-zones/SwipeRow.tsx — рядок зі свайпом уліво (Layout
 * System v2.4: «Вліво — архів / видалити без входу в деталі»).
 *
 * Свайп відкриває кнопки праворуч (ReanimatedSwipeable з
 * react-native-gesture-handler; кореневий GestureHandlerRootView — у
 * app/_layout.tsx). Дія спрацьовує ТАПОМ по кнопці, а не самим свайпом —
 * випадковий змах під час прокрутки нічого не видаляє.
 *
 * Доступність: свайп — лише прискорення. Ті самі дії мусять мати й інший
 * шлях (меню картки / BulkActionBar); для VoiceOver SwipeRow передає їх
 * рядку як accessibilityActions через render-prop `children(a11y)` —
 * або екран додає їх сам.
 *
 *   <SwipeRow actions={[
 *     { key: 'archive', label: 'В архів', icon: 'archivebox.fill', tone: 'neutral', onPress },
 *     { key: 'delete',  label: 'Видалити', icon: 'trash.fill', tone: 'danger', onPress },
 *   ]}>{a11y => <TaskCard {...a11y} />}</SwipeRow>
 */
import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { fontFamily, radius, zone } from '@/constants/theme';

export type SwipeActionTone = 'neutral' | 'danger' | 'success';

export interface SwipeAction {
  key: string;
  label: string;
  icon: IconSymbolName;
  tone?: SwipeActionTone;
  onPress: () => void;
  testID?: string;
}

export interface SwipeRowA11y {
  accessibilityActions: AccessibilityActionInfo[];
  onAccessibilityAction: (e: AccessibilityActionEvent) => void;
}

export function SwipeRow({ actions, enabled = true, children, radius: r = radius.card, testID }: {
  actions: readonly SwipeAction[];
  enabled?: boolean;
  /** Вміст рядка; функція отримує accessibilityActions для власного Pressable. */
  children: React.ReactNode | ((a11y: SwipeRowA11y) => React.ReactNode);
  /** Радіус картки рядка (щоб кнопки дій мали той самий контур). */
  radius?: number;
  testID?: string;
}) {
  const { t } = useDSTheme();
  const ref = useRef<SwipeableMethods | null>(null);

  const run = useCallback((a: SwipeAction) => {
    ref.current?.close();
    a.onPress();
  }, []);

  const a11y: SwipeRowA11y = {
    accessibilityActions: actions.map(a => ({ name: a.key, label: a.label })),
    onAccessibilityAction: e => {
      const a = actions.find(x => x.key === e.nativeEvent.actionName);
      if (a) a.onPress();
    },
  };

  const content = typeof children === 'function' ? children(a11y) : children;
  if (!enabled || actions.length === 0) return <>{content}</>;

  const bg = (tone: SwipeActionTone | undefined) =>
    tone === 'danger' ? t.status.danger : tone === 'success' ? t.status.success : t.action.primary;
  // Білий на danger/success — 4.5:1 лише для великого/жирного; підпис 12 SemiBold
  // + іконка: на status.danger (#E8543F) білий ≈ 3.6:1 → беремо text.onAction
  // на action.primary і #111113 на success/danger у світлій (≥ 5:1).
  const fg = (tone: SwipeActionTone | undefined) =>
    tone === 'danger' || tone === 'success' ? '#111113' : t.text.onAction;

  return (
    <ReanimatedSwipeable
      ref={ref}
      testID={testID}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      // Контейнер свайпу обрізає (overflow hidden) — з тими ж кутами, що й
      // рядок, інакше тінь картки обрізається прямокутником із гострими кутами.
      containerStyle={{ borderRadius: r }}
      // Лише навмисний горизонтальний змах — вертикальна прокрутка списку
      // не повинна відкривати дії.
      activeOffsetX={[-14, 14]}
      failOffsetY={[-10, 10]}
      renderRightActions={() => (
        <View style={st.actions}>
          {actions.map((a, i) => (
            <Pressable
              key={a.key}
              testID={a.testID}
              onPress={() => run(a)}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ pressed }) => [
                st.action,
                {
                  backgroundColor: bg(a.tone),
                  opacity: pressed ? 0.8 : 1,
                  borderTopRightRadius: i === actions.length - 1 ? r : 0,
                  borderBottomRightRadius: i === actions.length - 1 ? r : 0,
                },
              ]}>
              <IconSymbol name={a.icon} size={18} color={fg(a.tone)} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[st.label, { color: fg(a.tone) }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}>
      {content}
    </ReanimatedSwipeable>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', paddingLeft: 8 },
  action: { width: zone.swipeAction, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  label: { fontSize: 12, fontFamily: fontFamily.semibold },
});

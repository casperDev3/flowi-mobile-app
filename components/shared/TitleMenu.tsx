/**
 * components/shared/TitleMenu.tsx — кнопка-«бургер» (☰) праворуч у рядку
 * великого заголовка + її меню дій розділу (11.2026, рішення власника).
 *
 * Що замінює: на телефоні кнопки розділу («⋯» дій, історія, налаштування
 * розділу, перемикачі вигляду) стояли в рядку інструментів поруч із
 * дзвіником і аватаром. Тепер розділ дає ОДНУ кнопку меню навпроти свого
 * заголовка («Фінанси ……… ☰»), а все інше — пункти меню. Перемикачі
 * режиму/вигляду з шапки телефона прибрано.
 *
 * Два режими:
 *   items   — меню малює шапка: поповер під кнопкою на «брудному склі»
 *             (OverlaySurface) + OverlayScrim, ролі menu / menuitem.
 *   onPress — кнопка лише відкриває НАЯВНЕ меню екрана (напр. TasksHeaderMenu
 *             чи меню фільтрів Фінансів) — коли в ньому перемикачі, бейджі
 *             тощо, яких нема в TitleMenuItem.
 *
 * Не плутати з ☰ шухляди сайдбара: та — ліворуч у рядку інструментів
 * (іконка sidebar.left), ця — праворуч у рядку заголовка (line.3.horizontal).
 *
 * Ціль дотику 44×44 (сама кнопка 44, без hitSlop — у рядку заголовка поруч
 * нікого немає). Видно лише три риски (11.2026): без кружка, тла й скла.
 */
import React, { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OverlayScrim, OverlaySurface } from '@/components/ds/OverlaySurface';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';

export interface TitleMenuItem {
  /** Ключ рядка (за замовч. — label). */
  key?: string;
  label: string;
  icon?: IconSymbolName;
  onPress: () => void;
  /** Деструктивна дія — coral.ink (≥ 4.5:1 на «брудному склі»), не status.danger. */
  destructive?: boolean;
  /** Перемикач: true/false — галочка й роль checkbox; undefined — звичайна дія. */
  checked?: boolean;
  /** Число праворуч (напр. кількість активних фільтрів). */
  badge?: number;
  /** Розділювач ПЕРЕД пунктом. */
  separatorBefore?: boolean;
  disabled?: boolean;
  testID?: string;
}

export interface TitleMenuConfig {
  /** Пункти меню — шапка сама малює поповер. */
  items?: readonly TitleMenuItem[];
  /** АБО: відкрити власне меню екрана (тоді items не потрібні). */
  onPress?: () => void;
  /** Підпис для VoiceOver; за замовч. «Опції: <заголовок>». */
  accessibilityLabel?: string;
  /** Є активні фільтри — крапка біля рисок (кнопка сама лишається без тла). */
  active?: boolean;
  testID?: string;
}

/** Розмір кнопки: рівно ціль дотику HIG. */
export const TITLE_MENU_BUTTON_SIZE = 44;

export function TitleMenuButton({ menu, title }: { menu: TitleMenuConfig; title: string }) {
  const { t, g } = useDS();
  const { tr } = useI18n();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useResponsive();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const label = menu.accessibilityLabel ?? `${tr.a11yOptions}: ${title}`;
  const items = menu.items ?? [];

  const open = useCallback(() => {
    if (menu.onPress) { menu.onPress(); return; }
    if (items.length === 0) return;
    const node = ref.current;
    const fallback = { top: insets.top + 120, right: 16 + insets.right };
    if (!node || typeof node.measureInWindow !== 'function') { setAnchor(fallback); return; }
    node.measureInWindow((x, y, w, h) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) { setAnchor(fallback); return; }
      setAnchor({ top: y + h + 8, right: Math.max(8, winW - (x + w)) });
    });
  }, [menu, items.length, insets.top, insets.right, winW]);

  const close = useCallback(() => setAnchor(null), []);


  return (
    <>
      <Pressable
        ref={ref}
        testID={menu.testID ?? 'title-menu-button'}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: anchor != null }}
        // 11.2026: лише три риски — без кружка, тла, обідка й скла. Кнопка
        // 44×44 лишається невидимою ціллю дотику.
        style={({ pressed }) => [st.button, { opacity: pressed ? 0.5 : 1 }]}>
        <IconSymbol name="line.3.horizontal" size={28} color={t.text.primary} />
        {/* Є активні фільтри — крапка біля рисок (замість суцільної кнопки). */}
        {menu.active ? (
          <View testID="title-menu-active-dot" style={[st.activeDot, { backgroundColor: t.text.primary }]} />
        ) : null}
      </Pressable>

      {menu.items ? (
        <Modal visible={anchor != null} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
          <View style={StyleSheet.absoluteFill}>
            <OverlayScrim onPress={close} accessibilityLabel={tr.close} blur={false} />
            {anchor ? (
              <OverlaySurface
                accessibilityViewIsModal
                radius={radius.cardCompact}
                testID="title-menu"
                style={[st.menu, {
                  top: anchor.top,
                  right: anchor.right,
                  maxHeight: Math.max(200, winH - anchor.top - insets.bottom - 16),
                }]}>
                <ScrollView bounces={false} accessibilityRole="menu">
                  {items.map((item, i) => {
                    const color = item.destructive ? g.accent.coral.ink : t.text.primary;
                    const iconColor = item.destructive ? g.accent.coral.ink : t.text.secondary;
                    return (
                      <View key={item.key ?? item.label}>
                        {i > 0 && item.separatorBefore ? (
                          <View style={[st.divider, { backgroundColor: t.border.hairline }]} />
                        ) : null}
                        <Pressable
                          testID={item.testID}
                          disabled={item.disabled}
                          onPress={() => { close(); item.onPress(); }}
                          accessibilityRole={item.checked === undefined ? 'menuitem' : 'checkbox'}
                          accessibilityState={{
                            disabled: !!item.disabled,
                            ...(item.checked === undefined ? null : { checked: item.checked }),
                          }}
                          accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
                          style={({ pressed }) => [st.item, { opacity: item.disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
                          {item.icon ? <IconSymbol name={item.icon} size={16} color={iconColor} /> : null}
                          <Text numberOfLines={1} style={[st.itemText, { color }]}>{item.label}</Text>
                          {item.badge ? (
                            <View style={[st.badge, { backgroundColor: t.surface.subtle }]}>
                              <Text style={[st.badgeText, { color: t.text.primary }]}>{item.badge}</Text>
                            </View>
                          ) : null}
                          {item.checked ? <IconSymbol name="checkmark" size={16} color={t.text.primary} /> : null}
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              </OverlaySurface>
            ) : null}
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const st = StyleSheet.create({
  button: {
    width: TITLE_MENU_BUTTON_SIZE,
    height: TITLE_MENU_BUTTON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activeDot: { position: 'absolute', top: 10, right: 8, width: 8, height: 8, borderRadius: 4 },
  menu: { position: 'absolute', minWidth: 240, maxWidth: 320, paddingVertical: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16 },
  itemText: { flex: 1, fontSize: 15, fontFamily: fontFamily.medium },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16, marginVertical: 4 },
});

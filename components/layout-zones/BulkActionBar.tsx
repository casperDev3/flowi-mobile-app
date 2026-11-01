/**
 * components/layout-zones/BulkActionBar.tsx — плаваюча панель масових дій
 * (Layout System v2.4, сторінка 06: «3 вибрано · Дії ▾ · ✕»).
 *
 * З'являється внизу головної зони, коли вибрано ≥ 1 запис (довгий тап по
 * рядку вмикає вибір, далі — короткі тапи). «Дії ▾» відкриває меню дій (теж
 * «брудне скло»); ✕ / системне «Назад» знімають вибір.
 * Поверхня — OverlaySurface; ціль дотику кожної кнопки ≥ 44; рядок
 * оголошується VoiceOver (accessibilityLiveRegion) при зміні кількості.
 *
 *   <BulkActionBar count={ids.size} onClear={clear} bottom={tabBarInset + 12}
 *     actions={[{ key:'done', label:'Виконано', icon:'checkmark', onPress },
 *               { key:'delete', label:'Видалити', icon:'trash.fill', tone:'danger', onPress }]} />
 */
import React, { useEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { OverlayScrim, OverlaySurface } from '@/components/ds/OverlaySurface';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { fontFamily, radius, zone } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';
import { useI18n } from '@/store/i18n';

import { useZoneStrings } from './strings';

export interface BulkAction {
  key: string;
  label: string;
  icon: IconSymbolName;
  tone?: 'default' | 'danger';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function BulkActionBar({ count, actions, onClear, bottom = 16, style, testID }: {
  count: number;
  actions: readonly BulkAction[];
  onClear: () => void;
  /** Відступ від низу головної зони (над таб-баром на телефоні). */
  bottom?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t, g } = useDSTheme();
  const { tr } = useI18n();
  const s = useZoneStrings();
  const motion = useMotion();
  const [menu, setMenu] = useState(false);

  // Android «Назад» знімає вибір (як Esc на вебі).
  useEffect(() => {
    if (count === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClear(); return true; });
    return () => sub.remove();
  }, [count, onClear]);

  useEffect(() => { if (count === 0) setMenu(false); }, [count]);

  if (count === 0) return null;

  return (
    <>
      <Animated.View
        entering={motion.entering(FadeInDown.duration(160))}
        exiting={motion.entering(FadeOutDown.duration(120))}
        pointerEvents="box-none"
        style={[st.wrap, { bottom }, style]}>
        <OverlaySurface radius={radius.pill} testID={testID} style={st.bar}>
          <Text
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            style={[st.count, { color: t.text.primary }]}>
            {s.selectedN(count)}
          </Text>
          <Pressable
            testID={testID ? `${testID}-actions` : undefined}
            onPress={() => setMenu(true)}
            accessibilityRole="button"
            accessibilityLabel={s.actions}
            accessibilityState={{ expanded: menu }}
            style={({ pressed }) => [st.actionsBtn, { backgroundColor: t.action.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={[st.actionsText, { color: t.text.onAction }]}>{s.actions}</Text>
            <IconSymbol name="chevron.down" size={12} color={t.text.onAction} />
          </Pressable>
          <Pressable
            testID={testID ? `${testID}-clear` : undefined}
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={s.clearSelection}
            style={st.iconBtn}>
            <IconSymbol name="xmark" size={16} color={t.text.secondary} />
          </Pressable>
        </OverlaySurface>
      </Animated.View>

      <Modal visible={menu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenu(false)}>
        <View style={StyleSheet.absoluteFill}>
          <OverlayScrim onPress={() => setMenu(false)} accessibilityLabel={tr.close} blur={false} />
          <View pointerEvents="box-none" style={[st.menuWrap, { bottom: bottom + zone.bulkBar + 8 }]}>
            <OverlaySurface accessibilityViewIsModal accessibilityRole="menu" style={st.menu}>
              {actions.map(a => {
                // Текст на «брудному склі»: coral.ink (≥ 4.5:1), а не status.danger (≈ 3.4:1).
                const fg = a.tone === 'danger' ? g.accent.coral.ink : t.text.primary;
                return (
                  <Pressable
                    key={a.key}
                    testID={a.testID}
                    disabled={a.disabled}
                    onPress={() => { setMenu(false); a.onPress(); }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ disabled: !!a.disabled }}
                    accessibilityLabel={a.label}
                    style={({ pressed }) => [st.menuItem, { opacity: a.disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
                    <IconSymbol name={a.icon} size={16} color={fg} />
                    <Text style={[st.menuText, { color: fg }]}>{a.label}</Text>
                  </Pressable>
                );
              })}
            </OverlaySurface>
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: zone.bulkBar, paddingLeft: 18, paddingRight: 6, maxWidth: 520 },
  count: { flexShrink: 1, fontSize: 14, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'], marginRight: 4 },
  actionsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill },
  actionsText: { fontSize: 14, fontFamily: fontFamily.semibold },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  menu: { minWidth: 240, paddingVertical: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 18 },
  menuText: { fontSize: 15, fontFamily: fontFamily.medium },
});

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, theme } from '@/constants/theme';
import { ds } from '@/hooks/use-ds';

/**
 * Плитка розділу на хабі Здоровʼя.
 *
 * NAT-13 (нативний прогін). Короткий тап по центру плитки не відкривав екран
 * узагалі — відкривало лише довге натискання. Контроль на тому самому екрані
 * (банер «Профіль здоровʼя», звичайний TouchableOpacity) на той самий тап
 * реагував нормально; відрізнялась тільки обгортка — PressableScale
 * (Animated.createAnimatedComponent(Pressable) зі spring на onPressIn)
 * навколо BlurView з overflow:'hidden'. Тому плитка переведена на ту саму
 * обгортку, що доведено працює поруч. Анімації натискання тут немає свідомо:
 * плитка, яка не відкривається, — гірше за плитку без пружинки.
 *
 * L9: висота була зашита (`height: 112`) при `overflow:'hidden'`, тож при
 * збільшеному системному шрифті другий рядок (те, заради чого плитку й
 * читають) обрізався: на XXXL запас 1.7pt, на AX1 рядок розрізано навпіл.
 * Тепер це `minHeight` — коробка росте разом із текстом, — а заголовку
 * дозволено два рядки.
 *
 * 07.10: плитка суцільна (фон картки, як на Фінансах), а не BlurView без фону —
 * тож і `overflow:'hidden'` для заокруглення розмиття більше не потрібен.
 */
export function HubTile({ title, icon, color, stat, hint, badge, onPress, isDark, border, text, sub, card }: {
  title: string;
  /** Типізовано: рядок пропускав назви, яких немає в маппінгу. */
  icon: IconSymbolName;
  color: string;
  stat?: string;
  hint?: string;
  badge?: number;
  onPress: () => void;
  isDark: boolean;
  border: string;
  text: string;
  sub: string;
  /** Фон плитки (c.card — скло DS v2.1); без нього — glass.surface. */
  card?: string;
}) {
  const detail = stat ?? hint;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{ flex: 1 }}
      accessibilityRole="button"
      accessibilityLabel={[title, detail, badge != null && badge > 0 ? String(badge) : null].filter(Boolean).join(', ')}
    >
      <View
        style={{ borderRadius: radius.cardCompact, padding: 20, minHeight: 112,
          // DS v2.1: скло (заливка + спекулярний обідок) над mesh.
          ...ds.glass(isDark, 'card'), ...(card ? { backgroundColor: card } : null), ...shadow[isDark ? 'dark' : 'light'].card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 38, height: 38, borderRadius: radius.pill, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name={icon as any} size={20} color={color} />
          </View>
          <View style={{ flex: 1 }} />
          {/* Omni: плитка-перехід — декоративна ↗ праворуч (сама плитка кнопка). */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: (isDark ? theme.dark : theme.light).surface.subtle }}>
            <IconSymbol name="arrow.up.right" size={14} color={text} />
          </View>
          {badge != null && badge > 0 && (
            <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: (isDark ? theme.dark : theme.light).accent.coral, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{badge}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={2} style={{ color: text, fontSize: 16, fontFamily: fontFamily.semibold, marginTop: 12 }}>{title}</Text>
        {stat ? <Text numberOfLines={2} style={{ color: text, fontSize: 13, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], marginTop: 4 }}>{stat}</Text>
              : hint ? <Text numberOfLines={2} style={{ color: sub, fontSize: 12, fontFamily: fontFamily.regular, marginTop: 4 }}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

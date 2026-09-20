import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';

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
 * дозволено два рядки. `overflow:'hidden'` лишається: він тут тримає
 * заокруглення BlurView, а не ріже текст, бо стеля висоти знята.
 */
export function HubTile({ title, icon, color, stat, hint, badge, onPress, isDark, border, text, sub }: {
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
      <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
        style={{ borderRadius: 18, borderWidth: 1, borderColor: border, overflow: 'hidden', padding: 14, minHeight: 112 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name={icon as any} size={19} color={color} />
          </View>
          <View style={{ flex: 1 }} />
          {badge != null && badge > 0 && (
            <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{badge}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={2} style={{ color: text, fontSize: 15, fontWeight: '800', marginTop: 12 }}>{title}</Text>
        {stat ? <Text numberOfLines={2} style={{ color, fontSize: 13, fontWeight: '700', marginTop: 3 }}>{stat}</Text>
              : hint ? <Text numberOfLines={2} style={{ color: sub, fontSize: 11, fontWeight: '600', marginTop: 3 }}>{hint}</Text> : null}
      </BlurView>
    </TouchableOpacity>
  );
}

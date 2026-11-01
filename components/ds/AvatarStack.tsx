/**
 * components/ds/AvatarStack.tsx — стос аватарів (Omni: учасники картки).
 *
 * Аватар — коло з ініціалами на суцільній заливці акценту (solid + onSolid,
 * ≥ 4.99:1 в обох темах), кольори детерміновані від id. Кола перекриваються
 * на третину й мають обідок кольору картки. Понад `max` — «+N».
 * Стос — один елемент для скрінрідера: «Ім'я, Ім'я і ще N».
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { fontFamily, type GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type AvatarPerson = { id: string; name: string; accent?: GlassAccent };

const ROTATION: GlassAccent[] = ['lavender', 'amber', 'info', 'lime', 'coral', 'success'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + second).toUpperCase();
}

export type AvatarProps = {
  person: AvatarPerson;
  size?: number;
  /** Колір обідка — фон, на якому стоїть аватар (за замовч. surface.card). */
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ person, size = 28, ringColor, style }: AvatarProps) {
  const { t, g } = useDS();
  const a = g.accent[person.accent ?? ROTATION[hash(person.id || person.name) % ROTATION.length]];
  return (
    <View
      style={[
        {
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: a.solid,
          borderWidth: 2, borderColor: ringColor ?? t.surface.card,
          alignItems: 'center', justifyContent: 'center',
        },
        style,
      ]}>
      <Text
        allowFontScaling={false}
        style={{ color: a.onSolid, fontFamily: fontFamily.semibold, fontSize: Math.round(size * 0.38) }}>
        {initialsOf(person.name)}
      </Text>
    </View>
  );
}

export type AvatarStackProps = {
  people: AvatarPerson[];
  max?: number;
  size?: number;
  ringColor?: string;
  /** Шаблон підпису для «ще N» — напр. tr-рядок «і ще {n}»; без нього — «+N». */
  moreLabel?: (n: number) => string;
  style?: StyleProp<ViewStyle>;
};

export function AvatarStack({ people, max = 3, size = 28, ringColor, moreLabel, style }: AvatarStackProps) {
  const { t } = useDS();
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const label = shown.map(p => p.name).join(', ') + (rest > 0 ? `, ${moreLabel ? moreLabel(rest) : `+${rest}`}` : '');
  return (
    <View accessible accessibilityLabel={label} style={[st.row, style]}>
      {shown.map((p, i) => (
        <Avatar key={p.id} person={p} size={size} ringColor={ringColor} style={i > 0 ? { marginLeft: -size / 3 } : null} />
      ))}
      {rest > 0 ? (
        <View
          style={{
            marginLeft: -size / 3, width: size, height: size, borderRadius: size / 2,
            backgroundColor: t.surface.subtle, borderWidth: 2, borderColor: ringColor ?? t.surface.card,
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Text allowFontScaling={false} style={{ color: t.text.secondary, fontFamily: fontFamily.semibold, fontSize: Math.round(size * 0.36) }}>
            +{rest}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});

import { Atlas } from '@/constants/atlas';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/shared/PressableScale';
import { AccentIcon } from '@/components/shared/GlassBits';
import type { Translations } from '@/store/translations';
import { fontFamily, shadow, type GlassAccent } from '@/constants/theme';
import { dsTheme } from '@/components/shared/dsTheme';

interface Props {
  isDark: boolean;
  c: { border: string; sub: string };
  tr: Translations;
  onAddTask: () => void;
  onAddExpense: () => void;
  onAddWater: () => void;
  onTimer: () => void;
}

/** Стеля Dynamic Type для підписів плиток — див. коментар у розмітці. */
const QUICK_LABEL_MAX_FONT_SCALE = 1.6;

export function QuickActions({ isDark, c, tr, onAddTask, onAddExpense, onAddWater, onTimer }: Props) {
  // Omni (DS v2.2): плитки — суцільні bento-картки (surface.card + м'яка
  // тінь), іконка — тонований кружок акценту модуля (завдання — lavender,
  // фінанси — lime, вода/здоров'я — coral, час — amber). Скло лишається
  // функціональному шару (шапка, таб-бар, сайдбар).
  const t = dsTheme(isDark);
  const cardShadow = shadow[isDark ? 'dark' : 'light'].card;
  const actions: { label: string; icon: 'plus.circle.fill' | 'banknote' | 'drop.fill' | 'timer'; accent: GlassAccent; onPress: () => void }[] = [
    { label: tr.quickAddTask,    icon: 'plus.circle.fill', accent: 'lavender', onPress: onAddTask },
    { label: tr.quickAddExpense, icon: 'banknote',         accent: 'lime',     onPress: onAddExpense },
    { label: tr.quickAddWater,   icon: 'drop.fill',        accent: 'coral',    onPress: onAddWater },
    { label: tr.quickTimer,      icon: 'timer',            accent: 'amber',    onPress: onTimer },
  ];

  return (
    <View style={s.row}>
      {actions.map(a => (
        <PressableScale
          key={a.label}
          onPress={a.onPress}
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel={a.label}>
          <View
            style={[s.btn, { backgroundColor: t.surface.card, ...cardShadow }]}>
            <AccentIcon isDark={isDark} icon={a.icon} accent={a.accent} size="md" style={s.iconWrap} />
            {/* NAT-06: чотири плитки ділять ширину порівну, і при найбільшому
                Dynamic Type (AX5) підписи зрізались до «+ З…», «Та…», «Фін…».
                Стеля масштабування + другий рядок лишають слово читабельним;
                озвучення не страждає — повний підпис є в accessibilityLabel
                самої плитки. */}
            <Text
              style={[s.label, { color: t.text.primary }]}
              numberOfLines={2}
              maxFontSizeMultiplier={QUICK_LABEL_MAX_FONT_SCALE}>{a.label}</Text>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  // Без зовнішнього marginBottom: відступ дає секція (TodaySectionGrid).
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    borderRadius: Atlas.radius.xlarge,
    paddingVertical: 14,
    alignItems: 'center',
  },
  iconWrap: { marginBottom: 6 },
  label: { fontSize: 11, fontFamily: fontFamily.medium, textAlign: 'center', paddingHorizontal: 4 },
});

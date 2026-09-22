import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/shared/PressableScale';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

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
  const actions = [
    { label: tr.quickAddTask,    icon: 'plus.circle.fill' as const, color: '#7C3AED', onPress: onAddTask },
    { label: tr.quickAddExpense, icon: 'banknote'         as const, color: '#0EA5E9', onPress: onAddExpense },
    { label: tr.quickAddWater,   icon: 'drop.fill'        as const, color: '#10B981', onPress: onAddWater },
    { label: tr.quickTimer,      icon: 'timer'            as const, color: '#6366F1', onPress: onTimer },
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
          <BlurView
            intensity={isDark ? 22 : 42}
            tint={isDark ? 'dark' : 'light'}
            style={[s.btn, { borderColor: c.border }]}>
            <View style={[s.iconWrap, { backgroundColor: a.color + '22' }]}>
              <IconSymbol name={a.icon} size={16} color={a.color} />
            </View>
            {/* NAT-06: чотири плитки ділять ширину порівну, і при найбільшому
                Dynamic Type (AX5) підписи зрізались до «+ З…», «Та…», «Фін…».
                Стеля масштабування + другий рядок лишають слово читабельним;
                озвучення не страждає — повний підпис є в accessibilityLabel
                самої плитки. */}
            <Text
              style={[s.label, { color: c.sub }]}
              numberOfLines={2}
              maxFontSizeMultiplier={QUICK_LABEL_MAX_FONT_SCALE}>{a.label}</Text>
          </BlurView>
        </PressableScale>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  btn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  label: { fontSize: 10, fontWeight: '600', textAlign: 'center', paddingHorizontal: 4 },
});

/**
 * components/settings/ToolTiles.tsx — «Інструменти» плитками.
 *
 * ResponsiveGrid з minItemWidth: колонок стільки, скільки влазить плиток
 * ≥ 96pt (телефон — 3, планшет — до 6); неповний рядок добивається
 * порожніми комірками, тож плитки однакові.
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';

export interface ToolTile {
  key: string;
  icon: IconSymbolName;
  iconColor: string;
  label: string;
}

export function ToolTiles({ tools, onPress, isDark, text, border }: {
  tools: readonly ToolTile[];
  onPress: (key: string) => void;
  isDark: boolean;
  text: string;
  border: string;
}) {
  return (
    <ResponsiveGrid minItemWidth={96} maxColumns={6} columns={{ compact: 3, medium: 4, expanded: 6 }} gap={10}>
      {tools.map(tool => (
        <TouchableOpacity
          key={tool.key}
          onPress={() => onPress(tool.key)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={tool.label}>
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.tile, { borderColor: border }]}>
            <View style={[st.iconBox, { backgroundColor: tool.iconColor + '20' }]}>
              <IconSymbol name={tool.icon} size={20} color={tool.iconColor} />
            </View>
            <Text style={[st.label, { color: text }]} numberOfLines={2}>{tool.label}</Text>
          </BlurView>
        </TouchableOpacity>
      ))}
    </ResponsiveGrid>
  );
}

const st = StyleSheet.create({
  tile:    { borderRadius: Atlas.radius.large, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 6, gap: 8, minHeight: 92 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});

/**
 * components/settings/ToolTiles.tsx — «Інструменти» плитками.
 *
 * ResponsiveGrid з minItemWidth: колонок стільки, скільки влазить плиток
 * ≥ 96pt (телефон — 3, планшет — до 6); неповний рядок добивається
 * порожніми комірками, тож плитки однакові.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { fontFamily, moduleAccent, type ModuleKey } from '@/constants/theme';
import { dsTheme, glassOf, glassRim } from '@/components/shared/dsTheme';
import { AccentIcon } from '@/components/shared/GlassBits';

export interface ToolTile {
  key: string;
  icon: IconSymbolName;
  iconColor: string;
  label: string;
}

export function ToolTiles({ tools, onPress, isDark, text, border: _border }: {
  tools: readonly ToolTile[];
  onPress: (key: string) => void;
  isDark: boolean;
  text: string;
  border: string;
}) {
  // DS v2: плитка — surface.card без рамки, іконка — у колі з тоном кольору інструмента.
  const t = dsTheme(isDark);
  return (
    <ResponsiveGrid minItemWidth={96} maxColumns={6} columns={{ compact: 3, medium: 4, expanded: 6 }} gap={12}>
      {tools.map(tool => (
        <TouchableOpacity
          key={tool.key}
          onPress={() => onPress(tool.key)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={tool.label}>
          <View style={[st.tile, { backgroundColor: glassOf(t).surface, ...glassRim(t, 'card') }]}>
            {/* DS v2.1: інструмент модуля — тонований скляний кружок акценту модуля. */}
            {tool.key in moduleAccent ? (
              <AccentIcon isDark={isDark} icon={tool.icon} accent={moduleAccent[tool.key as ModuleKey]} size="md" style={st.iconBox} />
            ) : (
              <View style={[st.iconBox, { backgroundColor: tool.iconColor + '20' }]}>
                <IconSymbol name={tool.icon} size={20} color={tool.iconColor} />
              </View>
            )}
            <Text style={[st.label, { color: text }]} numberOfLines={2}>{tool.label}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ResponsiveGrid>
  );
}

const st = StyleSheet.create({
  tile:    { borderRadius: Atlas.radius.xlarge, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 6, gap: 8, minHeight: 92 },
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 12, fontFamily: fontFamily.semibold, textAlign: 'center' },
});

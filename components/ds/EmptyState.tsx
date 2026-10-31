/**
 * components/ds/EmptyState.tsx — порожній стан DS v2:
 * іконка в тонованому акцентом скляному колі + заголовок + підпис
 * (text.secondary) + pill-CTA.
 */
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useResolvedAccent } from '@/components/ds/AccentContext';
import { PillButton } from '@/components/ds/PillButton';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { space, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type EmptyStateProps = {
  icon?: IconSymbolName;
  title: string;
  caption?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({ icon = 'tray', title, caption, actionLabel, onAction, actionTestID, testID, style }: EmptyStateProps) {
  const { t, g, reduceTransparency } = useDS();
  const accent = useResolvedAccent(null);
  return (
    <View testID={testID} style={[{ alignItems: 'center', paddingVertical: space[10], paddingHorizontal: space[6], gap: space[3] }, style]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          backgroundColor: reduceTransparency ? t.surface.subtle : g.surfaceSubtle,
          borderWidth: reduceTransparency ? 0 : 1, borderColor: g.rim, borderBottomColor: g.rimShade,
        }}>
        {/* Тонована акцентом модуля підкладка — порожній стан теж «свого» кольору. */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: g.accent[accent].tint }} />
        <IconSymbol name={icon} size={28} color={g.accent[accent].ink} />
      </View>
      <Text accessibilityRole="header" style={[type.h2, { color: t.text.primary, textAlign: 'center' }]}>{title}</Text>
      {caption ? (
        <Text style={[type.body, { color: t.text.secondary, textAlign: 'center', maxWidth: 320 }]}>{caption}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <PillButton label={actionLabel} onPress={onAction} testID={actionTestID} icon="plus" style={{ alignSelf: 'center', marginTop: space[2] }} />
      ) : null}
    </View>
  );
}

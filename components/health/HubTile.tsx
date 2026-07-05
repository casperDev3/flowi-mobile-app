import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, View } from 'react-native';

import { PressableScale } from '@/components/shared/PressableScale';
import { IconSymbol } from '@/components/ui/icon-symbol';

export function HubTile({ title, icon, color, stat, hint, badge, onPress, isDark, border, text, sub }: {
  title: string;
  icon: string;
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
  return (
    <PressableScale onPress={onPress} style={{ flex: 1 }}>
      <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
        style={{ borderRadius: 18, borderWidth: 1, borderColor: border, overflow: 'hidden', padding: 14, height: 112 }}>
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
        <Text numberOfLines={1} style={{ color: text, fontSize: 15, fontWeight: '800', marginTop: 12 }}>{title}</Text>
        {stat ? <Text numberOfLines={1} style={{ color, fontSize: 13, fontWeight: '700', marginTop: 3 }}>{stat}</Text>
              : hint ? <Text numberOfLines={1} style={{ color: sub, fontSize: 11, fontWeight: '600', marginTop: 3 }}>{hint}</Text> : null}
      </BlurView>
    </PressableScale>
  );
}

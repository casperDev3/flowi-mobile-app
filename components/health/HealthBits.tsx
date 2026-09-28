import { Atlas } from '@/constants/atlas';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';

export function SectionHeader({ title, icon, color, textColor, top = 22 }: {
  title: string; icon: any; color: string; textColor: string; top?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: top, marginBottom: 10, gap: 9 }}>
      <View style={{ width: 28, height: 28, borderRadius: Atlas.radius.small, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name={icon} size={14} color={color} />
      </View>
      <Text style={{ color: textColor, fontSize: 17, fontWeight: Atlas.type.headingWeight }}>{title}</Text>
    </View>
  );
}

export function QuickStatCard({ value, label, icon, color, isDark, border, sub, text }: {
  value: string; label: string; icon: any; color: string;
  isDark: boolean; border: string; sub: string; text: string;
}) {
  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
      style={{ flex: 1, borderRadius: Atlas.radius.large, borderWidth: 1, borderColor: border, overflow: 'hidden', padding: 12, alignItems: 'center' }}>
      <View style={{ width: 32, height: 32, borderRadius: Atlas.radius.medium, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <IconSymbol name={icon} size={15} color={color} />
      </View>
      <Text style={{ color: text, fontSize: 12, fontWeight: Atlas.type.headingWeight, textAlign: 'center' }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </BlurView>
  );
}

export function CalStat({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color, fontSize: 16, fontWeight: Atlas.type.headingWeight }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', marginTop: 1 }}>{label}</Text>
    </View>
  );
}

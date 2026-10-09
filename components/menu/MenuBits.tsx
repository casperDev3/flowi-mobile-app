/**
 * components/menu/MenuBits.tsx — дрібні примітиви екрана «Меню»: кнопка,
 * рядок, картка, текст, кругла кнопка-іконка, бейдж статусу, «Сьогодні».
 *
 * Фабрика, а не окремі компоненти: усім примітивам потрібні ті самі палітра
 * й прапор «зайнято» (під час запиту кнопки вимкнені), і передавати їх у
 * кожен виклик означало б подвоїти розмітку вкладок.
 */
import { Atlas } from '@/constants/atlas';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';

import { MENU_OK, MENU_WARN, type MenuColors } from './theme';

export function menuBits(c: MenuColors, busy: boolean) {
  const text = (value: string, muted = false) => (
    <Text style={{ color: muted ? c.sub : c.text, fontSize: muted ? 12 : 15, lineHeight: muted ? 18 : 22 }}>
      {value}
    </Text>
  );

  const btn = (
    label: string,
    action: () => void,
    selected = false,
    disabled = false,
    icon?: IconSymbolName,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled, selected }}
      disabled={busy || disabled}
      onPress={action}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: Atlas.radius.medium,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: selected ? c.accent : c.dim,
        opacity: busy || disabled ? 0.5 : pressed ? 0.7 : 1,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        gap: 6,
      })}>
      {icon && <IconSymbol name={icon} size={15} color={selected ? '#fff' : c.text} />}
      <Text
        style={{
          textAlign: 'center',
          lineHeight: 20,
          includeFontPadding: false,
          color: selected ? '#fff' : c.text,
          fontWeight: '600',
          fontSize: 13,
        }}>
        {label}
      </Text>
    </Pressable>
  );

  const row = (children: React.ReactNode) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</View>
  );

  const panel = (children: React.ReactNode, key?: string) => (
    <View
      key={key}
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        borderRadius: Atlas.radius.xlarge,
        padding: 16,
        gap: 12,
      }}>
      {children}
    </View>
  );

  const iconBtn = (name: IconSymbolName, label: string, action: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled }}
      disabled={busy || disabled}
      onPress={action}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: Atlas.radius.xlarge,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.dim,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: busy || disabled ? 0.4 : pressed ? 0.7 : 1,
      })}>
      <IconSymbol name={name} size={18} color={c.text} />
    </Pressable>
  );

  const badge = (tone: 'ok' | 'warn' | 'muted', label: string, icon?: IconSymbolName) => {
    const fg =
      tone === 'ok'
        ? c.isDark ? '#34D399' : '#047857'
        : tone === 'warn'
          ? c.isDark ? '#FBBF24' : '#B45309'
          : c.sub;
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={`Статус: ${label}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: tone === 'ok' ? MENU_OK + '24' : tone === 'warn' ? MENU_WARN + '24' : c.chip,
        }}>
        {icon && <IconSymbol name={icon} size={14} color={fg} />}
        <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      </View>
    );
  };

  const todayPill = (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.accent + '26' }}>
      <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>Сьогодні</Text>
    </View>
  );

  return { text, btn, row, panel, iconBtn, badge, todayPill };
}

export type MenuBitsApi = ReturnType<typeof menuBits>;

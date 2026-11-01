/**
 * components/shared/AccountSheet.tsx — меню акаунта з аватара в AppHeader
 * (Omni: аватар + ім'я + ⌄ у правому куті шапки).
 *
 * Лише входи в уже наявні екрани: «Керування акаунтом» (/account),
 * «Сповіщення» (/notifications, з бейджем непрочитаних), «Налаштування»
 * (вкладка) — і перемикач теми, той самий стор, що й у Налаштуваннях
 * (store/theme-context). Нової логіки тут немає.
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ds/AvatarStack';
import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { useTheme, type ThemeOption } from '@/store/theme-context';

function Row({ icon, label, onPress, trailing }: {
  icon: IconSymbolName; label: string; onPress: () => void; trailing?: React.ReactNode;
}) {
  const { t } = useDS();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [st.row, { backgroundColor: t.surface.subtle, opacity: pressed ? 0.7 : 1 }]}>
      <IconSymbol name={icon} size={18} color={t.text.primary} />
      <Text numberOfLines={1} style={[st.rowText, { color: t.text.primary }]}>{label}</Text>
      {trailing}
      <IconSymbol name="chevron.right" size={12} color={t.text.secondary} />
    </Pressable>
  );
}

export function AccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useDS();
  const { tr } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const go = (route: Href) => {
    onClose();
    router.push(route);
  };

  const themes: { key: ThemeOption; label: string; icon: IconSymbolName }[] = [
    { key: 'system', label: tr.themeSystem, icon: 'circle.lefthalf.filled' },
    { key: 'light', label: tr.themeLight, icon: 'sun.max' },
    { key: 'dark', label: tr.themeDark, icon: 'moon' },
  ];

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={[st.card, { backgroundColor: t.surface.card }]}>
        <View style={st.profile}>
          {user ? (
            <Avatar person={{ id: user.id, name: user.name || user.email }} size={52} />
          ) : (
            <View style={[st.guest, { backgroundColor: t.surface.subtle }]}>
              <IconSymbol name="person.fill" size={24} color={t.text.secondary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[st.name, { color: t.text.primary }]}>
              {user ? (user.name || user.email) : tr.settingsHub.profileGuest}
            </Text>
            {user?.email && user.name ? (
              <Text numberOfLines={1} style={[st.email, { color: t.text.secondary }]}>{user.email}</Text>
            ) : null}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          {user ? <Row icon="person.crop.circle" label={tr.accountManage} onPress={() => go('/account')} /> : null}
          <Row
            icon="bell"
            label={tr.notifications}
            onPress={() => go('/notifications')}
            trailing={<NotificationBadge />}
          />
          <Row icon="gearshape.fill" label={tr.settings} onPress={() => go('/(tabs)/settings' as Href)} />
        </View>

        <Text style={[st.section, { color: t.text.secondary }]}>{tr.theme}</Text>
        <View style={[st.segment, { backgroundColor: t.surface.subtle }]} accessibilityRole="radiogroup">
          {themes.map(opt => {
            const active = theme === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setTheme(opt.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={opt.label}
                style={[st.segItem, active ? { backgroundColor: t.action.primary } : null]}>
                <IconSymbol name={opt.icon} size={16} color={active ? t.text.onAction : t.text.secondary} />
                <Text numberOfLines={1} style={[st.segText, { color: active ? t.text.onAction : t.text.secondary }]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SheetModal>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 24, padding: 20, gap: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
  guest: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 18, fontFamily: fontFamily.semibold },
  email: { fontSize: 13, fontFamily: fontFamily.regular, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.nested },
  rowText: { flex: 1, fontSize: 15, fontFamily: fontFamily.medium },
  section: { fontSize: 12, fontFamily: fontFamily.semibold, marginTop: 4 },
  segment: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segText: { fontSize: 13, fontFamily: fontFamily.semibold },
});

/**
 * components/shared/SidebarDrawer.tsx — сайдбар-шухляда телефона (Omni, DS v2.2).
 *
 * На телефоні постійного сайдбара немає (там нижні таби з п'ятьма головними
 * розділами), але решта модулів — Проєкти, Нотатки, Контейнери, Меню… —
 * жила лише в «Опціях». Шухляда відкривається кнопкою «меню» в AppHeader і
 * показує той самий NavSidebar, що й на планшеті (ті самі групи, вимкнені
 * модулі сховані, активний пункт — чорна pill).
 *
 * Модалка з бекдропом: тап поза панеллю й системне «Назад» закривають;
 * accessibilityViewIsModal тримає VoiceOver усередині. Поява — ковзання
 * зліва, з «Зменшити рух» — без анімації.
 */
import { usePathname } from 'expo-router';
import React from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, SlideInLeft } from 'react-native-reanimated';

import { NavSidebar } from '@/components/shared/NavSidebar';
import { useDS } from '@/hooks/use-ds';
import { useMotion } from '@/hooks/use-motion';
import { useI18n } from '@/store/i18n';

/** Ширина шухляди: 300pt, але не більше 86% вікна (лишається видно край екрана). */
export function drawerWidthFor(windowWidth: number): number {
  return Math.min(300, Math.round(windowWidth * 0.86));
}

export function SidebarDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, isDark } = useDS();
  const { tr } = useI18n();
  const motion = useMotion();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const panelWidth = drawerWidthFor(width);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View entering={motion.entering(FadeIn.duration(180))} style={StyleSheet.absoluteFill}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: t.surface.overlay }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tr.close}
          />
        </Animated.View>
        <Animated.View
          entering={motion.entering(SlideInLeft.duration(220))}
          accessibilityViewIsModal
          style={[st.panel, { width: panelWidth, backgroundColor: t.surface.card }]}>
          <NavSidebar
            pathname={pathname}
            isDark={isDark}
            variant="drawer"
            width={panelWidth}
            onNavigate={onClose}
            onClose={onClose}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  panel: {
    position: 'absolute', top: 0, bottom: 0, left: 0,
    borderTopRightRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden',
  },
});

/**
 * components/shared/SidebarDrawer.tsx — сайдбар-шухляда телефона (Omni, DS v2.2;
 * Layout System v2.4).
 *
 * На телефоні постійного сайдбара немає (там нижній бар із чотирма головними
 * розділами: Сьогодні · Задачі · Фінанси · Здоров'я), а ВСЕ інше — Налаштування,
 * Час, Проєкти, Нотатки, Контейнери, Меню… — у шухляді за кнопкою ☰. Шухляда
 * показує той самий NavSidebar, що й планшет (ті самі групи, вимкнені модулі
 * сховані, активний пункт — чорна pill).
 *
 * Layout System v2.4:
 *   • поверхня — «брудне скло» OverlaySurface (під ним не просвічує вміст),
 *     затемнення — OverlayScrim;
 *   • закриття: тап по затемненню, свайп УЛІВО по панелі, системне «Назад»;
 *   • унизу — перемикач «Список / Колонки» розділу, що зараз у фокусі
 *     (useActiveZone; лише для розділів, які вміють «Колонки»).
 * accessibilityViewIsModal тримає VoiceOver усередині. Поява й закриття
 * (затемнення, ✕, «Назад») — лише проявлення/зникнення (Motion.popup); свайп
 * рухає панель за пальцем, а після відпускання за порогом вона зникає з
 * того місця. З «Зменшити рух» — без анімації. Перехід за пунктом меню
 * закриває шухляду одразу (екран під нею вже змінюється).
 */
import { usePathname } from 'expo-router';
import React from 'react';
import { Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { OverlayScrim, OverlaySurface } from '@/components/ds/OverlaySurface';
import { ViewModeSwitch } from '@/components/layout-zones/ViewModeSwitch';
import { NavSidebar } from '@/components/shared/NavSidebar';
import { popupExitTiming, popupFadeIn } from '@/constants/motion';
import { useDS } from '@/hooks/use-ds';
import { useMotion } from '@/hooks/use-motion';
import { setZonePrefs, useActiveZone, useZonePrefs } from '@/hooks/use-zone-state';
import { useI18n } from '@/store/i18n';

/** Ширина шухляди: 300pt, але не більше 86% вікна (лишається видно край екрана). */
export function drawerWidthFor(windowWidth: number): number {
  return Math.min(300, Math.round(windowWidth * 0.86));
}

/** Свайп уліво далі цієї частки ширини (або швидкий змах) закриває шухляду. */
const CLOSE_FRACTION = 0.3;
const CLOSE_VELOCITY = 600;

function DrawerViewSwitch({ section }: { section: string }) {
  const prefs = useZonePrefs(section);
  return (
    <ViewModeSwitch
      value={prefs.view}
      onChange={v => setZonePrefs(section, { view: v })}
      fullWidth
      testID="drawer-view-switch"
    />
  );
}

export function SidebarDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { isDark } = useDS();
  const { tr } = useI18n();
  const motion = useMotion();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const activeZone = useActiveZone();
  const panelWidth = drawerWidthFor(width);

  const dx = useSharedValue(0);
  /** Зникнення всієї шухляди (затемнення + панель) перед onClose. */
  const fade = useSharedValue(1);
  const closingRef = React.useRef(false);
  React.useEffect(() => {
    if (visible) { dx.value = 0; fade.value = 1; closingRef.current = false; }
  }, [visible, dx, fade]);

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const finishClose = React.useCallback(() => onCloseRef.current(), []);
  /** Закрити зі зникненням (Motion.popup.exit); «Зменшити рух» — одразу. */
  const fadeClose = React.useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (motion.reduced) { finishClose(); return; }
    fade.value = withTiming(0, popupExitTiming, done => { if (done) runOnJS(finishClose)(); });
  }, [motion.reduced, fade, finishClose]);

  const swipe = Gesture.Pan()
    .activeOffsetX([-12, 9999])
    .failOffsetY([-12, 12])
    .onUpdate(e => { dx.value = Math.min(0, e.translationX); })
    .onEnd(e => {
      if (-e.translationX > panelWidth * CLOSE_FRACTION || e.velocityX < -CLOSE_VELOCITY) {
        runOnJS(fadeClose)();
      } else {
        dx.value = withTiming(0, { duration: motion.reduced ? 0 : 160 });
      }
    });
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={fadeClose}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents="box-none">
        <Animated.View entering={motion.entering(popupFadeIn())} style={StyleSheet.absoluteFill}>
          <OverlayScrim onPress={fadeClose} accessibilityLabel={tr.close} />
        </Animated.View>
        <GestureDetector gesture={swipe}>
          <Animated.View
            entering={motion.entering(popupFadeIn())}
            style={[st.panelWrap, { width: panelWidth }, panelStyle]}>
            <OverlaySurface
              accessibilityViewIsModal
              radius={24}
              style={[st.panel, { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}>
              <NavSidebar
                pathname={pathname}
                isDark={isDark}
                variant="drawer"
                width={panelWidth}
                onNavigate={onClose}
                onClose={fadeClose}
                footer={activeZone ? <View style={st.footer}><DrawerViewSwitch section={activeZone.section} /></View> : null}
              />
            </OverlaySurface>
          </Animated.View>
        </GestureDetector>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const st = StyleSheet.create({
  panelWrap: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  panel: { flex: 1 },
  footer: { paddingHorizontal: 4 },
});

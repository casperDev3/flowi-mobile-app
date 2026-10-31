/**
 * components/time/ActiveTimersBar.tsx — глобальна панель активних таймерів
 * на телефоні (як міні-плеєр над панеллю табів).
 *
 * Навіщо: таймер, що йде, не має жити лише на тому екрані, де його запустили.
 * Зупинити його треба з будь-якої вкладки — і на будь-якому пристрої, бо
 * реєстр active_timers синхронізований (веб і планшет показують те саме).
 *
 * Поведінка (однакова з вебом і карткою сайдбара на планшеті):
 *   • 0 таймерів — панелі немає (і відступ таб-бару її не враховує);
 *   • 1 таймер — назва + годинник + ■ стоп; тап по назві відкриває Трекер часу;
 *   • N > 1 — «N таймери» + годинник найстарішого; тап розгортає аркуш зі
 *     списком і стопом для кожного, а під ним в один рядок — «Трекер часу» і
 *     «Зосередження».
 *
 * Стоїть абсолютним шаром у (tabs)/_layout: Stack-екрани відкриваються поверх
 * вкладок і накривають панель разом із табами — там, де табів немає, немає й
 * її, як і обіцяє useTabBarInset().
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActiveTimerRow,
  StopTimerButton,
  TIMER_KIND_ICON,
  TimerProjectTag,
  timerKindLabel,
  useTimerStopper,
} from '@/components/time/ActiveTimerRow';
import { useTimerProjects } from '@/components/time/useTimerProjects';
import { FullscreenTimers } from '@/components/time/FullscreenTimers';
import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ACTIVE_TIMERS_BAR_HEIGHT, TAB_BAR_HEIGHT, activeTimersBarVisible } from '@/constants/nav';
import { fontFamily, radius, shadow } from '@/constants/theme';
import { getScreenColors } from '@/constants/tokens';
import { dsTokens } from '@/hooks/use-ds';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { useTimerContext } from '@/store/timer-context';
import { primaryTimer, timerKind, timersCountLabel } from '@/utils/activeTimersBar';
import { formatClock } from '@/utils/durationFormat';
import { haptic } from '@/utils/haptics';
import { elapsedSince } from '@/utils/taskTimer';
import { GlassBackdrop } from '@/components/ds';
import { useGlassStyles } from '@/components/finance/finPalette';

const BAR_BODY_HEIGHT = 44;

export function ActiveTimersBar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { isWide } = useResponsive();
  const { tr, lang } = useI18n();
  const { activeTimers } = useTimerContext();
  const { busy, stop } = useTimerStopper();
  const projectOf = useTimerProjects(activeTimers);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const focusDelay = useRef<ReturnType<typeof setTimeout> | null>(null);

  const c = useMemo(() => getScreenColors('time', isDark), [isDark]);
  const t = dsTokens(isDark);
  const gs = useGlassStyles();
  const visible = activeTimersBarVisible(isWide, activeTimers.length);
  const count = activeTimers.length;
  const primary = primaryTimer(activeTimers);

  // Останній таймер зупинили (тут, на іншому пристрої чи з деталі) — аркуш
  // закривається сам, а не лишається порожнім вікном.
  useEffect(() => {
    if (!visible) setSheetOpen(false);
  }, [visible]);

  useEffect(() => () => {
    if (focusDelay.current) clearTimeout(focusDelay.current);
  }, []);

  // Режим живе поза панеллю: коли в ньому зупинили останній таймер, панель
  // зникає, а режим лишається відкритим у своєму порожньому стані.
  const focusLayer = <FullscreenTimers visible={focusOpen} onClose={() => setFocusOpen(false)} />;

  if (!visible || !primary) return focusOpen ? focusLayer : null;

  const single = count === 1;
  const primaryLabel = primary.label?.trim() || timerKindLabel(timerKind(primary), tr);
  const title = single ? primaryLabel : timersCountLabel(count, lang, tr);
  const rowColors = { text: c.text, sub: c.sub, border: c.border, accent: c.accent };

  const onBodyPress = () => {
    haptic.light();
    if (single) router.push('/(tabs)/time' as never);
    else setSheetOpen(true);
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[
          st.wrap,
          {
            bottom: TAB_BAR_HEIGHT,
            height: ACTIVE_TIMERS_BAR_HEIGHT,
            left: insets.left + 10,
            right: insets.right + 10,
          },
        ]}>
        {/* DS v2: суцільна піднята поверхня замість блюру; тінь — лише м'яка popover. */}
        <View
          style={[
            st.bar,
            { ...gs.strong },
            shadow[isDark ? 'dark' : 'light'].popover,
          ]}>
          <Pressable
            onPress={onBodyPress}
            accessibilityRole="button"
            accessibilityLabel={single ? `${tr.navTimeTracker}: ${primaryLabel}` : tr.activeTimersExpandA11y}
            style={st.body}>
            <View style={[st.icon, { ...gs.subtle }]}>
              <IconSymbol name={single ? TIMER_KIND_ICON[timerKind(primary)] : 'timer'} size={15} color={c.text} />
            </View>
            <Text numberOfLines={1} style={[st.title, { color: c.text }]}>{title}</Text>
            {single && (
              <TimerProjectTag project={projectOf(primary)} tr={tr} color={c.sub} style={st.tag} />
            )}
            <ElapsedClock
              running
              seconds={now => elapsedSince(primary.startedAt, now)}
              format={formatClock}
              style={[st.clock, { color: c.text }]}
            />
            {!single && <IconSymbol name="chevron.up" size={14} color={c.sub} />}
          </Pressable>
          {single && (
            <StopTimerButton
              busy={busy.has(primary.id)}
              onPress={() => stop(primary.id)}
              label={`${tr.stopTimerAction}: ${primaryLabel}`}
            />
          )}
        </View>
      </View>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={[st.backdrop, { backgroundColor: t.surface.overlay }]} onPress={() => setSheetOpen(false)} accessibilityRole="button" accessibilityLabel={tr.close} />
        <View style={[st.sheet, { ...gs.strong, paddingBottom: insets.bottom + 16 }]}>
          <GlassBackdrop style={{ borderRadius: 24, overflow: 'hidden' }} />
          <View style={[st.handle, { backgroundColor: t.text.muted }]} />
          <View style={st.head}>
            <Text style={[st.sheetTitle, { color: c.text }]}>
              {tr.activeTimers} · {count}
            </Text>
            <Pressable onPress={() => setSheetOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr.close}>
              <IconSymbol name="xmark" size={16} color={c.sub} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {activeTimers.map(timer => (
              <ActiveTimerRow
                key={timer.id}
                timer={timer}
                project={projectOf(timer)}
                busy={busy.has(timer.id)}
                onStop={() => stop(timer.id)}
                colors={rowColors}
                tr={tr}
              />
            ))}
          </ScrollView>
          <View style={st.actions}>
            <Pressable
              onPress={() => { setSheetOpen(false); router.push('/(tabs)/time' as never); }}
              accessibilityRole="button"
              style={[st.action, { ...gs.subtle }]}>
              <IconSymbol name="timer" size={15} color={t.action.secondaryText} />
              <Text numberOfLines={1} style={[st.actionText, { color: t.action.secondaryText }]}>{tr.navTimeTracker}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                haptic.light();
                setSheetOpen(false);
                // iOS не показує другу модалку, поки перша ще закривається.
                focusDelay.current = setTimeout(() => setFocusOpen(true), 300);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${tr.focusMode}, ${tr.activeTimers}: ${count}`}
              style={[st.action, { backgroundColor: t.action.primary }]}>
              <IconSymbol name="viewfinder" size={15} color={t.text.onAction} />
              <Text numberOfLines={1} style={[st.actionText, { color: t.text.onAction }]}>{tr.focusMode}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {focusLayer}
    </>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', justifyContent: 'flex-end', paddingBottom: ACTIVE_TIMERS_BAR_HEIGHT - BAR_BODY_HEIGHT - 2 },
  bar: {
    height: BAR_BODY_HEIGHT,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 6,
    gap: 8,
  },
  body:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: '100%', minWidth: 0 },
  icon:  { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 14, fontFamily: fontFamily.semibold },
  clock: { fontSize: 15, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] },
  // Назва таймера головніша за проєкт: мітка стискається першою.
  tag:   { flexShrink: 1, maxWidth: '38%' },

  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    maxHeight: '70%',
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle:     { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  head:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  actions:    { flexDirection: 'row', gap: 8, marginTop: 10 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  actionText: { fontSize: 14, fontFamily: fontFamily.semibold, flexShrink: 1 },
});

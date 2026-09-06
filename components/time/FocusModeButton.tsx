/**
 * components/time/FocusModeButton.tsx
 *
 * Вхід у режим зосередження — плаваюча кнопка, яка живе в кореневому лейауті
 * й тому доступна з будь-якого екрана ШИРОКОГО пристрою. На телефоні її немає:
 * там вона забирала кут у власної дії екрана, і вхід лишився в шапці вкладки
 * «Час» (див. focusButtonVisible).
 *
 * Іконка — viewfinder, а не стрілки «на весь екран»: стрілки обіцяють
 * «збільшити те, що бачу», а кнопка відкриває інше — зведення таймерів, що
 * йдуть просто зараз. Рамка прицілу читається як «зосередитись», тобто як
 * назва режиму. Іконку таймера взяти не можна: нею в навігації позначений
 * розділ «Трекер часу», і два різні пункти з однією іконкою читались би як
 * той самий.
 *
 * Чому не в шапці: Stack-екрани в цьому застосунку мають headerShown: false і
 * малюють власні ScreenHeader. Спільної шапки не існує, тож «увімкнути
 * звідусіль» у шапці означало б двадцять копій однієї кнопки.
 *
 * Кнопка видима завжди, а не лише коли таймер іде: режим має порожній стан і
 * служить місцем, звідки таймер ЗАПУСКАЮТЬ, а не тільки дивляться на вже
 * запущений. Кількість активних таймерів показує бейдж.
 *
 * Лічильник читається з TimerContext — того самого стору, з якого його бере
 * вкладка «Час». Другий прохід по 'active_timers' дав би друге джерело
 * істини, і число на бейджі розійшлося б із кількістю годинників у сітці.
 */
import { usePathname } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/shared/PressableScale';
import { FullscreenTimers } from '@/components/time/FullscreenTimers';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TAB_BAR_HEIGHT } from '@/constants/nav';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { useTimerContext } from '@/store/timer-context';
import { focusBadgeLabel, focusButtonOffsets, focusButtonVisible } from '@/utils/focusMode';
import { haptic } from '@/utils/haptics';

export function FocusModeButton() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const { activeTimers } = useTimerContext();
  const [open, setOpen] = useState(false);

  const visible = focusButtonVisible(pathname, isWide);

  // Пішли на екран входу (вихід з акаунта, редірект гостя) — режим закриваємо.
  // Інакше він лишився б відкритим у стані й вигулькнув би після повернення.
  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  const c = useMemo(() => getScreenColors('time', isDark), [isDark]);
  const offsets = useMemo(
    () => focusButtonOffsets({
      pathname,
      isWide,
      insets: { bottom: insets.bottom, right: insets.right },
      tabBarHeight: TAB_BAR_HEIGHT,
    }),
    [pathname, isWide, insets.bottom, insets.right],
  );

  const badge = focusBadgeLabel(activeTimers.length);

  if (!visible) return null;

  return (
    <>
      <PressableScale
        scaleTo={0.92}
        onPress={() => { haptic.light(); setOpen(true); }}
        accessibilityRole="button"
        // Рядки — лише зі словника: мова змінюється в рантаймі.
        accessibilityLabel={
          badge ? `${tr.fullscreenTimers}, ${tr.activeTimers}: ${activeTimers.length}`
                : `${tr.fullscreenTimers}, ${tr.noActiveTimers}`
        }
        style={[
          s.fab,
          {
            bottom: offsets.bottom,
            right: offsets.right,
            backgroundColor: isDark ? 'rgba(18,21,37,0.92)' : 'rgba(255,255,255,0.94)',
            borderColor: c.accent,
          },
        ]}>
        <IconSymbol name="viewfinder" size={20} color={c.accent} />
        {badge && (
          <View style={[s.badge, { backgroundColor: c.accent, borderColor: c.bg1 }]}>
            <Text style={s.badgeText} numberOfLines={1}>{badge}</Text>
          </View>
        )}
      </PressableScale>

      {/* Сітка малює себе сама, читаючи таймери зі стору. */}
      <FullscreenTimers visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    // Лівий кут, бо правий нижній зайнятий власними FAB екранів
    // (Завдання, Нотатки, Наради, Банки…) — див. focusButtonOffsets.
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Нижче UndoToast (9999): тост живе секунди, кнопка — завжди.
    zIndex: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});

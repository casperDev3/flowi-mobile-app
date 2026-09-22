/**
 * components/health/HealthNotices.tsx
 *
 * Плашки станів, яких на екранах здоровʼя не було взагалі:
 *  · ERR-01 — «дані не прочитались» окремо від «порожньо», з кнопкою повтору.
 *    Без неї екран малював звичайний порожній стан, а ефект-дзеркало одразу
 *    писало цей порожній масив назад у сховище. Тепер запис у такий ключ
 *    блокує сам шар сховища (StorageWriteBlockedError), а екран мусить
 *    показати помилку й дати «Повторити» (retryStorageRead).
 *  · ERR-10 — «нагадування НЕ увімкнено», коли планувальник повернув відмову
 *    (глобальний тумблер вимкнено або ОС не дала дозволу). До цього застосунок
 *    стверджував протилежне: перемикач ставав ON, картка показувала годину, а
 *    в ОС не було заплановано нічого.
 *
 * Про рядки. Ключів під ці два стани в `store/translations.ts` немає, а сам
 * словник — чужа зона цього проходу (паралельно його правлять). Щоб не лишати
 * англомовному користувачеві українську плашку, тексти лежать тут двомовною
 * табличкою за `lang`. Це тимчасовий прихисток: рядки треба перенести в
 * `Translations` і замінити на `tr.*` (винесено в needsOtherZone).
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { HKAccess } from '@/store/healthkit';
import type { Lang } from '@/store/translations';
import type { HealthColors } from '@/utils/healthTheme';

const TEXT = {
  uk: {
    loadFailed: 'Дані не прочитались',
    loadFailedSub: 'Сховище повернуло помилку. Це НЕ порожній список — щоб не втратити записи, зміни поки не зберігаються.',
    retry: 'Повторити',
    reminderOff: 'Нагадування не увімкнено',
    reminderOffSub: 'Система не дала дозволу на сповіщення (або їх вимкнено в налаштуваннях застосунку). Запис збережено без нагадування.',
    openSettings: 'Налаштування',
    hkSyncing: 'Синхронізується з HealthKit',
    hkManual: 'Додавайте активність вручну або через тренування',
    hkDenied: 'Немає доступу до HealthKit — показані числа введені вручну',
    hkGrant: 'Надати доступ',
    hkFailed: 'HealthKit не відповів: це не «нуль», а відсутність даних',
    hkRetry: 'Повторити',
    appleHealth: 'Apple Health',
  },
  en: {
    loadFailed: 'Could not read your data',
    loadFailedSub: 'Storage returned an error. This is NOT an empty list — changes are not being saved so nothing gets overwritten.',
    retry: 'Try again',
    reminderOff: 'Reminder is not set',
    reminderOffSub: 'The system did not grant notification permission (or notifications are off in app settings). The entry was saved without a reminder.',
    openSettings: 'Settings',
    hkSyncing: 'Syncing with HealthKit',
    hkManual: 'Add activity manually or via workouts',
    hkDenied: 'No HealthKit access — the numbers below are your manual entries',
    hkGrant: 'Grant access',
    hkFailed: 'HealthKit did not answer: this is missing data, not a zero',
    hkRetry: 'Try again',
    appleHealth: 'Apple Health',
  },
} as const;

export function healthNoticeText(lang: Lang) {
  return TEXT[lang] ?? TEXT.uk;
}

const WARN = '#F59E0B';
const ERR = '#EF4444';

/** ERR-01: «не прочиталось» ≠ «порожньо». */
export function LoadErrorNotice({ lang, c, isDark, onRetry }: {
  lang: Lang;
  c: HealthColors;
  isDark: boolean;
  onRetry: () => void;
}) {
  const t = healthNoticeText(lang);
  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
      style={{ borderRadius: 16, borderWidth: 1, borderColor: ERR + '55', overflow: 'hidden', padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconSymbol name="exclamationmark.triangle.fill" size={16} color={ERR} />
        <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', marginLeft: 8, flex: 1 }}>{t.loadFailed}</Text>
      </View>
      <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{t.loadFailedSub}</Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t.retry}
        style={{ marginTop: 12, alignSelf: 'flex-start', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: ERR }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t.retry}</Text>
      </TouchableOpacity>
    </BlurView>
  );
}

/** ERR-10: планувальник відмовив — кажемо це вголос, а не мовчимо. */
export function ReminderBlockedNotice({ lang, c, isDark, onOpenSettings, onDismiss }: {
  lang: Lang;
  c: HealthColors;
  isDark: boolean;
  onOpenSettings?: () => void;
  onDismiss?: () => void;
}) {
  const t = healthNoticeText(lang);
  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
      style={{ borderRadius: 16, borderWidth: 1, borderColor: WARN + '55', overflow: 'hidden', padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconSymbol name="bell.slash" size={16} color={WARN} />
        <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', marginLeft: 8, flex: 1 }}>{t.reminderOff}</Text>
        {onDismiss ? (
          <TouchableOpacity onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t.reminderOff}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol name="xmark" size={14} color={c.sub} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{t.reminderOffSub}</Text>
      {onOpenSettings ? (
        <TouchableOpacity
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel={t.openSettings}
          style={{ marginTop: 12, alignSelf: 'flex-start', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: WARN }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t.openSettings}</Text>
        </TouchableOpacity>
      ) : null}
    </BlurView>
  );
}

/**
 * NAT-14. Екрани профілактики подані як `formSheet` (app/_layout.tsx:51-58) з
 * прозорим `contentStyle`. У formSheet корінь RN не отримує визначеної висоти,
 * тож `flex: 1` схлопується до висоти вмісту: на пристрої світла картка
 * обривалась на y≈450, а нижче крізь «аркуш» було видно хаб Здоровʼя з FAB і
 * таб-баром. Стеля detent-а — 0.92 висоти вікна; беремо її ж як minHeight,
 * і корінь заповнює аркуш незалежно від того, скільки в ньому вмісту.
 */
export const SHEET_SCREEN_DETENT = 0.92;

export function useSheetScreenMinHeight(): number {
  const { height } = useWindowDimensions();
  return Math.round(height * SHEET_SCREEN_DETENT);
}

/**
 * ERR-14. Підпис під показниками активності, що НЕ бреше.
 *
 * До цього екран перевіряв лише `h.hk.available` — тобто «модуль HealthKit є
 * у збірці» — і під нулями писав «Синхронізується з HealthKit». На пристрої з
 * ВІДМОВЛЕНИМ доступом це виглядало як факт: «Кроки 0», «≈ 0.0 км». Стану
 * «немає доступу» чи кнопки «надати дозвіл» не було ніде.
 */
export function healthKitStatusText(
  lang: Lang,
  hk: { available: boolean; access: HKAccess; failed: boolean },
): { text: string; action: 'grant' | 'retry' | null } {
  const t = healthNoticeText(lang);
  if (!hk.available || hk.access === 'unavailable') return { text: t.hkManual, action: null };
  if (hk.access === 'denied') return { text: t.hkDenied, action: 'grant' };
  if (hk.failed) return { text: t.hkFailed, action: 'retry' };
  return { text: t.hkSyncing, action: null };
}

export function HealthKitStatus({ lang, c, hk, onGrant, onRetry }: {
  lang: Lang;
  c: HealthColors;
  hk: { available: boolean; access: HKAccess; failed: boolean };
  onGrant: () => void;
  onRetry: () => void;
}) {
  const t = healthNoticeText(lang);
  const { text, action } = healthKitStatusText(lang, hk);
  return (
    <View>
      <Text style={{ color: action ? WARN : c.sub, fontSize: 11, marginTop: 6, fontWeight: action ? '700' : '400' }}>{text}</Text>
      {action ? (
        <TouchableOpacity
          onPress={action === 'grant' ? onGrant : onRetry}
          accessibilityRole="button"
          accessibilityLabel={action === 'grant' ? t.hkGrant : t.hkRetry}
          style={{ marginTop: 8, alignSelf: 'flex-start', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: WARN }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{action === 'grant' ? t.hkGrant : t.hkRetry}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

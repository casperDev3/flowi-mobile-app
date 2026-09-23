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
 * Про рядки. Вони живуть у `store/translations.ts` — двомовної таблички тут
 * більше немає. Плашки беруть мову прямо зі словника за пропом `lang`, а не
 * через `tr`: їх малює десяток екранів, і всі вони передають саме `lang`.
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { HKAccess } from '@/store/healthkit';
import { allTranslations, type Lang } from '@/store/translations';
import type { HealthColors } from '@/utils/healthTheme';

const WARN = '#F59E0B';
const ERR = '#EF4444';

/** ERR-01: «не прочиталось» ≠ «порожньо». */
export function LoadErrorNotice({ lang, c, isDark, onRetry }: {
  lang: Lang;
  c: HealthColors;
  isDark: boolean;
  onRetry: () => void;
}) {
  const t = allTranslations[lang] ?? allTranslations.uk;
  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
      style={{ borderRadius: 16, borderWidth: 1, borderColor: ERR + '55', overflow: 'hidden', padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconSymbol name="exclamationmark.triangle.fill" size={16} color={ERR} />
        <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', marginLeft: 8, flex: 1 }}>{t.loadErrorTitle}</Text>
      </View>
      <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{t.loadErrorBody}</Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t.loadErrorRetry}
        style={{ marginTop: 12, alignSelf: 'flex-start', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: ERR }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t.loadErrorRetry}</Text>
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
  const t = allTranslations[lang] ?? allTranslations.uk;
  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
      style={{ borderRadius: 16, borderWidth: 1, borderColor: WARN + '55', overflow: 'hidden', padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconSymbol name="bell.slash" size={16} color={WARN} />
        <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', marginLeft: 8, flex: 1 }}>{t.healthReminderOff}</Text>
        {onDismiss ? (
          <TouchableOpacity onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t.healthReminderOff}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol name="xmark" size={14} color={c.sub} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{t.healthReminderOffSub}</Text>
      {onOpenSettings ? (
        <TouchableOpacity
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel={t.healthNoticeSettings}
          style={{ marginTop: 12, alignSelf: 'flex-start', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: WARN }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t.healthNoticeSettings}</Text>
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
  hk: { available: boolean; access: HKAccess; failed: boolean; label?: string | null },
): { text: string; action: 'grant' | 'retry' | null } {
  const t = allTranslations[lang] ?? allTranslations.uk;
  // Назва джерела — з хука («Apple Health» / «Health Connect»): на Android
  // підпис «Синхронізується з HealthKit» був би неправдою.
  const label = hk.label ?? null;
  const withSource = (tpl: string) => tpl.replace('{source}', label ?? '');
  if (!hk.available || hk.access === 'unavailable') return { text: t.hkManual, action: null };
  if (hk.access === 'denied') return { text: label ? withSource(t.hautoDenied) : t.hkDenied, action: 'grant' };
  if (hk.failed) return { text: label ? withSource(t.hautoFailed) : t.hkFailed, action: 'retry' };
  return { text: label ? withSource(t.hautoSyncing) : t.hkSyncing, action: null };
}

export function HealthKitStatus({ lang, c, hk, onGrant, onRetry }: {
  lang: Lang;
  c: HealthColors;
  hk: { available: boolean; access: HKAccess; failed: boolean; label?: string | null };
  onGrant: () => void;
  onRetry: () => void;
}) {
  const t = allTranslations[lang] ?? allTranslations.uk;
  const { text, action } = healthKitStatusText(lang, hk);
  return (
    <View>
      <Text style={{ color: action ? WARN : c.sub, fontSize: 11, marginTop: 6, fontWeight: action ? '700' : '400' }}>{text}</Text>
      {action ? (
        <TouchableOpacity
          onPress={action === 'grant' ? onGrant : onRetry}
          accessibilityRole="button"
          accessibilityLabel={action === 'grant' ? t.hkGrant : t.loadErrorRetry}
          style={{ marginTop: 8, alignSelf: 'flex-start', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: WARN }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{action === 'grant' ? t.hkGrant : t.loadErrorRetry}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

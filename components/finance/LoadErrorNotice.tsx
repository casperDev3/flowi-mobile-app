/**
 * components/finance/LoadErrorNotice.tsx — «дані не прочитались» ≠ «порожньо».
 *
 * ERR-01. Екрани фінансів читали сховище через `loadData(key, [])`, який на
 * будь-якій помилці мовчки віддавав fallback. Далі спрацьовував ефект-дзеркало
 * (`if (initialized) saveSynced(key, state)`) і записував цей порожній масив
 * назад — операції, рахунки й ліміти зникали не через збій читання, а через
 * автозапис одразу після нього.
 *
 * Тепер шар сховища розрізняє «ключа немає» і «не вдалося» (`loadDataResult`) і
 * блокує запис у провалений ключ (`StorageWriteBlockedError`). Екранам лишилось
 * не вдавати порожній стан: показати цю плашку й дати «Повторити»
 * (`retryStorageRead`), бо без повтору ключ лишається заблокованим на запис до
 * перезапуску застосунку — і це свідомо.
 *
 * Про рядки. Ключів під цей стан у `store/translations.ts` немає, а сам словник
 * у цьому проході — чужа зона (його правлять паралельно). Щоб англомовний
 * користувач не отримав українську плашку, тексти лежать тут двомовною
 * табличкою за `lang`; перенести їх у `Translations` — окрема задача
 * (винесено в needsOtherZone).
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Lang } from '@/store/translations';

const ERR = '#EF4444';

const TEXT = {
  uk: {
    title: 'Дані не прочитались',
    sub: 'Сховище повернуло помилку. Це НЕ порожній список — щоб не втратити записи, зміни поки не зберігаються.',
    retry: 'Повторити',
  },
  en: {
    title: 'Could not read your data',
    sub: 'Storage returned an error. This is NOT an empty list — changes are not being saved so nothing gets overwritten.',
    retry: 'Try again',
  },
} as const;

export function loadErrorText(lang: Lang) {
  return TEXT[lang] ?? TEXT.uk;
}

export function LoadErrorNotice({ lang, isDark, text, sub, onRetry, style }: {
  lang: Lang;
  isDark: boolean;
  /** Колір основного тексту екрана. */
  text: string;
  /** Колір приглушеного тексту екрана. */
  sub: string;
  onRetry: () => void;
  style?: object;
}) {
  const t = loadErrorText(lang);
  return (
    <BlurView
      intensity={isDark ? 22 : 42}
      tint={isDark ? 'dark' : 'light'}
      style={[{
        borderRadius: 16, borderWidth: 1, borderColor: ERR + '55',
        overflow: 'hidden', padding: 14, marginBottom: 12,
      }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconSymbol name="exclamationmark.triangle.fill" size={16} color={ERR} />
        <Text style={{ color: text, fontSize: 14, fontWeight: '700', flex: 1 }}>{t.title}</Text>
      </View>
      <Text style={{ color: sub, fontSize: 12, lineHeight: 17, marginTop: 6 }}>{t.sub}</Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t.retry}
        style={{
          alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 14, paddingVertical: 8,
          borderRadius: 10, backgroundColor: ERR + '1A', borderWidth: 1, borderColor: ERR + '55',
        }}>
        <Text style={{ color: ERR, fontSize: 13, fontWeight: '700' }}>{t.retry}</Text>
      </TouchableOpacity>
    </BlurView>
  );
}

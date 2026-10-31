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
 * Про рядки. Вони живуть у `store/translations.ts` (`loadErrorTitle`,
 * `loadErrorBody`, `loadErrorRetry`) — двомовної таблички тут більше немає.
 * Плашка бере мову прямо зі словника за пропом `lang`, а не через `tr`: її
 * малюють десяток екранів, і всі вони вже передають саме `lang`.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, type as dsType } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { allTranslations, type Lang } from '@/store/translations';
import { useGlassStyles } from '@/components/finance/finPalette';


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
  const t = allTranslations[lang] ?? allTranslations.uk;
  const ds = dsTokens(isDark);
  const gs = useGlassStyles();
  return (
    // Алерт DS v2: біла картка, корал лише гліфом; повтор — pill action.primary.
    <View style={[{
        borderRadius: radius.cardCompact, ...gs.card,
        padding: space.cardPaddingCompact, marginBottom: 12,
      }, shadow[isDark ? 'dark' : 'light'].card, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconSymbol name="exclamationmark.triangle.fill" size={16} color={ds.accent.coral} />
        <Text style={{ ...dsType.h2, color: text, flex: 1 }}>{t.loadErrorTitle}</Text>
      </View>
      <Text style={{ ...dsType.body, color: sub, marginTop: 6 }}>{t.loadErrorBody}</Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t.loadErrorRetry}
        style={{
          alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 20, minHeight: 44, justifyContent: 'center',
          borderRadius: radius.pill, backgroundColor: ds.action.primary,
        }}>
        <Text style={{ color: ds.text.onAction, fontSize: 14, fontFamily: fontFamily.semibold }}>{t.loadErrorRetry}</Text>
      </TouchableOpacity>
    </View>
  );
}

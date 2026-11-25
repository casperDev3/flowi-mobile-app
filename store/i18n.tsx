import { getLocales } from 'expo-localization';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { loadDataResult, saveData } from '@/store/storage';
import { Lang, Translations, allTranslations } from '@/store/translations';
import { langFromDeviceLanguages, resolveInitialLang } from '@/utils/deviceLanguage';

const STORAGE_KEY = 'lang_option_v1';
/** Є, щойно людина підключала workspace — ознака наявного встановлення. */
const EXISTING_INSTALL_KEY = 'workspace_config';

function deviceLanguageCodes(): string[] {
  try {
    return getLocales().map(locale => locale.languageCode ?? '').filter(Boolean);
  } catch (e) {
    if (__DEV__) console.warn('[i18n] getLocales failed:', e);
    return [];
  }
}

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  tr: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'uk',
  setLang: () => {},
  tr: allTranslations.uk,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Перший кадр — уже мовою пристрою, щоб нове встановлення не блимало
  // українською до читання сховища.
  const [lang, setLangState] = useState<Lang>(() => langFromDeviceLanguages(deviceLanguageCodes()));

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [saved, existing] = await Promise.all([
        loadDataResult<unknown>(STORAGE_KEY, null),
        loadDataResult<unknown>(EXISTING_INSTALL_KEY, null),
      ]);
      if (!mounted) return;
      if (!saved.ok) {
        // Не прочиталось ≠ не обрано: лишаємо українську, як і раніше, і
        // нічого не пишемо поверх.
        setLangState('uk');
        return;
      }
      const next = resolveInitialLang({
        saved: saved.value,
        hasExistingInstall: !existing.ok || existing.found,
        deviceLanguageCodes: deviceLanguageCodes(),
      });
      setLangState(next);
      // Фіксуємо вибір: push, нагадування, віджет і годинник читають той самий
      // ключ із запасним 'uk' і мусять бачити ту саму мову, що й інтерфейс.
      if (!saved.found) {
        saveData(STORAGE_KEY, next).catch(e => {
          if (__DEV__) console.warn('[i18n] save lang failed:', e);
        });
      }
    })();
    return () => { mounted = false; };
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    saveData(STORAGE_KEY, next);
  };

  const value = useMemo(
    () => ({ lang, setLang, tr: allTranslations[lang] }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

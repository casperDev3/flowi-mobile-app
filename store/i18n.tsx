import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { loadData, saveData } from '@/store/storage';
import { Lang, Translations, allTranslations } from '@/store/translations';

const STORAGE_KEY = 'lang_option_v1';

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
  const [lang, setLangState] = useState<Lang>('uk');

  useEffect(() => {
    let mounted = true;
    loadData<Lang>(STORAGE_KEY, 'uk').then(saved => {
      if (!mounted) return;
      if (saved === 'uk' || saved === 'en') setLangState(saved);
    });
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

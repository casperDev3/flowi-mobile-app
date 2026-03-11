import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { loadData, saveData } from '@/store/storage';

export type ThemeOption = 'system' | 'light' | 'dark';

type ColorScheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeOption;
  setTheme: (theme: ThemeOption) => void;
  colorScheme: ColorScheme;
  isDark: boolean;
}

const STORAGE_KEY = 'theme_option_v1';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  colorScheme: 'light',
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = (useSystemColorScheme() ?? 'light') as ColorScheme;
  const [theme, setThemeState] = useState<ThemeOption>('system');

  useEffect(() => {
    let mounted = true;
    loadData<ThemeOption>(STORAGE_KEY, 'system').then(saved => {
      if (!mounted) return;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setTheme = (next: ThemeOption) => {
    setThemeState(next);
    saveData(STORAGE_KEY, next);
  };

  const colorScheme: ColorScheme = theme === 'system' ? systemScheme : theme;
  const value = useMemo(
    () => ({
      theme,
      setTheme,
      colorScheme,
      isDark: colorScheme === 'dark',
    }),
    [theme, colorScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

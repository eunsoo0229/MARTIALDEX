import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'martialdex:theme';

function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = pref;
  }
}

function readInitial(): ThemePreference {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>(() => readInitial());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((pref: ThemePreference) => {
    window.localStorage.setItem(STORAGE_KEY, pref);
    setThemeState(pref);
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');
  }, [theme, setTheme]);

  return { theme, setTheme, cycleTheme };
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type ThemeColors, type ThemeMode } from '../theme/colors';

/** Как на сайте: frontend/src/components/SettingsPage.jsx */
export const THEME_STORAGE_KEY = 'tep-portal-theme';

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  ready: boolean;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((v) => {
      if (cancelled) return;
      if (v === 'dark' || v === 'light') setModeState(v);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((m: ThemeMode) => {
    setModeState(m);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, m);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setTheme]);

  const colors = useMemo(() => (mode === 'dark' ? darkColors : lightColors), [mode]);

  const value = useMemo(
    () => ({ mode, colors, ready, setTheme, toggleTheme }),
    [mode, colors, ready, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

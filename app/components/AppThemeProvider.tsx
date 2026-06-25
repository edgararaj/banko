'use client'

import * as React from 'react';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { useServerInsertedHTML } from 'next/navigation';

type PaletteMode = 'light' | 'dark';

type ColorModeContextValue = {
  mode: PaletteMode;
  toggleMode: () => void;
};

const ColorModeContext = React.createContext<ColorModeContextValue | null>(null);

function createEmotionCache() {
  return createCache({ key: 'mui', prepend: true });
}

export function useAppColorMode() {
  const context = React.useContext(ColorModeContext);
  if (!context) {
    throw new Error('useAppColorMode must be used within AppThemeProvider');
  }
  return context;
}

function getInitialMode(): PaletteMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem('theme-mode');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<PaletteMode>(getInitialMode);
  const [cache] = React.useState(createEmotionCache);

  const toggleMode = React.useCallback(() => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem('theme-mode', mode);
    document.documentElement.style.colorScheme = mode;
    // Keep CSS variables in sync so components using global CSS update immediately
    if (mode === 'dark') {
      document.documentElement.style.setProperty('--background', '#070d1a');
      document.documentElement.style.setProperty('--foreground', '#e5edf7');
      document.documentElement.style.setProperty('--muted', '#94a3b8');
      document.documentElement.style.setProperty('--accent', '#60a5fa');
    } else {
      document.documentElement.style.setProperty('--background', '#f4f7fb');
      document.documentElement.style.setProperty('--foreground', '#0f172a');
      document.documentElement.style.setProperty('--muted', '#64748b');
      document.documentElement.style.setProperty('--accent', '#2563eb');
    }
  }, [mode]);

  useServerInsertedHTML(() => {
    const inserted = Object.keys((cache as { inserted: Record<string, boolean> }).inserted).map((name) => (
      <style
        key={name}
        data-emotion={`${cache.key} ${name}`}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: (cache as { inserted: Record<string, string> }).inserted[name] }}
      />
    ));
    (cache as { inserted: Record<string, boolean> }).inserted = {};
    return <>{inserted}</>;
  });

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          ...(mode === 'dark'
            ? {
                background: {
                  default: '#070d1a',
                  paper: '#0e1628',
                },
              }
            : {
                background: {
                  default: '#f4f7fb',
                  paper: '#ffffff',
                },
              }),
        },
        shape: {
          borderRadius: 12,
        },
        typography: {
          fontFamily: 'var(--font-geist-sans), "Segoe UI", Helvetica, Arial, sans-serif',
        },
      }),
    [mode]
  );

  return (
    <ColorModeContext.Provider value={{ mode, toggleMode }}>
      <CacheProvider value={cache}>
        <ThemeProvider theme={theme}>
          <CssBaseline enableColorScheme />
          {children}
        </ThemeProvider>
      </CacheProvider>
    </ColorModeContext.Provider>
  );
}

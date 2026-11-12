import { useState, useEffect } from 'react';
import { ReaderSettings, ReaderPreset } from '../types';

const STORAGE_KEY = 'mnema_reader_settings';

export const READER_PRESETS: Record<ReaderPreset, Omit<ReaderSettings, 'preset'>> = {
  paperback: {
    theme: 'sepia',
    fontFamily: 'serif',
    fontSize: 18,
    contentWidth: 680,
    lineHeight: 1.7,
  },
  editorial: {
    theme: 'light',
    fontFamily: 'serif',
    fontSize: 19,
    contentWidth: 720,
    lineHeight: 1.75,
  },
  modern: {
    theme: 'dark',
    fontFamily: 'sans',
    fontSize: 16,
    contentWidth: 700,
    lineHeight: 1.6,
  },
  focus: {
    theme: 'dark',
    fontFamily: 'sans',
    fontSize: 18,
    contentWidth: 600,
    lineHeight: 1.8,
  },
};

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'light',
  fontFamily: 'serif',
  fontSize: 18,
  contentWidth: 680,
  lineHeight: 1.8,
  preset: 'editorial',
};

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}

    // Apply dark / sepia class to html document
    const root = document.documentElement;
    root.classList.remove('dark', 'sepia');
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else if (settings.theme === 'sepia') {
      root.classList.add('sepia');
    }
  }, [settings]);

  const updateSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: ReaderPreset) => {
    const config = READER_PRESETS[preset];
    setSettings((prev) => ({
      ...prev,
      ...config,
      preset,
    }));
  };

  return { settings, updateSetting, setSettings, applyPreset };
}

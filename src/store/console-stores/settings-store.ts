import { create } from "zustand";

type ThemePreference = "light" | "dark" | "system";

const THEME_KEY = "agent-office-theme";
const LANG_KEY = "agent-office-lang";

function readLocal(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

interface ConsoleSettingsState {
  theme: ThemePreference;
  language: string;

  setTheme: (theme: ThemePreference) => void;
  setLanguage: (lang: string) => void;
}

export const useConsoleSettingsStore = create<ConsoleSettingsState>((set) => ({
  theme: readLocal(THEME_KEY, "system") as ThemePreference,
  language: readLocal(LANG_KEY, "ko"),

  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },

  setLanguage: (language) => {
    localStorage.setItem(LANG_KEY, language);
    set({ language });
  },
}));

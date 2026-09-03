import { createContext, useContext } from 'react';

export const THEMES = ['brutalist', 'cozy'];
export const THEME_STORAGE_KEY = 'curling_theme';

export const ThemeContext = createContext({ theme: 'brutalist', toggleTheme: () => {} });

export function useTheme() {
    return useContext(ThemeContext);
}

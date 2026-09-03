import { useState, useEffect } from 'react';
import { ThemeContext, THEMES, THEME_STORAGE_KEY } from './ThemeContext';

function readStoredTheme() {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return THEMES.includes(stored) ? stored : THEMES[0];
    } catch {
        return THEMES[0];
    }
}

export function ThemeProvider({ children, className }) {
    const [theme, setTheme] = useState(readStoredTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // Storage can be unavailable; the theme still applies for this session.
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'brutalist' ? 'cozy' : 'brutalist'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            <div className={className} style={{ display: 'contents' }}>
                {children}
            </div>
        </ThemeContext.Provider>
    );
}

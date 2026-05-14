import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext({ theme: 'brutalist', toggleTheme: () => {} });

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState('brutalist');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'brutalist' ? 'cozy' : 'brutalist');
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}

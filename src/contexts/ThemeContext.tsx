import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('fibertech-theme');
        return (saved as Theme) || 'light';
    });

    useEffect(() => {
        const html = window.document.documentElement;
        const body = window.document.body;

        // Remove existing classes
        html.classList.remove('light', 'dark');
        body.classList.remove('light', 'dark');

        // Add current theme class
        html.classList.add(theme);
        body.classList.add(theme);

        // Update color scheme for browser elements (scrollbars, etc)
        html.style.colorScheme = theme;
        body.style.colorScheme = theme;

        // Set data-theme just for good measure (some libraries use this)
        html.setAttribute('data-theme', theme);

        localStorage.setItem('fibertech-theme', theme);

        // Debugging (not visible to user but keeps context alive)
        console.log(`[FiberTech] Theme changed to: ${theme}`);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

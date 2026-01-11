import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(() => {
        // Check local storage first
        const saved = localStorage.getItem('theme');
        if (saved === 'dark' || saved === 'light') return saved;

        // Check system preference
        if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }
        return 'dark';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');

        // We use data-theme for css variables, and class for Tailwind compatibility if needed (though we are moving to vanilla)
        // or simply consistency.
        root.setAttribute('data-theme', theme);

        // If we want to support both class and data attribute
        if (theme === 'light') {
            root.classList.add('light');
        } else {
            root.classList.add('dark');
        }

        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return { theme, toggleTheme };
}

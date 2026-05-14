import { useTheme } from './ThemeProvider';
import { Palette } from 'lucide-react';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isCozy = theme === 'cozy';

    return (
        <div className="theme-toggle-container">
            <button
                className="theme-toggle-btn"
                onClick={toggleTheme}
                title={isCozy ? 'Switch to Brutalist theme' : 'Switch to Cozy theme'}
            >
                <Palette size={18} />
            </button>
            <div className="theme-toggle-popup">
                {isCozy ? 'Cuteness Overload' : 'CurlingMania'}
            </div>
        </div>
    );
}

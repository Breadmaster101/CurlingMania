import { useState, useEffect } from 'react';

export function useShiftKey() {
    const [shiftHeld, setShiftHeld] = useState(false);

    useEffect(() => {
        const downHandler = (e) => {
            if (e.key === 'Shift') setShiftHeld(true);
        };
        const upHandler = (e) => {
            if (e.key === 'Shift') setShiftHeld(false);
        };
        // Alt-tabbing away while holding Shift never delivers the keyup, which
        // would otherwise leave the kick buttons stuck visible.
        const resetHandler = () => setShiftHeld(false);

        window.addEventListener('keydown', downHandler);
        window.addEventListener('keyup', upHandler);
        window.addEventListener('blur', resetHandler);

        return () => {
            window.removeEventListener('keydown', downHandler);
            window.removeEventListener('keyup', upHandler);
            window.removeEventListener('blur', resetHandler);
        };
    }, []);

    return shiftHeld;
}

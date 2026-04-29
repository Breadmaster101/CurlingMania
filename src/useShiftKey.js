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

        window.addEventListener('keydown', downHandler);
        window.addEventListener('keyup', upHandler);

        return () => {
            window.removeEventListener('keydown', downHandler);
            window.removeEventListener('keyup', upHandler);
        };
    }, []);

    return shiftHeld;
}

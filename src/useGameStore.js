import { useState, useEffect } from 'react';
import { store } from './store';

export function useGameStore() {
    const [state, setState] = useState(store.getSnapshot());

    useEffect(() => {
        const unsubscribe = store.subscribe(() => {
            setState(store.getSnapshot());
        });
        return unsubscribe;
    }, []);

    return state;
}

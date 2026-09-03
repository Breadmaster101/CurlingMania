import { useState, useEffect } from 'react';
import { LogOut, AlertTriangle } from 'lucide-react';
import { store } from './store';
import { useGameStore } from './useGameStore';

const CONFIRM_WINDOW_MS = 3000;

export default function LeaveButton() {
    const { isHost, gameState } = useGameStore();
    const [confirming, setConfirming] = useState(false);

    // The host leaving ends the match for everyone, so make it a two-tap action
    // once there is actually something to lose.
    const needsConfirm = isHost && gameState.players.length > 1;

    useEffect(() => {
        if (!confirming) return undefined;
        const timer = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
        return () => clearTimeout(timer);
    }, [confirming]);

    const handleClick = () => {
        if (needsConfirm && !confirming) {
            setConfirming(true);
            return;
        }
        store.leaveRoom();
    };

    return (
        <button
            className={`leave-btn ${confirming ? 'confirming' : ''}`}
            onClick={handleClick}
            title={needsConfirm ? 'End the match for everyone' : 'Return to Main Menu'}
        >
            {confirming ? <AlertTriangle size={16} /> : <LogOut size={16} />}
            <span>{confirming ? 'End match?' : 'Leave'}</span>
        </button>
    );
}

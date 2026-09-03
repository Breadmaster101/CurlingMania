import { WifiOff, Loader } from 'lucide-react';
import { useGameStore } from './useGameStore';

/**
 * One place to tell players that the game they are looking at is stale.
 * Two failure modes matter: our own socket is down, or the socket is fine but
 * the host has gone quiet (their tab crashed, they are reconnecting, or the
 * relay dropped the room).
 */
export default function ConnectionBanner() {
    const { connectionState, hostLinkLost, currentRoom, isHost, gameState } = useGameStore();

    if (!currentRoom || gameState.status === 'CONNECT') return null;

    const offline = connectionState !== 'online';
    if (!offline && !hostLinkLost) return null;

    const message = offline
        ? 'Connection lost. Reconnecting...'
        : isHost
            ? 'Waiting for the server...'
            : 'Lost contact with the host. Trying to reconnect...';

    return (
        <div className="connection-banner" role="status">
            {offline ? <WifiOff size={16} /> : <Loader size={16} className="spin-icon" />}
            <span>{message}</span>
        </div>
    );
}

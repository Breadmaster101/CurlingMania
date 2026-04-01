import { store } from './store';
import { useGameStore } from './useGameStore';
import { Play } from 'lucide-react';

export default function LobbyScreen() {
    const { gameState, isHost, myId, currentRoom } = useGameStore();

    return (
        <div className="menu-box">
            <h1 style={{fontSize: 28}}>Room Lobby</h1>
            <p style={{marginBottom: 15}}>Code: <strong style={{color: 'var(--primary)', fontSize: 22}}>{currentRoom}</strong></p>

            <div className="player-list-box">
                {gameState.players.map(p => (
                    <div key={p.id} className="player-list-item">
                        <div>
                            <span className="color-dot" style={{background: p.color}}></span>
                            {p.name} {p.id === myId ? '(You)' : ''}
                        </div>
                        {p.isSpectator && <span style={{color: '#94a3b8', fontSize: 12}}>Spectating</span>}
                    </div>
                ))}
            </div>

            {isHost ? (
                <button className="btn btn-accent" onClick={() => store.startGame()}>
                    <Play size={20} fill="currentColor" /> Start Match
                </button>
            ) : (
                <p style={{color: 'var(--text-muted)', fontWeight: 600}}>Waiting for host to start...</p>
            )}
        </div>
    );
}

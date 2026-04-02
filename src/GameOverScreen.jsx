import { useGameStore } from './useGameStore';
import { store } from './store';
import { Trophy, Home } from 'lucide-react';

export default function GameOverScreen() {
    const { gameState, myId, isHost } = useGameStore();

    // Sort players by score descending
    const sortedPlayers = [...gameState.players].sort((a, b) => (b.totalScore + b.score) - (a.totalScore + a.score));
    const winner = sortedPlayers.length > 0 ? sortedPlayers[0] : null;

    return (
        <div className="menu-box" style={{ width: '400px', maxWidth: '80%' }}>
            <h1 style={{ fontSize: 32, textAlign: 'center', marginBottom: '5px' }}>
                <Trophy size={36} style={{ verticalAlign: 'middle', marginRight: '10px', color: '#f59e0b' }} />
                Game Over!
            </h1>
            
            {winner && (
                <p style={{ textAlign: 'center', fontSize: 20, color: 'var(--text-muted)', marginBottom: 20 }}>
                    <strong style={{ color: winner.color }}>{winner.name}</strong> wins!
                </p>
            )}

            <div className="player-list-box" style={{ marginBottom: '20px' }}>
                {sortedPlayers.map((p, index) => (
                    <div key={p.id} className="player-list-item" style={{ fontSize: '18px', padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ width: 25, fontWeight: 'bold', marginRight: 10, color: 'var(--text-muted)' }}>
                                #{index + 1}
                            </span>
                            <span className="color-dot" style={{ background: p.color }}></span>
                            {p.name} {p.id === myId ? '(You)' : ''}
                        </div>
                        <strong style={{ color: 'var(--text-muted)' }}>{p.totalScore + p.score} pts</strong>
                    </div>
                ))}
            </div>

            <button 
                className="btn btn-secondary" 
                onClick={() => store.returnToLobby()} 
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}
            >
                <Home size={20} style={{ marginRight: '8px' }} /> Return to Lobby
            </button>
            
            {isHost && (
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: '10px' }}>
                    As the host, returning to the lobby will bring everyone with you.
                </p>
            )}
        </div>
    );
}

import { store } from './store';
import { useGameStore } from './useGameStore';
import { Play, Swords, Sparkles } from 'lucide-react';

const GAMEMODES = [
    {
        id: 'MANIA',
        name: 'Mania',
        icon: Swords,
        description: 'All players share one rink. Knock opponents\' stones away and fight for the best position!',
        gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
    },
    {
        id: 'ZEN',
        name: 'Zen',
        icon: Sparkles,
        description: 'Each player gets their own rink. Throw 3 stones solo, then pass it on. Pure precision!',
        gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
    },
];

export default function LobbyScreen() {
    const { gameState, isHost, myId, currentRoom } = useGameStore();

    return (
        <div className="menu-box" style={{ maxWidth: 520 }}>
            <h1 style={{fontSize: 28}}>Room Lobby</h1>
            <p style={{marginBottom: 15}}>Code: <strong style={{color: 'var(--primary)', fontSize: 22}}>{currentRoom}</strong></p>

            {/* Gamemode Cards */}
            <div className="gamemode-cards">
                {GAMEMODES.map(mode => {
                    const Icon = mode.icon;
                    const isSelected = gameState.gameMode === mode.id;
                    return (
                        <div
                            key={mode.id}
                            className={`gamemode-card ${isSelected ? 'selected' : ''} ${!isHost ? 'disabled' : ''}`}
                            onClick={() => isHost && store.setGameMode(mode.id)}
                            style={{ '--card-gradient': mode.gradient }}
                        >
                            <div className="gamemode-card-icon" style={{ background: mode.gradient }}>
                                <Icon size={24} color="#fff" />
                            </div>
                            <div className="gamemode-card-name">{mode.name}</div>
                            <div className="gamemode-card-desc">{mode.description}</div>
                            {isSelected && <div className="gamemode-card-check">✓</div>}
                        </div>
                    );
                })}
            </div>
            {!isHost && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-10px 0 15px', fontWeight: 600 }}>
                    The host picks the gamemode
                </p>
            )}

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

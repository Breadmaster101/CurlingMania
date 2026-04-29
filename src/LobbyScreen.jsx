import { useState, useEffect } from 'react';
import { store } from './store';
import { useGameStore } from './useGameStore';
import { Play, Swords, Sparkles, ListTodo, X } from 'lucide-react';
import { useShiftKey } from './useShiftKey';
import ScaledMenuBox from './ScaledMenuBox';
import LeaveButton from './LeaveButton';
import initialTodoRaw from '../todo.md?raw';

const GAMEMODES = [
    {
        id: 'MANIA',
        name: 'Mania',
        icon: Swords,
        description: 'All players share one rink. Knock opponents\' stones away and fight for the best position!',
        gradient: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)',
    },
    {
        id: 'ZEN',
        name: 'Zen',
        icon: Sparkles,
        description: 'Each player gets their own rink. Throw 3 stones solo, then pass it on. Pure precision!',
        gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
    },
];

function parseTodoItems(raw) {
    return raw
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('- '))
        .map(line => line.replace(/^- /, ''));
}

function TodoCard() {
    const [items, setItems] = useState(() => parseTodoItems(initialTodoRaw));

    useEffect(() => {
        if (import.meta.hot) {
            import.meta.hot.accept('../todo.md?raw', (newModule) => {
                if (newModule) {
                    setItems(parseTodoItems(newModule.default));
                }
            });
        }
    }, []);

    if (items.length === 0) return null;

    return (
        <div className="todo-card">
            <div className="todo-card-header">
                <ListTodo size={14} />
                <span>Roadmap / E-Money's To-Do</span>
            </div>
            <ul className="todo-card-list">
                {items.map((item, i) => (
                    <li key={i}>{item}</li>
                ))}
            </ul>
        </div>
    );
}

export default function LobbyScreen() {
    const { gameState, isHost, myId, currentRoom } = useGameStore();
    const shiftHeld = useShiftKey();

    return (
        <>
        <LeaveButton />
        <ScaledMenuBox className="menu-box-wide">
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {p.isSpectator && <span style={{color: '#94a3b8', fontSize: 12}}>Spectating</span>}
                            {isHost && p.id !== myId && (
                                <button 
                                    className="kick-btn"
                                    onClick={(e) => { e.stopPropagation(); store.kickPlayer(p.id); }}
                                    title="Kick Player"
                                    style={{ visibility: shiftHeld ? 'visible' : 'hidden' }}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {isHost && gameState.players.length > 1 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '-10px', marginBottom: '15px', textAlign: 'center' }}>
                    Hold <kbd style={{ padding: '2px 4px', background: '#333', borderRadius: '4px', color: '#fff' }}>Shift</kbd> to kick players
                </p>
            )}

            {isHost ? (
                <button className="btn btn-accent" onClick={() => store.startGame()}>
                    <Play size={20} fill="currentColor" /> Start Match
                </button>
            ) : (
                <p style={{color: 'var(--text-muted)', fontWeight: 600}}>Waiting for host to start...</p>
            )}
        </ScaledMenuBox>

        <TodoCard />
        </>
    );
}

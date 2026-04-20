import { useRef, useEffect, useCallback, useState } from 'react';
import { useGameStore } from './useGameStore';
import { store } from './store';
import GameCanvas from './GameCanvas';
import { Trophy, Activity, Swords, Sparkles, AlertTriangle, Menu, X } from 'lucide-react';

function useIsMobile(breakpoint = 640) {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const handler = (e) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [breakpoint]);
    return isMobile;
}

export default function GameScreen() {
    const { gameState, myId, emojiParticles, emojiKeybinds } = useGameStore();
    const playerRowRefs = useRef({});
    const [activeKeys, setActiveKeys] = useState(new Set());
    const [drawerOpen, setDrawerOpen] = useState(false);
    const isMobile = useIsMobile();

    // Active player from the turn queue
    const currentPlayerId = (gameState.turnQueue && gameState.turnQueueIndex < gameState.turnQueue.length)
        ? gameState.turnQueue[gameState.turnQueueIndex]
        : null;
    const currentPlayer = currentPlayerId ? gameState.players.find(p => p.id === currentPlayerId) : null;
    const myPlayer = gameState.players.find(p => p.id === myId);
    const displayPlayers = gameState.leaderboard && gameState.leaderboard.length > 0 ? gameState.leaderboard : gameState.players;

    const isZen = gameState.gameMode === 'ZEN';

    // For Zen mode: figure out which stone # they're on (1, 2, or 3)
    let zenStoneNumber = 0;
    if (isZen && currentPlayerId) {
        // Count how many consecutive entries before this index have the same player
        let count = 0;
        for (let i = gameState.turnQueueIndex; i >= 0; i--) {
            if (gameState.turnQueue[i] === currentPlayerId) count++;
            else break;
        }
        zenStoneNumber = count;
    }

    let turnMessage = 'Waiting...';
    let turnBg = '#10b981';
    
    if (gameState.status === 'GAMEOVER') {
        turnMessage = 'Game Over!';
    } else if (currentPlayer) {
        if (currentPlayer.id === myId) {
            turnMessage = 'YOUR TURN!';
            turnBg = currentPlayer.color;
        } else {
            turnMessage = isZen 
                ? `${currentPlayer.name}'s Rink — Stone ${zenStoneNumber}/3` 
                : `${currentPlayer.name}'s Turn`;
            turnBg = currentPlayer.color;
        }
    }

    const GameModeIcon = isZen ? Sparkles : Swords;
    const gameModeName = isZen ? 'Zen' : 'Mania';

    // Handle clicking/tapping an emoji glossary item or mobile emoji button
    const handleEmojiClick = useCallback((emoji) => {
        store.sendEmoji(emoji);
    }, []);

    // Position unspawned emoji particles based on their player's leaderboard card
    const positionNewParticles = useCallback(() => {
        if (!emojiParticles) return;
        for (const particle of emojiParticles) {
            if (particle.spawned) continue;
            const rowEl = playerRowRefs.current[particle.playerId];
            if (rowEl) {
                const rect = rowEl.getBoundingClientRect();
                particle.x = rect.left + rect.width / 2;
                particle.y = rect.top + rect.height / 2;
                particle.spawned = true;
            } else if (isMobile) {
                // On mobile, panels may be hidden. Spawn near top-center.
                particle.x = window.innerWidth / 2;
                particle.y = 80;
                particle.spawned = true;
            }
        }
    }, [emojiParticles, isMobile]);

    useEffect(() => {
        positionNewParticles();
    }, [emojiParticles, positionNewParticles]);

    // Listen for key presses to animate the glossary UI
    useEffect(() => {
        if (!emojiKeybinds) return;
        
        const handleKeyDown = (e) => {
            const key = e.key.toLowerCase();
            if (emojiKeybinds[key]) {
                setActiveKeys(prev => {
                    const next = new Set(prev);
                    next.add(key);
                    return next;
                });
            }
        };

        const handleKeyUp = (e) => {
            const key = e.key.toLowerCase();
            if (emojiKeybinds[key]) {
                setActiveKeys(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [emojiKeybinds]);

    // Close drawer when switching away from mobile
    useEffect(() => {
        if (!isMobile) setDrawerOpen(false);
    }, [isMobile]);

    return (
        <div className="game-screen-wrapper">
            {/* AFK Warning Banner — visible to ALL players */}
            {gameState.turnWarning && (
                <div className="afk-warning">
                    <AlertTriangle size={18} />
                    <span>
                        {gameState.turnWarningPlayerName} will be skipped if they don't throw within {gameState.turnTimeLeft}s!
                    </span>
                </div>
            )}

            {/* ─── MOBILE HUD ─── */}
            {isMobile && (
                <div className="mobile-hud">
                    <div className="mobile-hud-bar">
                        <div className="mobile-hud-stat">
                            <span className="mobile-hud-stat-label">R</span>
                            <span className="mobile-hud-stat-value">{gameState.round}/3</span>
                        </div>
                        <div className="mobile-hud-turn" style={{ background: turnBg, color: '#000' }}>
                            {turnMessage}
                        </div>
                        <div className="mobile-hud-stat">
                            <span className="mobile-hud-stat-label">🪨</span>
                            <span className="mobile-hud-stat-value">{myPlayer && !myPlayer.isSpectator ? myPlayer.stonesLeft : 0}</span>
                        </div>
                        <div className="mobile-hud-btn" onClick={() => setDrawerOpen(true)}>
                            <Menu size={18} />
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MOBILE DRAWER (Leaderboard) ─── */}
            {isMobile && (
                <div className={`mobile-drawer-overlay ${drawerOpen ? 'open' : ''}`} onClick={(e) => {
                    if (e.target === e.currentTarget) setDrawerOpen(false);
                }}>
                    <div className="mobile-drawer">
                        <h2>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Trophy size={18} /> Leaderboard
                            </span>
                            <div className="mobile-drawer-close" onClick={() => setDrawerOpen(false)}>
                                <X size={14} />
                            </div>
                        </h2>
                        <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                            {displayPlayers.map(p => (
                                <div
                                    key={p.id}
                                    ref={el => { playerRowRefs.current[p.id] = el; }}
                                    className={`player-row ${p.isSpectator ? 'spectator' : ''} ${gameState.status !== 'GAMEOVER' && p.id === currentPlayerId ? 'active-turn' : ''}`}
                                >
                                    <div style={{display: 'flex', alignItems: 'center'}}>
                                        <span className="color-dot" style={{background: p.color}}></span>
                                        {p.name}
                                    </div>
                                    <div>{p.totalScore + p.score} pts</div>
                                </div>
                            ))}
                        </div>

                        {/* Gamemode badge in drawer */}
                        <div style={{ 
                            marginTop: 'auto', paddingTop: 12, borderTop: '2px solid var(--border-color)',
                            display: 'flex', alignItems: 'center', gap: 8, 
                            fontWeight: 700, fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)'
                        }}>
                            <GameModeIcon size={14} />
                            <span>{gameModeName} Mode</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── DESKTOP LAYOUT (unchanged) ─── */}
            {!isMobile && (
                <>
                    {/* Gamemode badge (Moved to float left of Game Stats via CSS) */}
                    <div className="gamemode-badge-container">
                        <GameModeIcon size={16} />
                        <span>{gameModeName}</span>
                    </div>

                    <div className="panel panel-left">
                        <h2><Trophy size={20} /> Leaderboard</h2>
                        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px 14px 10px 10px' }}>
                            {displayPlayers.map(p => (
                                <div
                                    key={p.id}
                                    ref={el => { playerRowRefs.current[p.id] = el; }}
                                    className={`player-row ${p.isSpectator ? 'spectator' : ''} ${gameState.status !== 'GAMEOVER' && p.id === currentPlayerId ? 'active-turn' : ''}`}
                                >
                                    <div style={{display: 'flex', alignItems: 'center'}}>
                                        <span className="color-dot" style={{background: p.color}}></span>
                                        {p.name}
                                    </div>
                                    <div>{p.totalScore + p.score} pts</div>
                                </div>
                            ))}
                        </div>

                        {/* Compact Emoji keybind glossary at the bottom of the leaderboard */}
                        <div className="emoji-glossary">
                            <div className="emoji-glossary-title">Reactions</div>
                            <div className="emoji-glossary-content">
                                {emojiKeybinds && Object.entries(emojiKeybinds).map(([key, emoji]) => (
                                    <div 
                                        key={key} 
                                        className={`emoji-glossary-item ${activeKeys.has(key) ? 'active' : ''}`}
                                        onClick={() => handleEmojiClick(emoji)}
                                    >
                                        <kbd className="emoji-key">{key.toUpperCase()}</kbd>
                                        <span className="emoji-icon">{emoji}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="panel panel-right">
                        <h2><Activity size={20} /> Game Stats</h2>

                        <div className={`turn-indicator ${currentPlayerId === myId ? 'wiggle-turn' : ''}`} style={{ background: turnBg }}>
                            {turnMessage}
                        </div>
                        
                        <div className="stat-box">
                            <div className="stat-label">Round</div>
                            <div className="stat-value">{gameState.round} / 3</div>
                        </div>
                        
                        <div className="stat-box">
                            <div className="stat-label">Your Stones</div>
                            <div className="stat-value">{myPlayer && !myPlayer.isSpectator ? myPlayer.stonesLeft : 0}</div>
                        </div>
                    </div>
                </>
            )}

            <GameCanvas />

            {/* ─── MOBILE EMOJI TAP BAR ─── */}
            {isMobile && emojiKeybinds && (
                <div className="mobile-emoji-bar show">
                    {Object.entries(emojiKeybinds).map(([key, emoji]) => (
                        <div 
                            key={key} 
                            className="mobile-emoji-btn"
                            onClick={() => handleEmojiClick(emoji)}
                        >
                            {emoji}
                        </div>
                    ))}
                </div>
            )}

            {/* Emoji particles layer */}
            {emojiParticles && emojiParticles.length > 0 && (
                <div className="emoji-particle-layer">
                    {emojiParticles.filter(p => p.spawned).map(p => (
                        <span
                            key={p.id}
                            className="emoji-particle"
                            style={{
                                left: `${p.x}px`,
                                top: `${p.y}px`,
                                fontSize: `${p.size}px`,
                            }}
                        >
                            {p.emoji}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
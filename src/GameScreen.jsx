import { useRef, useEffect, useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useGameStore } from './useGameStore';
import { store } from './store';
import GameCanvas from './GameCanvas';
import LeaveButton from './LeaveButton';
import { Trophy, Activity, Swords, Sparkles, AlertTriangle, Menu, X, WifiOff, LogOut } from 'lucide-react';
import { useShiftKey } from './useShiftKey';

function useIsMobile(breakpoint = 640) {
    const query = useMemo(() => window.matchMedia(`(max-width: ${breakpoint}px)`), [breakpoint]);
    return useSyncExternalStore(
        (onChange) => {
            query.addEventListener('change', onChange);
            return () => query.removeEventListener('change', onChange);
        },
        () => query.matches,
    );
}

/** One leaderboard row, shared by the desktop panel and the mobile drawer. */
function PlayerRow({ player, isCurrent, isHost, myId, shiftHeld, rowRef }) {
    const offline = player.connected === false;
    const classes = [
        'player-row',
        player.isSpectator ? 'spectator' : '',
        isCurrent ? 'active-turn' : '',
        offline ? 'offline' : '',
    ].filter(Boolean).join(' ');

    return (
        <div ref={rowRef} className={classes}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <span className="color-dot" style={{ background: player.color }}></span>
                <span className="player-row-name">{player.name}</span>
                {offline && <WifiOff size={13} className="player-row-offline-icon" />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{player.totalScore + player.score} pts</span>
                {isHost && player.id !== myId && (
                    <button
                        className="kick-btn"
                        onClick={(e) => { e.stopPropagation(); store.kickPlayer(player.id); }}
                        title="Kick Player"
                        style={{ visibility: shiftHeld ? 'visible' : 'hidden' }}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}

export default function GameScreen() {
    const { gameState, myId, emojiParticles, emojiKeybinds, isHost } = useGameStore();
    const playerRowRefs = useRef({});
    const [activeKeys, setActiveKeys] = useState(new Set());
    const [drawerOpen, setDrawerOpen] = useState(false);
    const isMobile = useIsMobile();
    const shiftHeld = useShiftKey();
    // The drawer only exists at mobile widths, so derive its visibility rather
    // than resetting the flag from an effect on every breakpoint change.
    const drawerVisible = isMobile && drawerOpen;

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
        } else {
            turnMessage = isZen
                ? `${currentPlayer.name}'s Rink — Stone ${zenStoneNumber}/3`
                : `${currentPlayer.name}'s Turn`;
        }
        turnBg = currentPlayer.color;
    }

    const GameModeIcon = isZen ? Sparkles : Swords;
    const gameModeName = isZen ? 'Zen' : 'Mania';

    // Handle clicking/tapping an emoji glossary item or mobile emoji button
    const handleEmojiClick = useCallback((emoji) => {
        store.sendEmoji(emoji);
    }, []);

    // Mobile lays the HUD bar and the emoji column over the corners where the
    // floating Leave/theme/mute buttons live, so scope those overrides to here.
    useEffect(() => {
        document.body.classList.add('in-game');
        return () => document.body.classList.remove('in-game');
    }, []);

    // Drop refs for players who left so the map does not grow without bound.
    useEffect(() => {
        const liveIds = new Set(gameState.players.map(p => p.id));
        for (const id of Object.keys(playerRowRefs.current)) {
            if (!liveIds.has(id)) delete playerRowRefs.current[id];
        }
    }, [gameState.players]);

    // Reactions pop out of the reacting player's leaderboard card. The store
    // owns the particles, so hand it a resolver rather than mutating them here.
    useEffect(() => {
        store.setEmojiAnchorResolver((playerId) => {
            if (!drawerVisible && isMobile) return null; // leaderboard is off-screen
            const rowEl = playerRowRefs.current[playerId];
            if (!rowEl) return null;
            const rect = rowEl.getBoundingClientRect();
            if (rect.width <= 0 && rect.height <= 0) return null;
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        });
        return () => store.setEmojiAnchorResolver(null);
    }, [isMobile, drawerVisible]);

    // Listen for key presses to animate the glossary UI
    useEffect(() => {
        if (!emojiKeybinds) return undefined;

        const isTypingTarget = (target) => target && (
            target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        );

        const handleKeyDown = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
            const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
            if (!emojiKeybinds[key]) return;
            setActiveKeys(prev => {
                if (prev.has(key)) return prev;
                const next = new Set(prev);
                next.add(key);
                return next;
            });
        };

        const handleKeyUp = (e) => {
            const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
            if (!emojiKeybinds[key]) return;
            setActiveKeys(prev => {
                if (!prev.has(key)) return prev;
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        };

        // A keyup that lands on another window would leave keys stuck lit.
        const clearKeys = () => setActiveKeys(prev => (prev.size === 0 ? prev : new Set()));

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', clearKeys);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', clearKeys);
        };
    }, [emojiKeybinds]);

    const renderRows = () => displayPlayers.map(p => (
        <PlayerRow
            key={p.id}
            player={p}
            isCurrent={gameState.status !== 'GAMEOVER' && p.id === currentPlayerId}
            isHost={isHost}
            myId={myId}
            shiftHeld={shiftHeld}
            rowRef={el => {
                if (el) playerRowRefs.current[p.id] = el;
                else delete playerRowRefs.current[p.id];
            }}
        />
    ));

    return (
        <div className="game-screen-wrapper">
            <LeaveButton />
            {/* AFK Warning Banner — visible to ALL players */}
            {gameState.turnWarning && (
                <div className="afk-warning">
                    <AlertTriangle size={18} />
                    <span>
                        {gameState.turnWarningPlayerName} will be skipped if they don&apos;t throw within {gameState.turnTimeLeft}s!
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
                            <span className="mobile-hud-stat-label">S</span>
                            <span className="mobile-hud-stat-value">{myPlayer && !myPlayer.isSpectator ? myPlayer.stonesLeft : 0}</span>
                        </div>
                        <button className="mobile-hud-btn" onClick={() => setDrawerOpen(true)} aria-label="Open leaderboard">
                            <Menu size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* ─── MOBILE DRAWER (Leaderboard) ─── */}
            {isMobile && (
                <div className={`mobile-drawer-overlay ${drawerVisible ? 'open' : ''}`} onClick={(e) => {
                    if (e.target === e.currentTarget) setDrawerOpen(false);
                }}>
                    <div className="mobile-drawer">
                        <h2>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Trophy size={18} /> Leaderboard
                            </span>
                            <button className="mobile-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close leaderboard">
                                <X size={14} />
                            </button>
                        </h2>
                        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '4px 12px 12px 4px' }}>
                            {renderRows()}
                        </div>

                        {/* Gamemode badge + leave, since the floating buttons are
                            hidden behind the HUD bar at this width. */}
                        <div className="mobile-drawer-footer">
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <GameModeIcon size={14} />
                                <span>{gameModeName} Mode</span>
                            </span>
                            <button className="mobile-drawer-leave" onClick={() => store.leaveRoom()}>
                                <LogOut size={14} /> Leave
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── DESKTOP LAYOUT ─── */}
            {!isMobile && (
                <>
                    {/* Gamemode badge (Moved to float left of Game Stats via CSS) */}
                    <div className="gamemode-badge-container">
                        <GameModeIcon size={16} />
                        <span>{gameModeName}</span>
                    </div>

                    <div className="panel panel-left">
                        <h2>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Trophy size={20} /> Leaderboard</span>
                        </h2>
                        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px 14px 10px 10px' }}>
                            {renderRows()}
                        </div>

                        {isHost && gameState.players.length > 1 && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 12, marginTop: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                                Hold <kbd style={{ padding: '2px 4px', background: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#475569', fontSize: 10 }}>Shift</kbd> to kick players
                            </div>
                        )}

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
                    {emojiParticles.map(p => (
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

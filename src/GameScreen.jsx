import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from './useGameStore';
import GameCanvas from './GameCanvas';
import { Trophy, Activity, Swords, Sparkles, AlertTriangle } from 'lucide-react';

export default function GameScreen() {
    const { gameState, myId, emojiParticles, emojiKeybinds } = useGameStore();
    const playerRowRefs = useRef({});

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
            }
        }
    }, [emojiParticles]);

    useEffect(() => {
        positionNewParticles();
    }, [emojiParticles, positionNewParticles]);

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

            <div className="panel panel-left">
                <h2><Trophy size={20} /> Leaderboard</h2>
                <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '10px' }}>
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
            </div>

            <GameCanvas />

            <div className="panel panel-right">
                <h2><Activity size={20} /> Game Stats</h2>

                {/* Gamemode badge */}
                <div className="gamemode-badge">
                    <GameModeIcon size={14} />
                    <span>{gameModeName}</span>
                </div>

                <div className="turn-indicator" style={{ background: turnBg }}>
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

            {/* Emoji keybind glossary */}
            <div className="emoji-glossary">
                <div className="emoji-glossary-title">Reactions</div>
                {emojiKeybinds && Object.entries(emojiKeybinds).map(([key, emoji]) => (
                    <div key={key} className="emoji-glossary-item">
                        <kbd className="emoji-key">{key.toUpperCase()}</kbd>
                        <span className="emoji-icon">{emoji}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
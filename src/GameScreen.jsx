import { useGameStore } from './useGameStore';
import GameCanvas from './GameCanvas';
import { Trophy, Activity } from 'lucide-react';

export default function GameScreen() {
    const { gameState, myId } = useGameStore();

    const currentPlayer = gameState.players.length > 0 ? gameState.players[gameState.turnIndex % gameState.players.length] : null;
    const myPlayer = gameState.players.find(p => p.id === myId);

    let turnMessage = 'Waiting...';
    let turnBg = '#10b981';
    
    if (gameState.status === 'GAMEOVER') {
        turnMessage = 'Game Over!';
    } else if (currentPlayer) {
        if (currentPlayer.id === myId) {
            turnMessage = 'YOUR TURN!';
            turnBg = currentPlayer.color;
        } else {
            turnMessage = `${currentPlayer.name}'s Turn`;
            turnBg = currentPlayer.color;
        }
    }

    return (
        <div className="game-screen-wrapper">
            <div className="panel panel-left">
                <h2><Trophy size={20} /> Leaderboard</h2>
                <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '10px' }}>
                    {gameState.players.map(p => (
                        <div key={p.id} className={`player-row ${p.isSpectator ? 'spectator' : ''} ${gameState.status !== 'GAMEOVER' && p.id === (currentPlayer?.id) ? 'active-turn' : ''}`}>
                            <div style={{display: 'flex', alignItems: 'center'}}>
                                <span className="color-dot" style={{background: p.color}}></span>
                                {p.name}
                            </div>
                            <div>{p.score} pts</div>
                        </div>
                    ))}
                </div>
            </div>

            <GameCanvas />

            <div className="panel panel-right">
                <h2><Activity size={20} /> Game Stats</h2>
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
        </div>
    );
}

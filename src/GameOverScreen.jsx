import { Trophy, RotateCcw, Crown } from 'lucide-react';
import { store } from './store';
import { useGameStore } from './useGameStore';
import ScaledMenuBox from './ScaledMenuBox';

export default function GameOverScreen() {
  const { room, myId } = useGameStore();

  if (!room) {
    return null;
  }

  const winner = room.players
    .filter((player) => !player.isSpectator)
    .slice()
    .sort((left, right) => right.score - left.score || right.roundWins - left.roundWins)[0];

  return (
    <ScaledMenuBox className="menu-box menu-box-wide">
      <div className="hero-badge">
        <Trophy size={14} />
        <span>Match complete</span>
      </div>
      <h1>Retrocycles</h1>
      <p>
        {winner ? (
          <>
            <strong style={{ color: winner.color }}>{winner.name}</strong> owns the grid.
          </>
        ) : 'No winner was recorded.'}
      </p>

      <div className="results-grid">
        {room.players
          .filter((player) => !player.isSpectator)
          .slice()
          .sort((left, right) => right.score - left.score || right.roundWins - left.roundWins)
          .map((player, index) => (
            <div key={player.id} className={`result-row ${player.id === myId ? 'is-me' : ''}`}>
              <div className="result-left">
                <span className="result-rank">#{index + 1}</span>
                <span className="color-dot" style={{ background: player.color }} />
                <span>{player.name}{player.id === myId ? ' (You)' : ''}</span>
              </div>
              <div className="result-right">
                <span>{player.score} pts</span>
                <span>{player.roundWins} rounds</span>
              </div>
            </div>
          ))}
      </div>

      {room.hostId === myId && (
        <button className="btn btn-accent" onClick={() => store.returnToLobby()}>
          <RotateCcw size={18} />
          Return To Lobby
        </button>
      )}

      {room.hostId !== myId && (
        <div className="waiting-banner">
          <Crown size={16} />
          Waiting for the host to cycle everyone back to lobby.
        </div>
      )}
    </ScaledMenuBox>
  );
}

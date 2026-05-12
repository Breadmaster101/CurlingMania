import { Play, Crown, Orbit, Users, ShieldHalf } from 'lucide-react';
import { store } from './store';
import { useGameStore } from './useGameStore';
import ScaledMenuBox from './ScaledMenuBox';

function PlayerCard({ player, isHost, isMe }) {
  return (
    <div className={`lobby-player-card ${player.isSpectator ? 'spectator' : ''}`}>
      <div className="lobby-player-topline">
        <div className="lobby-player-name">
          <span className="color-dot" style={{ background: player.color }} />
          <span>{player.name}{isMe ? ' (You)' : ''}</span>
        </div>
        <div className="lobby-player-tags">
          {isHost && <span className="player-chip">Host</span>}
          {player.isSpectator && <span className="player-chip player-chip-muted">Spectator</span>}
        </div>
      </div>
      <div className="lobby-player-stats">
        <span>{player.connected ? 'Linked in' : 'Disconnected'}</span>
        <span>{player.isSpectator ? 'Watching this match' : 'Ready to ride'}</span>
      </div>
    </div>
  );
}

export default function LobbyScreen() {
  const { room, myId } = useGameStore();

  if (!room) {
    return null;
  }

  const me = room.players.find((player) => player.id === myId);
  const isHost = room.hostId === myId;
  const activePlayers = room.players.filter((player) => !player.isSpectator);

  return (
    <ScaledMenuBox className="menu-box menu-box-wide">
      <div className="lobby-header">
        <div>
          <div className="hero-badge">
            <Orbit size={14} />
            <span>Room {room.code}</span>
          </div>
          <h1>Grid Lobby</h1>
          <p>
            Best of {room.settings.maxRounds} rounds on a {room.settings.arenaWidth}x{room.settings.arenaHeight} arena.
          </p>
        </div>
        <div className="room-stat-stack">
          <div className="room-stat">
            <Users size={14} />
            <span>{activePlayers.length} riders</span>
          </div>
          <div className="room-stat">
            <ShieldHalf size={14} />
            <span>Need 2+ to start</span>
          </div>
        </div>
      </div>

      <div className="lobby-grid">
        {room.players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            isHost={player.id === room.hostId}
            isMe={player.id === myId}
          />
        ))}
      </div>

      <div className="lobby-rules">
        <div><Crown size={14} /> Stay alive, close loops, and own the floor.</div>
        <div><Crown size={14} /> Trails are lethal. Territory is score. Energy cores add surge points.</div>
      </div>

      {isHost ? (
        <button className="btn btn-accent" onClick={() => store.startMatch()} disabled={activePlayers.length < 2}>
          <Play size={18} />
          Launch Match
        </button>
      ) : (
        <div className="waiting-banner">
          Host is calibrating the arena. You are queued as {me?.isSpectator ? 'a spectator' : 'a rider'}.
        </div>
      )}
    </ScaledMenuBox>
  );
}

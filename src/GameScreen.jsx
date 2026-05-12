import { useEffect } from 'react';
import { RotateCcw, House, ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { store } from './store';
import { useGameStore } from './useGameStore';
import GameCanvas from './GameCanvas';

function formatTime(ms) {
  return (ms / 1000).toFixed(1);
}

export default function GameScreen() {
  const { soloGame, myName } = useGameStore();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        store.queueTurn('left');
      }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        store.queueTurn('right');
      }
      if (event.key === 'r' || event.key === 'R') {
        store.restartSoloGame();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!soloGame) {
    return null;
  }

  const player = soloGame.riders.find((rider) => rider.id === 'player');
  const standings = [...soloGame.riders].sort((left, right) => {
    if (left.alive !== right.alive) {
      return Number(right.alive) - Number(left.alive);
    }
    return right.score - left.score;
  });

  return (
    <div className="game-shell">
      <header className="hud-topbar">
        <div className="hud-copy">
          <div className="hero-kicker">Solo Run</div>
          <h2>Ride The Grid</h2>
          <p>{soloGame.message}</p>
        </div>
        <div className="hud-readouts">
          <div className="hud-chip">Rider {myName}</div>
          <div className="hud-chip">Time {formatTime(soloGame.elapsedMs)}s</div>
          <div className="hud-chip">Status {soloGame.status}</div>
        </div>
      </header>

      <div className="solo-layout">
        <aside className="side-panel">
          <div className="panel-block">
            <div className="panel-label">Controls</div>
            <div className="control-row"><ChevronLeft size={15} /> Turn left</div>
            <div className="control-row"><ChevronRight size={15} /> Turn right</div>
            <div className="control-row"><RotateCcw size={15} /> Restart</div>
          </div>

          <div className="panel-block">
            <div className="panel-label">Standings</div>
            {standings.map((rider) => (
              <div key={rider.id} className={`rider-row ${rider.id === 'player' ? 'is-player' : ''}`}>
                <div className="rider-name">
                  <span className="color-dot" style={{ background: rider.color }} />
                  <span>{rider.name}</span>
                </div>
                <div className="rider-meta">
                  <span>{rider.alive ? 'Live' : 'Out'}</span>
                  <span>{rider.score}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="arena-panel">
          <GameCanvas />
          {soloGame.status === 'countdown' && (
            <div className="overlay-panel">
              <div className="overlay-count">{Math.max(1, soloGame.countdown)}</div>
              <div className="overlay-copy">Hit left and right to corner hard.</div>
            </div>
          )}
          {soloGame.status === 'finished' && (
            <div className="overlay-panel overlay-panel-finish">
              <div className="overlay-title">
                <Trophy size={18} />
                <span>{soloGame.winnerId === 'player' ? 'You won' : 'Run over'}</span>
              </div>
              <div className="overlay-copy">
                {player?.alive ? 'You owned the arena.' : 'You got trapped in your own lane.'}
              </div>
              <div className="overlay-actions">
                <button className="btn btn-accent" onClick={() => store.restartSoloGame()}>
                  <RotateCcw size={16} />
                  Run Again
                </button>
                <button className="btn btn-muted" onClick={() => store.goHome()}>
                  <House size={16} />
                  Exit
                </button>
              </div>
            </div>
          )}
        </main>

        <aside className="side-panel">
          <div className="panel-block">
            <div className="panel-label">Arena Rules</div>
            <div className="info-copy">Every tile you cross becomes a glowing barrier.</div>
            <div className="info-copy">Touch any wall or the boundary and you explode.</div>
            <div className="info-copy">The last rider moving wins the run.</div>
          </div>

          <div className="panel-block">
            <div className="panel-label">Telemetry</div>
            <div className="telemetry-row"><span>Your line</span><strong>{player?.trail.length ?? 0}</strong></div>
            <div className="telemetry-row"><span>Alive riders</span><strong>{soloGame.riders.filter((rider) => rider.alive).length}</strong></div>
            <div className="telemetry-row"><span>Best run</span><strong>{formatTime(soloGame.bestTimeMs)}s</strong></div>
          </div>
        </aside>
      </div>
    </div>
  );
}

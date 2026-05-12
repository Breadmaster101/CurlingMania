import { useState } from 'react';
import { Radio, PlusCircle, ChevronRight, AlertTriangle, Cpu } from 'lucide-react';
import { store } from './store';
import { useGameStore } from './useGameStore';
import ScaledMenuBox from './ScaledMenuBox';

export default function ConnectScreen() {
  const { errorMsg, connection, myName } = useGameStore();
  const [name, setName] = useState(myName);
  const [room, setRoom] = useState('');

  const handleCreate = () => {
    store.createRoom(name);
  };

  const handleJoin = () => {
    const code = room.trim().toUpperCase();
    if (code.length !== 4) {
      store.patch({ errorMsg: 'Room codes are 4 letters in Retrocycles.' });
      return;
    }
    store.joinRoom(name, code);
  };

  return (
    <ScaledMenuBox className="menu-box menu-box-hero">
      <div className="hero-badge">
        <Cpu size={14} />
        <span>{connection === 'online' ? 'Network online' : 'Connecting to room server'}</span>
      </div>

      <h1>Retrocycles</h1>
      <p>
        A neon 3D light-cycle arena where looping territory matters as much as survival.
      </p>

      <div className="input-group">
        <label>Rider Name</label>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            store.clearError();
          }}
          placeholder="Choose a callsign"
          maxLength={18}
        />
      </div>

      <div className="input-group">
        <label>Room Code</label>
        <input
          value={room}
          onChange={(event) => {
            setRoom(event.target.value.toUpperCase());
            store.clearError();
          }}
          placeholder="ABCD"
          maxLength={4}
          autoCapitalize="characters"
        />
      </div>

      {errorMsg && (
        <div className="join-error-banner">
          <AlertTriangle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      <button className="btn btn-accent" onClick={handleJoin} disabled={connection !== 'online'}>
        <ChevronRight size={18} />
        Join Room
      </button>

      <button className="btn" onClick={handleCreate} disabled={connection !== 'online'}>
        <PlusCircle size={18} />
        Create Arena
      </button>

      <div className="connect-notes">
        <div>
          <Radio size={14} />
          <span>Real-time multiplayer via the included Node room server.</span>
        </div>
        <div>
          <Radio size={14} />
          <span>Late joiners spectate live and jump in on the next match.</span>
        </div>
      </div>
    </ScaledMenuBox>
  );
}

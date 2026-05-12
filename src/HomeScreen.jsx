import { useState } from 'react';
import { Play, Gamepad2, ChevronRight } from 'lucide-react';
import { store } from './store';
import { useGameStore } from './useGameStore';
import ScaledMenuBox from './ScaledMenuBox';

export default function HomeScreen() {
  const { myName } = useGameStore();
  const [name, setName] = useState(myName);

  return (
    <ScaledMenuBox className="menu-box menu-box-home">
      <div className="hero-kicker">Solo-first reboot</div>
      <h1>Retrocycles</h1>
      <p>
        A proper light-cycle run: 3D chase camera, hard barriers, tight turns, and AI riders trying to box you in.
      </p>

      <div className="input-group">
        <label>Rider Name</label>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            store.setName(event.target.value);
          }}
          placeholder="Enter your callsign"
          maxLength={18}
        />
      </div>

      <button className="btn btn-accent" onClick={() => store.startSoloGame(name)}>
        <Play size={18} />
        Start Solo Run
      </button>

      <div className="feature-strip">
        <div className="feature-pill"><Gamepad2 size={14} /> Chase-cam 3D arena</div>
        <div className="feature-pill"><ChevronRight size={14} /> Left and right turn controls</div>
        <div className="feature-pill"><ChevronRight size={14} /> Three AI rivals out to trap you</div>
      </div>
    </ScaledMenuBox>
  );
}

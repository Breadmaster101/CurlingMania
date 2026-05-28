import { useState, useEffect } from 'react';
import { store } from './store';
import { Gamepad2, ArrowRight, AlertTriangle, Loader } from 'lucide-react';
import { useGameStore } from './useGameStore';
import ScaledMenuBox from './ScaledMenuBox';

export default function ConnectScreen() {
   const [name, setName] = useState('');
   const [room, setRoom] = useState('');
   const [joining, setJoining] = useState(false);
   const { errorMsg } = useGameStore();

   // Reset joining state when an error comes back

   useEffect(() => {
      if (errorMsg && joining) {
         setJoining(false);
      }
   }, [errorMsg, joining]);

   const handleJoin = () => {
      if (joining) return;
      const code = room.trim().toUpperCase();
      if (code.length !== 3) {
         store.errorMsg = 'Room codes are 3 characters. Check the code and try again.';
         store.notify();
         return;
      }
      setJoining(true);
      store.joinRoom(name || 'Curler_' + Math.floor(Math.random() * 1000), code);
   }

   const handleCreate = () => {
      store.createRoom(name || 'Curler_' + Math.floor(Math.random() * 1000));
   }

   return (
      <ScaledMenuBox>
         <h1>CurlingMania</h1>
         <p>Grab, Drag, and Release!</p>

         <div className="input-group">
            <label>Player Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name..." maxLength={24} />
         </div>
         <div className="input-group">
            <label>Room Code (To Join)</label>
            <input
               value={room}
               onChange={e => { setRoom(e.target.value.toUpperCase()); if (errorMsg) { store.errorMsg = ''; store.notify(); } }}
               placeholder="Enter room code..."
               maxLength={3}
               autoCapitalize="characters"
            />
         </div>

         {errorMsg && (
            <div className="join-error-banner">
               <AlertTriangle size={16} />
               <span>{errorMsg}</span>
            </div>
         )}

         <button className="btn btn-accent" onClick={handleJoin} disabled={joining}>
            {joining ? <><Loader size={20} className="spin-icon" /> Joining...</> : <><ArrowRight size={20} /> Join Game</>}
         </button>
         <div style={{ margin: '0 0 15px 0', color: '#94a3b8', fontSize: '14px', fontWeight: 600 }}>OR</div>
         <button className="btn" onClick={handleCreate}>
            <Gamepad2 size={20} /> Create New Game
         </button>
         <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, marginTop: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Created by E-Money aka Breadmaster/MbappeFartBubble
         </div>
      </ScaledMenuBox>
   );
}



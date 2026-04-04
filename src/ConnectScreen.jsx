import { useState } from 'react';
import { store } from './store';
import { Gamepad2, ArrowRight } from 'lucide-react';
import { useGameStore } from './useGameStore';

export default function ConnectScreen() {
   const [name, setName] = useState('');
   const [room, setRoom] = useState('');
   const { errorMsg } = useGameStore();

   const handleJoin = () => {
      if (!room) return;
      store.joinRoom(name || 'Curler_' + Math.floor(Math.random() * 1000), room.toUpperCase());
   }

   const handleCreate = () => {
      store.createRoom(name || 'Curler_' + Math.floor(Math.random() * 1000));
   }

   return (
      <div className="menu-box">
         <h1>CurlingMania</h1>
         <p>Grab, Drag, and Release!</p>

         <div className="input-group">
            <label>Player Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name..." maxLength={24} />
         </div>
         <div className="input-group">
            <label>Room Code (To Join)</label>
            <input value={room} onChange={e => setRoom(e.target.value.toUpperCase())} placeholder="Enter room code..." maxLength={3} autoCapitalize="characters" />
         </div>

         <button className="btn btn-accent" onClick={handleJoin}>
            <ArrowRight size={20} /> Join Game
         </button>
         <div style={{ margin: '0 0 15px 0', color: '#94a3b8', fontSize: '14px', fontWeight: 600 }}>OR</div>
         <button className="btn" onClick={handleCreate}>
            <Gamepad2 size={20} /> Create New Game
         </button>

         {errorMsg && <p style={{ color: '#e11d48', marginTop: 15, fontWeight: 'bold' }}>{errorMsg}</p>}
      </div>
   );
}

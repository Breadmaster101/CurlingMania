import { useState } from 'react';
import { store } from './store';
import { Gamepad2, ArrowRight, AlertTriangle, Loader, WifiOff } from 'lucide-react';
import { useGameStore } from './useGameStore';
import ScaledMenuBox from './ScaledMenuBox';
import EasterEggBackground from './EasterEggBackground';

const ROOM_CODE_LENGTH = 3;

export default function ConnectScreen() {
   const [name, setName] = useState('');
   const [room, setRoom] = useState('');
   const { errorMsg, connectionState, currentRoom } = useGameStore();

   const online = connectionState === 'online';
   // Derived, not stored: a join is pending exactly while the store still holds
   // the room code and nothing has failed. Anything that clears the code (an
   // error, the join timeout, a kick) ends the spinner on its own.
   const joining = Boolean(currentRoom) && !errorMsg;

   const randomName = () => 'Curler_' + Math.floor(Math.random() * 1000);

   const handleJoin = () => {
      if (joining || !online) return;
      const code = room.trim().toUpperCase();
      if (code.length !== ROOM_CODE_LENGTH) {
         store.setError(`Room codes are ${ROOM_CODE_LENGTH} characters. Check the code and try again.`);
         return;
      }
      store.joinRoom(name.trim() || randomName(), code);
   };

   const handleCreate = () => {
      if (joining || !online) return;
      store.createRoom(name.trim() || randomName());
   };

   const handleKeyDown = (e) => {
      if (e.key !== 'Enter') return;
      if (room.trim().length === ROOM_CODE_LENGTH) handleJoin();
   };

   return (
      <>
         {name.toLowerCase().includes('bill') && <EasterEggBackground />}
         <ScaledMenuBox>
            <h1>CurlingMania</h1>
            <p>Grab, Drag, and Release!</p>

            <div className="input-group">
               <label htmlFor="player-name">Player Name</label>
               <input
                  id="player-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter your name..."
                  maxLength={24}
               />
            </div>
            <div className="input-group">
               <label htmlFor="room-code">Room Code (To Join)</label>
               <input
                  id="room-code"
                  value={room}
                  onChange={e => { setRoom(e.target.value.toUpperCase()); store.clearError(); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter room code..."
                  maxLength={ROOM_CODE_LENGTH}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
               />
            </div>

            {errorMsg && (
               <div className="join-error-banner">
                  <AlertTriangle size={16} />
                  <span>{errorMsg}</span>
               </div>
            )}

            {!online && (
               <div className="join-error-banner connecting">
                  <WifiOff size={16} />
                  <span>
                     {connectionState === 'reconnecting'
                        ? 'Reconnecting to the server...'
                        : 'Waking the server up...'}
                  </span>
               </div>
            )}

            <button className="btn btn-accent" onClick={handleJoin} disabled={joining || !online}>
               {joining
                  ? <><Loader size={20} className="spin-icon" /> Joining...</>
                  : <><ArrowRight size={20} /> Join Game</>}
            </button>
            <div style={{ margin: '0 0 15px 0', color: '#94a3b8', fontSize: '14px', fontWeight: 600 }}>OR</div>
            <button className="btn" onClick={handleCreate} disabled={joining || !online}>
               <Gamepad2 size={20} /> Create New Game
            </button>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, marginTop: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
               Created by E-Money aka Breadmaster/MbappeFartBubble
            </div>
         </ScaledMenuBox>
      </>
   );
}

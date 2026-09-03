import { useState } from 'react';
import { useGameStore } from './useGameStore';
import { ThemeProvider } from './ThemeProvider';
import ConnectScreen from './ConnectScreen';
import LobbyScreen from './LobbyScreen';
import GameScreen from './GameScreen';
import GameOverScreen from './GameOverScreen';
import ThemeToggle from './ThemeToggle';
import MuteToggle from './MuteToggle';
import EasterEggBackground from './EasterEggBackground';
import ConnectionBanner from './ConnectionBanner';

export default function App() {
  const { gameState, myName } = useGameStore();
  const [randomEasterEgg] = useState(() => Math.random() < 0.01);

  const showBillEgg = myName.toLowerCase().includes('bill') && gameState.status !== 'CONNECT';
  const active = randomEasterEgg || showBillEgg;

  return (
     <ThemeProvider>
       {active && <EasterEggBackground />}
       <ConnectionBanner />
       {gameState.status === 'CONNECT' && <ConnectScreen />}
       {gameState.status === 'LOBBY' && <LobbyScreen />}
       {(gameState.status === 'PLAYING' || gameState.status === 'MOVING') && <GameScreen />}
       {gameState.status === 'GAMEOVER' && <GameOverScreen />}
       <ThemeToggle />
       <MuteToggle />
     </ThemeProvider>
  );
}

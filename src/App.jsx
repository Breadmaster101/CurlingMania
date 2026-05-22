import { useGameStore } from './useGameStore';
import { ThemeProvider } from './ThemeProvider';
import ConnectScreen from './ConnectScreen';
import LobbyScreen from './LobbyScreen';
import GameScreen from './GameScreen';
import GameOverScreen from './GameOverScreen';
import ThemeToggle from './ThemeToggle';
import MuteToggle from './MuteToggle';

export default function App() {
  const { gameState } = useGameStore();
  
  return (
     <ThemeProvider>
       {gameState.status === 'CONNECT' && <ConnectScreen />}
       {gameState.status === 'LOBBY' && <LobbyScreen />}
       {(gameState.status === 'PLAYING' || gameState.status === 'MOVING') && <GameScreen />}
       {gameState.status === 'GAMEOVER' && <GameOverScreen />}
       <ThemeToggle />
       <MuteToggle />
     </ThemeProvider>
  );
}

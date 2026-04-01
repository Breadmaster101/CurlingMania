import { useGameStore } from './useGameStore';
import ConnectScreen from './ConnectScreen';
import LobbyScreen from './LobbyScreen';
import GameScreen from './GameScreen';
import GameOverScreen from './GameOverScreen';

export default function App() {
  const { gameState } = useGameStore();
  
  return (
     <>
       {gameState.status === 'CONNECT' && <ConnectScreen />}
       {gameState.status === 'LOBBY' && <LobbyScreen />}
       {(gameState.status === 'PLAYING' || gameState.status === 'MOVING') && <GameScreen />}
       {gameState.status === 'GAMEOVER' && <GameOverScreen />}
     </>
  );
}

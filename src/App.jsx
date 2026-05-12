import { useGameStore } from './useGameStore';
import HomeScreen from './HomeScreen';
import GameScreen from './GameScreen';

export default function App() {
  const { screen } = useGameStore();

  return (
    <>
      {screen === 'HOME' && <HomeScreen />}
      {screen === 'SOLO' && <GameScreen />}
    </>
  );
}

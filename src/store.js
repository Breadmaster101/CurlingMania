const DEFAULT_NAME = `Rider_${Math.floor(Math.random() * 900 + 100)}`;
const TURN_ORDER = ['up', 'right', 'down', 'left'];
const RIDER_COLORS = ['#6ef3ff', '#ff5d9e', '#ffd85f', '#7dff87'];
const BOT_NAMES = ['Specter', 'Vector', 'Nova', 'Hex'];
const GRID_SIZE = 52;
const STEP_MS = 95;
const COUNTDOWN_TICKS = 24;

function createInitialState() {
  return {
    screen: 'HOME',
    myName: DEFAULT_NAME,
    soloGame: null,
  };
}

function turnDirection(dir, turn) {
  const currentIndex = TURN_ORDER.indexOf(dir);
  const offset = turn === 'left' ? -1 : 1;
  return TURN_ORDER[(currentIndex + offset + TURN_ORDER.length) % TURN_ORDER.length];
}

function dirVector(dir) {
  if (dir === 'up') return { x: 0, y: -1 };
  if (dir === 'down') return { x: 0, y: 1 };
  if (dir === 'left') return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function createRider(id, name, color, x, y, dir, isBot = false) {
  return {
    id,
    name,
    color,
    x,
    y,
    dir,
    queuedTurn: null,
    isBot,
    alive: true,
    placement: null,
    score: 0,
    trail: [{ x, y }],
  };
}

function createSoloGame(playerName) {
  const riders = [
    createRider('player', playerName || DEFAULT_NAME, RIDER_COLORS[0], 10, 26, 'right'),
    createRider('bot-1', BOT_NAMES[0], RIDER_COLORS[1], 41, 12, 'left', true),
    createRider('bot-2', BOT_NAMES[1], RIDER_COLORS[2], 41, 39, 'left', true),
    createRider('bot-3', BOT_NAMES[2], RIDER_COLORS[3], 12, 12, 'down', true),
  ];

  const walls = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  riders.forEach((rider) => {
    walls[rider.y][rider.x] = rider.id;
  });

  return {
    mode: 'solo',
    status: 'countdown',
    tick: 0,
    countdown: 3,
    message: 'Line up. Lock in. Hold your nerve.',
    arenaSize: GRID_SIZE,
    stepMs: STEP_MS,
    elapsedMs: 0,
    walls,
    riders,
    winnerId: null,
    bestTimeMs: 0,
  };
}

class GameStore {
  constructor() {
    this.state = createInitialState();
    this.listeners = new Set();
    this.loopHandle = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((listener) => listener());
  }

  patch(partial) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  getSnapshot() {
    return this.state;
  }

  setName(name) {
    this.patch({ myName: name || DEFAULT_NAME });
  }

  goHome() {
    this.stopLoop();
    this.patch({ screen: 'HOME', soloGame: null });
  }

  startSoloGame(name = this.state.myName) {
    const soloGame = createSoloGame(name);
    this.stopLoop();
    this.patch({
      screen: 'SOLO',
      myName: name || DEFAULT_NAME,
      soloGame,
    });
    this.loopHandle = window.setInterval(() => this.stepSoloGame(), STEP_MS);
  }

  restartSoloGame() {
    this.startSoloGame(this.state.myName);
  }

  stopLoop() {
    if (this.loopHandle) {
      window.clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }

  queueTurn(turn) {
    const soloGame = this.state.soloGame;
    if (!soloGame || soloGame.status !== 'running') {
      return;
    }

    const player = soloGame.riders.find((rider) => rider.id === 'player');
    if (player?.alive) {
      player.queuedTurn = turn;
    }
  }

  isBlocked(walls, x, y) {
    return x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE || Boolean(walls[y][x]);
  }

  pickBotTurn(rider, walls) {
    const candidates = ['straight', 'left', 'right'];
    const shuffled = candidates
      .map((value) => ({ value, sort: Math.random() }))
      .sort((left, right) => left.sort - right.sort)
      .map(({ value }) => value);

    const checkDistance = (dir) => {
      const vector = dirVector(dir);
      let distance = 0;
      let x = rider.x;
      let y = rider.y;
      while (distance < 7) {
        x += vector.x;
        y += vector.y;
        if (this.isBlocked(walls, x, y)) {
          break;
        }
        distance += 1;
      }
      return distance;
    };

    let best = { turn: null, distance: -1 };
    for (const choice of shuffled) {
      const dir = choice === 'straight' ? rider.dir : turnDirection(rider.dir, choice);
      const distance = checkDistance(dir);
      if (distance > best.distance) {
        best = { turn: choice === 'straight' ? null : choice, distance };
      }
    }

    return best.turn;
  }

  applyQueuedTurns(riders, walls) {
    riders.forEach((rider) => {
      if (!rider.alive) {
        return;
      }

      const turn = rider.isBot ? this.pickBotTurn(rider, walls) : rider.queuedTurn;
      if (turn) {
        rider.dir = turnDirection(rider.dir, turn);
      }
      rider.queuedTurn = null;
    });
  }

  stepSoloGame() {
    const soloGame = this.state.soloGame;
    if (!soloGame) {
      return;
    }

    if (soloGame.status === 'countdown') {
      const tick = soloGame.tick + 1;
      const countdown = Math.max(0, 3 - Math.floor(tick / 8));
      const nextStatus = tick >= COUNTDOWN_TICKS ? 'running' : 'countdown';
      const nextGame = {
        ...soloGame,
        tick,
        countdown,
        status: nextStatus,
        message: nextStatus === 'running' ? 'Ride the edge. Cut them off.' : `Launch in ${Math.max(1, countdown)}`,
      };
      this.patch({ soloGame: nextGame });
      return;
    }

    if (soloGame.status !== 'running') {
      return;
    }

    const walls = soloGame.walls.map((row) => [...row]);
    const riders = soloGame.riders.map((rider) => ({
      ...rider,
      trail: [...rider.trail],
    }));

    this.applyQueuedTurns(riders, walls);

    const moves = new Map();
    const headCounts = new Map();
    riders.filter((rider) => rider.alive).forEach((rider) => {
      const vector = dirVector(rider.dir);
      const next = { x: rider.x + vector.x, y: rider.y + vector.y };
      moves.set(rider.id, next);
      const key = `${next.x},${next.y}`;
      headCounts.set(key, (headCounts.get(key) || 0) + 1);
    });

    const crashes = new Set();
    riders.filter((rider) => rider.alive).forEach((rider) => {
      const next = moves.get(rider.id);
      if (this.isBlocked(walls, next.x, next.y)) {
        crashes.add(rider.id);
        return;
      }
      if (headCounts.get(`${next.x},${next.y}`) > 1) {
        crashes.add(rider.id);
      }
    });

    for (let i = 0; i < riders.length; i += 1) {
      const left = riders[i];
      if (!left.alive) continue;
      for (let j = i + 1; j < riders.length; j += 1) {
        const right = riders[j];
        if (!right.alive) continue;
        const leftNext = moves.get(left.id);
        const rightNext = moves.get(right.id);
        if (leftNext.x === right.x && leftNext.y === right.y && rightNext.x === left.x && rightNext.y === left.y) {
          crashes.add(left.id);
          crashes.add(right.id);
        }
      }
    }

    riders.forEach((rider) => {
      if (!rider.alive) {
        return;
      }
      if (crashes.has(rider.id)) {
        rider.alive = false;
        return;
      }
      const next = moves.get(rider.id);
      rider.x = next.x;
      rider.y = next.y;
      rider.trail.push({ x: next.x, y: next.y });
      walls[next.y][next.x] = rider.id;
      rider.score += rider.isBot ? 1 : 2;
    });

    const alive = riders.filter((rider) => rider.alive);
    const deathsThisStep = riders.filter((rider) => crashes.has(rider.id));
    const status = alive.length <= 1 ? 'finished' : 'running';
    let message = soloGame.message;
    let winnerId = null;

    if (deathsThisStep.length > 0) {
      const leadCrash = deathsThisStep.some((rider) => rider.id === 'player')
        ? 'You clipped a barrier.'
        : `${deathsThisStep[0].name} wiped out.`;
      message = leadCrash;
    }

    if (status === 'finished') {
      winnerId = alive[0]?.id ?? null;
      message = winnerId === 'player'
        ? 'Grid dominated. Clean win.'
        : alive[0]
          ? `${alive[0].name} took the round.`
          : 'Nobody made it out.';
      this.stopLoop();
    }

    const nextGame = {
      ...soloGame,
      tick: soloGame.tick + 1,
      elapsedMs: soloGame.elapsedMs + STEP_MS,
      walls,
      riders,
      status,
      winnerId,
      message,
      bestTimeMs: Math.max(soloGame.bestTimeMs, soloGame.elapsedMs + STEP_MS),
    };

    this.patch({ soloGame: nextGame });
  }
}

export const store = new GameStore();

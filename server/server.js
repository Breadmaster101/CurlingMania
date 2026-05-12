import { createServer } from 'node:http';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT || 3001);
const TICK_MS = 100;
const COLORS = ['#ff597d', '#59c7ff', '#7cff8f', '#ffc94b', '#b67dff', '#ff8d5b'];

const rooms = new Map();

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function createRoom(code, hostId) {
  return {
    code,
    hostId,
    status: 'LOBBY',
    players: [],
    settings: {
      arenaWidth: 34,
      arenaHeight: 34,
      maxRounds: 3,
      roundSeconds: 95,
    },
    round: null,
    interval: null,
  };
}

function getRoomBySocket(socket) {
  return socket.data.roomCode ? rooms.get(socket.data.roomCode) : null;
}

function emitRoom(io, room) {
  io.to(room.code).emit('room_state', {
    room: {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      settings: room.settings,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        connected: player.connected,
        isSpectator: player.isSpectator,
        score: player.score,
        roundWins: player.roundWins,
        alive: Boolean(player.alive),
      })),
      round: room.round
        ? {
            ...room.round,
            players: room.players.map((player) => ({
              id: player.id,
              name: player.name,
              color: player.color,
              isSpectator: player.isSpectator,
              alive: Boolean(player.alive),
              x: player.x,
              y: player.y,
              dir: player.dir,
              score: player.score,
              roundWins: player.roundWins,
              surgeTicks: player.surgeTicks,
            })),
          }
        : null,
    },
  });
}

function clearRoomInterval(room) {
  if (room.interval) {
    clearInterval(room.interval);
    room.interval = null;
  }
}

function cellIndex(room, x, y) {
  return y * room.settings.arenaWidth + x;
}

function isOut(room, x, y) {
  return x < 0 || y < 0 || x >= room.settings.arenaWidth || y >= room.settings.arenaHeight;
}

function spawnPositions(room) {
  const { arenaWidth: width, arenaHeight: height } = room.settings;
  return [
    { x: 4, y: 4, dir: 'right' },
    { x: width - 5, y: height - 5, dir: 'left' },
    { x: width - 5, y: 4, dir: 'down' },
    { x: 4, y: height - 5, dir: 'up' },
    { x: Math.floor(width / 2), y: 4, dir: 'down' },
    { x: Math.floor(width / 2), y: height - 5, dir: 'up' },
  ];
}

function setStartTerritory(room, player) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = player.x + dx;
      const y = player.y + dy;
      if (isOut(room, x, y)) {
        continue;
      }
      room.round.territory[cellIndex(room, x, y)] = player.id;
    }
  }
}

function createPickup(room) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const x = Math.floor(Math.random() * room.settings.arenaWidth);
    const y = Math.floor(Math.random() * room.settings.arenaHeight);
    const index = cellIndex(room, x, y);
    if (!room.round.walls[index] && !room.round.pickups.some((pickup) => pickup.x === x && pickup.y === y)) {
      room.round.pickups.push({ x, y });
      return;
    }
  }
}

function startRound(room) {
  const playerSpawns = spawnPositions(room);
  const activePlayers = room.players.filter((player) => !player.isSpectator && player.connected);

  room.status = 'PLAYING';
  room.round = {
    number: (room.round?.number || 0) + 1,
    phase: 'countdown',
    countdownTicks: 25,
    timeLeft: room.settings.roundSeconds,
    timeTicks: room.settings.roundSeconds * 10,
    territory: Array(room.settings.arenaWidth * room.settings.arenaHeight).fill(null),
    walls: Array(room.settings.arenaWidth * room.settings.arenaHeight).fill(null),
    pickups: [],
    arenaWidth: room.settings.arenaWidth,
    arenaHeight: room.settings.arenaHeight,
    winnerId: null,
    message: 'Riders syncing to the grid.',
    roundOverTicks: 0,
  };

  activePlayers.forEach((player, index) => {
    const spawn = playerSpawns[index % playerSpawns.length];
    player.x = spawn.x;
    player.y = spawn.y;
    player.dir = spawn.dir;
    player.pendingDir = spawn.dir;
    player.alive = true;
    player.surgeTicks = 0;
    player.eliminations = 0;
    player.captureTrail = [];
    player.capturing = false;
    setStartTerritory(room, player);
    room.round.walls[cellIndex(room, player.x, player.y)] = player.id;
  });

  room.players.filter((player) => player.isSpectator || !player.connected).forEach((player) => {
    player.alive = false;
    player.x = null;
    player.y = null;
    player.surgeTicks = 0;
  });

  createPickup(room);
  createPickup(room);
}

function directionVector(dir) {
  if (dir === 'up') return { x: 0, y: -1 };
  if (dir === 'down') return { x: 0, y: 1 };
  if (dir === 'left') return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function isOpposite(a, b) {
  return (a === 'up' && b === 'down')
    || (a === 'down' && b === 'up')
    || (a === 'left' && b === 'right')
    || (a === 'right' && b === 'left');
}

function claimLoop(room, player) {
  const { arenaWidth: width, arenaHeight: height } = room.settings;
  const blocked = Array(width * height).fill(false);

  for (let index = 0; index < blocked.length; index += 1) {
    blocked[index] = room.round.walls[index] !== null || room.round.territory[index] === player.id;
  }

  const seen = Array(width * height).fill(false);
  const queue = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const index = y * width + x;
    if (seen[index] || blocked[index]) {
      return;
    }
    seen[index] = true;
    queue.push({ x, y });
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  let claimed = 0;
  for (let index = 0; index < seen.length; index += 1) {
    if (!seen[index] && !blocked[index]) {
      room.round.territory[index] = player.id;
      claimed += 1;
    }
  }

  for (const tile of player.captureTrail) {
    room.round.territory[cellIndex(room, tile.x, tile.y)] = player.id;
  }

  player.score += claimed + player.captureTrail.length;
}

function finishRound(room) {
  const contenders = room.players.filter((player) => !player.isSpectator);
  const alive = contenders.filter((player) => player.alive);

  for (const player of contenders) {
    const territoryScore = room.round.territory.reduce(
      (sum, ownerId) => sum + (ownerId === player.id ? 1 : 0),
      0,
    );
    player.score += territoryScore;
  }

  if (alive[0]) {
    alive[0].score += 40;
    alive[0].roundWins += 1;
    room.round.winnerId = alive[0].id;
    room.round.message = `${alive[0].name} survives the round.`;
  } else {
    room.round.message = 'Mutual destruction. Nobody survives the round.';
  }

  room.round.phase = 'round-over';
  room.round.roundOverTicks = 28;

  const topWins = Math.max(...contenders.map((player) => player.roundWins));
  if (room.round.number >= room.settings.maxRounds || topWins >= 2) {
    room.status = 'MATCH_OVER';
    room.round.phase = 'ended';
  }
}

function maybeEndRound(room) {
  const alive = room.players.filter((player) => !player.isSpectator && player.alive);
  if (alive.length <= 1 || room.round.timeTicks <= 0) {
    finishRound(room);
  }
}

function stepRoom(room) {
  if (!room.round) {
    return;
  }

  if (room.round.phase === 'countdown') {
    room.round.countdownTicks -= 1;
    room.round.message = `Round ${room.round.number} begins in ${Math.ceil(room.round.countdownTicks / 10)}.`;
    if (room.round.countdownTicks <= 0) {
      room.round.phase = 'active';
      room.round.message = 'Ride hard. Close loops. Own the floor.';
    }
    return;
  }

  if (room.round.phase === 'round-over') {
    room.round.roundOverTicks -= 1;
    if (room.round.roundOverTicks <= 0) {
      startRound(room);
    }
    return;
  }

  if (room.round.phase !== 'active') {
    return;
  }

  room.round.timeTicks -= 1;
  room.round.timeLeft = Math.max(0, Math.ceil(room.round.timeTicks / 10));

  if (room.round.pickups.length < 3 && Math.random() < 0.08) {
    createPickup(room);
  }

  const activePlayers = room.players.filter((player) => !player.isSpectator && player.alive);
  const nextMoves = new Map();
  const targetCounts = new Map();

  for (const player of activePlayers) {
    if (player.pendingDir && !isOpposite(player.pendingDir, player.dir)) {
      player.dir = player.pendingDir;
    }

    const vector = directionVector(player.dir);
    const target = { x: player.x + vector.x, y: player.y + vector.y };
    nextMoves.set(player.id, target);
    const key = `${target.x},${target.y}`;
    targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
  }

  const deadPlayers = new Set();

  for (const player of activePlayers) {
    const target = nextMoves.get(player.id);
    if (isOut(room, target.x, target.y)) {
      deadPlayers.add(player.id);
      continue;
    }

    const key = `${target.x},${target.y}`;
    if (targetCounts.get(key) > 1) {
      deadPlayers.add(player.id);
      continue;
    }

    const targetIndex = cellIndex(room, target.x, target.y);
    if (room.round.walls[targetIndex]) {
      deadPlayers.add(player.id);
    }
  }

  for (let i = 0; i < activePlayers.length; i += 1) {
    for (let j = i + 1; j < activePlayers.length; j += 1) {
      const left = activePlayers[i];
      const right = activePlayers[j];
      const leftTarget = nextMoves.get(left.id);
      const rightTarget = nextMoves.get(right.id);
      if (leftTarget.x === right.x && leftTarget.y === right.y && rightTarget.x === left.x && rightTarget.y === left.y) {
        deadPlayers.add(left.id);
        deadPlayers.add(right.id);
      }
    }
  }

  for (const player of activePlayers) {
    if (deadPlayers.has(player.id)) {
      player.alive = false;
      continue;
    }

    const target = nextMoves.get(player.id);
    player.x = target.x;
    player.y = target.y;
    const index = cellIndex(room, player.x, player.y);
    room.round.walls[index] = player.id;

    const pickupIndex = room.round.pickups.findIndex((pickup) => pickup.x === player.x && pickup.y === player.y);
    if (pickupIndex >= 0) {
      room.round.pickups.splice(pickupIndex, 1);
      player.score += 10;
      player.surgeTicks = 30;
    }

    if (room.round.territory[index] === player.id) {
      if (player.capturing && player.captureTrail.length >= 4) {
        claimLoop(room, player);
      }
      player.capturing = false;
      player.captureTrail = [];
    } else {
      player.capturing = true;
      player.captureTrail.push({ x: player.x, y: player.y });
      player.score += player.surgeTicks > 0 ? 1 : 0;
    }

    if (player.surgeTicks > 0) {
      player.surgeTicks -= 1;
    }
  }

  for (const player of activePlayers) {
    if (!player.alive) {
      for (const killer of activePlayers) {
        if (killer.id !== player.id && killer.alive) {
          killer.score += 18;
        }
      }
    }
  }

  maybeEndRound(room);
}

function ensureRoomLoop(io, room) {
  clearRoomInterval(room);
  room.interval = setInterval(() => {
    stepRoom(room);
    emitRoom(io, room);
  }, TICK_MS);
}

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  socket.on('create_room', ({ name }) => {
    let code = randomCode();
    while (rooms.has(code)) {
      code = randomCode();
    }

    const room = createRoom(code, socket.id);
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    room.players.push({
      id: socket.id,
      name: name || 'Rider',
      color: COLORS[0],
      connected: true,
      isSpectator: false,
      score: 0,
      roundWins: 0,
      alive: false,
      x: null,
      y: null,
      dir: 'right',
      pendingDir: 'right',
      surgeTicks: 0,
    });

    emitRoom(io, room);
  });

  socket.on('join_room', ({ roomCode, name }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('room_error', { message: 'Room not found. Double-check the code.' });
      return;
    }

    socket.join(room.code);
    socket.data.roomCode = room.code;

    room.players.push({
      id: socket.id,
      name: name || 'Rider',
      color: COLORS[room.players.length % COLORS.length],
      connected: true,
      isSpectator: room.status !== 'LOBBY',
      score: 0,
      roundWins: 0,
      alive: false,
      x: null,
      y: null,
      dir: 'right',
      pendingDir: 'right',
      surgeTicks: 0,
    });

    emitRoom(io, room);
  });

  socket.on('start_match', () => {
    const room = getRoomBySocket(socket);
    if (!room || room.hostId !== socket.id) {
      return;
    }

    const activePlayers = room.players.filter((player) => !player.isSpectator && player.connected);
    if (activePlayers.length < 2) {
      socket.emit('room_error', { message: 'You need at least two riders to start a match.' });
      return;
    }

    for (const player of room.players) {
      if (!player.isSpectator) {
        player.score = 0;
        player.roundWins = 0;
      }
    }

    startRound(room);
    ensureRoomLoop(io, room);
    emitRoom(io, room);
  });

  socket.on('return_to_lobby', () => {
    const room = getRoomBySocket(socket);
    if (!room || room.hostId !== socket.id) {
      return;
    }

    clearRoomInterval(room);
    room.status = 'LOBBY';
    room.round = null;
    room.players.forEach((player) => {
      player.alive = false;
      player.x = null;
      player.y = null;
      if (!player.isSpectator) {
        player.score = 0;
        player.roundWins = 0;
      }
    });
    emitRoom(io, room);
  });

  socket.on('input', ({ dir }) => {
    const room = getRoomBySocket(socket);
    const player = room?.players.find((entry) => entry.id === socket.id);
    if (!player || player.isSpectator || !player.alive) {
      return;
    }
    player.pendingDir = dir;
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket);
    if (!room) {
      return;
    }

    const player = room.players.find((entry) => entry.id === socket.id);
    if (player) {
      player.connected = false;
      player.alive = false;
    }

    if (room.hostId === socket.id) {
      const nextHost = room.players.find((entry) => entry.connected);
      room.hostId = nextHost?.id || '';
    }

    if (!room.players.some((entry) => entry.connected)) {
      clearRoomInterval(room);
      rooms.delete(room.code);
      return;
    }

    emitRoom(io, room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Retrocycles room server listening on ${PORT}`);
});

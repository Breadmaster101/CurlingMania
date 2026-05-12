import { useEffect, useRef } from 'react';
import { useGameStore } from './useGameStore';

const STARS = Array.from({ length: 90 }, (_, index) => ({
  x: (Math.sin(index * 31.17) * 0.5 + 0.5),
  y: (Math.cos(index * 17.73) * 0.5 + 0.5),
  size: 1 + (index % 3),
  alpha: 0.18 + (index % 5) * 0.1,
}));

function hexToRgb(hex) {
  const parsed = Number.parseInt(hex.replace('#', ''), 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function getForward(dir) {
  if (dir === 'up') return { x: 0, y: 0, z: -1 };
  if (dir === 'down') return { x: 0, y: 0, z: 1 };
  if (dir === 'left') return { x: -1, y: 0, z: 0 };
  return { x: 1, y: 0, z: 0 };
}

function buildCamera(player) {
  const target = { x: player.x + 0.5, y: 0.95, z: player.y + 0.5 };
  const forward = getForward(player.dir);
  const position = {
    x: target.x - forward.x * 6.8,
    y: 5.2,
    z: target.z - forward.z * 6.8,
  };
  const lookDir = normalize({
    x: target.x + forward.x * 7.5 - position.x,
    y: 0.65 - position.y,
    z: target.z + forward.z * 7.5 - position.z,
  });
  const right = normalize(cross(lookDir, { x: 0, y: 1, z: 0 }));
  const up = normalize(cross(right, lookDir));
  return { position, lookDir, right, up };
}

function project(point, camera, width, height) {
  const relative = {
    x: point.x - camera.position.x,
    y: point.y - camera.position.y,
    z: point.z - camera.position.z,
  };
  const depth = dot(relative, camera.lookDir);
  if (depth <= 0.12) {
    return null;
  }

  const horizontal = dot(relative, camera.right);
  const vertical = dot(relative, camera.up);
  const focal = Math.min(width, height) * 0.84;

  return {
    x: width / 2 + (horizontal / depth) * focal,
    y: height / 2 - (vertical / depth) * focal,
    depth,
  };
}

function pushQuad(polys, points, color) {
  const depth = points.reduce((sum, point) => sum + point.depth, 0) / points.length;
  polys.push({ depth, points, color });
}

function drawGround(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#050915');
  sky.addColorStop(0.52, '#090f28');
  sky.addColorStop(1, '#120415');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  STARS.forEach((star) => {
    ctx.fillStyle = `rgba(194, 242, 255, ${star.alpha})`;
    ctx.fillRect(star.x * width, star.y * height * 0.6, star.size, star.size);
  });

  const glow = ctx.createRadialGradient(width * 0.5, height * 0.26, 0, width * 0.5, height * 0.26, width * 0.45);
  glow.addColorStop(0, 'rgba(89, 133, 255, 0.22)');
  glow.addColorStop(1, 'rgba(89, 133, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawWorld(ctx, canvas, game) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const player = game.riders.find((rider) => rider.id === 'player') ?? game.riders[0];
  if (!player) {
    return;
  }

  const camera = buildCamera(player);
  const polys = [];

  for (let y = 0; y < game.arenaSize; y += 1) {
    for (let x = 0; x < game.arenaSize; x += 1) {
      const ownerId = game.walls[y][x];
      if (!ownerId) {
        continue;
      }

      const rider = game.riders.find((entry) => entry.id === ownerId);
      if (!rider) {
        continue;
      }

      const heightUnits = ownerId === 'player' ? 1.95 : 1.8;
      const top = [
        { x, y: heightUnits, z: y },
        { x: x + 1, y: heightUnits, z: y },
        { x: x + 1, y: heightUnits, z: y + 1 },
        { x, y: heightUnits, z: y + 1 },
      ].map((point) => project(point, camera, width, height)).filter(Boolean);

      if (top.length === 4) {
        pushQuad(polys, top, rgba(rider.color, 0.18));
      }

      const neighbors = [
        { dx: 0, dy: -1, face: [{ x, y: 0, z: y }, { x: x + 1, y: 0, z: y }, { x: x + 1, y: heightUnits, z: y }, { x, y: heightUnits, z: y }] },
        { dx: 1, dy: 0, face: [{ x: x + 1, y: 0, z: y }, { x: x + 1, y: 0, z: y + 1 }, { x: x + 1, y: heightUnits, z: y + 1 }, { x: x + 1, y: heightUnits, z: y }] },
        { dx: 0, dy: 1, face: [{ x: x + 1, y: 0, z: y + 1 }, { x, y: 0, z: y + 1 }, { x, y: heightUnits, z: y + 1 }, { x: x + 1, y: heightUnits, z: y + 1 }] },
        { dx: -1, dy: 0, face: [{ x, y: 0, z: y + 1 }, { x, y: 0, z: y }, { x, y: heightUnits, z: y }, { x, y: heightUnits, z: y + 1 }] },
      ];

      neighbors.forEach((neighbor) => {
        const nx = x + neighbor.dx;
        const ny = y + neighbor.dy;
        const covered = nx >= 0 && ny >= 0 && nx < game.arenaSize && ny < game.arenaSize && game.walls[ny][nx] === ownerId;
        if (covered) {
          return;
        }
        const face = neighbor.face.map((point) => project(point, camera, width, height)).filter(Boolean);
        if (face.length === 4) {
          pushQuad(polys, face, rgba(rider.color, 0.72));
        }
      });
    }
  }

  const floorLines = [];
  for (let i = 0; i <= game.arenaSize; i += 2) {
    const a = project({ x: 0, y: 0, z: i }, camera, width, height);
    const b = project({ x: game.arenaSize, y: 0, z: i }, camera, width, height);
    const c = project({ x: i, y: 0, z: 0 }, camera, width, height);
    const d = project({ x: i, y: 0, z: game.arenaSize }, camera, width, height);
    if (a && b) floorLines.push([a, b]);
    if (c && d) floorLines.push([c, d]);
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(99, 238, 255, 0.12)';
  floorLines.forEach(([from, to]) => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  });

  polys.sort((left, right) => right.depth - left.depth);
  polys.forEach((poly) => {
    ctx.beginPath();
    ctx.moveTo(poly.points[0].x, poly.points[0].y);
    poly.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = poly.color;
    ctx.fill();
  });

  game.riders.forEach((rider) => {
    if (!rider.alive) {
      return;
    }
    const base = project({ x: rider.x + 0.5, y: 0.3, z: rider.y + 0.5 }, camera, width, height);
    const top = project({ x: rider.x + 0.5, y: 0.9, z: rider.y + 0.5 }, camera, width, height);
    if (!base || !top) {
      return;
    }

    const size = Math.max(3, 40 / base.depth);
    ctx.fillStyle = rgba(rider.color, 0.2);
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + size * 0.4, size * 2.1, size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = rgba(rider.color, 0.95);
    ctx.lineWidth = Math.max(2, 11 / base.depth);
    ctx.beginPath();
    ctx.moveTo(base.x - size, base.y);
    ctx.lineTo(base.x + size, base.y);
    ctx.stroke();

    ctx.fillStyle = rgba('#ffffff', 0.95);
    ctx.beginPath();
    ctx.arc(top.x, top.y, size * 0.34, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(0, height * 0.82, width, height * 0.18);
}

export default function GameCanvas() {
  const canvasRef = useRef(null);
  const { soloGame } = useGameStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !soloGame) {
      return undefined;
    }

    const ctx = canvas.getContext('2d');
    let frameId = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      drawGround(ctx, width, height);
      drawWorld(ctx, canvas, soloGame);
      frameId = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
    };
  }, [soloGame]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}

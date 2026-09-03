import { io } from 'socket.io-client';
import { audioManager } from './AudioManager';
import {
    num, clamp, safeCoord, isNonEmptyString,
    sanitizeName, getClientToken, generateRoomCode,
} from './net';

const SERVER_URL = 'https://quicklash-server.onrender.com';

// The relay is a free-tier host that sleeps; give reconnection plenty of room.
const socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000,
});

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const SPECTATOR_COLOR = '#94a3b8';

// Emoji keybind mapping: key -> emoji
const EMOJI_KEYBINDS = {
    'u': '\u{1F92C}',
    'i': '\u{1F976}',
    'o': '\u{1F3AF}',
    'j': '\u{1F64F}',
    'k': '\u{1F62D}',
    'l': '\u{1F480}',
};
// Only these exact strings are ever rendered from a remote payload.
const ALLOWED_EMOJI = new Set(Object.values(EMOJI_KEYBINDS));

const VALID_STATUSES = ['CONNECT', 'LOBBY', 'PLAYING', 'MOVING', 'GAMEOVER'];

// ─── Rink geometry (the canvas is a fixed 400x800 coordinate space) ─────
const RINK_W = 400;
const RINK_H = 800;
const STONE_RADIUS = 14;
const WALL_PAD = 5;
const HOME_X = 200;
const HOME_Y = 720;
const HOG_LINE_Y = 450;
const TARGET_X = 200;
const TARGET_Y = 150;
const TARGET_RADIUS = 100;
const GRAB_RADIUS = 30;

// ─── Match rules ────────────────────────────────────────────────────────
const TOTAL_ROUNDS = 3;
const STONES_PER_ROUND = 3;
const MAX_PLAYERS = 12;
const MAX_STONES = MAX_PLAYERS * STONES_PER_ROUND;
const MAX_QUEUE_LENGTH = MAX_PLAYERS * STONES_PER_ROUND;
const MAX_STONE_SPEED = 25;
const THROW_SPEED_MULTIPLIER = 16;

// ─── Physics ────────────────────────────────────────────────────────────
const PHYSICS_STEP_MS = 1000 / 60;
const MAX_CATCHUP_STEPS = 120;          // bounds work per tick when a tab is throttled
const PHYSICS_WATCHDOG_STEPS = 60 * 30; // hard stop after ~30s of simulation
const SETTLE_DELAY_MS = 300;
const FRICTION = 0.985;
const REST_EPSILON = 0.05;
const RESTITUTION = 0.85;
const WALL_BOUNCE = -0.8;

// ─── Timing / networking ────────────────────────────────────────────────
const AFK_TIMEOUT_S = 30;
const AFK_WARNING_AT_S = 20;
const AFK_DISCONNECTED_TIMEOUT_S = 10;  // don't make everyone wait on a dropped player

const INACTIVITY_TIMEOUT = 5 * 60 * 1000;   // idle-but-connected kick
const INACTIVITY_SWEEP_MS = 10000;
const HEARTBEAT_MS = 4000;                  // client -> host liveness ping
const PRESENCE_SWEEP_MS = 3000;
const PRESENCE_STALE_MS = 15000;            // host marks a player as dropped
const PRESENCE_DROP_MS = 90000;             // host removes them entirely
const HOST_KEEPALIVE_MS = 5000;             // host -> everyone state refresh
const HOST_SILENCE_MS = 18000;              // client decides the host link is gone
const HOST_ABANDONED_MS = 60000;            // client gives up and releases the player
const REJOIN_RETRY_MS = 6000;
const JOIN_TIMEOUT_MS = 12000;
const THROW_ACK_TIMEOUT_MS = 5000;
const ROOM_CLAIM_WINDOW_MS = 4000;          // window in which an error means "code taken"
const MAX_ROOM_CODE_ATTEMPTS = 6;
const EMOJI_MIN_INTERVAL_MS = 350;
const MAX_EMOJI_PARTICLES = 80;
// Where a reaction pops from when no leaderboard row is on screen for that
// player (mobile with the drawer closed, or a player who just left).
const DEFAULT_EMOJI_ANCHOR = Object.freeze({ x: 30, y: 68 });
const DRAG_SYNC_MS = 30;
const ERROR_TOAST_MS = 4000;

function makeInitialGameState() {
    return {
        players: [],
        stones: [],
        turnQueue: [],      // Explicit ordered list of player IDs for this round
        turnQueueIndex: 0,  // Current position in the turnQueue
        round: 1,
        leaderboard: [],    // Sorted copy for display (never used for turn logic)
        status: 'CONNECT',  // 'CONNECT', 'LOBBY', 'PLAYING', 'MOVING', 'GAMEOVER'
        gameMode: 'MANIA',  // 'MANIA' or 'ZEN'
        turnWarning: false, // true when 10s remain before AFK skip
        turnWarningPlayerName: '', // name of the player who will be skipped
        turnTimeLeft: 0,    // seconds remaining before skip
        stateSeq: 0,        // monotonic; lets clients drop out-of-order snapshots
    };
}

class GameStore {
    constructor() {
        this.clientToken = getClientToken();
        this.isHost = false;
        this.myId = '';
        this.myName = '';
        this.currentRoom = '';
        this.isSpectator = false;
        this.errorMsg = '';

        // Connection status surfaced to the UI
        this.connectionState = 'connecting'; // 'connecting' | 'online' | 'reconnecting'
        this.hostLinkLost = false;           // client heard nothing from the host recently

        this.gameState = makeInitialGameState();

        this.activeStone = { x: HOME_X, y: HOME_Y };
        this.mouseHistory = [];
        this.isGrabbing = false;
        this.throwPending = false;   // client threw, waiting for the host to confirm

        // Timers / loops
        this.physicsInterval = null;
        this.physicsAccumulator = 0;
        this.lastPhysicsTime = 0;
        this.physicsStepsRun = 0;
        this.settleTimeout = null;
        this.turnTimerInterval = null;
        this.turnStartTime = null;
        this.turnTimeoutSeconds = AFK_TIMEOUT_S;
        this.throwAckTimeout = null;
        this.errorTimeout = null;
        this.joinTimeout = null;

        // Host-only bookkeeping, deliberately kept out of the broadcast state
        this.playerTokens = {};      // socketId -> clientToken
        this.zenPlayerOrder = null;  // Zen keeps one random order for all rounds
        this.roomClaimDeadline = 0;
        this.roomClaimAttempts = 0;
        this.roomClaimReason = null; // 'create' | 'rehost'
        this.lastKeepaliveAt = 0;

        // Client-only bookkeeping
        this.lastHostMessageAt = 0;
        this.disconnectedAt = 0;
        this.lastRejoinAttempt = 0;
        this.lastHeartbeatAt = 0;
        this.lastAppliedSeq = -1;
        this.lastEmojiSentAt = 0;
        this.lastDragSync = 0;
        this.remoteEmojiTimestamps = {}; // playerId -> last accepted emoji time

        // Emoji reaction system
        this.emojiParticles = [];
        this.emojiAnchorResolver = null;
        this.emojiFrame = null;
        this.lastEmojiFrameTime = 0;
        this.emojiIdCounter = 0;

        this.listeners = new Set();

        this._handleKeyDown = (e) => this.handleGlobalKeyDown(e);
        window.addEventListener('keydown', this._handleKeyDown);

        this.bindSocketHandlers();
        this.startBackgroundLoops();
    }

    // ─── Subscriptions ───────────────────────────────────────────────

    notify() {
        this.listeners.forEach(l => l());
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getSnapshot() {
        return {
            isHost: this.isHost,
            myId: this.myId,
            myName: this.myName,
            currentRoom: this.currentRoom,
            isSpectator: this.isSpectator,
            errorMsg: this.errorMsg,
            gameState: this.gameState, // By ref is fine
            activeStone: this.activeStone,
            isGrabbing: this.isGrabbing,
            throwPending: this.throwPending,
            emojiParticles: this.emojiParticles,
            emojiKeybinds: EMOJI_KEYBINDS,
            connectionState: this.connectionState,
            hostLinkLost: this.hostLinkLost,
        };
    }

    // ─── Error surface ───────────────────────────────────────────────

    /** Shows a message. Transient ones clear themselves without racing each other. */
    setError(message, { transient = false } = {}) {
        if (this.errorTimeout) {
            clearTimeout(this.errorTimeout);
            this.errorTimeout = null;
        }
        this.errorMsg = message;
        if (message && transient) {
            this.errorTimeout = setTimeout(() => {
                this.errorTimeout = null;
                this.errorMsg = '';
                this.notify();
            }, ERROR_TOAST_MS);
        }
        this.notify();
    }

    clearError() {
        if (!this.errorMsg && !this.errorTimeout) return;
        this.setError('');
    }

    // ─── Socket wiring ───────────────────────────────────────────────

    bindSocketHandlers() {
        socket.on('connect', () => this.handleConnect());
        socket.on('disconnect', () => this.handleDisconnect());
        socket.on('connect_error', () => this.handleConnectError());
        socket.io.on('reconnect_attempt', () => {
            if (this.connectionState !== 'online') {
                this.connectionState = 'reconnecting';
                this.notify();
            }
        });

        socket.on('error_msg', (msg) => this.handleServerError(msg));
        socket.on('player_joined', (data) => this.handlePlayerJoined(data));
        socket.on('player_data', (payload) => this.handlePlayerData(payload));
        socket.on('game_data', (payload) => this.handleGameData(payload));
    }

    handleConnect() {
        const previousId = this.myId;
        this.myId = socket.id || '';
        this.connectionState = 'online';

        // Silence while our own socket was down says nothing about the host, so
        // credit the outage back before the host watchdog judges them for it.
        if (this.disconnectedAt) {
            const outage = Date.now() - this.disconnectedAt;
            this.disconnectedAt = 0;
            if (this.lastHostMessageAt) this.lastHostMessageAt += outage;
        }

        if (this.currentRoom) {
            if (this.isHost) {
                // Our old socket died along with the room registration. Claim the
                // code again and move our own player entry onto the new socket id.
                this.remapPlayerId(previousId, this.myId);
                this.roomClaimAttempts = 0;
                this.claimRoom('rehost');
                this.hostBroadcastState();
            } else {
                this.rejoinRoom();
            }
        }
        this.notify();
    }

    handleDisconnect() {
        this.connectionState = 'reconnecting';
        this.disconnectedAt = Date.now();
        // A dropped socket cannot deliver a throw; abandon any in-flight grab.
        this.isGrabbing = false;
        this.throwPending = false;
        this.clearThrowAck();
        this.notify();
    }

    handleConnectError() {
        if (this.connectionState !== 'reconnecting') {
            this.connectionState = 'reconnecting';
            this.notify();
        }
    }

    handleServerError(msg) {
        const text = typeof msg === 'string' && msg.trim()
            ? msg.trim().slice(0, 140)
            : 'Something went wrong.';

        // An error inside the claim window means the room code was rejected.
        if (this.roomClaimReason && Date.now() < this.roomClaimDeadline) {
            const reason = this.roomClaimReason;
            if (this.roomClaimAttempts >= MAX_ROOM_CODE_ATTEMPTS) {
                this.roomClaimReason = null;
                this.resetToConnect(reason === 'create'
                    ? 'Could not create a room right now. Please try again.'
                    : 'Lost the room after a connection drop.');
                return;
            }
            if (reason === 'create') {
                // Code collision: pick another one and try again immediately.
                this.currentRoom = generateRoomCode();
                this.claimRoom('create');
                this.notify();
            } else {
                // The server may still be holding our previous registration.
                // Back off and retry rather than tearing the match down.
                setTimeout(() => {
                    if (this.isHost && this.currentRoom) this.claimRoom('rehost');
                }, 1500);
            }
            return;
        }

        if (this.gameState.status === 'CONNECT') {
            // Initial join failed: send them back to the form with the reason.
            this.clearJoinTimeout();
            this.currentRoom = '';
            this.isHost = false;
            this.setError(text);
            return;
        }

        // We are mid-match, usually because a silent re-join failed. Don't evict
        // the player over it: surface it briefly and let the retry loop continue.
        this.setError(text, { transient: true });
    }

    // ─── Host: players joining ───────────────────────────────────────

    handlePlayerJoined(data) {
        if (!this.isHost || !this.currentRoom) return;
        if (!data || !isNonEmptyString(data.id)) return;
        if (data.id === this.myId) return;

        const name = sanitizeName(data.name);
        const existing = this.gameState.players.find(p => p.id === data.id);
        if (existing) {
            // A socket we already know re-announcing itself (client recovering
            // from host silence). Refresh presence instead of duplicating them.
            existing.name = name;
            existing.connected = true;
            existing.lastSeen = Date.now();
            this.hostBroadcastState();
            return;
        }

        if (this.gameState.players.length >= MAX_PLAYERS) {
            this.kickPlayer(data.id, 'The room is full.');
            return;
        }

        const isLateJoin = this.gameState.status !== 'LOBBY';
        this.gameState.players.push({
            id: data.id,
            name,
            color: isLateJoin ? SPECTATOR_COLOR : this.pickColor(),
            score: 0,
            totalScore: 0,
            prevRoundScore: 0,
            stonesLeft: isLateJoin ? 0 : STONES_PER_ROUND,
            isSpectator: isLateJoin,
            connected: true,
            lastActivity: Date.now(),
            lastSeen: Date.now(),
        });
        this.gameState.leaderboard = this.getSortedLeaderboard();
        this.hostBroadcastState();
    }

    /** First unused palette colour, so two players never share one. */
    pickColor() {
        const taken = new Set(this.gameState.players.map(p => p.color));
        const free = PLAYER_COLORS.find(c => !taken.has(c));
        return free || PLAYER_COLORS[this.gameState.players.length % PLAYER_COLORS.length];
    }

    /**
     * A client announced its stable token. If that token already belongs to a
     * player, this is a reconnect: move the old entry (score, stones, turn slot)
     * onto the new socket id instead of leaving a ghost behind.
     */
    handleHello(id, token, name) {
        if (!this.isHost) return;
        if (!isNonEmptyString(token)) return;

        const prior = this.gameState.players.find(
            p => p.id !== id && this.playerTokens[p.id] === token
        );

        if (prior) {
            const oldId = prior.id;
            // Drop the duplicate entry the fresh join created.
            this.gameState.players = this.gameState.players.filter(p => p.id !== id);
            delete this.playerTokens[oldId];
            this.playerTokens[id] = token;
            this.remapPlayerId(oldId, id);
            if (name) prior.name = sanitizeName(name);
            prior.connected = true;
            prior.lastSeen = Date.now();
            prior.lastActivity = Date.now();
            this.refreshTurnTimerTarget();
        } else {
            this.playerTokens[id] = token;
            const player = this.gameState.players.find(p => p.id === id);
            if (player) {
                player.connected = true;
                player.lastSeen = Date.now();
            }
        }
        this.hostBroadcastState();
    }

    /**
     * Rewrites every reference to a player id after a reconnect. `oldId` may be
     * the empty placeholder used when a room was created before the socket
     * finished connecting.
     */
    remapPlayerId(oldId, newId) {
        if (!newId || oldId === newId) return;

        // If the new id somehow already has an entry, the old one wins: it holds
        // the score and the turn-queue slot.
        this.gameState.players = this.gameState.players.filter(p => p.id !== newId);

        const player = this.gameState.players.find(p => p.id === oldId);
        if (player) player.id = newId;

        this.gameState.turnQueue = this.gameState.turnQueue.map(id => (id === oldId ? newId : id));
        this.gameState.stones.forEach(s => { if (s.playerId === oldId) s.playerId = newId; });
        this.emojiParticles.forEach(p => { if (p.playerId === oldId) p.playerId = newId; });
        if (this.zenPlayerOrder) {
            this.zenPlayerOrder = this.zenPlayerOrder.map(id => (id === oldId ? newId : id));
        }
        if (this.playerTokens[oldId] && !this.playerTokens[newId]) {
            this.playerTokens[newId] = this.playerTokens[oldId];
        }
        delete this.playerTokens[oldId];
        this.gameState.leaderboard = this.getSortedLeaderboard();
    }

    // ─── Host: inbound client messages ───────────────────────────────

    handlePlayerData(payload) {
        if (!this.isHost || !this.currentRoom) return;
        if (!payload || !isNonEmptyString(payload.id)) return;
        if (!payload.data || typeof payload.data !== 'object') return;

        const { id, data } = payload;

        // HELLO is the one message accepted from an unknown id: it is how a
        // reconnecting player re-attaches to their existing entry.
        if (data.action === 'HELLO') {
            this.handleHello(id, data.token, data.name);
            return;
        }

        const player = this.gameState.players.find(p => p.id === id);
        if (!player) return;

        player.lastSeen = Date.now();
        if (!player.connected) {
            player.connected = true;
            this.refreshTurnTimerTarget();
            this.hostBroadcastState();
        }

        switch (data.action) {
            case 'PING':
                return;
            case 'RESYNC':
                this.hostBroadcastState();
                return;
            case 'THROW':
                player.lastActivity = Date.now();
                this.hostAcceptThrow(player, data);
                return;
            case 'DRAG':
                player.lastActivity = Date.now();
                if (this.gameState.status === 'PLAYING' && !this.physicsInterval) {
                    const current = this.getActivePlayer();
                    if (current && current.id === id) {
                        this.hostBroadcastDrag(
                            id,
                            safeCoord(data.x, STONE_RADIUS, RINK_W - STONE_RADIUS, HOME_X),
                            safeCoord(data.y, HOG_LINE_Y, RINK_H - STONE_RADIUS, HOME_Y),
                        );
                    }
                }
                return;
            case 'EMOJI':
                player.lastActivity = Date.now();
                this.hostRelayEmoji(id, data.emoji);
                return;
            case 'LEAVE_ROOM':
                this.removePlayer(id);
                return;
            default:
                return;
        }
    }

    /** Validates a throw against the rules before it is allowed to happen. */
    hostAcceptThrow(player, data) {
        if (this.gameState.status !== 'PLAYING') return;
        if (this.physicsInterval) return;
        if (player.isSpectator || player.stonesLeft <= 0) return;

        const current = this.getActivePlayer();
        if (!current || current.id !== player.id) return;

        const throwData = this.sanitizeThrowInput(data);
        if (!throwData) return;

        this.clearTurnTimer();
        player.stonesLeft--;
        this.gameState.status = 'MOVING';
        this.hostBroadcastThrow(player.id, player.color, throwData);
    }

    /** Clamps a throw into legal positions/speeds; rejects a stationary one. */
    sanitizeThrowInput(data) {
        const x = safeCoord(data.x, STONE_RADIUS, RINK_W - STONE_RADIUS, HOME_X);
        const y = safeCoord(data.y, HOG_LINE_Y - 20, RINK_H - STONE_RADIUS, HOME_Y);
        let vx = clamp(num(data.vx, 0), -MAX_STONE_SPEED, MAX_STONE_SPEED);
        let vy = clamp(num(data.vy, 0), -MAX_STONE_SPEED, MAX_STONE_SPEED);

        const speed = Math.hypot(vx, vy);
        if (!Number.isFinite(speed) || speed < 0.01) return null;
        if (speed > MAX_STONE_SPEED) {
            vx = (vx / speed) * MAX_STONE_SPEED;
            vy = (vy / speed) * MAX_STONE_SPEED;
        }
        return { x, y, vx, vy };
    }

    hostRelayEmoji(playerId, emoji) {
        if (!ALLOWED_EMOJI.has(emoji)) return;
        const now = Date.now();
        const last = this.remoteEmojiTimestamps[playerId] || 0;
        if (now - last < EMOJI_MIN_INTERVAL_MS) return; // rate limit relayed spam
        this.remoteEmojiTimestamps[playerId] = now;

        socket.emit('host_broadcast', {
            roomCode: this.currentRoom,
            data: { action: 'SYNC_EMOJI', playerId, emoji },
        });
        this.spawnEmojiParticle(playerId, emoji);
    }

    // ─── Client: inbound host messages ───────────────────────────────

    handleGameData(payload) {
        if (!this.currentRoom) return;
        if (!payload || typeof payload !== 'object' || typeof payload.action !== 'string') return;

        this.lastHostMessageAt = Date.now();
        if (this.hostLinkLost) {
            this.hostLinkLost = false;
            this.notify();
        }

        switch (payload.action) {
            case 'HOST_LEFT':
                if (this.isHost) return; // our own echo
                this.resetToConnect('The host left the room.', { transient: true });
                return;
            case 'PLAYER_KICKED':
                if (!isNonEmptyString(payload.playerId)) return;
                if (payload.playerId === this.myId && !this.isHost) {
                    const reason = typeof payload.reason === 'string' && payload.reason.trim()
                        ? payload.reason.trim().slice(0, 140)
                        : 'You were kicked by the host.';
                    this.resetToConnect(reason, { transient: true });
                } else {
                    this.removePlayer(payload.playerId);
                }
                return;
            case 'SYNC_STATE':
                if (this.isHost) return;
                this.applyRemoteState(payload.state);
                return;
            case 'SYNC_THROW':
                if (this.isHost) return;
                this.applyThrow(payload.throwData);
                return;
            case 'SYNC_DRAG':
                if (this.isHost) return;
                if (payload.playerId !== this.myId) {
                    this.applyDrag(
                        safeCoord(payload.x, STONE_RADIUS, RINK_W - STONE_RADIUS, HOME_X),
                        safeCoord(payload.y, 0, RINK_H, HOME_Y),
                    );
                }
                return;
            case 'SYNC_EMOJI':
                if (payload.playerId !== this.myId && ALLOWED_EMOJI.has(payload.emoji)) {
                    this.spawnEmojiParticle(payload.playerId, payload.emoji);
                }
                return;
            default:
                return;
        }
    }

    // ─── Background loops ────────────────────────────────────────────

    startBackgroundLoops() {
        // Host: clear out abandoned tabs that are holding a lobby open. This is
        // deliberately NOT run during a match: a player watching eleven other
        // people throw can easily go five minutes without touching anything, and
        // the AFK turn timer plus the heartbeat already cover the in-game cases.
        this.inactivityInterval = setInterval(() => {
            if (!this.isHost || !this.currentRoom) return;
            if (this.gameState.status !== 'LOBBY' && this.gameState.status !== 'GAMEOVER') return;
            const now = Date.now();

            this.gameState.players
                .filter(p => p.id !== this.myId && now - num(p.lastActivity, now) > INACTIVITY_TIMEOUT)
                .forEach(p => this.kickPlayer(p.id, 'Kicked due to inactivity.'));

            const me = this.gameState.players.find(p => p.id === this.myId);
            if (me && now - num(me.lastActivity, now) > INACTIVITY_TIMEOUT) {
                this.leaveRoom();
            }
        }, INACTIVITY_SWEEP_MS);

        // Host: presence sweep + state keepalive. Client: heartbeat + link watchdog.
        this.presenceInterval = setInterval(() => this.tickPresence(), PRESENCE_SWEEP_MS);
    }

    tickPresence() {
        if (!this.currentRoom) return;
        const now = Date.now();

        if (this.isHost) {
            const me = this.gameState.players.find(p => p.id === this.myId);
            if (me) { me.lastSeen = now; me.connected = true; }

            let changed = false;
            const dropped = [];
            for (const p of this.gameState.players) {
                if (p.id === this.myId) continue;
                const silence = now - num(p.lastSeen, now);
                if (silence > PRESENCE_DROP_MS) {
                    dropped.push(p.id);
                } else if (silence > PRESENCE_STALE_MS && p.connected) {
                    p.connected = false;
                    changed = true;
                } else if (silence <= PRESENCE_STALE_MS && !p.connected) {
                    p.connected = true;
                    changed = true;
                }
            }
            dropped.forEach(id => this.removePlayer(id));

            // A dropped player must not hold the turn hostage.
            if (changed) this.refreshTurnTimerTarget();

            if (changed || dropped.length > 0 || now - this.lastKeepaliveAt >= HOST_KEEPALIVE_MS) {
                this.hostBroadcastState();
            }
            return;
        }

        // Client: prove we're alive, and notice if the host stops talking.
        if (socket.connected && now - this.lastHeartbeatAt >= HEARTBEAT_MS) {
            this.lastHeartbeatAt = now;
            this.sendToHost({ action: 'PING' });
        }

        if (!this.lastHostMessageAt || now - this.lastHostMessageAt <= HOST_SILENCE_MS) return;

        if (!this.hostLinkLost) {
            this.hostLinkLost = true;
            this.notify();
        }

        // Our own socket being down is not the host's fault; wait for it to come
        // back before counting this against the host.
        if (!socket.connected) return;

        // The host may have reconnected under a new socket, which drops the
        // server-side room. Re-announce ourselves until it sticks again.
        if (now - this.lastRejoinAttempt > REJOIN_RETRY_MS) {
            this.rejoinRoom();
        }

        // A host whose tab actually died is never coming back: the room only
        // exists in their memory. Release the player instead of leaving them
        // staring at a frozen board forever.
        if (now - this.lastHostMessageAt > HOST_ABANDONED_MS) {
            this.resetToConnect('Lost contact with the host. The room is gone.', { transient: true });
        }
    }

    // ─── Room lifecycle ──────────────────────────────────────────────

    /** (Re)registers our room code with the relay and opens the error window. */
    claimRoom(reason) {
        this.roomClaimReason = reason;
        this.roomClaimAttempts++;
        this.roomClaimDeadline = Date.now() + ROOM_CLAIM_WINDOW_MS;
        socket.emit('create_room', this.currentRoom);
    }

    rejoinRoom() {
        if (!this.currentRoom || this.isHost) return;
        this.lastRejoinAttempt = Date.now();
        socket.emit('join_room', { roomCode: this.currentRoom, name: this.myName });
        this.sendToHost({ action: 'HELLO', token: this.clientToken, name: this.myName });
        this.sendToHost({ action: 'RESYNC' });
    }

    createRoom(name) {
        if (this.currentRoom) return;
        this.myName = sanitizeName(name);
        this.currentRoom = generateRoomCode();
        this.isHost = true;
        this.isSpectator = false;
        this.roomClaimAttempts = 0;
        this.clearError();

        this.gameState = makeInitialGameState();
        this.zenPlayerOrder = null;
        this.playerTokens = {};
        this.remoteEmojiTimestamps = {};

        this.claimRoom('create');

        this.gameState.players.push({
            id: this.myId,
            name: this.myName,
            color: PLAYER_COLORS[0],
            score: 0,
            totalScore: 0,
            prevRoundScore: 0,
            stonesLeft: STONES_PER_ROUND,
            isSpectator: false,
            connected: true,
            lastActivity: Date.now(),
            lastSeen: Date.now(),
        });
        this.gameState.status = 'LOBBY';
        this.gameState.leaderboard = this.getSortedLeaderboard();
        this.notify();
    }

    joinRoom(name, room) {
        if (this.currentRoom) return;
        const code = typeof room === 'string' ? room.trim().toUpperCase() : '';
        if (!code) {
            this.setError('Enter a room code to join.');
            return;
        }
        this.myName = sanitizeName(name);
        this.currentRoom = code;
        this.isHost = false;
        this.isSpectator = false;
        this.lastAppliedSeq = -1;
        this.lastHostMessageAt = 0;
        this.hostLinkLost = false;
        this.clearError();

        // Stay on CONNECT until the host sends us a real state. If the room does
        // not exist the server answers with error_msg; if it is merely asleep the
        // timeout below gives up on our behalf.
        socket.emit('join_room', { roomCode: this.currentRoom, name: this.myName });
        this.sendToHost({ action: 'HELLO', token: this.clientToken, name: this.myName });

        this.clearJoinTimeout();
        this.joinTimeout = setTimeout(() => {
            this.joinTimeout = null;
            if (this.gameState.status === 'CONNECT') {
                this.currentRoom = '';
                this.setError('Room not found. Check the code and try again.');
            }
        }, JOIN_TIMEOUT_MS);

        this.notify();
    }

    clearJoinTimeout() {
        if (this.joinTimeout) {
            clearTimeout(this.joinTimeout);
            this.joinTimeout = null;
        }
    }

    /** Tears every loop and buffer down and returns to the connect screen. */
    resetToConnect(message, options = {}) {
        this.clearJoinTimeout();
        this.clearTurnTimer();
        this.stopPhysics();
        this.clearThrowAck();

        this.gameState = makeInitialGameState();
        this.currentRoom = '';
        this.isHost = false;
        this.isSpectator = false;
        this.isGrabbing = false;
        this.throwPending = false;
        this.mouseHistory = [];
        this.activeStone = { x: HOME_X, y: HOME_Y };
        this.zenPlayerOrder = null;
        this.playerTokens = {};
        this.remoteEmojiTimestamps = {};
        this.lastAppliedSeq = -1;
        this.lastHostMessageAt = 0;
        this.hostLinkLost = false;
        this.roomClaimReason = null;

        if (message) this.setError(message, options);
        else this.setError('');
    }

    leaveRoom() {
        if (!this.currentRoom) {
            this.resetToConnect('');
            return;
        }
        if (this.isHost) {
            socket.emit('host_broadcast', {
                roomCode: this.currentRoom,
                data: { action: 'HOST_LEFT' },
            });
        } else {
            this.sendToHost({ action: 'LEAVE_ROOM' });
        }
        this.resetToConnect('');
    }

    kickPlayer(playerId, reason) {
        if (!this.isHost) return;
        if (!isNonEmptyString(playerId) || playerId === this.myId) return;
        socket.emit('host_broadcast', {
            roomCode: this.currentRoom,
            data: {
                action: 'PLAYER_KICKED',
                playerId,
                reason: reason || 'You were kicked by the host.',
            },
        });
        this.removePlayer(playerId);
    }

    removePlayer(playerId) {
        if (!this.isHost) return;
        if (!isNonEmptyString(playerId)) return;
        if (!this.gameState.players.some(p => p.id === playerId)) return;

        this.gameState.players = this.gameState.players.filter(p => p.id !== playerId);
        delete this.playerTokens[playerId];
        delete this.remoteEmojiTimestamps[playerId];

        const inPlay = this.gameState.status === 'PLAYING' || this.gameState.status === 'MOVING';
        if (!inPlay) {
            this.gameState.leaderboard = this.getSortedLeaderboard();
            this.hostBroadcastState();
            return;
        }

        const activeId = this.gameState.turnQueue[this.gameState.turnQueueIndex];
        this.gameState.turnQueue = this.gameState.turnQueue.filter(id => id !== playerId);

        if (activeId === playerId) {
            // The player whose turn it was is gone. Step back so the normal
            // advance lands on whoever inherited the slot.
            this.gameState.turnQueueIndex = clamp(
                this.gameState.turnQueueIndex - 1, -1, this.gameState.turnQueue.length
            );
            if (!this.physicsInterval) {
                this.checkTurnEnd();
                return;
            }
        } else {
            const newIndex = this.gameState.turnQueue.indexOf(activeId);
            if (newIndex !== -1) this.gameState.turnQueueIndex = newIndex;
        }

        this.refreshTurnTimerTarget();
        this.gameState.leaderboard = this.getSortedLeaderboard();
        this.hostBroadcastState();
    }

    // ─── Match flow ──────────────────────────────────────────────────

    setGameMode(mode) {
        if (!this.isHost) return;
        if (mode !== 'MANIA' && mode !== 'ZEN') return;
        if (this.gameState.status !== 'LOBBY') return;
        this.updateActivity();
        this.gameState.gameMode = mode;
        this.hostBroadcastState();
    }

    startGame() {
        if (!this.isHost) return;
        if (this.gameState.status !== 'LOBBY') return;

        const contenders = this.gameState.players.filter(p => !p.isSpectator);
        if (contenders.length === 0) {
            this.setError('Need at least one player to start.', { transient: true });
            return;
        }

        this.updateActivity();
        this.stopPhysics();
        this.gameState.status = 'PLAYING';
        this.gameState.round = 1;
        this.gameState.stones = [];
        audioManager.playStart();

        this.gameState.players.forEach(p => {
            p.stonesLeft = p.isSpectator ? 0 : STONES_PER_ROUND;
            p.score = 0;
            p.totalScore = 0;
            p.prevRoundScore = 0;
        });

        if (this.gameState.gameMode === 'ZEN') {
            this.buildZenTurnQueue(true);
        } else {
            this.buildTurnQueue(true);
        }

        this.activeStone = { x: HOME_X, y: HOME_Y };
        this.gameState.leaderboard = this.getSortedLeaderboard();
        this.gameState.turnWarning = false;
        this.gameState.turnWarningPlayerName = '';
        this.gameState.turnTimeLeft = 0;
        this.hostBroadcastState();
        this.startTurnTimer();
    }

    /**
     * Builds a round-robin turn queue for Mania mode.
     * Each player throws 1 stone per turn, cycling through all players
     * until everyone has used all their stones.
     * @param {boolean} randomize - If true, shuffle the starting order (round 1).
     *                              If false, order by descending previous-round
     *                              score: the round's winner throws first, and the
     *                              trailing player gets the last stone (the hammer).
     */
    buildTurnQueue(randomize) {
        const validPlayers = this.gameState.players.filter(p => !p.isSpectator);

        if (randomize) {
            // Fisher-Yates shuffle
            for (let i = validPlayers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [validPlayers[i], validPlayers[j]] = [validPlayers[j], validPlayers[i]];
            }
        } else {
            validPlayers.sort((a, b) => num(b.prevRoundScore, 0) - num(a.prevRoundScore, 0));
        }

        // Round-robin: one stone each, repeated until everyone is out of stones.
        const maxStones = validPlayers.reduce((max, p) => Math.max(max, num(p.stonesLeft, 0)), 0);
        const queue = [];
        for (let throwNum = 0; throwNum < maxStones; throwNum++) {
            for (const p of validPlayers) {
                if (p.stonesLeft > throwNum) queue.push(p.id);
            }
        }

        this.gameState.turnQueue = queue.slice(0, MAX_QUEUE_LENGTH);
        this.gameState.turnQueueIndex = 0;
    }

    /**
     * Builds a turn queue for Zen mode.
     * Each player throws 3 stones consecutively on their own rink.
     * The order is randomized once and kept for all 3 rounds.
     * @param {boolean} firstRound - If true, randomize and store the order.
     */
    buildZenTurnQueue(firstRound) {
        let validPlayers;

        if (firstRound || !this.zenPlayerOrder) {
            validPlayers = this.gameState.players.filter(p => !p.isSpectator);
            // Fisher-Yates shuffle
            for (let i = validPlayers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [validPlayers[i], validPlayers[j]] = [validPlayers[j], validPlayers[i]];
            }
            this.zenPlayerOrder = validPlayers.map(p => p.id);
        } else {
            // Reuse the stored order, dropping anyone who left and appending
            // anyone who became a contender since.
            const byId = new Map(
                this.gameState.players.filter(p => !p.isSpectator).map(p => [p.id, p])
            );
            validPlayers = this.zenPlayerOrder.map(id => byId.get(id)).filter(Boolean);
            const seen = new Set(validPlayers.map(p => p.id));
            byId.forEach((p, id) => { if (!seen.has(id)) validPlayers.push(p); });
            this.zenPlayerOrder = validPlayers.map(p => p.id);
        }

        // Each player gets their remaining stones as consecutive entries.
        const queue = [];
        for (const p of validPlayers) {
            const stones = clamp(num(p.stonesLeft, STONES_PER_ROUND), 0, STONES_PER_ROUND);
            for (let i = 0; i < stones; i++) queue.push(p.id);
        }

        this.gameState.turnQueue = queue.slice(0, MAX_QUEUE_LENGTH);
        this.gameState.turnQueueIndex = 0;
    }

    returnToLobby() {
        // Host-only: the host owns the room state, and a local hop back to the
        // lobby would just be undone by the next state broadcast.
        if (!this.isHost) return;

        this.clearTurnTimer();
        this.stopPhysics();
        this.activeStone = { x: HOME_X, y: HOME_Y };
        this.updateActivity();
        this.gameState.status = 'LOBBY';
        this.gameState.stones = [];
        this.gameState.round = 1;
        this.gameState.turnQueue = [];
        this.gameState.turnQueueIndex = 0;
        this.zenPlayerOrder = null;
        this.gameState.players.forEach(p => {
            p.isSpectator = false;
            p.score = 0;
            p.totalScore = 0;
            p.prevRoundScore = 0;
            p.stonesLeft = STONES_PER_ROUND;
        });

        // Everyone is a contender again, so hand out distinct colours.
        const used = new Set();
        this.gameState.players.forEach(p => {
            if (PLAYER_COLORS.includes(p.color) && !used.has(p.color)) {
                used.add(p.color);
                return;
            }
            const free = PLAYER_COLORS.find(c => !used.has(c)) || SPECTATOR_COLOR;
            p.color = free;
            used.add(free);
        });

        this.gameState.leaderboard = this.getSortedLeaderboard();
        this.hostBroadcastState();
    }

    getActivePlayer() {
        const queue = this.gameState.turnQueue;
        const idx = this.gameState.turnQueueIndex;
        if (!Array.isArray(queue) || idx < 0 || idx >= queue.length) return null;
        return this.gameState.players.find(p => p.id === queue[idx]) || null;
    }

    /** Skips queue entries pointing at players who left or became spectators. */
    advancePastMissing() {
        const queue = this.gameState.turnQueue;
        while (this.gameState.turnQueueIndex < queue.length) {
            const id = queue[this.gameState.turnQueueIndex];
            const player = this.gameState.players.find(p => p.id === id);
            if (player && !player.isSpectator) break;
            this.gameState.turnQueueIndex++;
        }
    }

    updateActivity() {
        const me = this.gameState.players.find(p => p.id === this.myId);
        if (me) {
            me.lastActivity = Date.now();
            me.lastSeen = Date.now();
        }
    }

    // ─── AFK Timer ───────────────────────────────────────────────────

    startTurnTimer() {
        if (!this.isHost) return;
        this.clearTurnTimer();
        if (this.gameState.status !== 'PLAYING') return;

        // Disable AFK skipping if only one player is playing.
        const contenders = this.gameState.players.filter(p => !p.isSpectator);
        if (contenders.length <= 1) return;

        const active = this.getActivePlayer();
        if (!active) return;

        this.turnTimeoutSeconds = active.connected === false ? AFK_DISCONNECTED_TIMEOUT_S : AFK_TIMEOUT_S;
        this.turnStartTime = Date.now();
        this.gameState.turnWarning = false;
        this.gameState.turnWarningPlayerName = '';
        this.gameState.turnTimeLeft = 0;

        this.turnTimerInterval = setInterval(() => this.tickTurnTimer(), 1000);
    }

    tickTurnTimer() {
        if (!this.isHost || this.gameState.status !== 'PLAYING' || !this.turnStartTime) {
            this.clearTurnTimer();
            return;
        }

        const elapsed = Math.floor((Date.now() - this.turnStartTime) / 1000);
        const remaining = this.turnTimeoutSeconds - elapsed;

        if (remaining <= 0) {
            this.skipCurrentPlayer();
            return;
        }

        const warningAt = Math.max(0, this.turnTimeoutSeconds - (AFK_TIMEOUT_S - AFK_WARNING_AT_S));
        if (elapsed < warningAt) return;

        const player = this.getActivePlayer();
        const name = player ? player.name : 'Player';
        if (this.gameState.turnWarning
            && this.gameState.turnTimeLeft === remaining
            && this.gameState.turnWarningPlayerName === name) {
            return; // nothing changed, don't spam the room
        }
        this.gameState.turnWarning = true;
        this.gameState.turnWarningPlayerName = name;
        this.gameState.turnTimeLeft = remaining;
        this.hostBroadcastState();
    }

    clearTurnTimer() {
        if (this.turnTimerInterval) {
            clearInterval(this.turnTimerInterval);
            this.turnTimerInterval = null;
        }
        this.turnStartTime = null;
        this.gameState.turnWarning = false;
        this.gameState.turnWarningPlayerName = '';
        this.gameState.turnTimeLeft = 0;
    }

    /**
     * Re-evaluates whether the AFK clock should run at all (the player count
     * changed) and whether it should be the short "they dropped" clock.
     */
    refreshTurnTimerTarget() {
        if (!this.isHost) return;
        if (this.gameState.status !== 'PLAYING') {
            this.clearTurnTimer();
            return;
        }
        if (this.physicsInterval) return;

        const contenders = this.gameState.players.filter(p => !p.isSpectator);
        if (contenders.length <= 1) {
            this.clearTurnTimer();
            return;
        }
        const active = this.getActivePlayer();
        if (!active) return;

        const target = active.connected === false ? AFK_DISCONNECTED_TIMEOUT_S : AFK_TIMEOUT_S;
        if (!this.turnTimerInterval) {
            this.startTurnTimer();
        } else if (target !== this.turnTimeoutSeconds) {
            this.turnTimeoutSeconds = target;
        }
    }

    skipCurrentPlayer() {
        this.clearTurnTimer();

        const skipped = this.getActivePlayer();
        const currentId = this.gameState.turnQueue[this.gameState.turnQueueIndex];

        if (this.gameState.gameMode === 'ZEN') {
            // In Zen, being skipped forfeits the rest of this player's rink.
            let forfeited = 0;
            while (
                this.gameState.turnQueueIndex < this.gameState.turnQueue.length &&
                this.gameState.turnQueue[this.gameState.turnQueueIndex] === currentId
            ) {
                this.gameState.turnQueueIndex++;
                forfeited++;
            }
            if (skipped) skipped.stonesLeft = Math.max(0, skipped.stonesLeft - forfeited);
            // Bank their rink's score before wiping it for the next player.
            this.calculateScores();
            this.gameState.stones = [];
        } else {
            if (skipped) skipped.stonesLeft = Math.max(0, skipped.stonesLeft - 1);
            this.gameState.turnQueueIndex++;
            this.calculateScores();
        }

        this.gameState.leaderboard = this.getSortedLeaderboard();
        this.finishTurnAdvance();

        this.activeStone = { x: HOME_X, y: HOME_Y };
        this.hostBroadcastState();

        if (this.gameState.status === 'PLAYING') this.startTurnTimer();
    }

    // ─── Deterministic Physics Engine ────────────────────────────────

    hostBroadcastThrow(playerId, color, throwData) {
        const payload = { playerId, color, ...throwData };
        socket.emit('host_broadcast', {
            roomCode: this.currentRoom,
            data: { action: 'SYNC_THROW', throwData: payload },
        });
        this.applyThrow(payload);
    }

    hostBroadcastDrag(playerId, x, y) {
        socket.emit('host_broadcast', {
            roomCode: this.currentRoom,
            data: { action: 'SYNC_DRAG', playerId, x, y },
        });
        this.applyDrag(x, y);
    }

    applyDrag(x, y) {
        this.activeStone = { x, y };
    }

    applyThrow(data) {
        const throwData = data && typeof data === 'object' ? this.sanitizeThrowInput(data) : null;
        if (!throwData || this.gameState.stones.length >= MAX_STONES) {
            // Should be unreachable (the sender validates first), but a host stuck
            // in MOVING with no stone in flight would freeze the match forever.
            if (this.isHost && this.gameState.status === 'MOVING') {
                this.gameState.status = 'PLAYING';
                this.hostBroadcastState();
                this.startTurnTimer();
            }
            return;
        }

        this.clearThrowAck();
        this.throwPending = false;
        this.isGrabbing = false;
        this.gameState.status = 'MOVING';
        this.gameState.stones.push({
            x: throwData.x,
            y: throwData.y,
            vx: throwData.vx,
            vy: throwData.vy,
            color: typeof data.color === 'string' ? data.color : SPECTATOR_COLOR,
            playerId: isNonEmptyString(data.playerId) ? data.playerId : '',
            radius: STONE_RADIUS,
        });
        this.activeStone = { x: HOME_X, y: HOME_Y };
        this.notify();

        this.startPhysics();
    }

    startPhysics() {
        this.stopPhysics();
        this.physicsAccumulator = 0;
        this.physicsStepsRun = 0;
        this.lastPhysicsTime = now();
        this.physicsInterval = setInterval(() => this.updatePhysics(), PHYSICS_STEP_MS);
    }

    stopPhysics() {
        if (this.physicsInterval) {
            clearInterval(this.physicsInterval);
            this.physicsInterval = null;
        }
        if (this.settleTimeout) {
            clearTimeout(this.settleTimeout);
            this.settleTimeout = null;
        }
    }

    /**
     * Fixed-timestep integration driven by wall-clock elapsed time. Browsers
     * throttle timers in background tabs to ~1Hz; without catch-up the host
     * would stall the whole match just by switching tabs. Steps stay a fixed
     * 1/60s so every client converges on the same resting positions.
     */
    updatePhysics() {
        const stamp = now();
        const elapsed = clamp(stamp - this.lastPhysicsTime, 0, MAX_CATCHUP_STEPS * PHYSICS_STEP_MS);
        this.lastPhysicsTime = stamp;
        this.physicsAccumulator += elapsed;

        let steps = 0;
        let moving = false;
        while (this.physicsAccumulator >= PHYSICS_STEP_MS && steps < MAX_CATCHUP_STEPS) {
            moving = this.physicsStep();
            this.physicsAccumulator -= PHYSICS_STEP_MS;
            steps++;
            this.physicsStepsRun++;
            if (!moving) break;
        }
        if (steps === 0) return;

        // Watchdog: a stone that somehow never settles must not freeze the match.
        if (moving && this.physicsStepsRun >= PHYSICS_WATCHDOG_STEPS) {
            this.gameState.stones.forEach(s => { s.vx = 0; s.vy = 0; });
            moving = false;
        }

        if (moving) return;

        this.stopPhysics();
        this.notify();
        if (this.isHost) {
            this.settleTimeout = setTimeout(() => {
                this.settleTimeout = null;
                this.checkTurnEnd();
            }, SETTLE_DELAY_MS);
        }
    }

    /** One fixed 1/60s step. Returns true while anything is still moving. */
    physicsStep() {
        const stones = this.gameState.stones;
        let moving = false;
        let bumped = false;

        for (const s of stones) {
            // Guard against a NaN sneaking in: every comparison against it is
            // false, which would leave "still moving" true forever.
            s.x = num(s.x, HOME_X);
            s.y = num(s.y, HOME_Y);
            s.vx = clamp(num(s.vx, 0), -MAX_STONE_SPEED, MAX_STONE_SPEED);
            s.vy = clamp(num(s.vy, 0), -MAX_STONE_SPEED, MAX_STONE_SPEED);
            s.radius = num(s.radius, STONE_RADIUS);

            s.x += s.vx;
            s.y += s.vy;
            s.vx *= FRICTION;
            s.vy *= FRICTION;

            if (Math.abs(s.vx) < REST_EPSILON) s.vx = 0;
            if (Math.abs(s.vy) < REST_EPSILON) s.vy = 0;
            if (s.vx !== 0 || s.vy !== 0) moving = true;

            const minX = s.radius + WALL_PAD;
            const maxX = RINK_W - s.radius - WALL_PAD;
            const minY = s.radius + WALL_PAD;
            const maxY = RINK_H - s.radius - WALL_PAD;

            let hitWall = false;
            if (s.x < minX) { s.x = minX; s.vx *= WALL_BOUNCE; hitWall = true; }
            if (s.x > maxX) { s.x = maxX; s.vx *= WALL_BOUNCE; hitWall = true; }
            if (s.y < minY) { s.y = minY; s.vy *= WALL_BOUNCE; hitWall = true; }
            if (s.y > maxY) { s.y = maxY; s.vy *= WALL_BOUNCE; hitWall = true; }
            if (hitWall && (Math.abs(s.vx) > 0.5 || Math.abs(s.vy) > 0.5)) bumped = true;
        }

        for (let i = 0; i < stones.length; i++) {
            for (let j = i + 1; j < stones.length; j++) {
                const s1 = stones[i];
                const s2 = stones[j];
                const dx = s2.x - s1.x;
                const dy = s2.y - s1.y;
                let dist = Math.hypot(dx, dy);
                const minDist = s1.radius + s2.radius;
                if (dist >= minDist) continue;

                // Perfectly co-located stones would divide by zero; nudge them apart.
                let nx;
                let ny;
                if (dist < 1e-6) {
                    const angle = Math.random() * Math.PI * 2;
                    nx = Math.cos(angle);
                    ny = Math.sin(angle);
                    dist = 1e-6;
                } else {
                    nx = dx / dist;
                    ny = dy / dist;
                }

                const overlap = minDist - dist;
                s1.x -= nx * overlap / 2; s1.y -= ny * overlap / 2;
                s2.x += nx * overlap / 2; s2.y += ny * overlap / 2;

                const p = (s1.vx * nx + s1.vy * ny - s2.vx * nx - s2.vy * ny) * RESTITUTION;
                s1.vx -= p * nx; s1.vy -= p * ny;
                s2.vx += p * nx; s2.vy += p * ny;

                if (Math.abs(p) > 0.5) bumped = true;
                moving = true;
            }
        }

        if (bumped) audioManager.playCollision();
        return moving;
    }

    checkTurnEnd() {
        if (!this.isHost) return;
        if (this.gameState.status === 'GAMEOVER') return;

        // A player leaving right after the stones settle can call this directly
        // while the post-settle timeout is still pending. Advancing the queue
        // twice for one throw would skip somebody's turn.
        if (this.settleTimeout) {
            clearTimeout(this.settleTimeout);
            this.settleTimeout = null;
        }

        this.calculateScores();
        this.gameState.leaderboard = this.getSortedLeaderboard();

        const prevPlayerId = this.gameState.turnQueue[this.gameState.turnQueueIndex];
        this.gameState.turnQueueIndex++;

        if (this.gameState.gameMode === 'ZEN') {
            // A different player up next (or the end of the queue) means a fresh rink.
            const nextPlayerId = this.gameState.turnQueue[this.gameState.turnQueueIndex];
            if (nextPlayerId !== prevPlayerId) this.gameState.stones = [];
        }

        this.finishTurnAdvance();

        this.activeStone = { x: HOME_X, y: HOME_Y };
        this.hostBroadcastState();

        if (this.gameState.status === 'PLAYING') this.startTurnTimer();
    }

    /** Shared tail of checkTurnEnd/skipCurrentPlayer: round rollover or game over. */
    finishTurnAdvance() {
        if (this.gameState.turnQueueIndex < 0) this.gameState.turnQueueIndex = 0;
        this.advancePastMissing();

        if (this.gameState.turnQueueIndex < this.gameState.turnQueue.length) {
            this.gameState.status = 'PLAYING';
            return;
        }

        if (this.gameState.round >= TOTAL_ROUNDS) {
            this.gameState.status = 'GAMEOVER';
            this.clearTurnTimer();
            return;
        }

        // Bank the round, then set up the next one.
        this.gameState.players
            .filter(p => !p.isSpectator)
            .forEach(p => {
                p.prevRoundScore = p.score;
                p.totalScore += p.score;
                p.score = 0;
                p.stonesLeft = STONES_PER_ROUND;
            });
        this.gameState.round++;
        this.gameState.stones = [];
        this.gameState.status = 'PLAYING';

        if (this.gameState.gameMode === 'ZEN') {
            this.buildZenTurnQueue(false); // same order every round
        } else {
            this.buildTurnQueue(false);    // round winner throws first
        }
        this.advancePastMissing();
        this.gameState.leaderboard = this.getSortedLeaderboard();

        // Everyone left mid-round: there is nothing sensible left to play.
        if (this.gameState.turnQueue.length === 0) {
            this.gameState.status = 'GAMEOVER';
            this.clearTurnTimer();
        }
    }

    calculateScores() {
        const rescore = (playerIds) => {
            playerIds.forEach(id => {
                const player = this.gameState.players.find(p => p.id === id);
                if (player) player.score = 0;
            });
            this.gameState.stones.forEach(s => {
                const dist = Math.hypot(num(s.x, 0) - TARGET_X, num(s.y, 0) - TARGET_Y);
                if (dist > TARGET_RADIUS) return;
                const player = this.gameState.players.find(p => p.id === s.playerId);
                if (player) player.score += Math.floor(TARGET_RADIUS - dist);
            });
        };

        if (this.gameState.gameMode === 'ZEN') {
            // Only the player whose rink is live gets re-scored; everyone else's
            // score was banked when their rink was cleared.
            rescore([...new Set(this.gameState.stones.map(s => s.playerId))]);
        } else {
            rescore(this.gameState.players.map(p => p.id));
        }
    }

    /** Returns a sorted copy of players for leaderboard display (does not mutate the source). */
    getSortedLeaderboard() {
        return [...this.gameState.players].sort(compareForLeaderboard);
    }

    // ─── State replication ───────────────────────────────────────────

    hostBroadcastState() {
        if (!this.isHost || !this.currentRoom) return;
        this.gameState.stateSeq = num(this.gameState.stateSeq, 0) + 1;
        this.lastKeepaliveAt = Date.now();
        socket.emit('host_broadcast', {
            roomCode: this.currentRoom,
            data: { action: 'SYNC_STATE', state: this.gameState },
        });
        this.notify();
    }

    sendToHost(data) {
        if (!this.currentRoom || this.isHost) return;
        socket.emit('client_send', { roomCode: this.currentRoom, data });
    }

    requestResync() {
        this.sendToHost({ action: 'RESYNC' });
    }

    applyRemoteState(rawState) {
        const state = this.sanitizeIncomingState(rawState);
        if (!state) return;
        if (state.stateSeq > 0 && state.stateSeq < this.lastAppliedSeq) return; // out of order
        this.lastAppliedSeq = state.stateSeq;

        this.clearJoinTimeout();

        const oldStatus = this.gameState.status;

        // A snapshot arriving mid-flight would teleport stones. Our simulation is
        // deterministic, and the host corrects us once everything settles.
        if (this.physicsInterval && state.status === 'MOVING') {
            state.stones = this.gameState.stones;
        }

        this.gameState = state;

        const me = state.players.find(p => p.id === this.myId);
        this.isSpectator = me ? me.isSpectator : false;

        if (state.status !== 'MOVING') this.stopPhysics();
        if (oldStatus === 'MOVING' && state.status === 'PLAYING') {
            this.activeStone = { x: HOME_X, y: HOME_Y };
        }
        if (oldStatus === 'LOBBY' && state.status === 'PLAYING') {
            audioManager.playStart();
        }

        // Our turn ended (or never started): resolve anything left hanging.
        const active = this.getActivePlayer();
        const isMyTurn = !!active && active.id === this.myId;
        if (this.throwPending && (!isMyTurn || state.status !== 'PLAYING')) {
            this.throwPending = false;
            this.clearThrowAck();
        }
        if (!isMyTurn) {
            this.isGrabbing = false;
        }

        this.notify();
    }

    /** Rebuilds a trusted state object out of whatever the wire handed us. */
    sanitizeIncomingState(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (!Array.isArray(raw.players)) return null;

        const stamp = Date.now();
        const players = raw.players
            .filter(p => p && isNonEmptyString(p.id))
            .slice(0, MAX_PLAYERS)
            .map(p => ({
                id: p.id,
                name: sanitizeName(p.name),
                color: typeof p.color === 'string' ? p.color.slice(0, 32) : SPECTATOR_COLOR,
                score: num(p.score, 0),
                totalScore: num(p.totalScore, 0),
                prevRoundScore: num(p.prevRoundScore, 0),
                stonesLeft: clamp(Math.round(num(p.stonesLeft, 0)), 0, STONES_PER_ROUND),
                isSpectator: !!p.isSpectator,
                connected: p.connected !== false,
                lastActivity: num(p.lastActivity, stamp),
                lastSeen: num(p.lastSeen, stamp),
            }));

        const knownIds = new Set(players.map(p => p.id));
        const stones = (Array.isArray(raw.stones) ? raw.stones : [])
            .filter(s => s && typeof s === 'object')
            .slice(0, MAX_STONES)
            .map(s => ({
                x: safeCoord(s.x, 0, RINK_W, HOME_X),
                y: safeCoord(s.y, 0, RINK_H, HOME_Y),
                vx: clamp(num(s.vx, 0), -MAX_STONE_SPEED, MAX_STONE_SPEED),
                vy: clamp(num(s.vy, 0), -MAX_STONE_SPEED, MAX_STONE_SPEED),
                color: typeof s.color === 'string' ? s.color.slice(0, 32) : SPECTATOR_COLOR,
                playerId: isNonEmptyString(s.playerId) ? s.playerId : '',
                radius: clamp(num(s.radius, STONE_RADIUS), 4, 40),
            }));

        const turnQueue = (Array.isArray(raw.turnQueue) ? raw.turnQueue : [])
            .filter(id => isNonEmptyString(id) && knownIds.has(id))
            .slice(0, MAX_QUEUE_LENGTH);

        return {
            players,
            stones,
            turnQueue,
            turnQueueIndex: clamp(Math.round(num(raw.turnQueueIndex, 0)), 0, turnQueue.length),
            round: clamp(Math.round(num(raw.round, 1)), 1, TOTAL_ROUNDS),
            // The leaderboard is derived, so rebuild it rather than trusting it.
            leaderboard: [...players].sort(compareForLeaderboard),
            status: VALID_STATUSES.includes(raw.status) ? raw.status : 'LOBBY',
            gameMode: raw.gameMode === 'ZEN' ? 'ZEN' : 'MANIA',
            turnWarning: !!raw.turnWarning,
            turnWarningPlayerName: sanitizeName(raw.turnWarningPlayerName, ''),
            turnTimeLeft: clamp(Math.round(num(raw.turnTimeLeft, 0)), 0, 999),
            stateSeq: num(raw.stateSeq, 0),
        };
    }

    // ─── Input handlers (called by GameCanvas) ───────────────────────

    /** The single source of truth for "am I allowed to touch a stone right now". */
    canThrowNow() {
        if (this.gameState.status !== 'PLAYING') return false;
        if (this.physicsInterval || this.throwPending) return false;
        if (this.connectionState !== 'online') return false;
        const current = this.getActivePlayer();
        return !!current
            && current.id === this.myId
            && !current.isSpectator
            && current.stonesLeft > 0;
    }

    handleInputStart(pos) {
        if (!this.canThrowNow()) return;
        const dist = Math.hypot(pos.x - this.activeStone.x, pos.y - this.activeStone.y);
        if (dist > GRAB_RADIUS) return;

        this.updateActivity();
        this.isGrabbing = true;
        this.mouseHistory = [{ x: pos.x, y: pos.y, time: Date.now() }];
        this.notify();
    }

    handleInputMove(pos) {
        if (!this.isGrabbing) return;
        // The turn can end mid-drag: an AFK skip, a kick, or a disconnect.
        if (!this.canThrowNow()) {
            this.cancelGrab();
            return;
        }

        this.activeStone = {
            x: clamp(num(pos.x, HOME_X), STONE_RADIUS + 1, RINK_W - STONE_RADIUS - 1),
            y: clamp(num(pos.y, HOME_Y), HOG_LINE_Y, RINK_H - STONE_RADIUS - 1),
        };

        this.mouseHistory.push({ x: this.activeStone.x, y: this.activeStone.y, time: Date.now() });
        if (this.mouseHistory.length > 15) this.mouseHistory.shift();

        const stamp = Date.now();
        if (stamp - this.lastDragSync > DRAG_SYNC_MS) {
            this.lastDragSync = stamp;
            if (this.isHost) {
                this.hostBroadcastDrag(this.myId, this.activeStone.x, this.activeStone.y);
            } else {
                this.sendToHost({ action: 'DRAG', x: this.activeStone.x, y: this.activeStone.y });
            }
        }

        if (this.activeStone.y <= HOG_LINE_Y) this.releaseStone();
    }

    handleInputEnd() {
        if (this.isGrabbing) this.releaseStone();
    }

    cancelGrab() {
        this.isGrabbing = false;
        this.mouseHistory = [];
        this.activeStone = { x: HOME_X, y: HOME_Y };
        this.notify();
    }

    releaseStone() {
        if (!this.isGrabbing) return;
        this.isGrabbing = false;

        if (!this.canThrowNow()) {
            this.cancelGrab();
            return;
        }

        const stamp = Date.now();
        const recent = this.mouseHistory.filter(p => stamp - p.time <= 120);
        const past = recent.length > 0 ? recent[0] : this.mouseHistory[this.mouseHistory.length - 1];
        if (!past) {
            this.cancelGrab();
            return;
        }

        const dt = Math.max(1, stamp - past.time);
        let vx = num(((this.activeStone.x - past.x) / dt) * THROW_SPEED_MULTIPLIER, 0);
        let vy = num(((this.activeStone.y - past.y) / dt) * THROW_SPEED_MULTIPLIER, 0);

        const speed = Math.hypot(vx, vy);
        if (speed > MAX_STONE_SPEED) {
            vx = (vx / speed) * MAX_STONE_SPEED;
            vy = (vy / speed) * MAX_STONE_SPEED;
        }

        // A limp downward flick is a misclick, not a throw.
        if (vy >= 0 && speed < 1) {
            this.cancelGrab();
            return;
        }

        const throwX = this.activeStone.x;
        const throwY = this.activeStone.y;
        this.mouseHistory = [];
        this.activeStone = { x: HOME_X, y: HOME_Y };

        if (this.isHost) {
            const current = this.getActivePlayer();
            // Validate before committing: spending the stone on a throw the
            // physics engine then refuses would strand the match in MOVING.
            const throwData = this.sanitizeThrowInput({ x: throwX, y: throwY, vx, vy });
            if (!current || !throwData) {
                this.cancelGrab();
                return;
            }
            this.clearTurnTimer();
            current.stonesLeft--;
            this.gameState.status = 'MOVING';
            this.hostBroadcastThrow(this.myId, current.color, throwData);
            return;
        }

        // Client: the host owns the outcome. Hide the stone optimistically, but
        // never fake a status change, or a dropped throw soft-locks the turn.
        this.throwPending = true;
        this.sendToHost({ action: 'THROW', x: throwX, y: throwY, vx, vy });
        this.armThrowAck();
        this.notify();
    }

    armThrowAck() {
        this.clearThrowAck();
        this.throwAckTimeout = setTimeout(() => {
            this.throwAckTimeout = null;
            if (!this.throwPending) return;
            this.throwPending = false;
            this.requestResync();
            this.setError('That throw never reached the host. Try again.', { transient: true });
        }, THROW_ACK_TIMEOUT_MS);
    }

    clearThrowAck() {
        if (this.throwAckTimeout) {
            clearTimeout(this.throwAckTimeout);
            this.throwAckTimeout = null;
        }
    }

    // ─── Emoji Reaction System ───────────────────────────────────────

    handleGlobalKeyDown(e) {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
        }
        if (typeof e.key !== 'string') return;

        const emoji = EMOJI_KEYBINDS[e.key.toLowerCase()];
        if (!emoji) return;
        if (this.gameState.status !== 'PLAYING' && this.gameState.status !== 'MOVING') return;
        this.sendEmoji(emoji);
    }

    sendEmoji(emoji) {
        if (!ALLOWED_EMOJI.has(emoji)) return;
        if (!this.currentRoom) return;

        const stamp = Date.now();
        if (stamp - this.lastEmojiSentAt < EMOJI_MIN_INTERVAL_MS) return;
        this.lastEmojiSentAt = stamp;

        this.updateActivity();
        this.spawnEmojiParticle(this.myId, emoji);

        if (this.isHost) {
            socket.emit('host_broadcast', {
                roomCode: this.currentRoom,
                data: { action: 'SYNC_EMOJI', playerId: this.myId, emoji },
            });
        } else {
            this.sendToHost({ action: 'EMOJI', emoji });
        }
    }

    /**
     * The renderer owns the leaderboard DOM, so it registers a resolver that
     * turns a player id into a spawn point. Particles are positioned here at
     * spawn time so the render tree never has to mutate them.
     */
    setEmojiAnchorResolver(resolver) {
        this.emojiAnchorResolver = typeof resolver === 'function' ? resolver : null;
    }

    spawnEmojiParticle(playerId, emoji) {
        if (this.emojiParticles.length >= MAX_EMOJI_PARTICLES) return; // bound the render layer
        const anchor = (this.emojiAnchorResolver && this.emojiAnchorResolver(playerId)) || DEFAULT_EMOJI_ANCHOR;
        this.emojiParticles.push({
            id: this.emojiIdCounter++,
            playerId,
            emoji,
            x: num(anchor.x, DEFAULT_EMOJI_ANCHOR.x),
            y: num(anchor.y, DEFAULT_EMOJI_ANCHOR.y),
            vx: (Math.random() - 0.5) * 60,  // slight random horizontal scatter
            vy: -(Math.random() * 80 + 40),  // initial upward pop
            size: 28,
        });
        this.startEmojiLoop();
        this.notify();
    }

    /**
     * rAF rather than setInterval: it pauses with the tab instead of banking a
     * huge dt, and the clamp below keeps a returning tab from flinging every
     * particle off-screen in a single frame.
     */
    startEmojiLoop() {
        if (this.emojiFrame !== null) return;
        this.lastEmojiFrameTime = now();
        const step = () => {
            this.emojiFrame = requestAnimationFrame(step);
            this.updateEmojiPhysics();
        };
        this.emojiFrame = requestAnimationFrame(step);
    }

    stopEmojiLoop() {
        if (this.emojiFrame !== null) {
            cancelAnimationFrame(this.emojiFrame);
            this.emojiFrame = null;
        }
    }

    updateEmojiPhysics() {
        const stamp = now();
        const dt = clamp((stamp - this.lastEmojiFrameTime) / 1000, 0, 0.05);
        this.lastEmojiFrameTime = stamp;

        const gravity = 980; // pixels/s^2 (realistic gravity feel)
        for (const p of this.emojiParticles) {
            p.vy += gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }

        // Drop particles that have fallen off the bottom of the screen.
        const floor = window.innerHeight + 50;
        this.emojiParticles = this.emojiParticles.filter(p => p.y < floor);

        if (this.emojiParticles.length === 0) this.stopEmojiLoop();
        this.notify();
    }
}

function compareForLeaderboard(a, b) {
    if (a.isSpectator !== b.isSpectator) return a.isSpectator ? 1 : -1;
    const diff = (num(b.totalScore, 0) + num(b.score, 0)) - (num(a.totalScore, 0) + num(a.score, 0));
    if (diff !== 0) return diff;
    return String(a.name).localeCompare(String(b.name));
}

function now() {
    return typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
}

export const store = new GameStore();

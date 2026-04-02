import { io } from 'socket.io-client';

const socket = io('https://quicklash-server.onrender.com');

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

class GameStore {
    constructor() {
        this.isHost = false;
        this.myId = '';
        this.myName = '';
        this.currentRoom = '';
        this.isSpectator = false;
        this.errorMsg = '';
        
        this.gameState = {
            players: [],
            stones: [],
            turnIndex: 0,
            round: 1,
            status: 'CONNECT' // New custom status for React UI ('CONNECT', 'LOBBY', 'PLAYING', 'MOVING', 'GAMEOVER')
        };
        
        this.activeStone = { x: 200, y: 720 };
        this.physicsInterval = null;
        this.mouseHistory = [];
        this.isGrabbing = false;

        this.listeners = new Set();

        socket.on('connect', () => { this.myId = socket.id; this.notify(); });
        socket.on('error_msg', (msg) => { this.errorMsg = msg; this.notify(); });
        
        // Host Network
        socket.on('player_joined', (data) => {
            if (!this.isHost) return;
            const isLateJoin = this.gameState.status !== 'LOBBY';
            const newColor = isLateJoin ? '#94a3b8' : PLAYER_COLORS[this.gameState.players.length % PLAYER_COLORS.length];
            
            this.gameState.players.push({
                id: data.id, name: data.name, color: newColor, score: 0, totalScore: 0, 
                stonesLeft: isLateJoin ? 0 : 3, isSpectator: isLateJoin
            });
            this.hostBroadcastState();
        });

        socket.on('player_data', (payload) => {
            if (!this.isHost) return;
            const { id, data } = payload;
            if (data.action === 'THROW' && this.gameState.status === 'PLAYING' && !this.physicsInterval) {
                const currentPlayer = this.getActivePlayer();
                if (currentPlayer && currentPlayer.id === id && currentPlayer.stonesLeft > 0) {
                    currentPlayer.stonesLeft--;
                    this.gameState.status = 'MOVING';
                    this.hostBroadcastThrow(id, currentPlayer.color, data.x, data.y, data.vx, data.vy);
                }
            } else if (data.action === 'DRAG' && this.gameState.status === 'PLAYING') {
                const currentPlayer = this.getActivePlayer();
                if (currentPlayer && currentPlayer.id === id) {
                    this.hostBroadcastDrag(id, data.x, data.y);
                }
            }
        });

        // Client Network Receive
        socket.on('game_data', (payload) => {
            if (payload.action === 'SYNC_STATE') {
                this.applyGameState(payload.state);
            } else if (payload.action === 'SYNC_THROW') {
                this.applyThrow(payload.throwData);
            } else if (payload.action === 'SYNC_DRAG') {
                if (payload.playerId !== this.myId) {
                    this.applyDrag(payload.x, payload.y);
                }
            }
        });
    }

    notify() {
        this.listeners.forEach(l => l());
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    // React Accessormethods
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
            isGrabbing: this.isGrabbing
        };
    }

    // Actions
    createRoom(name) {
        this.myName = name;
        this.currentRoom = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.isHost = true;
        
        socket.emit('create_room', this.currentRoom);
        
        this.gameState.players.push({
            id: this.myId, name: this.myName, color: PLAYER_COLORS[0], score: 0, totalScore: 0, stonesLeft: 3, isSpectator: false
        });
        this.gameState.status = 'LOBBY';
        this.errorMsg = '';
        this.notify();
    }

    joinRoom(name, room) {
        this.myName = name;
        this.currentRoom = room;
        socket.emit('join_room', { roomCode: this.currentRoom, name: this.myName });
        this.gameState.status = 'LOBBY';
        this.errorMsg = '';
        this.notify();
    }

    startGame() {
        if (!this.isHost) return;
        this.gameState.status = 'PLAYING';
        this.gameState.round = 1;
        
        // Randomize who goes first for the 1st round
        const validPlayerIndices = this.gameState.players
            .map((p, i) => p.isSpectator ? -1 : i)
            .filter(i => i !== -1);
        
        if (validPlayerIndices.length > 0) {
            this.gameState.turnIndex = validPlayerIndices[Math.floor(Math.random() * validPlayerIndices.length)];
        } else {
            this.gameState.turnIndex = 0;
        }

        this.gameState.stones = [];
        this.gameState.players.forEach(p => { 
            if(!p.isSpectator) p.stonesLeft = 3; 
            p.score = 0;
            p.totalScore = 0;
        });
        this.activeStone = { x: 200, y: 720 };
        this.hostBroadcastState();
    }

    returnToLobby() {
        if (this.isHost) {
            this.gameState.status = 'LOBBY';
            this.hostBroadcastState();
        } else {
            this.gameState.status = 'LOBBY';
            this.notify();
        }
    }

    getActivePlayer() {
        if (this.gameState.players.length === 0) return null;
        return this.gameState.players[this.gameState.turnIndex % this.gameState.players.length];
    }

    // Deterministic Physics Engine
    hostBroadcastThrow(playerId, color, x, y, vx, vy) {
        const throwData = { playerId, color, x, y, vx, vy };
        socket.emit('host_broadcast', { roomCode: this.currentRoom, data: { action: 'SYNC_THROW', throwData } });
        this.applyThrow(throwData);
    }

    hostBroadcastDrag(playerId, x, y) {
        socket.emit('host_broadcast', { roomCode: this.currentRoom, data: { action: 'SYNC_DRAG', playerId, x, y } });
        this.applyDrag(x, y);
    }

    applyDrag(x, y) {
        this.activeStone = { x, y };
        // We do not need to notify(), saving render cycles. 
        // Or if we want other clients to see it updating smoothly, they render from getSnapshot.
        // Actually we probably should notify() if they are not moving their mouse to trigger their own renders,
        // Wait, the canvas has requestAnimationFrame which polls getSnapshot() constantly! So no notify needed for canvas!
    }

    applyThrow(data) {
        this.gameState.status = 'MOVING';
        this.gameState.stones.push({
            x: data.x, y: data.y, vx: data.vx, vy: data.vy, 
            color: data.color, playerId: data.playerId, radius: 14, counted: false
        });
        this.notify();
        
        if (this.physicsInterval) clearInterval(this.physicsInterval);
        this.physicsInterval = setInterval(() => this.updatePhysics(), 1000 / 60);
    }

    updatePhysics() {
        let moving = false;
        const friction = 0.985;
        
        this.gameState.stones.forEach(s => {
            s.x += s.vx;
            s.y += s.vy;
            s.vx *= friction;
            s.vy *= friction;

            if (Math.abs(s.vx) < 0.05) s.vx = 0;
            if (Math.abs(s.vy) < 0.05) s.vy = 0;
            if (s.vx !== 0 || s.vy !== 0) moving = true;

            if (s.x < s.radius + 5) { s.x = s.radius + 5; s.vx *= -0.8; }
            if (s.x > 400 - s.radius - 5) { s.x = 400 - s.radius - 5; s.vx *= -0.8; }
            if (s.y < s.radius + 5) { s.y = s.radius + 5; s.vy *= -0.8; }
            if (s.y > 800 - s.radius - 5) { s.y = 800 - s.radius - 5; s.vy *= -0.8; }
        });

        for (let i = 0; i < this.gameState.stones.length; i++) {
            for (let j = i + 1; j < this.gameState.stones.length; j++) {
                let s1 = this.gameState.stones[i];
                let s2 = this.gameState.stones[j];
                let dx = s2.x - s1.x;
                let dy = s2.y - s1.y;
                let dist = Math.hypot(dx, dy);
                let minDist = s1.radius + s2.radius;

                if (dist < minDist) {
                    let overlap = minDist - dist;
                    let nx = dx / dist;
                    let ny = dy / dist;
                    s1.x -= nx * overlap / 2; s1.y -= ny * overlap / 2;
                    s2.x += nx * overlap / 2; s2.y += ny * overlap / 2;
                    let p = s1.vx * nx + s1.vy * ny - s2.vx * nx - s2.vy * ny;
                    let restitution = 0.85; 
                    p *= restitution;
                    s1.vx -= p * nx;  s1.vy -= p * ny;
                    s2.vx += p * nx;  s2.vy += p * ny;
                }
            }
        }

        if (!moving) {
            clearInterval(this.physicsInterval);
            this.physicsInterval = null;
            if (this.isHost) {
                setTimeout(() => this.checkTurnEnd(), 300);
            }
        }
    }

    checkTurnEnd() {
        this.calculateScores();
        
        let validPlayers = this.gameState.players.filter(p => !p.isSpectator);
        let totalStonesLeft = validPlayers.reduce((sum, p) => sum + p.stonesLeft, 0);
        
        if (totalStonesLeft <= 0) {
            if (this.gameState.round >= 3) {
                this.gameState.status = 'GAMEOVER';
            } else {
                this.gameState.round++;
                this.gameState.turnIndex = 0;
                validPlayers.forEach(p => {
                    p.totalScore += p.score;
                    p.score = 0;
                    p.stonesLeft = 3;
                });
                this.gameState.stones = [];
                this.gameState.status = 'PLAYING';
            }
        } else {
            do {
                this.gameState.turnIndex++;
            } while (
                this.gameState.players[this.gameState.turnIndex % this.gameState.players.length].stonesLeft <= 0 ||
                this.gameState.players[this.gameState.turnIndex % this.gameState.players.length].isSpectator
            );
            this.gameState.status = 'PLAYING';
        }

        this.activeStone = { x: 200, y: 720 };
        this.hostBroadcastState();
    }

    calculateScores() {
        const targetX = 200, targetY = 150, maxRadius = 100;

        // Reset all player scores to recalculate them from current stone positions
        this.gameState.players.forEach(p => p.score = 0);

        this.gameState.stones.forEach(s => {
            let dist = Math.hypot(s.x - targetX, s.y - targetY);
            if (dist <= maxRadius) {
                let points = Math.floor(maxRadius - dist);
                let player = this.gameState.players.find(p => p.id === s.playerId);
                if(player) {
                    player.score += points;
                }
            }
        });
    }

    hostBroadcastState() {
        socket.emit('host_broadcast', { roomCode: this.currentRoom, data: { action: 'SYNC_STATE', state: this.gameState } });
        this.applyGameState(this.gameState);
    }

    applyGameState(newState) {
        const oldStatus = this.gameState.status;
        this.gameState = newState;
        
        const me = this.gameState.players.find(p => p.id === this.myId);
        if (me && me.isSpectator) this.isSpectator = true;
        
        if (oldStatus === 'MOVING' && this.gameState.status === 'PLAYING') {
            this.activeStone = { x: 200, y: 720 };
        }
        this.notify();
    }

    // Input handlers for the canvas (To be called by GameCanvas)
    handleInputStart(pos) {
        if (this.gameState.status !== 'PLAYING') return;
        const currentPlayer = this.getActivePlayer();
        if (!currentPlayer || currentPlayer.id !== this.myId || this.physicsInterval) return;

        const dist = Math.hypot(pos.x - this.activeStone.x, pos.y - this.activeStone.y);
        if (dist <= 30) {
            this.isGrabbing = true;
            this.mouseHistory = [{ x: pos.x, y: pos.y, time: Date.now() }];
            // Do NOT notify() 60fps, let canvas pull directly via getSnapshot()
        }
    }

    handleInputMove(pos) {
        if (!this.isGrabbing) return;
        this.activeStone.x = Math.max(15, Math.min(385, pos.x));
        this.activeStone.y = Math.max(450, Math.min(785, pos.y));
        
        this.mouseHistory.push({ x: this.activeStone.x, y: this.activeStone.y, time: Date.now() });
        if (this.mouseHistory.length > 15) this.mouseHistory.shift(); 

        const now = Date.now();
        if (!this.lastDragSync || now - this.lastDragSync > 30) {
            this.lastDragSync = now;
            if (this.isHost) {
                this.hostBroadcastDrag(this.myId, this.activeStone.x, this.activeStone.y);
            } else {
                socket.emit('client_send', { 
                    roomCode: this.currentRoom, 
                    data: { action: 'DRAG', x: this.activeStone.x, y: this.activeStone.y } 
                });
            }
        }

        if (this.activeStone.y <= 450) this.releaseStone();
    }

    handleInputEnd() {
        if (this.isGrabbing) this.releaseStone();
    }

    releaseStone() {
        this.isGrabbing = false;
        const now = Date.now();
        const validHistory = this.mouseHistory.filter(p => now - p.time <= 120);
        const past = validHistory.length > 0 ? validHistory[0] : this.mouseHistory[this.mouseHistory.length - 1];
        
        // Prevent div by 0 check
        if (!past) {
             this.activeStone = { x: 200, y: 720 };
             this.notify();
             return;
        }

        const dt = Math.max(1, now - past.time);
        
        let multiplier = 16; 
        let vx = ((this.activeStone.x - past.x) / dt) * multiplier;
        let vy = ((this.activeStone.y - past.y) / dt) * multiplier;

        let speed = Math.hypot(vx, vy);
        if (speed > 25) {
            vx = (vx / speed) * 25;
            vy = (vy / speed) * 25;
        }
        
        if (vy >= 0 && speed < 1) {
            this.activeStone = { x: 200, y: 720 };
            this.notify();
            return;
        }

        const currentPlayer = this.getActivePlayer();
        if (this.isHost) {
            currentPlayer.stonesLeft--;
            this.gameState.status = 'MOVING';
            const throwX = this.activeStone.x;
            const throwY = this.activeStone.y;
            this.activeStone = { x: 200, y: 720 };
            this.hostBroadcastThrow(this.myId, currentPlayer.color, throwX, throwY, vx, vy);
        } else {
            socket.emit('client_send', { 
                roomCode: this.currentRoom, 
                data: { action: 'THROW', x: this.activeStone.x, y: this.activeStone.y, vx, vy } 
            });
            this.activeStone = { x: 200, y: 720 }; 
            this.gameState.status = 'MOVING';
            this.notify();
        }
    }
}

export const store = new GameStore();

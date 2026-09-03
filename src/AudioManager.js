// A single physics tick can resolve many collisions at once (and the catch-up
// loop runs several ticks in one go), so unthrottled playback turns a pile-up
// into a burst of dozens of overlapping clips.
const COLLISION_MIN_GAP_MS = 60;
const MAX_CONCURRENT_COLLISIONS = 4;

function readStoredNumber(key, fallback) {
    try {
        const parsed = parseFloat(localStorage.getItem(key));
        return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
    } catch {
        return fallback;
    }
}

function readStoredBoolean(key, fallback) {
    try {
        const stored = localStorage.getItem(key);
        return stored === null ? fallback : stored === 'true';
    } catch {
        return fallback;
    }
}

class AudioManager {
    constructor() {
        this.muted = readStoredBoolean('curling_muted', true);
        this.volume = readStoredNumber('curling_volume', 0.5);

        this.collisionSound = new Audio('/stone_collision.mp3');
        this.startSound = new Audio('/submority-traimory-mega-horn-angry-siren-f-cinematic-trailer-sound-effects-193408.mp3');

        this.lastCollisionAt = 0;
        this.activeCollisions = 0;
        this.listeners = new Set();

        this.updateVolume();
    }

    /** Lets the UI react to changes without polling. */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(l => l());
    }

    persist(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch {
            // Storage can be unavailable (private mode, quota); playback still works.
        }
    }

    updateVolume() {
        const level = this.muted ? 0 : this.volume;
        this.collisionSound.volume = level;
        this.startSound.volume = level;
    }

    setMuted(muted) {
        this.muted = !!muted;
        this.persist('curling_muted', this.muted);
        this.updateVolume();
        this.notify();
    }

    setVolume(volume) {
        this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
        this.persist('curling_volume', this.volume);
        this.updateVolume();
        this.notify();
    }

    playCollision() {
        if (this.muted || this.volume === 0) return;

        const stamp = Date.now();
        if (stamp - this.lastCollisionAt < COLLISION_MIN_GAP_MS) return;
        if (this.activeCollisions >= MAX_CONCURRENT_COLLISIONS) return;
        this.lastCollisionAt = stamp;

        const sound = this.collisionSound.cloneNode();
        sound.volume = this.volume;
        this.activeCollisions++;
        const release = () => { this.activeCollisions = Math.max(0, this.activeCollisions - 1); };
        sound.addEventListener('ended', release, { once: true });
        sound.play().catch(() => {
            // Autoplay is blocked until the first user gesture; not worth surfacing.
            release();
        });
    }

    playStart() {
        if (this.muted || this.volume === 0) return;
        this.startSound.currentTime = 0;
        this.startSound.play().catch(() => {});
    }
}

export const audioManager = new AudioManager();

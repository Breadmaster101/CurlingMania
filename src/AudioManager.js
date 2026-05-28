class AudioManager {
    constructor() {
        const storedMuted = localStorage.getItem('curling_muted');
        this.muted = storedMuted === null ? true : storedMuted === 'true';
        this.volume = parseFloat(localStorage.getItem('curling_volume') || '0.5');
        
        this.collisionSound = new Audio('/stone_collision.mp3');
        this.startSound = new Audio('/submority-traimory-mega-horn-angry-siren-f-cinematic-trailer-sound-effects-193408.mp3');
        
        this.updateVolume();
    }

    updateVolume() {
        this.collisionSound.volume = this.muted ? 0 : this.volume;
        this.startSound.volume = this.muted ? 0 : this.volume;
    }

    setMuted(muted) {
        this.muted = muted;
        localStorage.setItem('curling_muted', muted);
        this.updateVolume();
    }

    setVolume(volume) {
        this.volume = volume;
        localStorage.setItem('curling_volume', volume);
        this.updateVolume();
    }

    playCollision() {
        if (this.muted || this.volume === 0) return;
        const sound = this.collisionSound.cloneNode();
        sound.volume = this.volume;
        sound.play().catch(e => console.error("Audio play failed:", e));
    }

    playStart() {
        if (this.muted || this.volume === 0) return;
        this.startSound.currentTime = 0;
        this.startSound.play().catch(e => console.error("Audio play failed:", e));
    }
}

export const audioManager = new AudioManager();

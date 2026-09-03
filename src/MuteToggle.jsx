import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { audioManager } from './AudioManager';

export default function MuteToggle() {
    const [muted, setMuted] = useState(audioManager.muted);
    const [volume, setVolume] = useState(audioManager.volume);

    const containerRef = useRef(null);

    // Mirror the manager's state instead of polling it on a timer.
    useEffect(() => audioManager.subscribe(() => {
        setMuted(audioManager.muted);
        setVolume(audioManager.volume);
    }), []);

    useEffect(() => {
        const handleMouseUp = (e) => {
            const container = containerRef.current;
            if (!container || !container.contains(document.activeElement)) return;
            if (!container.contains(e.target)) document.activeElement.blur();
        };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    const handleMouseLeave = (e) => {
        if (e.buttons !== 0) return;
        const container = containerRef.current;
        if (container && container.contains(document.activeElement)) {
            document.activeElement.blur();
        }
    };

    const toggleMute = () => {
        audioManager.setMuted(!audioManager.muted);
    };

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        if (!Number.isFinite(newVolume)) return;
        audioManager.setVolume(newVolume);
        // Dragging to zero mutes; dragging away from zero unmutes.
        if (newVolume > 0 && audioManager.muted) audioManager.setMuted(false);
        else if (newVolume === 0 && !audioManager.muted) audioManager.setMuted(true);
    };

    return (
        <div
            className="mute-toggle-container"
            ref={containerRef}
            onMouseLeave={handleMouseLeave}
        >
            <button
                className="theme-toggle-btn"
                onClick={toggleMute}
                title={muted ? 'Unmute' : 'Mute'}
            >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div className="mute-toggle-popup">
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                    aria-label="Volume"
                />
            </div>
        </div>
    );
}

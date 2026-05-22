import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { audioManager } from './AudioManager';

export default function MuteToggle() {
    const [muted, setMuted] = useState(audioManager.muted);
    const [volume, setVolume] = useState(audioManager.volume);

    const containerRef = useRef(null);

    // Update state if it changes outside (e.g. from volume slider forcing mute/unmute)
    useEffect(() => {
        const interval = setInterval(() => {
            if (muted !== audioManager.muted) setMuted(audioManager.muted);
            if (volume !== audioManager.volume) setVolume(audioManager.volume);
        }, 100);
        return () => clearInterval(interval);
    }, [muted, volume]);

    useEffect(() => {
        const handleMouseUp = (e) => {
            if (containerRef.current && containerRef.current.contains(document.activeElement)) {
                if (!containerRef.current.contains(e.target)) {
                    document.activeElement.blur();
                }
            }
        };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    const handleMouseLeave = (e) => {
        if (e.buttons === 0 && containerRef.current) {
            if (containerRef.current.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        }
    };

    const toggleMute = () => {
        const newMuted = !muted;
        setMuted(newMuted);
        audioManager.setMuted(newMuted);
    };

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        audioManager.setVolume(newVolume);
        if (newVolume > 0 && muted) {
            setMuted(false);
            audioManager.setMuted(false);
        } else if (newVolume === 0 && !muted) {
            setMuted(true);
            audioManager.setMuted(true);
        }
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
                />
            </div>
        </div>
    );
}

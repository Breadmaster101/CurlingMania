import { useEffect, useRef } from 'react';
import { store } from './store';
import { useTheme } from './ThemeProvider';

export default function GameCanvas() {
    const canvasRef = useRef(null);
    const { theme } = useTheme();
    const themeRef = useRef(theme);

    // Keep a ref so the render loop always reads the latest theme without re-mounting
    useEffect(() => {
        themeRef.current = theme;
    }, [theme]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationId;

        const getCanvasPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            let clientX = e.clientX;
            let clientY = e.clientY;
            
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            }

            return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
        };

        const onStart = (e) => store.handleInputStart(getCanvasPos(e));
        const onMove = (e) => store.handleInputMove(getCanvasPos(e));
        const onEnd = () => store.handleInputEnd();

        canvas.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove, { passive: false });
        window.addEventListener('mouseup', onEnd);
        canvas.addEventListener('touchstart', onStart, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);

        // ─── Brutalist stone (original) ─────────────────────────
        const drawStoneBrutalist = (x, y, color) => {
            ctx.beginPath(); ctx.arc(x + 4, y + 4, 14, 0, Math.PI * 2); ctx.fillStyle = '#6b7280'; ctx.fill();
            ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fillStyle = '#e5e7eb'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1f2937'; ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 3, y - 7, 6, 14, 3) : ctx.rect(x-3, y-7, 6, 14);
            ctx.fillStyle = '#f8fafc'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1f2937'; ctx.stroke();
        };

        // ─── Kawaii stone ────────────────────────────────────────
        const drawStoneKawaii = (x, y, color) => {
            // Soft shadow (no hard offset)
            ctx.beginPath(); ctx.arc(x + 2, y + 2, 14, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180, 160, 200, 0.35)'; ctx.fill();
            // Main stone body
            ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
            ctx.fillStyle = '#fff0f5'; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = '#e9b8d4'; ctx.stroke();
            // Inner color ring
            ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = '#e9b8d4'; ctx.stroke();

            // Handle (softer)
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x - 3, y - 7, 6, 14, 3); else ctx.rect(x-3, y-7, 6, 14);
            ctx.fillStyle = '#fef3c7'; ctx.fill();
            ctx.lineWidth = 1.5; ctx.strokeStyle = '#e9b8d4'; ctx.stroke();
        };

        const renderCanvas = () => {
            const isCozy = themeRef.current === 'cozy';

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Background fill for cozy theme
            if (isCozy) {
                ctx.fillStyle = '#fdf2f8';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            
            const state = store.getSnapshot();
            const drawStone = isCozy ? drawStoneKawaii : drawStoneBrutalist;
            
            // House
            const targetX = 200, targetY = 150;
            if (isCozy) {
                // Pastel kawaii house
                ctx.lineWidth = 2; ctx.strokeStyle = '#e9b8d4';
                ctx.beginPath(); ctx.arc(targetX, targetY, 100, 0, Math.PI * 2); ctx.fillStyle = '#c4b5fd'; ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(targetX, targetY, 66, 0, Math.PI * 2); ctx.fillStyle = '#fef3c7'; ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(targetX, targetY, 33, 0, Math.PI * 2); ctx.fillStyle = '#f9a8d4'; ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(targetX, targetY, 10, 0, Math.PI * 2); ctx.fillStyle = '#fff0f5'; ctx.fill(); ctx.stroke();
            } else {
                // Original brutalist house
                ctx.lineWidth = 2; ctx.strokeStyle = '#1f2937';
                ctx.beginPath(); ctx.arc(targetX, targetY, 100, 0, Math.PI * 2); ctx.fillStyle = '#2563eb'; ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(targetX, targetY, 66, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(targetX, targetY, 33, 0, Math.PI * 2); ctx.fillStyle = '#dc2626'; ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(targetX, targetY, 10, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
            }

            // Lines
            if (isCozy) {
                ctx.strokeStyle = '#e9b8d4'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(200, 0); ctx.lineTo(200, 800); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(400, 150); ctx.stroke();
                ctx.strokeStyle = '#f9a8d4'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(0, 450); ctx.lineTo(400, 450); ctx.stroke();
                ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(150, 720); ctx.lineTo(250, 720); ctx.stroke();
            } else {
                ctx.lineWidth = 2; ctx.strokeStyle = '#1f2937';
                ctx.beginPath(); ctx.moveTo(200, 0); ctx.lineTo(200, 800); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(400, 150); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, 450); ctx.lineTo(400, 450); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 4; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(150, 720); ctx.lineTo(250, 720); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 4; ctx.stroke();
            }

            // Placed stones
            state.gameState.stones.forEach(s => drawStone(s.x, s.y, s.color));

            // Active stone
            if (state.gameState.status === 'PLAYING') {
                const queue = state.gameState.turnQueue;
                const qIdx = state.gameState.turnQueueIndex;
                const currentPlayerId = (queue && qIdx < queue.length) ? queue[qIdx] : null;
                const currentPlayer = currentPlayerId ? state.gameState.players.find(p => p.id === currentPlayerId) : null;
                if (currentPlayer && currentPlayer.stonesLeft > 0 && !currentPlayer.isSpectator) {
                    if (currentPlayer.id === state.myId) {
                        drawStone(state.activeStone.x, state.activeStone.y, currentPlayer.color);
                        if (state.isGrabbing) {
                            if (isCozy) {
                                ctx.fillStyle = 'rgba(249, 168, 212, 0.15)'; // Soft pink grab highlight
                            } else {
                                ctx.fillStyle = 'rgba(251, 191, 36, 0.2)'; // Neo-yellow grab highlight
                            }
                            ctx.fillRect(0, 0, 400, 450); 
                        }
                    } else {
                        drawStone(state.activeStone.x, state.activeStone.y, currentPlayer.color);
                    }
                }
            }
            
            animationId = requestAnimationFrame(renderCanvas);
        };

        renderCanvas();

        return () => {
            cancelAnimationFrame(animationId);
            canvas.removeEventListener('mousedown', onStart);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            canvas.removeEventListener('touchstart', onStart);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        };
    }, []);

    return (
        <div className="canvas-container">
            <canvas ref={canvasRef} width="400" height="800"></canvas>
        </div>
    );
}


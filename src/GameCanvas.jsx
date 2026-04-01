import { useEffect, useRef } from 'react';
import { store } from './store';

export default function GameCanvas() {
    const canvasRef = useRef(null);

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

        const drawStone = (x, y, color) => {
            ctx.beginPath(); ctx.arc(x + 3, y + 3, 14, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
            ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fillStyle = '#94a3b8'; ctx.fill();
            ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 3, y - 7, 6, 14, 3) : ctx.rect(x-3, y-7, 6, 14);
            ctx.fillStyle = '#1e293b'; ctx.fill();
        };

        const renderCanvas = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const state = store.getSnapshot();
            
            // House
            const targetX = 200, targetY = 150;
            ctx.beginPath(); ctx.arc(targetX, targetY, 100, 0, Math.PI * 2); ctx.fillStyle = '#3b82f6'; ctx.fill(); 
            ctx.beginPath(); ctx.arc(targetX, targetY, 66, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();  
            ctx.beginPath(); ctx.arc(targetX, targetY, 33, 0, Math.PI * 2); ctx.fillStyle = '#ef4444'; ctx.fill();  
            ctx.beginPath(); ctx.arc(targetX, targetY, 10, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();  

            // Lines
            ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(200, 0); ctx.lineTo(200, 800); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(400, 150); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, 450); ctx.lineTo(400, 450); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 4; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(150, 720); ctx.lineTo(250, 720); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 4; ctx.stroke();

            // Placed stones
            state.gameState.stones.forEach(s => drawStone(s.x, s.y, s.color));

            // Active stone
            if (state.gameState.status === 'PLAYING') {
                const currentPlayer = state.gameState.players.length > 0 ? state.gameState.players[state.gameState.turnIndex % state.gameState.players.length] : null;
                if (currentPlayer && currentPlayer.stonesLeft > 0 && !currentPlayer.isSpectator) {
                    if (currentPlayer.id === state.myId) {
                        drawStone(state.activeStone.x, state.activeStone.y, currentPlayer.color);
                        if (state.isGrabbing) {
                            ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
                            ctx.fillRect(0, 0, 400, 450); 
                        }
                    } else {
                        drawStone(200, 720, currentPlayer.color);
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

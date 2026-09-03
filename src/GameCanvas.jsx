import { useEffect, useRef } from 'react';
import { store } from './store';
import { useTheme } from './ThemeContext';

// The game logic lives in a fixed coordinate space; the backing store is sized
// to the device instead so the rink is not upscaled on high-DPI screens.
const LOGICAL_W = 400;
const LOGICAL_H = 800;
const MAX_DPR = 3;

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
        if (!canvas) return undefined;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;

        let animationId;
        // getBoundingClientRect forces layout, so only re-measure when something
        // actually changed rather than on all 60 frames a second.
        let needsResize = true;

        const resizeBackingStore = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            const width = Math.max(1, Math.round(rect.width * dpr));
            const height = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
        };

        const getCanvasPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };

            let clientX = e.clientX;
            let clientY = e.clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            }
            if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return { x: 0, y: 0 };

            return {
                x: (clientX - rect.left) * (LOGICAL_W / rect.width),
                y: (clientY - rect.top) * (LOGICAL_H / rect.height),
            };
        };

        const onStart = (e) => store.handleInputStart(getCanvasPos(e));
        const onMove = (e) => {
            if (!store.isGrabbing) return;
            // Stop the page from scrolling / pull-to-refreshing under the drag.
            if (e.cancelable) e.preventDefault();
            store.handleInputMove(getCanvasPos(e));
        };
        const onEnd = () => store.handleInputEnd();
        // Losing the pointer (tab switch, context menu, gesture cancel) must not
        // leave a stone stuck to the cursor.
        const onCancel = () => {
            if (store.isGrabbing) store.cancelGrab();
        };

        canvas.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove, { passive: false });
        window.addEventListener('mouseup', onEnd);
        canvas.addEventListener('touchstart', onStart, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onCancel);
        window.addEventListener('blur', onCancel);

        const markResize = () => { needsResize = true; };
        const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(markResize) : null;
        if (resizeObserver) resizeObserver.observe(canvas);
        window.addEventListener('resize', markResize);

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

            if (needsResize) {
                needsResize = false;
                resizeBackingStore();
            }
            // Map the fixed 400x800 game space onto the device-sized backing store.
            ctx.setTransform(canvas.width / LOGICAL_W, 0, 0, canvas.height / LOGICAL_H, 0, 0);
            ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

            // Background fill for cozy theme
            if (isCozy) {
                ctx.fillStyle = '#fdf2f8';
                ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
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

            // Active stone. A pending throw is already on its way to the host, so
            // the stone stays hidden until the host confirms or the retry clears it.
            if (state.gameState.status === 'PLAYING' && !state.throwPending) {
                const queue = state.gameState.turnQueue;
                const qIdx = state.gameState.turnQueueIndex;
                const currentPlayerId = (queue && qIdx < queue.length) ? queue[qIdx] : null;
                const currentPlayer = currentPlayerId ? state.gameState.players.find(p => p.id === currentPlayerId) : null;
                if (currentPlayer && currentPlayer.stonesLeft > 0 && !currentPlayer.isSpectator) {
                    drawStone(state.activeStone.x, state.activeStone.y, currentPlayer.color);
                    if (currentPlayer.id === state.myId && state.isGrabbing) {
                        // Neo grab highlight over the throwing half of the rink
                        ctx.fillStyle = isCozy
                            ? 'rgba(249, 168, 212, 0.15)'
                            : 'rgba(251, 191, 36, 0.2)';
                        ctx.fillRect(0, 0, 400, 450);
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
            window.removeEventListener('touchcancel', onCancel);
            window.removeEventListener('blur', onCancel);
            window.removeEventListener('resize', markResize);
            if (resizeObserver) resizeObserver.disconnect();
        };
    }, []);

    return (
        <div className="canvas-container">
            <canvas ref={canvasRef} width={LOGICAL_W} height={LOGICAL_H}></canvas>
        </div>
    );
}

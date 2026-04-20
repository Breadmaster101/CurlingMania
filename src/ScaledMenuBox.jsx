import { useRef, useEffect } from 'react';

// The "Create New Game" button is ~62px tall — use that as minimum gap on all sides
const FLOAT_GAP = 62;
const MIN_ZOOM = 0.35;

/**
 * A wrapper that replaces <div className="menu-box">.
 * It applies CSS `zoom` to uniformly scale the card (exactly like ctrl -)
 * so that it always floats with FLOAT_GAP px between the card edges and the viewport edges.
 * On large screens, zoom=1 (no change). On small/short screens, the whole card shrinks.
 */
export default function ScaledMenuBox({ children, className = '', style = {} }) {
  const ref = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const recalc = () => {
      // Read the current zoom so we can recover the natural (zoom=1) dimensions
      // without resetting zoom (avoids flicker).
      const currentZoom = parseFloat(el.style.zoom) || 1;
      const rect = el.getBoundingClientRect();

      // Recover unscaled natural dimensions
      const naturalW = rect.width / currentZoom;
      const naturalH = rect.height / currentZoom;

      const availW = window.innerWidth - FLOAT_GAP * 2;
      const availH = window.innerHeight - FLOAT_GAP * 2;

      const z = Math.min(1, availW / naturalW, availH / naturalH);
      el.style.zoom = String(Math.max(MIN_ZOOM, z));
    };

    const debouncedRecalc = () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(recalc);
    };

    // Initial calculation
    recalc();

    window.addEventListener('resize', debouncedRecalc);

    // Watch for content changes (players joining lobby, errors appearing, etc.)
    const mo = new MutationObserver(debouncedRecalc);
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', debouncedRecalc);
      mo.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div ref={ref} className={`menu-box ${className}`} style={style}>
      {children}
    </div>
  );
}

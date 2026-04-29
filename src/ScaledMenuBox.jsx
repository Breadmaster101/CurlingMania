import { useRef, useEffect, useState } from 'react';

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
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const recalc = () => {
      // Temporarily remove zoom to measure TRULY natural dimensions without relying 
      // on buggy or inconsistent browser math (Safari bounds bugs, Chrome zoom standardization).
      // This runs synchronously, so it will NOT cause a visual flicker.
      el.style.zoom = '1';
      
      const naturalW = el.offsetWidth;
      const naturalH = el.offsetHeight;

      const availW = window.innerWidth - FLOAT_GAP * 2;
      const availH = window.innerHeight - FLOAT_GAP * 2;

      const z = Math.min(1, availW / naturalW, availH / naturalH);
      const newZoom = Math.max(MIN_ZOOM, z);
      el.style.zoom = String(newZoom);
      setZoom(newZoom);
    };

    const debouncedRecalc = () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(recalc);
    };

    // Initial calculation
    recalc();

    window.addEventListener('resize', debouncedRecalc);
    
    // Fallback font metrics (system-ui) might differ from 'Space Grotesk', causing the 
    // initial recalc to use slightly larger/smaller natural dimensions. When the font
    // finishes loading asynchronously, it doesn't trigger the MutationObserver.
    // Triggering recalc on font load fixes the first-click resize jump.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(debouncedRecalc);
    }

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
    <div ref={ref} className={`menu-box ${className}`} style={{ ...style, zoom }}>
      {children}
    </div>
  );
}

/**
 * Shared helpers for validating anything that arrives over the network.
 *
 * The relay server is a dumb pipe: every payload here was authored by another
 * client, so nothing from it can be trusted. A single NaN velocity is enough to
 * wedge the physics loop forever, so all of it gets sanitized on the way in.
 */

/** Coerces to a finite number, falling back when the value is NaN/Infinity/garbage. */
export function num(value, fallback = 0) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/** Finite number clamped into range, with a fallback for non-numbers. */
export function safeCoord(value, min, max, fallback) {
    return clamp(num(value, fallback), min, max);
}

export function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

/** Trims, strips control characters, and caps length. Never returns empty. */
export function sanitizeName(name, fallback = 'Curler') {
    if (typeof name !== 'string') return fallback;
    const printable = Array.from(name)
        .filter(ch => {
            const code = ch.charCodeAt(0);
            return code >= 32 && code !== 127;
        })
        .join('');
    const cleaned = printable.trim().slice(0, 24);
    return cleaned.length > 0 ? cleaned : fallback;
}

/** A per-tab identity that survives socket reconnects (a new socket means a new id). */
export function getClientToken() {
    const generate = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
        let token = sessionStorage.getItem('curling_client_token');
        if (!token) {
            token = generate();
            sessionStorage.setItem('curling_client_token', token);
        }
        return token;
    } catch {
        // Private browsing / storage disabled: fall back to a memory-only token.
        return generate();
    }
}

/** Random room code. Excludes easily-confused characters (0/O, 1/I). */
export function generateRoomCode(length = 3) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
}

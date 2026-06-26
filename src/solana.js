// Phantom / Solana wallet integration.
//
// The game identity on the Solana network is the connected wallet public key.
// Phantom is the primary target, but any injected Solana provider that exposes
// `connect` / `signMessage` (Solflare, Backpack, ...) is supported transparently.

const PHANTOM_INSTALL_URL = 'https://phantom.app/';
// Display-only label. Phantom itself decides the active cluster; we never switch it.
export const SOLANA_NETWORK = 'mainnet-beta';

const STORAGE = {
    pubkey: 'solana_pubkey',
    username: 'solana_username',
};

let eventsBound = false;

/**
 * Resolve the best available injected Solana provider.
 * Prefers the namespaced `window.phantom.solana` (recommended by Phantom)
 * and falls back to the legacy `window.solana` global.
 */
export function getPhantomProvider() {
    if (typeof window === 'undefined') return null;
    const phantom = window.phantom && window.phantom.solana;
    if (phantom && phantom.isPhantom) return phantom;
    // Legacy fallback: only accept an injected provider that can actually connect.
    if (window.solana && typeof window.solana.connect === 'function') return window.solana;
    return null;
}

export function isPhantomInstalled() {
    return !!getPhantomProvider();
}

export function getInstallUrl() {
    return PHANTOM_INSTALL_URL;
}

async function signLoginChallenge(provider, publicKey) {
    // Best-effort proof of wallet ownership. Non-fatal if the wallet refuses
    // (some providers gate signMessage behind extra prompts).
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const messageStr =
            `Sign this message to log into NEAR Lands.\n` +
            `Wallet: ${publicKey}\n` +
            `Network: ${SOLANA_NETWORK}\n` +
            `Challenge: ${timestamp}`;
        const encodedMessage = new TextEncoder().encode(messageStr);
        await provider.signMessage(encodedMessage, 'utf8');
        return true;
    } catch (err) {
        console.warn('Message signing skipped or failed:', err);
        return false;
    }
}

/**
 * Interactive connect. Throws a user-friendly error when no wallet is present
 * or the user rejects the request.
 */
export async function connectSolana() {
    const provider = getPhantomProvider();
    if (!provider) {
        // Open the install page in a new tab to nudge the user along.
        try { window.open(PHANTOM_INSTALL_URL, '_blank', 'noopener'); } catch (e) {}
        throw new Error('Phantom wallet not found. Install Phantom (or another Solana wallet) and reload.');
    }

    let resp;
    try {
        resp = await provider.connect();
    } catch (err) {
        // 4001 == user rejected the request (EIP-1193 style code reused by Phantom).
        if (err && (err.code === 4001 || /reject/i.test(err.message || ''))) {
            throw new Error('Wallet connection was rejected.');
        }
        throw new Error(err && err.message ? err.message : 'Solana login failed.');
    }

    const publicKey = resp.publicKey.toString();
    await signLoginChallenge(provider, publicKey);

    localStorage.setItem(STORAGE.pubkey, publicKey);
    bindProviderEvents(provider);
    return publicKey;
}

/**
 * Silent reconnect for returning users. Phantom only resolves this if the dapp
 * was previously trusted, so it never shows a popup. Keeps localStorage in sync
 * with the wallet's real state without forcing a fresh login.
 *
 * Returns the connected public key, or null when no trusted session exists.
 */
export async function eagerConnectSolana() {
    const provider = getPhantomProvider();
    if (!provider) return null;

    bindProviderEvents(provider);

    // Already connected in this page session.
    if (provider.publicKey) {
        const publicKey = provider.publicKey.toString();
        localStorage.setItem(STORAGE.pubkey, publicKey);
        return publicKey;
    }

    // Only attempt the silent path when we believe the user logged in before.
    if (!localStorage.getItem(STORAGE.pubkey)) return null;

    try {
        const resp = await provider.connect({ onlyIfTrusted: true });
        const publicKey = resp.publicKey.toString();
        localStorage.setItem(STORAGE.pubkey, publicKey);
        return publicKey;
    } catch (err) {
        // Not trusted / wallet locked — leave stored identity in place so the UI
        // still treats them as logged in; signing happens via the NEAR keystore.
        console.debug('Eager Solana reconnect unavailable:', err && err.message);
        return null;
    }
}

/**
 * Keep the app in sync when the user switches accounts or disconnects from the
 * wallet UI directly. Safe to call multiple times — only binds once.
 */
function bindProviderEvents(provider) {
    if (eventsBound || !provider || typeof provider.on !== 'function') return;
    eventsBound = true;

    provider.on('accountChanged', (publicKey) => {
        if (publicKey) {
            const next = publicKey.toString();
            const current = localStorage.getItem(STORAGE.pubkey);
            if (next !== current) {
                // New wallet => new identity. Drop the old nickname/character.
                localStorage.setItem(STORAGE.pubkey, next);
                localStorage.removeItem(STORAGE.username);
                window.location.reload();
            }
        } else {
            // Switched to a locked/unknown account.
            disconnectSolana();
            window.location.reload();
        }
    });

    provider.on('disconnect', () => {
        // Phantom fires this on transient locks / auto-disconnect too, so we do
        // NOT wipe the stored identity or reload here — the player keeps their
        // session (game identity lives in localStorage; P2P signing uses the NEAR
        // keystore). An intentional logout goes through disconnectSolana().
        console.debug('Solana wallet disconnect event (session preserved).');
    });
}

export function getSolanaPubkey() {
    return localStorage.getItem(STORAGE.pubkey);
}

export function getSolanaUsername() {
    return localStorage.getItem(STORAGE.username);
}

export function setSolanaUsername(name) {
    localStorage.setItem(STORAGE.username, name);
}

/**
 * Short, human-readable label for the active wallet: nickname if set,
 * otherwise a truncated public key, otherwise null.
 */
export function getSolanaDisplayName() {
    const username = getSolanaUsername();
    if (username) return username;
    const pubkey = getSolanaPubkey();
    if (pubkey) return shortenPubkey(pubkey);
    return null;
}

export function shortenPubkey(pubkey) {
    if (!pubkey || pubkey.length <= 10) return pubkey || '';
    return `${pubkey.substring(0, 4)}...${pubkey.substring(pubkey.length - 4)}`;
}

export function disconnectSolana() {
    localStorage.removeItem(STORAGE.pubkey);
    localStorage.removeItem(STORAGE.username);
    const provider = getPhantomProvider();
    if (provider && provider.disconnect) {
        try {
            provider.disconnect();
        } catch (e) {
            console.error('Error disconnecting Solana wallet:', e);
        }
    }
}

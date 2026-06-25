export async function connectSolana() {
    const provider = window.solana;
    if (!provider) {
        throw new Error("Solana wallet extension not found. Please install Phantom or Solflare.");
    }
    
    // Connect to Phantom/Solana provider
    const resp = await provider.connect();
    const publicKey = resp.publicKey.toString();
    
    // Optional: Sign a challenge message for verification
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const messageStr = `Sign this message to log into NEAR Lands.\nChallenge: ${timestamp}`;
        const encodedMessage = new TextEncoder().encode(messageStr);
        await provider.signMessage(encodedMessage, "utf8");
    } catch (err) {
        console.warn("Message signing skipped or failed:", err);
    }
    
    localStorage.setItem('solana_pubkey', publicKey);
    return publicKey;
}

export function getSolanaPubkey() {
    return localStorage.getItem('solana_pubkey');
}

export function getSolanaUsername() {
    return localStorage.getItem('solana_username');
}

export function setSolanaUsername(name) {
    localStorage.setItem('solana_username', name);
}

export function disconnectSolana() {
    localStorage.removeItem('solana_pubkey');
    localStorage.removeItem('solana_username');
    if (window.solana && window.solana.disconnect) {
        try {
            window.solana.disconnect();
        } catch (e) {
            console.error("Error disconnecting Solana wallet:", e);
        }
    }
}

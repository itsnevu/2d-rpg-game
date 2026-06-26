// Co-op multiplayer layer for the survival mode.
//
// Players already share the same world and see each other move (see p2p.js +
// onLocationUpdate in index.js). This module adds the *survival* dimension on
// top of that shared world: every player broadcasts their live run state, so
// each client can render a live co-op scoreboard of everyone currently playing
// and merge submitted scores into a shared seasonal leaderboard.
//
// Design notes:
// - Transport is the existing gossip P2P bus, reached through the global
//   `window.publishSurvival(message)` (wired up in index.js once P2P connects).
//   When P2P is unavailable (offline / no peers) everything still works — the
//   scoreboard simply shows the local player only.
// - This layer is intentionally NOT authoritative over enemies: each player
//   runs their own wave simulation. A future host-authoritative co-op (shared
//   monsters) can reuse the same `type: 'survival'` channel by adding new
//   `event` kinds (e.g. 'enemy-snapshot') without touching the presence code.

import { SEASON_CONFIG } from './survival-config';

const PRESENCE_INTERVAL_MS = 1000;   // how often we broadcast our own run state
const PEER_TIMEOUT_MS = 8000;        // drop peers we haven't heard from recently
const SCOREBOARD_LIMIT = 8;          // max rows in the live co-op scoreboard

export class SurvivalNet {
    constructor(scene, { localDisplayName } = {}) {
        this.scene = scene;
        this.localDisplayName = localDisplayName || 'You';
        this.peers = {};               // accountId -> presence record
        this.submittedScores = {};     // accountId -> { displayName, score, ... }
        this.lastPublishAt = 0;
        this.lastRenderAt = 0;
    }

    /** Build the local player's current run snapshot from scene state. */
    localSnapshot() {
        const survival = this.scene.survivalSystem;
        const player = this.scene.player;
        const run = survival ? survival.scoreRunData : null;
        return {
            displayName: this.localDisplayName,
            score: run ? Math.round(run.finalScore) : 0,
            wave: run ? run.waveReached : 1,
            kills: run ? run.monstersKilled : 0,
            coins: run ? run.coinsCollected : 0,
            hp: player ? Math.max(0, Math.round(player.hp || 0)) : 0,
            maxHp: player ? Math.round(player.maxHp || 100) : 100,
            state: survival ? survival.state : 'running',
            you: true,
        };
    }

    /** Called every frame from the scene; throttles its own broadcasts. */
    update(now) {
        this.prunePeers(now);

        if (now - this.lastPublishAt >= PRESENCE_INTERVAL_MS) {
            this.lastPublishAt = now;
            this.publishPresence();
        }

        // Throttle DOM updates — the local score ticks every frame, so re-rendering
        // the board ~3x/sec is smooth without thrashing layout.
        if (now - this.lastRenderAt >= 350) {
            this.lastRenderAt = now;
            this.renderScoreboard();

            // Keep the result screen's shared seasonal board fresh when peers
            // submit after our run has ended (survivalSystem.update has stopped).
            const survival = this.scene.survivalSystem;
            if (survival && survival.state !== 'running' && survival.renderSeasonResult) {
                survival.renderSeasonResult();
            }
        }
    }

    publishPresence() {
        if (typeof window.publishSurvival !== 'function') return;
        const snap = this.localSnapshot();
        window.publishSurvival({
            type: 'survival',
            event: 'presence',
            displayName: snap.displayName,
            score: snap.score,
            wave: snap.wave,
            kills: snap.kills,
            coins: snap.coins,
            hp: snap.hp,
            maxHp: snap.maxHp,
            state: snap.state,
        });
    }

    /** Broadcast a finalized score so peers' seasonal boards update live. */
    broadcastSubmit(scoreRunData) {
        if (typeof window.publishSurvival !== 'function') return;
        window.publishSurvival({
            type: 'survival',
            event: 'submit',
            displayName: this.localDisplayName,
            score: Math.round(scoreRunData.finalScore),
            wave: scoreRunData.waveReached,
            kills: scoreRunData.monstersKilled,
            bossKilled: !!scoreRunData.bossKilled,
        });
    }

    /** Dispatch an incoming verified P2P message. Ignores non-survival traffic. */
    handleMessage(message) {
        if (!message || message.type !== 'survival' || !message.accountId) return;

        // Peers are untrusted: coerce every field to a safe type/range before it
        // can reach the DOM (numbers stay numbers -> no XSS via toLocaleString,
        // no NaN poisoning the sort) and cap name length to keep layout sane.
        const name = safeName(message.displayName, message.accountId);

        if (message.event === 'submit') {
            const score = safeNum(message.score);
            const prev = this.submittedScores[message.accountId];
            if (!prev || score > prev.score) {
                this.submittedScores[message.accountId] = {
                    displayName: name,
                    score,
                    wave: safeNum(message.wave, 1, 99),
                    bossKilled: !!message.bossKilled,
                };
            }
            return;
        }

        // Default: presence update.
        this.peers[message.accountId] = {
            accountId: message.accountId,
            displayName: name,
            score: safeNum(message.score),
            wave: safeNum(message.wave, 1, 99),
            kills: safeNum(message.kills),
            coins: safeNum(message.coins),
            hp: safeNum(message.hp),
            maxHp: safeNum(message.maxHp, 100) || 100,
            state: ['gameover', 'victory'].includes(message.state) ? message.state : 'running',
            lastSeen: Date.now(),
        };
    }

    prunePeers(now) {
        const wallNow = Date.now();
        for (const id of Object.keys(this.peers)) {
            if (wallNow - this.peers[id].lastSeen > PEER_TIMEOUT_MS) {
                delete this.peers[id];
            }
        }
    }

    /** All currently-online players (local + peers), sorted by score desc. */
    liveBoard() {
        const rows = [this.localSnapshot(), ...Object.values(this.peers)];
        rows.sort((a, b) => b.score - a.score);
        return rows;
    }

    renderScoreboard() {
        const panel = document.getElementById('coop-scoreboard');
        const list = document.getElementById('coop-list');
        const countEl = document.getElementById('coop-count');
        if (!panel || !list) return;

        const rows = this.liveBoard();
        const online = rows.length;
        if (countEl) countEl.innerText = String(online);

        // Only worth showing once at least one other player is around, but we
        // keep it visible solo too so the player learns it exists.
        panel.style.display = 'block';

        list.innerHTML = rows.slice(0, SCOREBOARD_LIMIT).map((r, i) => {
            const dead = r.state === 'gameover';
            const name = r.you ? `${r.displayName} (you)` : r.displayName;
            const cls = `coop-row${r.you ? ' you' : ''}${dead ? ' dead' : ''}`;
            return `<div class="${cls}">` +
                `<span class="coop-rank">${i + 1}</span>` +
                `<span class="coop-name">${escapeHtml(name)}</span>` +
                `<span class="coop-wave">W${r.wave}</span>` +
                `<span class="coop-score">${(r.score || 0).toLocaleString()}</span>` +
                `</div>`;
        }).join('');
    }

    /**
     * Merge submitted scores from peers, the local run, and the static season
     * mock into a single ranked leaderboard for the run-result screen.
     * Returns { rows, playerRank, estimatedReward }.
     */
    getMergedLeaderboard(localRun) {
        const entries = [];

        // Static mock entries from the season config (other "seasons" players).
        for (const e of SEASON_CONFIG.leaderboard) {
            entries.push({ displayName: e.playerId, score: e.score, you: false });
        }
        // Scores submitted by peers this session.
        for (const id of Object.keys(this.submittedScores)) {
            const s = this.submittedScores[id];
            entries.push({ displayName: s.displayName, score: s.score, you: false });
        }
        // The local player's finished run.
        if (localRun) {
            entries.push({
                displayName: this.localDisplayName,
                score: Math.round(localRun.finalScore),
                you: true,
            });
        }

        entries.sort((a, b) => b.score - a.score);
        entries.forEach((e, i) => { e.rank = i + 1; });

        const me = entries.find(e => e.you);
        const playerRank = me ? me.rank : entries.length + 1;
        const estimatedReward = estimateReward(playerRank, entries.length);

        return { rows: entries, playerRank, estimatedReward };
    }
}

/** Estimate a coin reward for a given rank using SEASON_CONFIG.rewardDistribution. */
export function estimateReward(rank, totalPlayers) {
    const pool = SEASON_CONFIG.rewardPool || 0;
    const dist = SEASON_CONFIG.rewardDistribution || [];
    for (const tier of dist) {
        const [lo, hi] = parseRankRange(tier.ranks);
        if (rank >= lo && rank <= hi) {
            const tierPlayers = Math.max(1, Math.min(hi, totalPlayers) - lo + 1);
            // Split this tier's share evenly across the ranks it covers.
            return Math.round((pool * tier.share / 100) / tierPlayers);
        }
    }
    return 0;
}

function parseRankRange(ranks) {
    const str = String(ranks);
    if (str.includes('-')) {
        const [a, b] = str.split('-').map(n => parseInt(n, 10));
        return [a, b];
    }
    const n = parseInt(str, 10);
    return [n, n];
}

// Coerce an untrusted value to a finite number, clamped to [0, max], default d.
function safeNum(v, d = 0, max = 1e9) {
    const n = Number(v);
    if (!Number.isFinite(n)) return d;
    return Math.max(0, Math.min(max, n));
}

function safeName(name, accountId) {
    const str = (typeof name === 'string' && name.trim()) ? name.trim() : shortAccount(accountId);
    return str.slice(0, 24);
}

function shortAccount(accountId) {
    if (!accountId) return 'player';
    if (accountId.startsWith('guest:')) return `guest:${accountId.split(':')[1].substring(0, 6)}`;
    if (accountId.length > 12) return `${accountId.substring(0, 6)}...`;
    return accountId;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

// Data-driven sprite art for the survival mode.
//
// Each creature/item/weapon is defined as a back-to-front list of filled shape
// "ops" in a normalized 0..1 coordinate space. A tiny software rasterizer turns
// that definition into an RGBA pixel buffer. The SAME buffer is used:
//   - in the browser, to build a Phaser texture via an offscreen canvas, and
//   - offline, to render a PNG preview (scripts/* using `sharp`),
// so what you preview is pixel-identical to what ships.
//
// To add a new monster: add an entry here, point its MONSTER_CONFIGS.assetKey at
// the key, done. No binary assets, no build step.

// ---- shared palette (kept consistent across creatures) ----
const C = {
    // slime (green)
    slimeDark: '#1b5e20', slime: '#5fd06f', slimeLite: '#bff7c8',
    // raider / goblin (orange, fast)
    raiderDark: '#7a3b14', raider: '#df7d3e', raiderLite: '#f0a368',
    // brute / tank (purple)
    bruteDark: '#3f2a63', brute: '#8e6fbe', bruteLite: '#b89ad8',
    // spitter / ranged (violet w/ glowing core)
    spitDark: '#2f2080', spit: '#7b61ff', spitGlow: '#7fe7ff',
    // elite (gold)
    eliteDark: '#7a5c12', elite: '#f2c94c', eliteLite: '#ffe9a8',
    // boss warlord (red demon)
    bossDark: '#4a1010', boss: '#c0392b', bossLite: '#e8654a', bossAura: '#ff6b3d',
    // shared
    steel: '#cdd6e0', steelLite: '#f2f6fa', steelDark: '#8a98a8',
    gold: '#c8a23c', goldLite: '#f4d98a',
    bone: '#ece2c8', grip: '#5c3a21',
    eyeWhite: '#ffffff', pupil: '#10231a', glowYellow: '#ffe14d', menace: '#ff3b30',
    black: '#1c1410',
};

// Helper builders keep op lists short and readable.
const ell = (x, y, rx, ry, fill, a) => ({ op: 'ellipse', x, y, rx, ry, fill, a });
const circ = (x, y, r, fill, a) => ({ op: 'ellipse', x, y, rx: r, ry: r, fill, a });
const rect = (x, y, w, h, fill, r, a) => ({ op: 'rect', x, y, w, h, fill, r, a });
const tri = (points, fill, a) => ({ op: 'tri', points, fill, a });

export const SURVIVAL_ART = {
    // ---------------- SLIME ----------------
    'monster-slime': {
        ops: [
            ell(0.50, 0.64, 0.42, 0.34, C.slimeDark),     // outline
            ell(0.50, 0.64, 0.37, 0.29, C.slime),         // body
            ell(0.38, 0.50, 0.15, 0.08, C.slimeLite, 0.85), // shine
            // big readable eyes
            circ(0.36, 0.60, 0.12, C.eyeWhite),
            circ(0.64, 0.60, 0.12, C.eyeWhite),
            circ(0.37, 0.63, 0.06, C.pupil),
            circ(0.63, 0.63, 0.06, C.pupil),
            circ(0.39, 0.60, 0.02, C.eyeWhite),           // catchlight
            circ(0.65, 0.60, 0.02, C.eyeWhite),
            ell(0.50, 0.79, 0.13, 0.045, C.slimeDark),    // mouth
        ],
    },

    // ---------------- RAIDER (goblin, fast) ----------------
    'monster-raider': {
        ops: [
            // dagger in right hand
            rect(0.72, 0.46, 0.05, 0.10, C.grip),
            tri([[0.70, 0.46], [0.83, 0.10], [0.80, 0.48]], C.steel),
            tri([[0.70, 0.46], [0.80, 0.48], [0.74, 0.10]], C.steelLite),
            // body
            ell(0.48, 0.66, 0.27, 0.28, C.raiderDark),
            ell(0.48, 0.66, 0.22, 0.23, C.raider),
            rect(0.34, 0.60, 0.28, 0.10, C.raiderDark, 0.4, 0.5), // belt shade
            // pointy ears
            tri([[0.26, 0.32], [0.12, 0.30], [0.28, 0.44]], C.raiderDark),
            tri([[0.70, 0.32], [0.86, 0.30], [0.68, 0.44]], C.raiderDark),
            // head
            circ(0.48, 0.34, 0.20, C.raiderDark),
            circ(0.48, 0.34, 0.16, C.raiderLite),
            // angry brow
            tri([[0.34, 0.28], [0.46, 0.32], [0.34, 0.34]], C.raiderDark),
            tri([[0.62, 0.28], [0.50, 0.32], [0.62, 0.34]], C.raiderDark),
            // eyes
            circ(0.41, 0.35, 0.045, C.menace),
            circ(0.55, 0.35, 0.045, C.menace),
            // fangs
            tri([[0.43, 0.42], [0.47, 0.42], [0.45, 0.47]], C.eyeWhite),
            tri([[0.49, 0.42], [0.53, 0.42], [0.51, 0.47]], C.eyeWhite),
        ],
    },

    // ---------------- BRUTE (tank) ----------------
    'monster-brute': {
        ops: [
            // big hulking torso
            rect(0.17, 0.44, 0.66, 0.46, C.bruteDark, 0.4),
            rect(0.21, 0.47, 0.58, 0.40, C.brute, 0.4),
            // wide shoulders (kept low so they don't merge with the head)
            circ(0.19, 0.56, 0.13, C.bruteDark),
            circ(0.81, 0.56, 0.13, C.bruteDark),
            circ(0.19, 0.56, 0.095, C.bruteLite),
            circ(0.81, 0.56, 0.095, C.bruteLite),
            // chest armour plate
            rect(0.38, 0.58, 0.24, 0.24, C.bruteDark, 0.25),
            rect(0.41, 0.61, 0.18, 0.18, C.bruteLite, 0.2, 0.6),
            // distinct head on top
            circ(0.50, 0.27, 0.18, C.bruteDark),
            circ(0.50, 0.28, 0.14, C.brute),
            // heavy brow
            rect(0.36, 0.22, 0.28, 0.04, C.bruteDark),
            // big glowing eyes
            rect(0.38, 0.26, 0.09, 0.055, C.glowYellow),
            rect(0.53, 0.26, 0.09, 0.055, C.glowYellow),
            // tusks
            tri([[0.44, 0.36], [0.48, 0.36], [0.46, 0.42]], C.eyeWhite),
            tri([[0.52, 0.36], [0.56, 0.36], [0.54, 0.42]], C.eyeWhite),
        ],
    },

    // ---------------- SPITTER (ranged) ----------------
    'monster-ranged': {
        ops: [
            // body
            ell(0.46, 0.60, 0.34, 0.33, C.spitDark),
            ell(0.46, 0.60, 0.29, 0.28, C.spit),
            // dark spots
            circ(0.30, 0.45, 0.05, C.spitDark),
            circ(0.40, 0.74, 0.045, C.spitDark),
            circ(0.58, 0.50, 0.04, C.spitDark),
            // glowing core
            circ(0.46, 0.60, 0.13, C.spitGlow, 0.55),
            circ(0.46, 0.60, 0.07, C.steelLite, 0.9),
            // spit cannon / mouth on the right
            tri([[0.66, 0.46], [0.96, 0.60], [0.66, 0.74]], C.spitDark),
            tri([[0.70, 0.52], [0.90, 0.60], [0.70, 0.68]], C.spitGlow, 0.85),
            // eyes
            circ(0.34, 0.40, 0.05, C.glowYellow),
            circ(0.56, 0.38, 0.05, C.glowYellow),
            circ(0.34, 0.40, 0.022, C.pupil),
            circ(0.56, 0.38, 0.022, C.pupil),
        ],
    },

    // ---------------- ELITE (gold champion) ----------------
    'monster-elite': {
        ops: [
            // aura
            circ(0.50, 0.55, 0.46, C.eliteLite, 0.18),
            // body
            ell(0.50, 0.62, 0.32, 0.32, C.eliteDark),
            ell(0.50, 0.62, 0.27, 0.27, C.elite),
            // chest gem
            tri([[0.50, 0.52], [0.58, 0.62], [0.50, 0.72]], C.menace),
            tri([[0.50, 0.52], [0.42, 0.62], [0.50, 0.72]], '#ff7b6b'),
            // helmet
            circ(0.50, 0.34, 0.21, C.eliteDark),
            circ(0.50, 0.36, 0.17, C.elite),
            rect(0.31, 0.33, 0.38, 0.06, C.eliteDark, 0.5), // visor slot
            // glowing eyes in visor
            rect(0.40, 0.335, 0.07, 0.03, C.glowYellow),
            rect(0.53, 0.335, 0.07, 0.03, C.glowYellow),
            // crown spikes
            tri([[0.34, 0.20], [0.40, 0.20], [0.37, 0.06]], C.gold),
            tri([[0.47, 0.18], [0.53, 0.18], [0.50, 0.02]], C.gold),
            tri([[0.60, 0.20], [0.66, 0.20], [0.63, 0.06]], C.gold),
            circ(0.50, 0.03, 0.03, C.menace),
        ],
    },

    // ---------------- BOSS: SEASON WARLORD (complete) ----------------
    'monster-boss-warlord': {
        ops: [
            // outer aura
            circ(0.50, 0.52, 0.49, C.bossAura, 0.16),
            circ(0.50, 0.52, 0.42, C.bossAura, 0.12),
            // cape behind
            tri([[0.50, 0.30], [0.12, 0.92], [0.88, 0.92]], '#5a0f0f'),
            tri([[0.50, 0.34], [0.20, 0.88], [0.80, 0.88]], C.bossDark),
            // big sword on the right
            rect(0.80, 0.18, 0.05, 0.62, C.steel, 0.2),
            rect(0.805, 0.18, 0.02, 0.62, C.steelLite, 0.2),
            tri([[0.78, 0.18], [0.87, 0.18], [0.825, 0.07]], C.steelLite), // tip
            rect(0.74, 0.74, 0.17, 0.05, C.gold, 0.3),                     // guard
            rect(0.80, 0.78, 0.05, 0.12, C.grip),                          // grip
            circ(0.825, 0.92, 0.035, C.gold),                             // pommel
            // shoulder pauldrons
            circ(0.24, 0.52, 0.17, C.bossDark),
            circ(0.76, 0.52, 0.17, C.bossDark),
            circ(0.24, 0.52, 0.12, C.bossLite),
            circ(0.76, 0.52, 0.12, C.bossLite),
            // torso
            ell(0.50, 0.64, 0.32, 0.30, C.bossDark),
            ell(0.50, 0.64, 0.27, 0.25, C.boss),
            // chest armor with gold trim
            rect(0.34, 0.54, 0.32, 0.30, C.gold, 0.25),
            rect(0.37, 0.57, 0.26, 0.24, C.steelDark, 0.2),
            tri([[0.50, 0.58], [0.60, 0.70], [0.50, 0.82]], C.menace, 0.9), // chest gem
            tri([[0.50, 0.58], [0.40, 0.70], [0.50, 0.82]], '#ff6f5e', 0.9),
            // head
            circ(0.50, 0.34, 0.19, C.bossDark),
            circ(0.50, 0.35, 0.15, C.boss),
            // horns
            tri([[0.33, 0.30], [0.20, 0.06], [0.40, 0.22]], C.bone),
            tri([[0.67, 0.30], [0.80, 0.06], [0.60, 0.22]], C.bone),
            tri([[0.33, 0.30], [0.26, 0.14], [0.39, 0.23]], '#cdbf9a'),
            tri([[0.67, 0.30], [0.74, 0.14], [0.61, 0.23]], '#cdbf9a'),
            // glowing eyes
            circ(0.43, 0.35, 0.05, C.glowYellow),
            circ(0.57, 0.35, 0.05, C.glowYellow),
            circ(0.43, 0.35, 0.022, C.eyeWhite),
            circ(0.57, 0.35, 0.022, C.eyeWhite),
            // snarl + fangs
            rect(0.42, 0.45, 0.16, 0.035, C.black, 0.3),
            tri([[0.44, 0.45], [0.48, 0.45], [0.46, 0.52]], C.eyeWhite),
            tri([[0.52, 0.45], [0.56, 0.45], [0.54, 0.52]], C.eyeWhite),
        ],
    },

    // ---------------- PLAYER KNIFE (held, points +x) ----------------
    // Authored wide: x runs along the blade length, y across thickness. Short
    // single-edged dagger — smaller than a sword, sits in the character's hand.
    'weapon-knife': {
        width: 40, height: 16,
        ops: [
            // pommel + grip
            circ(0.08, 0.5, 0.07, C.gold),
            rect(0.07, 0.36, 0.20, 0.28, C.grip, 0.3),
            rect(0.10, 0.40, 0.10, 0.08, '#7a5230', 0.4), // grip highlight
            // small guard
            rect(0.27, 0.28, 0.05, 0.44, C.gold, 0.2),
            // single-edged blade tapering to a point on the right
            tri([[0.32, 0.32], [0.32, 0.66], [0.97, 0.49]], C.steel),
            tri([[0.32, 0.50], [0.32, 0.66], [0.97, 0.49]], C.steelDark), // lower bevel
            tri([[0.34, 0.37], [0.34, 0.49], [0.86, 0.49]], C.steelLite), // edge highlight
        ],
    },

    // ---------------- ITEM: COIN ----------------
    'drop-coin': {
        ops: [
            circ(0.5, 0.5, 0.44, C.eliteDark),
            circ(0.5, 0.5, 0.36, C.gold),
            circ(0.42, 0.42, 0.12, C.goldLite, 0.9),
            rect(0.44, 0.30, 0.12, 0.40, C.eliteDark, 0.3, 0.7),  // "$" stem
        ],
    },

    // ---------------- ITEM: HEALTH POTION ----------------
    'drop-health_potion': {
        ops: [
            rect(0.40, 0.10, 0.20, 0.12, C.grip, 0.3),        // cork
            rect(0.34, 0.30, 0.32, 0.58, '#7a1f1f', 0.35),    // glass outline
            rect(0.37, 0.33, 0.26, 0.52, '#e74c3c', 0.35),    // liquid
            rect(0.40, 0.40, 0.10, 0.34, '#ff9a8d', 0.4, 0.8), // shine
            rect(0.45, 0.52, 0.10, 0.04, C.eyeWhite),         // cross
            rect(0.48, 0.46, 0.04, 0.16, C.eyeWhite),
        ],
    },

    // ---------------- ITEM: RARE CHEST ----------------
    'drop-rare_chest': {
        ops: [
            rect(0.16, 0.44, 0.68, 0.40, '#5c3413', 0.15),    // base
            rect(0.20, 0.48, 0.60, 0.34, '#8a5a2b', 0.15),
            ell(0.50, 0.44, 0.34, 0.18, '#5c3413'),           // lid
            ell(0.50, 0.44, 0.30, 0.14, C.gold),
            rect(0.16, 0.60, 0.68, 0.06, C.gold),             // band
            rect(0.45, 0.54, 0.10, 0.20, C.eliteDark, 0.2),   // lock
            circ(0.50, 0.60, 0.04, C.glowYellow),
        ],
    },
};

// Sizes for square creature textures are derived from collision radius so the
// art lines up with the physics body (texture = 2*radius + pad).
export const ART_PAD = 12;

// ----------------------------- rasterizer -----------------------------

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

function insideOp(op, nx, ny) {
    switch (op.op) {
        case 'ellipse': {
            const dx = (nx - op.x) / op.rx;
            const dy = (ny - op.y) / op.ry;
            return dx * dx + dy * dy <= 1;
        }
        case 'rect': {
            const x0 = op.x, y0 = op.y, x1 = op.x + op.w, y1 = op.y + op.h;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) return false;
            if (op.r) {
                // rounded corners
                const r = op.r * Math.min(op.w, op.h);
                const cx = Math.min(Math.max(nx, x0 + r), x1 - r);
                const cy = Math.min(Math.max(ny, y0 + r), y1 - r);
                const dx = nx - cx, dy = ny - cy;
                return dx * dx + dy * dy <= r * r;
            }
            return true;
        }
        case 'tri': {
            const [a, b, c] = op.points;
            const d1 = sign(nx, ny, a, b);
            const d2 = sign(nx, ny, b, c);
            const d3 = sign(nx, ny, c, a);
            const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
            const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
            return !(hasNeg && hasPos);
        }
        default:
            return false;
    }
}

function sign(px, py, a, b) {
    return (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
}

/**
 * On-screen size (in texture pixels) of a single "art pixel". Bigger = chunkier,
 * more retro. Monsters/boss share one block size so the whole roster reads as a
 * single cohesive pixel grid; items/weapon use a finer block for crispness.
 */
export function pixelSizeFor(key) {
    if (key.startsWith('drop-')) return 2;
    if (key === 'weapon-knife') return 2;
    // Big sprites stay chunky (3px blocks); smaller monsters get finer blocks so
    // eyes/faces survive — both still read clearly as pixel art.
    if (key === 'monster-elite' || key === 'monster-boss-warlord') return 3;
    return 2;
}

/**
 * Render an art definition to a straight (non-premultiplied) RGBA buffer, in a
 * deliberately pixelated style: the canvas is divided into `pixelSize`-wide
 * cells, each shape is sampled once per cell, and the cell is filled as one flat
 * block. That yields crisp, aliased pixel-art blocks instead of smooth shapes.
 * Returns { data: Uint8ClampedArray, width, height }.
 */
export function rasterize(art, outW, outH, pixelSize = 1) {
    const W = outW, H = outH;
    const cols = Math.ceil(W / pixelSize);
    const rows = Math.ceil(H / pixelSize);
    const cell = new Float32Array(cols * rows * 4); // rgb 0..255, a 0..1

    for (const op of art.ops) {
        const [r, g, b] = hexToRgb(op.fill);
        const a = op.a == null ? 1 : op.a;
        for (let cy = 0; cy < rows; cy++) {
            const ny = ((cy + 0.5) * pixelSize) / H; // sample at cell centre
            for (let cx = 0; cx < cols; cx++) {
                const nx = ((cx + 0.5) * pixelSize) / W;
                if (!insideOp(op, nx, ny)) continue;
                const idx = (cy * cols + cx) * 4;
                const da = cell[idx + 3];
                const outA = a + da * (1 - a);
                if (outA <= 0) continue;
                cell[idx]     = (r * a + cell[idx]     * da * (1 - a)) / outA;
                cell[idx + 1] = (g * a + cell[idx + 1] * da * (1 - a)) / outA;
                cell[idx + 2] = (b * a + cell[idx + 2] * da * (1 - a)) / outA;
                cell[idx + 3] = outA;
            }
        }
    }

    // Expand logical cells to the full-resolution texture (each cell -> block).
    const data = new Uint8ClampedArray(W * H * 4);
    for (let py = 0; py < H; py++) {
        const cy = Math.floor(py / pixelSize);
        for (let px = 0; px < W; px++) {
            const cx = Math.floor(px / pixelSize);
            const c = (cy * cols + cx) * 4;
            const o = (py * W + px) * 4;
            data[o]     = cell[c];
            data[o + 1] = cell[c + 1];
            data[o + 2] = cell[c + 2];
            data[o + 3] = Math.round(cell[c + 3] * 255);
        }
    }
    return { data, width: W, height: H };
}

/**
 * Browser-only: build a Phaser texture from an art key via an offscreen canvas.
 * No-op if the texture already exists.
 */
export function addArtTexture(scene, key, outW, outH) {
    if (scene.textures.exists(key)) return;
    const art = SURVIVAL_ART[key];
    if (!art) return;
    const W = art.width || outW;
    const H = art.height || outH;
    const { data } = rasterize(art, W, H, pixelSizeFor(key));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(W, H);
    imageData.data.set(data);
    ctx.putImageData(imageData, 0, 0);
    scene.textures.addCanvas(key, canvas);
}

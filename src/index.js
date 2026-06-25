import Phaser from 'phaser';

import desertTilesImg from 'url:~src/assets/tilemaps/tiles/tmw_desert_spacing.png';
import grassTilesImg from 'url:~src/assets/tilemaps/tiles/grass.png';
import waterTilesImg from 'url:~src/assets/tilemaps/tiles/water.png';
import asphaltTilesImg from 'url:~src/assets/asset/tiles/new/asphalt.png';
import dirtroadTilesImg from 'url:~src/assets/asset/tiles/new/dirtroad.png';
import dirtTilesImg from 'url:~src/assets/asset/tiles/new/dirt.png';
import seaTilesImg from 'url:~src/assets/asset/tiles/new/sea.png';
import deepseaTilesImg from 'url:~src/assets/asset/tiles/new/deepsea.png';
import tundragrassTilesImg from 'url:~src/assets/asset/tiles/new/tundragrass.png';
import alpineTilesImg from 'url:~src/assets/asset/tiles/new/alpine.png';
import forestTilesImg from 'url:~src/assets/asset/tiles/new/forest.png';
import newGrassTilesImg from 'url:~src/assets/asset/tiles/new/grass.png';
import tundraTilesImg from 'url:~src/assets/asset/tiles/new/tundra.png';
import volcanicTilesImg from 'url:~src/assets/asset/tiles/new/volcanic.png';
import beachTilesImg from 'url:~src/assets/asset/tiles/new/beach.png';
import riverbankTilesImg from 'url:~src/assets/asset/tiles/new/riverbank.png';
import gamepadSpritesheet from 'url:~src/assets/gamepad/gamepad_spritesheet.png'
import princessSpritesheet from 'url:~src/assets/princess.png'

import 'regenerator-runtime/runtime';

import VirtualJoystick from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin'
import UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin'

import sendJson from 'fetch-send-json';

import { connectP2P } from './p2p'
import { connectNear, CONTRACT_NAME } from './near'
import * as audioChat from './audio-chat'
import { debounce } from './utils';
import { connectSolana, getSolanaPubkey, disconnectSolana, getSolanaUsername, setSolanaUsername } from './solana';

import { Player, UPDATE_DELTA } from './player'
import { UIScene } from './ui';

const SET_TILE_GAS = 120 * 1000 * 1000 * 1000 * 1000;
const SET_TILE_BATCH_SIZE = 10;
const DEBUG = false;

const WEB4_URL = process.env.WEB4_URL || 'https://lands.near.page';
const contractPath = WEB4_URL.includes('.near.page') ? '' : `/web4/contract/${CONTRACT_NAME}`;

const connectPromise = connectNear();

const accountIdToPlayer = {};
window.isSpectator = false;

window.showNotification = function(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Prevent Phaser from stealing keyboard focus from HTML input elements
document.addEventListener('focusin', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        try {
            const activeGame = window.game || (typeof game !== 'undefined' ? game : null);
            if (activeGame && activeGame.input && activeGame.input.keyboard) {
                activeGame.input.keyboard.enabled = false;
            }
        } catch (err) {}
    }
});
document.addEventListener('focusout', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        try {
            const activeGame = window.game || (typeof game !== 'undefined' ? game : null);
            if (activeGame && activeGame.input && activeGame.input.keyboard) {
                activeGame.input.keyboard.enabled = true;
            }
        } catch (err) {}
    }
});

async function login() {
    try {
        const pubkey = await connectSolana();
        console.log("Logged in with Solana:", pubkey);
        window.location.reload();
    } catch (e) {
        window.showNotification(e.message || "Solana login failed", "error");
    }
}

async function logout() {
    disconnectSolana();
    localStorage.removeItem('peerId');
    window.location.reload();
}

const CHUNK_SIZE = 16;
const CHUNK_COUNT = 4;
const PARCEL_COUNT = 8;
const TILE_SIZE_PIXELS = 32;
const CHUNK_SIZE_PIXELS = CHUNK_SIZE * TILE_SIZE_PIXELS;
const PARCEL_SIZE_PIXELS = CHUNK_COUNT * CHUNK_SIZE_PIXELS;
const WIDTH_TILES = CHUNK_COUNT * CHUNK_SIZE * PARCEL_COUNT;
const HEIGHT_TILES = WIDTH_TILES;

let nonceMap = [...Array(PARCEL_COUNT * CHUNK_COUNT)].map(() => [...Array(PARCEL_COUNT * CHUNK_COUNT)]);
let fullMap = [...Array(PARCEL_COUNT * CHUNK_COUNT)].map(() => [...Array(PARCEL_COUNT * CHUNK_COUNT)]);

let parcelsLoading = false;
async function loadParcels() {
    if (parcelsLoading) {
        return;
    }

    try {
        parcelsLoading = true;
        const { contract } = await connectPromise;

        const scene = game.scene.getScene('GameScene');
        const { scrollX, scrollY, displayWidth, displayHeight } = scene.cameras.main;
        const startX = Math.floor(scrollX / PARCEL_SIZE_PIXELS);
        const startY = Math.floor(scrollY / PARCEL_SIZE_PIXELS);
        const endX = Math.ceil((scrollX + displayWidth) / PARCEL_SIZE_PIXELS);
        const endY = Math.ceil((scrollY + displayHeight) / PARCEL_SIZE_PIXELS);

        for (let parcelX = startX; parcelX < endX; parcelX++) {
            for (let parcelY = startY; parcelY < endY; parcelY++) {
                const parcelNonces = await sendJson('GET',
                    `${WEB4_URL}${contractPath}/getParcelNonces?x.json=${parcelX}&y.json=${parcelY}`);

                for (let i = 0; i < parcelNonces.length; i++) {
                    for (let j = 0; j < parcelNonces[i].length; j++) {
                        nonceMap[parcelX * CHUNK_COUNT + i][parcelY * CHUNK_COUNT + j] = parcelNonces[i][j];
                    }
                }
            }
        }

        // Throttle
        await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
        parcelsLoading = false;
    }
}

function generateFallbackChunk(i, j, scene) {
    const tiles = [];
    
    // Gids
    const desertGid = 30; // standard sand tile in the desert tileset
    const grassGid = scene.grassTiles ? scene.grassTiles.firstgid : 49;
    const waterGid = scene.waterTiles ? scene.waterTiles.firstgid : 97;
    const asphaltGid = scene.asphaltTiles ? scene.asphaltTiles.firstgid : 129;
    const dirtroadGid = scene.dirtroadTiles ? scene.dirtroadTiles.firstgid : 161;
    const dirtGid = scene.dirtTiles ? scene.dirtTiles.firstgid : 193;
    const seaGid = scene.seaTiles ? scene.seaTiles.firstgid : 225;
    const deepseaGid = scene.deepseaTiles ? scene.deepseaTiles.firstgid : 257;
    const tundragrassGid = scene.tundragrassTiles ? scene.tundragrassTiles.firstgid : 289;
    const alpineGid = scene.alpineTiles ? scene.alpineTiles.firstgid : 321;

    for (let ii = 0; ii < CHUNK_SIZE; ii++) {
        const row = [];
        for (let jj = 0; jj < CHUNK_SIZE; jj++) {
            // Absolute coordinates in tiles
            const absX = i * CHUNK_SIZE + ii;
            const absY = j * CHUNK_SIZE + jj;

            // Simple noise using sine functions for organic patterns
            const n1 = Math.sin(absX * 0.08) * Math.cos(absY * 0.08);
            const n2 = Math.sin(absX * 0.04 + 1.5) * Math.sin(absY * 0.04 + 0.5);
            const val = n1 * 0.65 + n2 * 0.35;

            let tileId = desertGid; // default is sand

            // 1. Procedural Roads (Asphalt and Dirtroad)
            // Let's create an asphalt road crossing horizontally every 45 tiles
            if (Math.abs((absY % 45) - 20) <= 1) {
                tileId = asphaltGid;
            }
            // Let's create a dirtroad crossing vertically every 45 tiles
            else if (Math.abs((absX % 45) - 25) <= 1) {
                tileId = dirtroadGid;
            }
            // 2. Natural Biomes
            else if (val < -0.45) {
                // Deep sea
                tileId = deepseaGid;
            } else if (val < -0.25) {
                // Sea / Shallow Water
                tileId = seaGid;
            } else if (val > 0.3) {
                // Alpine mountain height
                tileId = alpineGid;
            } else if (val > 0.1) {
                // Tundragrass / forest area
                tileId = tundragrassGid;
                // Add scattered grass detail
                if (Math.sin(absX * 0.7) * Math.cos(absY * 0.7) > 0.5) {
                    tileId = grassGid;
                }
            } else if (val > -0.05) {
                // Normal dirt patch
                tileId = dirtGid;
            } else {
                // Desert sand with occasional cacti/rocks
                const rand = Math.sin(absX * 13.0 + absY * 37.0);
                if (rand > 0.96) {
                    tileId = 38; // shrub/cactus
                } else if (rand < -0.96) {
                    tileId = 39; // rock
                }
            }
            row.push(tileId);
        }
        tiles.push(row);
    }
    return {
        nonce: 0,
        tiles: tiles
    };
}

const CHUNK_PRELOAD_RATIO = 0.25;
const VELOCITY_RATIO = 1 / 250;
async function loadChunksIfNeeded() {
    const { contract } = await connectPromise;

    const scene = game.scene.getScene('GameScene');
    const { scrollX, scrollY, displayWidth, displayHeight } = scene.cameras.main;

    const vx = scene.player ? scene.player.body.velocity.x : 0;
    const vy = scene.player ? scene.player.body.velocity.y : 0;
    const extendStartX = Math.max(0, -vx * CHUNK_PRELOAD_RATIO * VELOCITY_RATIO);
    const extendStartY = Math.max(0, -vy * CHUNK_PRELOAD_RATIO * VELOCITY_RATIO);
    const extendEndX = Math.min(vx * CHUNK_PRELOAD_RATIO * VELOCITY_RATIO, CHUNK_PRELOAD_RATIO);
    const extendEndY = Math.min(vy * CHUNK_PRELOAD_RATIO * VELOCITY_RATIO, CHUNK_PRELOAD_RATIO);
    const startX = Math.max(0, Math.floor(scrollX / CHUNK_SIZE_PIXELS - extendStartX));
    const startY = Math.max(0, Math.floor(scrollY / CHUNK_SIZE_PIXELS - extendStartY));
    const endX = Math.min(PARCEL_COUNT * CHUNK_COUNT, Math.ceil((scrollX + displayWidth) / CHUNK_SIZE_PIXELS + extendEndX));
    const endY = Math.min(PARCEL_COUNT * CHUNK_COUNT, Math.ceil((scrollY + displayHeight) / CHUNK_SIZE_PIXELS + extendEndY));

    for (let i = startX; i < endX; i++) {
        for (let j = startY; j < endY; j++) {
            const { nonce, loading } = fullMap[i][j] || {};
            if ((nonce == null || nonce < nonceMap[i][j]) && !loading) {
                console.debug('nonce mismatch for chunk', i, j, nonce, nonceMap[i][j], );
                fullMap[i][j] = { ...fullMap[i][j], loading: true };
                // NOTE: no await on purpose
                await sendJson('GET', `${WEB4_URL}${contractPath}/getChunk?x.json=${i}&y.json=${j}`)
                    .then(chunk => {
                        fullMap[i][j] = { ...chunk, loading: false };
                        updateChunk(i, j);
                    })
                    .catch(e => {
                        console.warn('Error loading chunk ', i, j, e);
                        const fallbackChunk = generateFallbackChunk(i, j, scene);
                        fullMap[i][j] = { ...fallbackChunk, loading: false };
                        updateChunk(i, j);
                    });
            }
        }
    }
}


let setTileQueue = [];
let setTileBatch = [];
function putTileOnChain(x, y, tileId) {
    if (setTileQueue.concat(setTileBatch).some(tile => x == tile.x && y == tile.y && tileId == tile.tileId)) {
        return;
    }

    console.debug('putTileOnChain', x, y, tileId);
    setTileQueue.push({ x, y, tileId });
    updatePending();
}

function updatePending() {
    const scene = game.scene.getScene('UIScene');

    if (!scene || !scene.messageLabel) {
        return;
    }

    scene.updatePending({ setTileQueue, setTileBatch });
}

function updateError(e) {
    console.warn('updateError', e);

    const scene = game.scene.getScene('UIScene');
    if (!scene) {
        return;
    }

    scene.updateError(e);
}

async function setNextPixel() {
    const { contract } = await connectPromise;

    try {
        if (setTileQueue.length == 0) {
            return;
        }

        setTileBatch = setTileQueue.splice(0, Math.min(setTileQueue.length, SET_TILE_BATCH_SIZE));

        // Make sure to set tiles within one chunk
        let nextChunkIndex = setTileBatch.findIndex(tile =>
            Math.floor(tile.x / CHUNK_SIZE) != Math.floor(setTileBatch[0].x / CHUNK_SIZE) ||
            Math.floor(tile.y / CHUNK_SIZE) != Math.floor(setTileBatch[0].y / CHUNK_SIZE))
        if (nextChunkIndex > 0) {
            setTileQueue = setTileBatch.slice(nextChunkIndex).concat(setTileQueue);
            setTileBatch = setTileBatch.slice(0, nextChunkIndex);
        }

        console.debug('setTiles', setTileBatch);
        await contract.setTiles({ tiles: setTileBatch }, SET_TILE_GAS);
    } catch (e) {
        updateError(e);
        updateChunk(Math.floor(setTileBatch[0].x / CHUNK_SIZE), Math.floor(setTileBatch[0].y / CHUNK_SIZE));
    } finally {
        setTileBatch = [];
        updatePending();
        setTimeout(() => setNextPixel(), 50);
    };
}
setNextPixel();

const UI_DEPTH = Number.MAX_SAFE_INTEGER - 100; // NOTE: On top of everything, but leave room for more layers

class GameScene extends Phaser.Scene
{
    constructor ()
    {
        super({ key: 'GameScene' });

        Phaser.GameObjects.GameObjectFactory.register('player', function (config) {
            const player = new Player({ scene: this.scene, ...config });
            this.displayList.add(player);
            this.updateList.add(player);
            return player;
        });
    }

    preload() {
        this.load.image('desert', desertTilesImg);
        this.load.image('grass', grassTilesImg);
        this.load.image('water', waterTilesImg);
        this.load.image('asphalt', asphaltTilesImg);
        this.load.image('dirtroad', dirtroadTilesImg);
        this.load.image('dirt', dirtTilesImg);
        this.load.image('sea', seaTilesImg);
        this.load.image('deepsea', deepseaTilesImg);
        this.load.image('tundragrass', tundragrassTilesImg);
        this.load.image('alpine', alpineTilesImg);

        this.load.spritesheet({ key: 'gamepad', url: gamepadSpritesheet, frameConfig: { frameWidth: 100, frameHeight: 100 } });
        this.load.spritesheet({ key: 'princess', url: princessSpritesheet, frameConfig: { frameWidth: 64, frameHeight: 64 }});
        this.load.spritesheet({ key: 'skeleton', url: '/lpc-character/body/male/skeleton.png', frameConfig: { frameWidth: 64, frameHeight: 64 }});
    }

    selectInventoryTiles(tiles, { forceUpdate } = {}) {
        if (this.inventoryTiles == tiles && !forceUpdate) {
            return;
        }
        this.inventoryTiles = tiles;

        if (this.inventoryBorder) {
            this.inventoryBorder.destroy();
        }
        if (this.inventoryMap) {
            this.inventoryMap.destroy();
        }
        if (this.marker) {
            this.marker.destroy();
        }

        let inventoryData = [];
        let gid = tiles.firstgid;
        for (let i = 0; i < tiles.rows; i++) {
            const row = [];
            for (let j = 0; j < tiles.columns; j++, gid++) {
                row[j] = gid;
            }
            inventoryData.push(row)
        }

        this.inventoryMap = this.make.tilemap({
            tileWidth: tiles.tileWidth,
            tileHeight: tiles.tileHeight,
            width: tiles.columns,
            height: tiles.rows,
            data: inventoryData
        });

        const inventoryX = this.cameras.main.width - this.inventoryMap.widthInPixels - tiles.tileWidth;
        const inventoryY = tiles.tileHeight * 1.5;
        this.inventoryLayer = this.inventoryMap.createLayer(0, tiles, inventoryX, inventoryY);
        this.inventoryLayer.setScrollFactor(0);
        this.inventoryLayer.setDepth(UI_DEPTH);
        this.inventoryLayer.setInteractive();
        this.inventoryLayer.on('pointerdown', this.handleTileDrawing);
        this.inventoryLayer.on('pointermove', this.handleTileDrawing);

        this.inventoryBorder = this.add.graphics();
        this.inventoryBorder.lineStyle(2, 0x000000, 1);
        this.inventoryBorder.strokeRect(inventoryX, inventoryY, this.inventoryMap.widthInPixels, this.inventoryMap.heightInPixels);
        this.inventoryBorder.setScrollFactor(0);
        this.inventoryBorder.setDepth(UI_DEPTH);

        this.marker = this.add.graphics();
        this.marker.lineStyle(2, 0x000000, 1);
        this.marker.strokeRect(0, 0, this.mainMap.tileWidth, this.mainMap.tileHeight);
    }

    create() {
        this.input.addPointer(2);

        this.mainMap = this.make.tilemap({
            key: 'mainMap',
            width: WIDTH_TILES,
            height: HEIGHT_TILES
        });

        this.desertTiles = this.mainMap.addTilesetImage('desert', 'desert', 32, 32, 1, 1);
        this.grassTiles = this.mainMap.addTilesetImage('grass', 'grass', 32, 32, 0, 0, this.desertTiles.firstgid + this.desertTiles.total);
        this.waterTiles = this.mainMap.addTilesetImage('water', 'water', 32, 32, 0, 0, this.grassTiles.firstgid + this.grassTiles.total);
        this.asphaltTiles = this.mainMap.addTilesetImage('asphalt', 'asphalt', 32, 32, 0, 0, this.waterTiles.firstgid + this.waterTiles.total);
        this.dirtroadTiles = this.mainMap.addTilesetImage('dirtroad', 'dirtroad', 32, 32, 0, 0, this.asphaltTiles.firstgid + this.asphaltTiles.total);
        this.dirtTiles = this.mainMap.addTilesetImage('dirt', 'dirt', 32, 32, 0, 0, this.dirtroadTiles.firstgid + this.dirtroadTiles.total);
        this.seaTiles = this.mainMap.addTilesetImage('sea', 'sea', 32, 32, 0, 0, this.dirtTiles.firstgid + this.dirtTiles.total);
        this.deepseaTiles = this.mainMap.addTilesetImage('deepsea', 'deepsea', 32, 32, 0, 0, this.seaTiles.firstgid + this.seaTiles.total);
        this.tundragrassTiles = this.mainMap.addTilesetImage('tundragrass', 'tundragrass', 32, 32, 0, 0, this.deepseaTiles.firstgid + this.deepseaTiles.total);
        this.alpineTiles = this.mainMap.addTilesetImage('alpine', 'alpine', 32, 32, 0, 0, this.tundragrassTiles.firstgid + this.tundragrassTiles.total);
        
        this.allTiles = [
            this.desertTiles, this.grassTiles, this.waterTiles,
            this.asphaltTiles, this.dirtroadTiles, this.dirtTiles,
            this.seaTiles, this.deepseaTiles, this.tundragrassTiles,
            this.alpineTiles
        ];
        this.lpcTiles = [this.grassTiles, this.waterTiles];

        this.mainLayer = this.mainMap.createBlankLayer('Main', this.allTiles, 0, 0, WIDTH_TILES, HEIGHT_TILES);
        this.mainLayer.setInteractive();
        this.mainLayer.on('pointerdown', this.handleTileDrawing);
        this.mainLayer.on('pointermove', this.handleTileDrawing);
        this.autotileLayer = this.mainMap.createBlankLayer('Main-autotile', this.allTiles, 0, 0, WIDTH_TILES, HEIGHT_TILES);
        this.mainMap.setLayer(this.mainLayer);

        // Mark colliding tiles
        const collides = true;
        const recalculateFaces = false;
        this.mainLayer.setCollisionBetween(-1, -1, collides, recalculateFaces);
        this.mainLayer.setCollisionBetween(45, 47, collides, recalculateFaces);
        this.mainLayer.setCollisionBetween(37, 39, collides, recalculateFaces);
        this.mainLayer.setCollisionBetween(30, 31, collides, recalculateFaces);
        this.mainLayer.setCollisionBetween(this.waterTiles.firstgid, this.waterTiles.firstgid + this.waterTiles.total, collides, recalculateFaces);
        this.autotileLayer.setCollisionBetween(this.waterTiles.firstgid, this.waterTiles.firstgid + this.waterTiles.total, collides, recalculateFaces);

        this.cameras.main.setBounds(0, 0, this.mainMap.widthInPixels, this.mainMap.heightInPixels);
        this.physics.world.setBounds(0, 0, this.mainLayer.width, this.mainLayer.height, true, true, true, true);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasdCursors = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.inventoryKeys = [
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
        ]

        let x = 400, y = 300;
        const { hash } = window.location;
        if (hash) {
            [x, y] = hash.substring(1).split(',').map(s => parseFloat(s) * TILE_SIZE_PIXELS);
        }
        const solanaPubkey = getSolanaPubkey();
        const solanaUsername = getSolanaUsername();
        const activeAccountId = solanaUsername || solanaPubkey || (window.account && window.account.accountId) || ('guest:' + Math.random().toString(36).substring(2, 8));
        
        let characterLayers = undefined;
        if (solanaPubkey) {
            const savedLayers = localStorage.getItem('solana_character_layers_' + solanaPubkey);
            if (savedLayers) {
                try {
                    characterLayers = JSON.parse(savedLayers);
                } catch (e) {
                    console.error("Error parsing saved character layers:", e);
                }
            }
        }
        
        if (window.isSpectator) {
            this.player = this.add.player({ scene: this, x, y, accountId: 'Spectator', controlledByUser: true, isSpectator: true });
            const roundPixels = true;
            this.cameras.main.startFollow(this.player, roundPixels);
        } else {
            this.player = this.add.player({ scene: this, x, y, accountId: activeAccountId, layers: characterLayers, controlledByUser: true });
            const roundPixels = true;
            this.cameras.main.startFollow(this.player, roundPixels);
            
            window.activeHotbarItem = 'sword';
            this.hotbarItemsCount = {
                apple: 5,
                wood: 3
            };
            
            this.hotbarKeys = [
                this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
                this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
                this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
                this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
                this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE),
            ];
            
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
            
            const slots = document.querySelectorAll('.hotbar-slot');
            slots.forEach(slot => {
                slot.addEventListener('click', () => {
                    const item = slot.getAttribute('data-item');
                    this.selectHotbarItem(item);
                });
            });
            
            this.monstersGroup = this.physics.add.group();
            for (let i = 0; i < 4; i++) {
                this.spawnMonster(Math.random() * 800 + 200, Math.random() * 600 + 200);
            }
            
            this.physics.add.collider(this.monstersGroup, this.mainLayer);
            this.physics.add.collider(this.monstersGroup, this.autotileLayer);
        }

        this.selectInventoryTiles(this.desertTiles);

        this.selectedTile = this.inventoryMap.getTileAt(5, 3);

        // Debug graphics
        if (DEBUG) {
            // Turn on physics debugging to show player's hitbox
            this.physics.world.createDebugGraphic();

            // Create worldLayer collision graphic above the player, but below the help text
            this.debugGraphics = this.add.graphics()
                .setAlpha(0.75)
                .setDepth(20);
        };

        // TODO: Move inventory to the ui.js?
        this.scale.on('resize', () => {
            this.selectInventoryTiles(this.inventoryTiles, { forceUpdate: true });
        });
    }

    handleTileDrawing = (pointer) => {
        let worldPoint = pointer.positionToCamera(this.cameras.main);

        let inventoryX = this.inventoryMap.worldToTileX(worldPoint.x);
        let inventoryY = this.inventoryMap.worldToTileY(worldPoint.y);

        let insideInventory = !!(inventoryX >= 0 && inventoryY >= 0 && inventoryX < this.inventoryMap.width && inventoryY < this.inventoryMap.height);

        let sourceMap = insideInventory ? this.inventoryMap : this.mainMap;

        let pointerTileX = sourceMap.worldToTileX(worldPoint.x);
        let pointerTileY = sourceMap.worldToTileY(worldPoint.y);

        this.marker.x = sourceMap.tileToWorldX(pointerTileX);
        this.marker.y = sourceMap.tileToWorldY(pointerTileY);
        this.marker.setDepth(insideInventory ? UI_DEPTH + 1 : 0);

        if (pointer.isDown) {
            if (this.shiftKey.isDown || sourceMap == this.inventoryMap) {
                this.selectedTile = sourceMap.getTileAt(pointerTileX, pointerTileY);
            } else if (sourceMap == this.mainMap) {
                if (!getSolanaPubkey()) {
                    updateError('You need to login to draw');
                    return;
                }

                this.mainLayer.putTileAt(this.selectedTile, pointerTileX, pointerTileY);
                this.populateAutotile(pointerTileX - 1, pointerTileY - 1, 3, 3);

                putTileOnChain(pointerTileX, pointerTileY, `${this.selectedTile.index}`);
            }
        }
    }

    get gameMode() {
        const uiScene = game.scene.getScene('UIScene');
        const mode = uiScene.modeButtons.value;
        return mode;
    }

    update(time, delta) {
        if (!this.dayNightTimer) this.dayNightTimer = 0;
        this.dayNightTimer += delta;
        
        const CYCLE_DURATION = 120000; 
        const progress = (this.dayNightTimer % CYCLE_DURATION) / CYCLE_DURATION;
        
        let isNight = false;
        let timeText = 'DAY';
        let tintColor = 0xffffff;
        let tintAlpha = 0;
        
        if (progress >= 0.4 && progress < 0.5) {
            timeText = 'SUNSET';
            const p = (progress - 0.4) / 0.1;
            tintColor = Phaser.Display.Color.Interpolate.ColorWithColor(
                Phaser.Display.Color.ValueToColor(0xffffff),
                Phaser.Display.Color.ValueToColor(0xff5500),
                100, p * 100
            );
            tintColor = Phaser.Display.Color.GetColor(tintColor.r, tintColor.g, tintColor.b);
            tintAlpha = p * 0.3;
        } else if (progress >= 0.5 && progress < 0.9) {
            isNight = true;
            timeText = 'NIGHT';
            tintColor = 0x000033;
            tintAlpha = 0.5;
        } else if (progress >= 0.9 && progress < 1.0) {
            timeText = 'SUNRISE';
            const p = (progress - 0.9) / 0.1;
            tintColor = Phaser.Display.Color.Interpolate.ColorWithColor(
                Phaser.Display.Color.ValueToColor(0x000033),
                Phaser.Display.Color.ValueToColor(0xffffff),
                100, p * 100
            );
            tintColor = Phaser.Display.Color.GetColor(tintColor.r, tintColor.g, tintColor.b);
            tintAlpha = (1 - p) * 0.5;
        }
        
        window.isNight = isNight;
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) {
            timeDisplay.innerText = timeText;
            if (timeText === 'NIGHT') {
                timeDisplay.style.color = '#00ffff';
            } else if (timeText === 'SUNSET' || timeText === 'SUNRISE') {
                timeDisplay.style.color = '#ffaa00';
            } else {
                timeDisplay.style.color = '#5c3a21';
            }
        }
        
        if (!this.lightOverlay) {
            this.lightOverlay = this.add.graphics();
            this.lightOverlay.setDepth(100);
        }
        this.lightOverlay.clear();
        if (tintAlpha > 0) {
            this.lightOverlay.fillStyle(tintColor, tintAlpha);
            this.lightOverlay.fillRect(0, 0, this.mainMap.widthInPixels, this.mainMap.heightInPixels);
        }

        if (this.player && !window.isSpectator) {
            let isNearCampfire = false;
            const playerTileX = this.mainMap.worldToTileX(this.player.x);
            const playerTileY = this.mainMap.worldToTileY(this.player.y);
            
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const tile = this.mainLayer.getTileAt(playerTileX + dx, playerTileY + dy);
                    if (tile && tile.index >= 45 && tile.index <= 47) {
                        isNearCampfire = true;
                    }
                }
            }
            
            if (this.campfiresGroup) {
                this.campfiresGroup.getChildren().forEach(fire => {
                    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, fire.x, fire.y);
                    if (dist < 100) {
                        isNearCampfire = true;
                    }
                });
            }
            window.isNearCampfire = isNearCampfire;

            if (this.hotbarKeys) {
                this.hotbarKeys.forEach((key, idx) => {
                    if (Phaser.Input.Keyboard.JustDown(key)) {
                        const items = ['sword', 'torch', 'apple', 'bottle', 'wood'];
                        this.selectHotbarItem(items[idx]);
                    }
                });
            }

            if (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
                this.useActiveItem();
            }

            if (this.monstersGroup) {
                this.monstersGroup.getChildren().forEach(monster => {
                    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, monster.x, monster.y);
                    if (dist < 30) {
                        const now = this.time.now;
                        if (!monster.lastHitTime || now - monster.lastHitTime > 1000) {
                            monster.lastHitTime = now;
                            this.player.hp = Math.max(0, this.player.hp - 15);
                            const angle = Phaser.Math.Angle.Between(monster.x, monster.y, this.player.x, this.player.y);
                            this.player.body.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
                        }
                    }
                });
            }
        }

        if (window.isSpectator) {
            this.inventoryLayer.visible = false;
            this.inventoryBorder.visible = false;
            this.marker.visible = false;

            const camSpeed = this.cameraSpeed || 10;
            if (this.cursors.left.isDown || this.wasdCursors.left.isDown) {
                this.cameras.main.scrollX -= camSpeed;
            } else if (this.cursors.right.isDown || this.wasdCursors.right.isDown) {
                this.cameras.main.scrollX += camSpeed;
            }
            if (this.cursors.up.isDown || this.wasdCursors.up.isDown) {
                this.cameras.main.scrollY -= camSpeed;
            } else if (this.cursors.down.isDown || this.wasdCursors.down.isDown) {
                this.cameras.main.scrollY += camSpeed;
            }

            loadParcels().catch(console.error);
            loadChunksIfNeeded().catch(console.error);
            this.updateURL();
            this.updateVolume();
            return;
        }

        switch (this.gameMode) {
        case 'walk':
            this.inventoryLayer.visible = false;
            this.inventoryBorder.visible = false;
            this.marker.visible = false;
            this.inventoryLayer.removeInteractive();
            this.mainLayer.removeInteractive();
            break;
        case 'build':
            this.inventoryLayer.visible = true;
            this.inventoryBorder.visible = true;
            this.inventoryLayer.setInteractive();
            this.mainLayer.setInteractive();
            break;
        default:
            console.error('Unrecognized game mode: ', this.gameMode);
        }

        this.inventoryKeys.forEach((key, i) => {
            if (Phaser.Input.Keyboard.JustDown(key)) {
                this.selectInventoryTiles(this.allTiles[i]);
            }
        });

        if (DEBUG && this.debugGraphics) {
            this.mainLayer.renderDebug(this.debugGraphics, {
                tileColor: null, // Color of non-colliding tiles
                collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255), // Color of colliding tiles
                faceColor: new Phaser.Display.Color(40, 39, 37, 255) // Color of colliding face edges
            });

            this.autotileLayer.renderDebug(this.debugGraphics, {
                tileColor: null, // Color of non-colliding tiles
                collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255), // Color of colliding tiles
                faceColor: new Phaser.Display.Color(40, 39, 37, 255) // Color of colliding face edges
            });
        }

        loadParcels().catch(console.error);
        loadChunksIfNeeded().catch(console.error);

        this.updateURL();
        this.updateVolume();
    }

    updateVolume = debounce(() => {
        const REF_DISTANCE = 64;
        const MAX_VOLUME = 100;
        // TODO: Limit max distance and stop streaming in that case?
        const MAX_DISTANCE = 1000;
        const ROLLOFF_FACTOR = 1;

        const targetX = this.player ? this.player.x : (this.cameras.main.scrollX + this.cameras.main.width / 2);
        const targetY = this.player ? this.player.y : (this.cameras.main.scrollY + this.cameras.main.height / 2);

        for (let accountId of Object.keys(accountIdToPlayer)) {
            const player = accountIdToPlayer[accountId];
            const distance = Phaser.Math.Distance.Between(player.x, player.y, targetX, targetY);
            // TODO: Experiment more with formulas
            // See https://medium.com/@kfarr/understanding-web-audio-api-positional-audio-distance-models-for-webxr-e77998afcdff
            const volume = REF_DISTANCE / (REF_DISTANCE + ROLLOFF_FACTOR * (Math.max(REF_DISTANCE, distance) - REF_DISTANCE)) * MAX_VOLUME;
            audioChat.setVolume(accountId, volume);

            player.setVolumeLevel(audioChat.getInputVolume(accountId));
        }
        if (this.player) {
            this.player.setVolumeLevel(audioChat.getInputVolume());
        }
    }, 100);

    updateURL = debounce(() => {
        const targetX = this.player ? this.player.x : (this.cameras.main.scrollX + this.cameras.main.width / 2);
        const targetY = this.player ? this.player.y : (this.cameras.main.scrollY + this.cameras.main.height / 2);
        const x = targetX / TILE_SIZE_PIXELS;
        const y = targetY / TILE_SIZE_PIXELS;
        const newHash = `#${x.toFixed(1)},${y.toFixed(1)}`;

        if (!this.player || this.player.body.velocity.length() == 0) {
            if (window.location.hash != newHash) {
                history.replaceState(null, null, newHash);
            }
        }
    }, 500);

    populateAutotile(startX, startY, width, height) {
        console.debug('populateAutotile', startX, startY, width, height);
        startX = Math.max(0, startX);
        startY = Math.max(0, startY);

        const endX = Math.min(startX + width, this.mainMap.width);
        const endY = Math.min(startY + height, this.mainMap.height);

        let tilesetConfigs = [];
        for (let tileset of this.lpcTiles) {
            const toGid = localId => tileset.firstgid + localId;

            let coreTiles = [10, 15, 16, 17].map(toGid);
            let outerTiles = [
                [6, 7, 8],
                [9, 10, 11],
                [12, 13, 14]
            ].map(row => row.map(toGid));
            let innerCornerTiles = [1, 2, 4, 5].map(toGid);

            tilesetConfigs.push({
                coreTiles,
                outerTiles,
                innerCornerTiles
            })
        }
        window.tilesetConfigs = tilesetConfigs;

        let directions = [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0], [0, 0], [1, 0],
            [-1, 1], [0, 1], [1, 1]
        ];
        let cornerDirections = [0, 2, 6, 8];
        let sideDirections = [1, 3, 5, 7];
        let innerCornerDirections = [[1, 3], [1, 5], [3, 7], [5, 7]];

        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                let { index: tileId } = this.mainLayer.getTileAt(x, y, true);

                let autotileId;
                for (let { coreTiles, outerTiles, innerCornerTiles } of tilesetConfigs) {
                    if (coreTiles.includes(tileId)) {
                        autotileId = null;
                        continue;
                    }

                    const checkDirection = ([dx, dy]) => {
                        if (dx == 0 && dy == 0) {
                            return;
                        }

                        if (x + dx < 0 || x + dx >= this.mainMap.width || y + dy < 0 || y + dy >= this.mainMap.height) {
                            return;
                        }

                        let { index: neighborTileId } = this.mainLayer.getTileAt(x + dx, y + dy, true);
                        if (coreTiles.includes(neighborTileId)) {
                            return true;
                        }

                        return false;
                    };

                    [cornerDirections, sideDirections].forEach(directionIndices =>
                        directionIndices.forEach(di => {
                            let [dx, dy] = directions[di];
                            if (checkDirection([dx, dy])) {
                                autotileId = outerTiles[1 - dy][1 - dx];
                            }
                        }));

                    innerCornerDirections.forEach((directionIndices, i) => {
                        if (directionIndices.every(di => checkDirection(directions[di]))) {
                            autotileId = innerCornerTiles[i];
                        }
                    });
                }

                if (autotileId) {
                    this.autotileLayer.putTileAt(autotileId, x, y);
                } else {
                    this.autotileLayer.removeTileAt(x, y);
                }
            }
        }
    }

    selectHotbarItem(item) {
        window.activeHotbarItem = item;
        const slots = document.querySelectorAll('.hotbar-slot');
        slots.forEach(slot => {
            if (slot.getAttribute('data-item') === item) {
                slot.classList.add('active');
            } else {
                slot.classList.remove('active');
            }
        });
    }

    useActiveItem() {
        if (!this.player || window.isSpectator) return;
        
        const item = window.activeHotbarItem;
        if (item === 'sword') {
            this.performAttack();
        } else if (item === 'apple') {
            if (this.hotbarItemsCount.apple > 0) {
                this.hotbarItemsCount.apple--;
                this.player.hunger = Math.min(100, this.player.hunger + 30);
                this.player.hp = Math.min(100, this.player.hp + 10);
                const appleLabel = document.getElementById('apple-count');
                if (appleLabel) appleLabel.innerText = `APPLE (${this.hotbarItemsCount.apple})`;
                
                this.tweens.add({
                    targets: this.player,
                    scaleX: 1.2,
                    scaleY: 1.2,
                    duration: 100,
                    yoyo: true
                });
            } else {
                window.showNotification("Out of Apples!", "error");
            }
        } else if (item === 'bottle') {
            const playerTileX = this.mainMap.worldToTileX(this.player.x);
            const playerTileY = this.mainMap.worldToTileY(this.player.y);
            let nearWater = false;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const tile = this.mainLayer.getTileAt(playerTileX + dx, playerTileY + dy);
                    if (tile && tile.index >= this.waterTiles.firstgid) {
                        nearWater = true;
                    }
                }
            }
            
            if (nearWater) {
                this.player.thirst = Math.min(100, this.player.thirst + 40);
                window.showNotification("Filled bottle and drank water!", "success");
            } else {
                window.showNotification("Must stand near water to drink!", "error");
            }
        } else if (item === 'wood') {
            if (this.hotbarItemsCount.wood > 0) {
                this.hotbarItemsCount.wood--;
                const woodLabel = document.getElementById('wood-count');
                if (woodLabel) woodLabel.innerText = `CAMPFIRE (${this.hotbarItemsCount.wood})`;
                
                if (!this.campfiresGroup) {
                    this.campfiresGroup = this.add.group();
                }
                
                const fire = this.add.sprite(this.player.x, this.player.y, 'wisp-particle');
                fire.setScale(2.0);
                fire.setTint(0xff5500);
                this.campfiresGroup.add(fire);
                
                this.tweens.add({
                    targets: fire,
                    scaleX: 2.4,
                    scaleY: 2.4,
                    alpha: 0.8,
                    duration: 200,
                    yoyo: true,
                    repeat: -1
                });
            } else {
                window.showNotification("Out of wood!", "error");
            }
        }
    }

    spawnMonster(x, y) {
        const monster = this.physics.add.sprite(x, y, 'skeleton');
        monster.setCollideWorldBounds(true);
        monster.hp = 50;
        
        this.time.addEvent({
            delay: 2000,
            callback: () => {
                if (!monster.active) return;
                if (this.player && !window.isSpectator && Phaser.Math.Distance.Between(this.player.x, this.player.y, monster.x, monster.y) < 250) {
                    this.physics.moveToObject(monster, this.player, 80);
                } else {
                    monster.setVelocity(Math.random() * 100 - 50, Math.random() * 100 - 50);
                }
            },
            loop: true
        });
        
        this.monstersGroup.add(monster);
    }

    performAttack() {
        const slash = this.add.graphics();
        slash.fillStyle(0xffffff, 0.8);
        slash.slice(this.player.x, this.player.y, 40, 0, Math.PI * 2);
        slash.fill();
        this.time.delayedCall(150, () => slash.destroy());
        
        this.monstersGroup.getChildren().forEach(monster => {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, monster.x, monster.y);
            if (dist < 60) {
                monster.hp -= 25;
                monster.setTint(0xff0000);
                this.time.delayedCall(200, () => {
                    if (monster.active) monster.clearTint();
                });
                
                const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, monster.x, monster.y);
                monster.setVelocity(Math.cos(angle) * 300, Math.sin(angle) * 300);
                
                if (monster.hp <= 0) {
                    monster.destroy();
                    this.hotbarItemsCount.apple++;
                    const appleLabel = document.getElementById('apple-count');
                    if (appleLabel) appleLabel.innerText = `APPLE (${this.hotbarItemsCount.apple})`;
                    
                    this.time.delayedCall(5000, () => {
                        this.spawnMonster(Math.random() * 1000 + 100, Math.random() * 1000 + 100);
                    });
                }
            }
        });
    }

}

const config = {
    type: Phaser.CANVAS,
    width: window.innerWidth,
    height: window.innerHeight,
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    backgroundColor: '#2d2d2d',
    parent: 'phaser-example',
    pixelArt: true,
    roundPixels: true,
    plugins: {
        global: [{
            key: 'rexVirtualJoystick',
            plugin: VirtualJoystick,
            start: true
        }],
        scene: [{
            key: 'rexUI',
            plugin: UIPlugin,
            mapping: 'rexUI'
        }]
    },
    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 0 } // Top down game, so no gravity
        }
    },
    scene: [ GameScene, UIScene ]
};

const game = new Phaser.Game(config);
function updateChunk(i, j) {
    console.debug('updateChunk', i, j);
    const scene = game.scene.getScene('GameScene');

    const chunk = fullMap[i][j];
    for (let ii = 0; ii < CHUNK_SIZE; ii++) {
        for (let jj = 0; jj < CHUNK_SIZE; jj++) {
            scene.mainLayer.putTileAt(chunk.tiles[ii][jj] | 0, i * CHUNK_SIZE + ii, j * CHUNK_SIZE + jj);
        }
    }

    updatePutTileQueue();

    scene.populateAutotile(i * CHUNK_SIZE - 1, j * CHUNK_SIZE - 1, CHUNK_SIZE + 2, CHUNK_SIZE + 2);
}

function updatePutTileQueue() {
    const scene = game.scene.getScene('GameScene');

    for (let { x, y, tileId } of [...setTileBatch, ...setTileQueue]) {
        scene.mainLayer.putTileAt(tileId, x, y);
    }
}

async function onLocationUpdate({ accountId, x, y, frame, animName, animProgress, layers }) {
    const activeAccountId = getSolanaUsername() || getSolanaPubkey() || (window.account && window.account.accountId);
    if (accountId && accountId == activeAccountId) {
        return;
    }

    if (!accountIdToPlayer[accountId]) {
        const scene = game.scene.getScene('GameScene');
        accountIdToPlayer[accountId] = scene.add.player({ scene, x, y, accountId, layers });
    }
    const player = accountIdToPlayer[accountId];
    player.updateFromRemote({ x, y, layers, frame, animName, animProgress });
}

let p2pPromise
async function connectP2PIfNeeded() {
    const { contract } = await connectPromise;
    if (!p2pPromise) {
        p2pPromise = connectP2P({ account: contract.account });
    }
    return await p2pPromise;
}

async function publishLocation() {
    try {
        const p2p = await connectP2PIfNeeded();

        const scene = game.scene.getScene('GameScene');
        if (!scene || !scene.player) {
            return;
        }

        const { x, y, playerSprites } = scene.player;
        const [{ anims, ...playerSprite }] = playerSprites;
        const layers = playerSprites.map(sprite => sprite.texture.key);
        p2p.publishLocation({
            x,
            y,
            frame: playerSprite.frame.name,
            animName: anims.isPlaying && anims.getName().replace(/:.+$/, ''),
            animProgress: anims.getProgress(),
            // TODO: Throttle layers transmission to save bandwidth?
            layers
        });
    } finally {
        setTimeout(publishLocation, UPDATE_DELTA);
    }
};
publishLocation();

(async () => {
    const p2p = await connectP2PIfNeeded();
    if (!p2p) {
        console.error("Couldn't subscribe to location updates");
        return;
    }
    p2p.subscribeToLocation(onLocationUpdate);

    const solanaPubkey = getSolanaPubkey();
    const solanaUsername = getSolanaUsername();
    
    // Setup landing page UI with wallet connection state
    const authSection = document.getElementById('auth-section');
    if (authSection) {
        if (solanaPubkey) {
            const shortPubkey = solanaPubkey.substring(0, 6) + '...' + solanaPubkey.substring(solanaPubkey.length - 4);
            
            if (!solanaUsername) {
                // Wallet connected but no username set yet
                authSection.innerHTML = `
                    <div class="account-info" style="margin-bottom:15px;">Connected: <strong>${shortPubkey}</strong></div>
                    <input type="text" id="username-input" placeholder="ENTER NICKNAME" class="menu-input" maxlength="15">
                    
                    <div style="font-family: 'PixelOperatorMono-Bold', monospace; color: #5c3a21; margin-bottom: 10px; font-size: 14px; text-transform: uppercase;">Choose Character</div>
                    <div class="character-grid">
                        <div class="char-option active" data-char="adventurer">
                            <div class="char-preview">
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/body/male/light.png'); background-position: 0px -640px;"></div>
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/hair/male/messy1/brown.png'); background-position: 0px -640px;"></div>
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/torso/shirts/longsleeve/male/brown_longsleeve.png'); background-position: 0px -640px;"></div>
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/legs/pants/male/teal_pants_male.png'); background-position: 0px -640px;"></div>
                            </div>
                            ADVENTURER
                        </div>
                        <div class="char-option" data-char="princess">
                            <div class="char-preview">
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/body/female/light.png'); background-position: 0px -512px;"></div>
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/hair/female/princess/gold.png'); background-position: 0px -512px;"></div>
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/torso/dress_female/dress_w_sash_female.png'); background-position: 0px -512px;"></div>
                            </div>
                            PRINCESS
                        </div>
                        <div class="char-option" data-char="mage">
                            <div class="char-preview">
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/body/male/darkelf.png'); background-position: 0px -640px;"></div>
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/hair/male/mohawk/purple.png'); background-position: 0px -640px;"></div>
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/torso/shirts/longsleeve/male/maroon_longsleeve.png'); background-position: 0px -640px;"></div>
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/legs/pants/male/red_pants_male.png'); background-position: 0px -640px;"></div>
                            </div>
                            MAGE
                        </div>
                        <div class="char-option" data-char="skeleton">
                            <div class="char-preview">
                                <div class="preview-layer" style="background-image: url('./static/lpc-character/body/male/skeleton.png'); background-position: 0px -640px;"></div>
                            </div>
                            SKELETON
                        </div>
                    </div>
                    
                    <button class="menu-button" id="btn-save-username">SAVE &amp; ENTER</button>
                    <button class="menu-button secondary" id="btn-logout">LOGOUT</button>
                `;

                
                let selectedChar = 'adventurer';
                const charOptions = authSection.querySelectorAll('.char-option');
                charOptions.forEach(opt => {
                    opt.addEventListener('click', () => {
                        charOptions.forEach(o => o.classList.remove('active'));
                        opt.classList.add('active');
                        selectedChar = opt.getAttribute('data-char');
                    });
                });
                
                document.getElementById('btn-save-username').addEventListener('click', () => {
                    const inputVal = document.getElementById('username-input').value.trim();
                    if (!inputVal) {
                        window.showNotification("Please enter a nickname!", "error");
                        return;
                    }
                    
                    const CHARACTER_PRESETS = {
                        adventurer: [
                            '/lpc-character/body/male/light.png',
                            '/lpc-character/hair/male/messy1/brown.png',
                            '/lpc-character/feet/shoes/male/brown_shoes_male.png',
                            '/lpc-character/torso/shirts/longsleeve/male/brown_longsleeve.png',
                            '/lpc-character/legs/pants/male/teal_pants_male.png'
                        ],
                        princess: [
                            '/lpc-character/body/female/light.png',
                            '/lpc-character/hair/female/princess/gold.png',
                            '/lpc-character/torso/dress_female/dress_w_sash_female.png',
                            '/lpc-character/feet/shoes/female/black_shoes_female.png'
                        ],
                        mage: [
                            '/lpc-character/body/male/darkelf.png',
                            '/lpc-character/hair/male/mohawk/purple.png',
                            '/lpc-character/torso/shirts/longsleeve/male/maroon_longsleeve.png',
                            '/lpc-character/legs/pants/male/red_pants_male.png',
                            '/lpc-character/feet/shoes/male/black_shoes_male.png'
                        ],
                        skeleton: [
                            '/lpc-character/body/male/skeleton.png'
                        ]
                    };
                    
                    const layers = CHARACTER_PRESETS[selectedChar] || CHARACTER_PRESETS.adventurer;
                    localStorage.setItem('solana_character_layers_' + solanaPubkey, JSON.stringify(layers));
                    
                    setSolanaUsername(inputVal);
                    // Reload page so player is spawned with the new name correctly
                    window.location.reload();
                });
                
                document.getElementById('btn-logout').addEventListener('click', () => {
                    logout();
                });
            } else {
                // Wallet connected and username is already set
                authSection.innerHTML = `
                    <div class="account-info">
                        Logged in: <strong>${solanaUsername}</strong><br>
                        <span style="font-size: 12px; opacity: 0.7;">Solana (${shortPubkey})</span>
                    </div>
                    <button class="menu-button" id="btn-play">ENTER GAME</button>
                    <button class="menu-button secondary" id="btn-logout">LOGOUT</button>
                `;
                document.getElementById('btn-play').addEventListener('click', () => {
                    document.getElementById('landing-screen').classList.add('fade-out');
                });
                document.getElementById('btn-logout').addEventListener('click', () => {
                    logout();
                });
            }
        } else {
            authSection.innerHTML = `
                <button class="menu-button" id="btn-login">LOGIN WITH SOLANA</button>
                <button class="menu-button secondary" id="btn-spectate">SPECTATE GAME</button>
            `;
            document.getElementById('btn-login').addEventListener('click', () => {
                login();
            });
            document.getElementById('btn-spectate').addEventListener('click', () => {
                window.isSpectator = true;
                const gameScene = game.scene.getScene('GameScene');
                if (gameScene) {
                    if (gameScene.player) {
                        gameScene.player.destroy();
                    }
                    const px = gameScene.cameras.main.scrollX + gameScene.cameras.main.width / 2;
                    const py = gameScene.cameras.main.scrollY + gameScene.cameras.main.height / 2;
                    gameScene.player = gameScene.add.player({
                        scene: gameScene,
                        x: px,
                        y: py,
                        accountId: 'Spectator',
                        controlledByUser: true,
                        isSpectator: true
                    });
                    gameScene.cameras.main.startFollow(gameScene.player, true);
                }
                const uiScene = game.scene.getScene('UIScene');
                if (uiScene) {
                    uiScene.createOrUpdateUI();
                }
                document.getElementById('landing-screen').classList.add('fade-out');
            });
        }
    }

    if (solanaPubkey) {
        await audioChat.join(solanaPubkey);
    }
})().catch(console.error);

Object.assign(window, { login, logout, game, onLocationUpdate, publishLocation });

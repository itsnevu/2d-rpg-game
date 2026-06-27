import Phaser from 'phaser';

import {
    DROP_TABLES,
    ITEM_CONFIGS,
    MONSTER_CONFIGS,
    PLAYER_COMBAT_CONFIG,
    SCORE_CONFIG,
    SEASON_CONFIG,
    WAVE_CONFIGS,
} from './survival-config';
import { addArtTexture, ART_PAD, SURVIVAL_ART } from './survival-art';

const clampPercent = value => `${Phaser.Math.Clamp(value, 0, 100)}%`;
const formatTime = seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};
const escapeHtml = str => String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export class SurvivalSystem {
    constructor(scene) {
        this.scene = scene;
        this.state = 'running';
        this.started = false;
        this.currentWaveIndex = 0;
        this.waveStartedAt = scene.time.now;
        this.lastSpawnAt = 0;
        this.lastAttackAt = -Infinity;
        this.bossSpawned = false;
        this.runStartedAt = scene.time.now;
        this.activeBuffs = {};
        this.damageNumbers = [];
        this.submittedScore = null;
        this.scoreRunData = {
            playerId: scene.activeAccountId || 'guest',
            seasonId: SEASON_CONFIG.seasonId,
            finalScore: 0,
            waveReached: 1,
            monstersKilled: 0,
            elitesKilled: 0,
            bossKilled: false,
            coinsCollected: 0,
            survivalTime: 0,
            submittedAt: null,
        };
    }

    create() {
        this.createPlaceholderTextures();

        this.enemies = this.scene.physics.add.group();
        this.enemyProjectiles = this.scene.physics.add.group();
        this.playerProjectiles = this.scene.physics.add.group();
        this.drops = this.scene.physics.add.group();

        this.scene.physics.add.collider(this.enemies, this.scene.mainLayer);
        this.scene.physics.add.collider(this.enemies, this.scene.autotileLayer);
        this.scene.physics.add.collider(this.enemies, this.enemies);
        this.scene.physics.add.collider(this.enemyProjectiles, this.scene.mainLayer, projectile => projectile.destroy());
        this.scene.physics.add.collider(this.enemyProjectiles, this.scene.autotileLayer, projectile => projectile.destroy());
        this.scene.physics.add.collider(this.playerProjectiles, this.scene.mainLayer, projectile => projectile.destroy());
        this.scene.physics.add.collider(this.playerProjectiles, this.scene.autotileLayer, projectile => projectile.destroy());
        this.scene.physics.add.overlap(this.enemyProjectiles, this.scene.player, this.handleEnemyProjectileHit, null, this);
        this.scene.physics.add.overlap(this.playerProjectiles, this.enemies, this.handlePlayerProjectileHit, null, this);
        this.scene.physics.add.overlap(this.drops, this.scene.player, this.handlePickup, null, this);

        this.createPlayerKnife();

        this.updateHud();
    }

    // Begin the survival run. Deferred until the player actually enters the game
    // so waves/notifications don't fire behind the landing/character-select menu.
    start() {
        if (this.started) return;
        this.started = true;
        this.runStartedAt = this.scene.time.now;
        this.startWave(0);
        this.updateHud();
    }

    // Knife the player holds in their right hand; flicks when attacking.
    // Purely cosmetic (no physics body) — the slash arc shows the hit direction.
    createPlayerKnife() {
        const player = this.scene.player;
        this.knifeRestAngle = -0.5;       // resting: blade angled up-forward
        this.knifeSwinging = false;
        this.knife = this.scene.add.sprite(player.x, player.y, 'weapon-machete');
        this.knife.setOrigin(0.2, 0.5);   // pivot near the grip/hand
        this.knife.setScale(0.8);
        this.knife.setDepth(player.y + 5);
    }

    updateKnife() {
        if (!this.knife) return;
        const player = this.scene.player;
        if (!player || this.state !== 'running' || !this.started) {
            this.knife.setVisible(false);
            return;
        }
        this.knife.setVisible(true);
        // Held in the character's right hand (screen-right, slightly down).
        this.knife.setPosition(player.x + 11, player.y + 7);
        this.knife.setDepth(player.y + 5);
        if (!this.knifeSwinging) this.knife.setRotation(this.knifeRestAngle);
    }

    swingKnife() {
        if (!this.knife) return;
        this.knifeSwinging = true;
        this.scene.tweens.killTweensOf(this.knife);
        this.knife.setRotation(this.knifeRestAngle - 1.1);
        this.scene.tweens.add({
            targets: this.knife,
            rotation: this.knifeRestAngle + 0.5,
            duration: 150,
            ease: 'Cubic.Out',
            onComplete: () => { this.knifeSwinging = false; },
        });
    }

    createPlaceholderTextures() {
        const makeCircle = (key, color, radius, stroke = 0x2b1b12) => {
            if (this.scene.textures.exists(key)) return;
            const size = radius * 2 + 8;
            const graphics = this.scene.make.graphics({ x: 0, y: 0, add: false });
            graphics.fillStyle(color, 1);
            graphics.fillCircle(size / 2, size / 2, radius);
            graphics.lineStyle(3, stroke, 1);
            graphics.strokeCircle(size / 2, size / 2, radius);
            graphics.generateTexture(key, size, size);
            graphics.destroy();
        };

        // Detailed pixel-art sprites (see survival-art.js). Texture size is tied
        // to the collision radius so the art lines up with the physics body.
        // Falls back to a coloured circle if a key has no art defined.
        Object.values(MONSTER_CONFIGS).forEach(config => {
            const size = Math.round(config.radius * 2 + ART_PAD);
            addArtTexture(this.scene, config.assetKey, size, size);
            if (!this.scene.textures.exists(config.assetKey)) {
                makeCircle(config.assetKey, config.color, config.radius);
            }
        });

        // Player weapon (carries its own width/height).
        // Using real asset now instead of addArtTexture(this.scene, 'weapon-knife');

        // Item drops: coin / potion / chest get art, the rest stay as icons.
        ['coin', 'health_potion', 'rare_chest'].forEach(id => addArtTexture(this.scene, `drop-${id}`, 30, 30));
        Object.entries(ITEM_CONFIGS).forEach(([id, config]) => {
            if (!this.scene.textures.exists(`drop-${id}`)) {
                makeCircle(`drop-${id}`, config.color, id === 'rare_chest' ? 13 : 9, 0x3a2211);
            }
        });

        makeCircle('survival-player-projectile', 0xffffff, 6, 0x56ccf2);
        makeCircle('survival-enemy-projectile', 0x8e44ad, 7, 0xf5d7ff);
        makeCircle('survival-aoe-warning', 0xff3b30, 36, 0xffe0d8);
    }

    startWave(index) {
        this.currentWaveIndex = index;
        this.waveStartedAt = this.scene.time.now;
        this.lastSpawnAt = 0;
        this.bossSpawned = false;
        this.scoreRunData.waveReached = this.currentWave.waveNumber;
        window.showNotification && window.showNotification(`Wave ${this.currentWave.waveNumber} started`, 'success');
    }

    get currentWave() {
        return WAVE_CONFIGS[this.currentWaveIndex];
    }

    update(time, delta) {
        if (!this.started || this.state !== 'running' || !this.scene.player || window.isSpectator) return;

        this.scoreRunData.survivalTime = Math.floor((time - this.runStartedAt) / 1000);
        this.scoreRunData.finalScore += SCORE_CONFIG.survivalPointPerSecond * (delta / 1000);

        this.updateBuffs(time);
        this.spawnWaveEnemies(time);
        this.updateEnemies(time, delta);
        this.updateProjectiles(time);
        this.updateDrops();
        this.updateKnife();
        this.updateHud();
        this.checkWaveCompletion(time);
    }

    updateBuffs(time) {
        const names = Object.keys(this.activeBuffs);
        names.forEach(name => {
            if (time >= this.activeBuffs[name].expiresAt) {
                delete this.activeBuffs[name];
            }
        });

        this.scene.player.speedMultiplier = this.activeBuffs.speed_buff ? ITEM_CONFIGS.speed_buff.speedMultiplier : 1;
    }

    spawnWaveEnemies(time) {
        const wave = this.currentWave;
        const elapsed = (time - this.waveStartedAt) / 1000;
        const alive = this.enemies.countActive(true);
        if (elapsed < wave.durationSeconds && alive < wave.maxEnemies && time - this.lastSpawnAt >= wave.spawnRate) {
            this.lastSpawnAt = time;
            const spawnCount = Phaser.Math.Between(1, Math.min(3, wave.maxEnemies - alive));
            for (let i = 0; i < spawnCount; i++) {
                this.spawnMonster(this.pickMonsterId(wave), wave.statMultiplier);
            }
        }

        const shouldSpawnBoss = wave.bossId && !this.bossSpawned && elapsed >= wave.durationSeconds;
        if (shouldSpawnBoss) {
            this.bossSpawned = true;
            this.spawnMonster(wave.bossId, wave.statMultiplier, true);
            window.showNotification && window.showNotification('Boss incoming!', 'error');
        }
    }

    pickMonsterId(wave) {
        if (wave.eliteChance && Math.random() < wave.eliteChance) return 'elite';
        return Phaser.Utils.Array.GetRandom(wave.monsterTypes);
    }

    spawnMonster(monsterId, multiplier = 1, forceNearPlayer = false) {
        const baseConfig = MONSTER_CONFIGS[monsterId];
        const config = {
            ...baseConfig,
            hp: Math.round(baseConfig.hp * multiplier),
            maxHp: Math.round(baseConfig.hp * multiplier),
            damage: Math.round(baseConfig.damage * multiplier),
            speed: Math.round(baseConfig.speed * (1 + (multiplier - 1) * 0.25)),
            scoreValue: Math.round(baseConfig.scoreValue * multiplier),
        };
        const pos = this.getSpawnPosition(forceNearPlayer);
        const monster = this.scene.physics.add.sprite(pos.x, pos.y, config.assetKey);
        // Scale visual sprite but keep physics radius
        monster.setDisplaySize(config.radius * 2.5, config.radius * 2.5);
        monster.config = config;
        monster.hp = config.hp;
        monster.maxHp = config.maxHp;
        monster.lastAttackAt = -Infinity;
        monster.nextAbilityAt = this.scene.time.now + Phaser.Math.Between(2500, 4200);
        monster.setCollideWorldBounds(true);
        // Centre the circular collider on the sprite regardless of texture size.
        const bodyOffset = Math.max(0, (monster.width - config.radius * 2) / 2);
        monster.body.setCircle(config.radius, bodyOffset, bodyOffset);
        monster.setDepth(monster.y);
        this.enemies.add(monster);
        return monster;
    }

    getSpawnPosition(forceNearPlayer = false) {
        const player = this.scene.player;
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const distance = forceNearPlayer ? 420 : Phaser.Math.Between(420, 620);
        const x = Phaser.Math.Clamp(player.x + Math.cos(angle) * distance, 80, this.scene.mainMap.widthInPixels - 80);
        const y = Phaser.Math.Clamp(player.y + Math.sin(angle) * distance, 80, this.scene.mainMap.heightInPixels - 80);
        return { x, y };
    }

    updateEnemies(time) {
        const player = this.scene.player;
        this.enemies.getChildren().forEach(enemy => {
            if (!enemy.active) return;
            enemy.setDepth(enemy.y);
            const config = enemy.config;
            const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);

            if (config.type === 'boss') {
                this.updateBoss(enemy, time, distance);
            }

            if (config.type === 'ranged' && distance < config.attackRange) {
                enemy.setVelocity(0, 0);
                this.tryRangedAttack(enemy, time);
                return;
            }

            if (distance <= config.attackRange) {
                enemy.setVelocity(0, 0);
                this.tryMeleeAttack(enemy, time);
            } else if (distance <= config.detectionRange || config.type === 'boss') {
                this.scene.physics.moveToObject(enemy, player, config.speed);
            } else {
                enemy.setVelocity(0, 0);
            }
        });
    }

    updateBoss(boss, time, distance) {
        if (time < boss.nextAbilityAt) return;
        boss.nextAbilityAt = time + Phaser.Math.Between(3600, 5600);
        const ability = Phaser.Utils.Array.GetRandom(['charge', 'area', 'summon', 'spread']);
        if (ability === 'charge') {
            const angle = Phaser.Math.Angle.Between(boss.x, boss.y, this.scene.player.x, this.scene.player.y);
            boss.body.setVelocity(Math.cos(angle) * 420, Math.sin(angle) * 420);
            this.scene.time.delayedCall(420, () => boss.active && boss.body.setVelocity(0, 0));
        } else if (ability === 'area') {
            this.createBossAreaAttack(boss);
        } else if (ability === 'summon') {
            for (let i = 0; i < 3; i++) this.spawnMonster('slime', this.currentWave.statMultiplier);
        } else if (ability === 'spread') {
            for (let i = 0; i < 8; i++) {
                this.fireEnemyProjectile(boss, (Math.PI * 2 / 8) * i, boss.config.damage * 0.6, 250);
            }
        }
        if (distance <= boss.config.attackRange) this.tryMeleeAttack(boss, time);
    }

    createBossAreaAttack(boss) {
        const warning = this.scene.add.sprite(this.scene.player.x, this.scene.player.y, 'survival-aoe-warning');
        warning.setAlpha(0.25);
        warning.setScale(1.6);
        warning.setDepth(Number.MAX_SAFE_INTEGER - 20);
        this.scene.tweens.add({ targets: warning, alpha: 0.55, duration: 120, yoyo: true, repeat: 4 });
        this.scene.time.delayedCall(700, () => {
            if (!warning.active) return;
            const dist = Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, warning.x, warning.y);
            if (dist < 95) this.damagePlayer(boss.config.damage * 1.35, boss);
            warning.destroy();
        });
    }

    tryMeleeAttack(enemy, time) {
        if (time - enemy.lastAttackAt < enemy.config.attackCooldown) return;
        enemy.lastAttackAt = time;
        this.damagePlayer(enemy.config.damage, enemy);
    }

    tryRangedAttack(enemy, time) {
        if (time - enemy.lastAttackAt < enemy.config.attackCooldown) return;
        enemy.lastAttackAt = time;
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.scene.player.x, this.scene.player.y);
        this.fireEnemyProjectile(enemy, angle, enemy.config.damage, enemy.config.projectileSpeed || 230);
    }

    fireEnemyProjectile(enemy, angle, damage, speed) {
        const projectile = this.enemyProjectiles.create(enemy.x, enemy.y, 'survival-enemy-projectile');
        projectile.damage = damage;
        projectile.spawnedAt = this.scene.time.now;
        projectile.lifetime = 3200;
        projectile.body.setCircle(7);
        projectile.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    }

    updateProjectiles(time) {
        [...this.enemyProjectiles.getChildren(), ...this.playerProjectiles.getChildren()].forEach(projectile => {
            if (projectile.active && time - projectile.spawnedAt > projectile.lifetime) projectile.destroy();
        });
    }

    performAttack() {
        if (this.state !== 'running' || !this.scene.player) return;
        const now = this.scene.time.now;
        const cooldownMultiplier = this.activeBuffs.attack_speed_buff ? ITEM_CONFIGS.attack_speed_buff.cooldownMultiplier : 1;
        if (now - this.lastAttackAt < PLAYER_COMBAT_CONFIG.attackCooldown * cooldownMultiplier) return;
        this.lastAttackAt = now;

        const pointer = this.scene.input.activePointer;
        const worldPoint = pointer.positionToCamera(this.scene.cameras.main);
        const angle = Phaser.Math.Angle.Between(this.scene.player.x, this.scene.player.y, worldPoint.x, worldPoint.y);
        this.createSlashEffect(angle);
        this.swingKnife();

        let hitAny = false;
        this.enemies.getChildren().forEach(enemy => {
            const distance = Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, enemy.x, enemy.y);
            if (distance <= PLAYER_COMBAT_CONFIG.attackRange + enemy.config.radius) {
                const enemyAngle = Phaser.Math.Angle.Between(this.scene.player.x, this.scene.player.y, enemy.x, enemy.y);
                const diff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - angle));
                if (diff < Math.PI * 0.72) {
                    hitAny = true;
                    this.damageEnemy(enemy, this.getPlayerDamage(), angle);
                }
            }
        });

        if (!hitAny) this.firePlayerProjectile(angle);
    }

    createSlashEffect(angle) {
        const slash = this.scene.add.graphics();
        slash.lineStyle(7, 0xf8f1d8, 0.9);
        slash.beginPath();
        slash.arc(this.scene.player.x, this.scene.player.y, PLAYER_COMBAT_CONFIG.attackRange, angle - 0.7, angle + 0.7);
        slash.strokePath();
        slash.setDepth(this.scene.player.y + 4);
        this.scene.tweens.add({
            targets: slash,
            alpha: 0,
            scaleX: 1.18,
            scaleY: 1.18,
            duration: 170,
            onComplete: () => slash.destroy(),
        });
    }

    firePlayerProjectile(angle) {
        const projectile = this.playerProjectiles.create(this.scene.player.x, this.scene.player.y, 'survival-player-projectile');
        projectile.damage = Math.round(this.getPlayerDamage() * 0.75);
        projectile.spawnedAt = this.scene.time.now;
        projectile.lifetime = PLAYER_COMBAT_CONFIG.projectileLifetime;
        projectile.body.setCircle(6);
        projectile.setVelocity(Math.cos(angle) * PLAYER_COMBAT_CONFIG.projectileSpeed, Math.sin(angle) * PLAYER_COMBAT_CONFIG.projectileSpeed);
    }

    getPlayerDamage() {
        const multiplier = this.activeBuffs.damage_buff ? ITEM_CONFIGS.damage_buff.damageMultiplier : 1;
        return Math.round(PLAYER_COMBAT_CONFIG.baseDamage * multiplier);
    }

    handlePlayerProjectileHit(projectile, enemy) {
        this.damageEnemy(enemy, projectile.damage, Phaser.Math.Angle.Between(projectile.x, projectile.y, enemy.x, enemy.y));
        projectile.destroy();
    }

    handleEnemyProjectileHit(projectile, player) {
        this.damagePlayer(projectile.damage, projectile);
        projectile.destroy();
    }

    damageEnemy(enemy, damage, angle) {
        if (!enemy.active) return;
        enemy.hp -= damage;
        enemy.setTint(0xffffff);
        this.scene.time.delayedCall(80, () => enemy.active && enemy.setTint(0xff4d4d));
        this.scene.time.delayedCall(170, () => enemy.active && enemy.clearTint());
        enemy.body.setVelocity(Math.cos(angle) * PLAYER_COMBAT_CONFIG.knockback, Math.sin(angle) * PLAYER_COMBAT_CONFIG.knockback);
        this.showDamageNumber(enemy.x, enemy.y - 22, Math.round(damage), '#fff3a3');

        if (enemy.hp <= 0) this.killEnemy(enemy);
    }

    killEnemy(enemy) {
        const config = enemy.config;
        const isBoss = config.type === 'boss';
        this.scoreRunData.monstersKilled++;
        if (config.type === 'elite') this.scoreRunData.elitesKilled++;
        if (isBoss) {
            this.scoreRunData.bossKilled = true;
            this.scoreRunData.finalScore += SCORE_CONFIG.bossKillBonus;
        }
        this.scoreRunData.finalScore += config.scoreValue;
        this.spawnDrops(enemy.x, enemy.y, config.dropTable);
        enemy.destroy();
        this.createDeathBurst(enemy.x, enemy.y, config.color);
        if (isBoss) this.finishRun('victory');
    }

    createDeathBurst(x, y, color) {
        const particles = this.scene.add.particles(this.scene.textures.exists('wisp-particle') ? 'wisp-particle' : 'survival-player-projectile');
        const emitter = particles.createEmitter({
            x,
            y,
            tint: color,
            speed: { min: 40, max: 160 },
            angle: { min: 0, max: 360 },
            lifespan: 360,
            scale: { start: 0.8, end: 0 },
            quantity: 10,
        });
        this.scene.time.delayedCall(380, () => {
            emitter.stop();
            particles.destroy();
        });
    }

    spawnDrops(x, y, tableId) {
        const table = DROP_TABLES[tableId] || [];
        table.forEach(drop => {
            if (Math.random() > drop.dropChance) return;
            const amount = Phaser.Math.Between(drop.minAmount, drop.maxAmount);
            const item = this.drops.create(x + Phaser.Math.Between(-18, 18), y + Phaser.Math.Between(-18, 18), `drop-${drop.itemId}`);
            item.setDisplaySize(24, 24);
            item.itemId = drop.itemId;
            item.amount = amount;
            item.rarity = drop.rarity;
            item.body.setCircle(10);
            item.body.moves = false; // we move/collect drops manually (see updateDrops)
            item.setDepth(item.y);
            // Shiny pulse instead of a position tween, so the collectible never
            // desyncs from where it's drawn.
            this.scene.tweens.add({
                targets: item,
                scaleX: 1.18, scaleY: 1.18,
                duration: 480, yoyo: true, repeat: -1, ease: 'Sine.InOut',
            });
        });
    }

    // Distance-based magnet + pickup. Reliable regardless of physics-body sync,
    // and gives the satisfying "items fly to the player" feel. Called each frame.
    updateDrops() {
        if (!this.drops || !this.scene.player) return;
        const player = this.scene.player;
        const MAGNET_RANGE = 115;
        const PICKUP_RANGE = 28;
        // Copy: handlePickup destroys items, which mutates the live group array.
        [...this.drops.getChildren()].forEach(item => {
            if (!item.active) return;
            const dist = Phaser.Math.Distance.Between(item.x, item.y, player.x, player.y);
            if (dist <= PICKUP_RANGE) {
                this.handlePickup(item, player);
            } else if (dist <= MAGNET_RANGE) {
                item.x += (player.x - item.x) * 0.22;
                item.y += (player.y - item.y) * 0.22;
                item.setDepth(item.y);
            }
        });
    }

    handlePickup(item, player) {
        if (!item.active) return; // guard against double-collection
        const config = ITEM_CONFIGS[item.itemId];
        if (!config) { item.destroy(); return; }

        if (item.itemId === 'coin') {
            this.scoreRunData.coinsCollected += item.amount;
            this.scoreRunData.finalScore += item.amount * config.scorePerAmount;
        } else if (item.itemId === 'health_potion') {
            player.hp = Math.min(player.maxHp || PLAYER_COMBAT_CONFIG.maxHp, player.hp + config.heal);
        } else if (item.itemId === 'rare_chest') {
            const coins = Phaser.Math.Between(config.coinMin, config.coinMax);
            this.scoreRunData.coinsCollected += coins;
            this.scoreRunData.finalScore += coins * ITEM_CONFIGS.coin.scorePerAmount + 150;
        } else if (item.itemId === 'shield') {
            player.shield = Math.min(80, (player.shield || 0) + config.shield);
        } else {
            this.activeBuffs[item.itemId] = {
                name: config.name,
                expiresAt: this.scene.time.now + PLAYER_COMBAT_CONFIG.buffDuration,
            };
        }

        this.showDamageNumber(item.x, item.y - 18, config.name, '#86ff9d');
        item.destroy();
        this.updateHud();
    }

    damagePlayer(damage, source) {
        const player = this.scene.player;
        if (!player || this.state !== 'running') return;
        let incoming = damage;
        if (player.shield > 0) {
            const absorbed = Math.min(player.shield, incoming);
            player.shield -= absorbed;
            incoming -= absorbed;
        }
        if (incoming > 0) {
            player.hp = Math.max(0, player.hp - incoming);
            const angle = Phaser.Math.Angle.Between(source.x, source.y, player.x, player.y);
            player.body.setVelocity(Math.cos(angle) * 180, Math.sin(angle) * 180);
            this.scene.cameras.main.flash(90, 80, 0, 0, false);
        }
        this.showDamageNumber(player.x, player.y - 36, Math.round(damage), '#ff6b6b');
        if (player.hp <= 0) this.finishRun('gameover');
    }

    showDamageNumber(x, y, text, color) {
        const label = this.scene.add.text(x, y, `${text}`, {
            fontFamily: 'PixelOperatorMono-Bold',
            fontSize: '18px',
            color,
            stroke: '#2b1b12',
            strokeThickness: 3,
        });
        label.setOrigin(0.5);
        label.setDepth(Number.MAX_SAFE_INTEGER - 30);
        this.scene.tweens.add({
            targets: label,
            y: y - 28,
            alpha: 0,
            duration: 650,
            onComplete: () => label.destroy(),
        });
    }

    checkWaveCompletion(time) {
        const wave = this.currentWave;
        const elapsed = (time - this.waveStartedAt) / 1000;
        if (elapsed < wave.durationSeconds || this.enemies.countActive(true) > 0) return;
        if (wave.waveNumber >= 5) return;

        this.scoreRunData.finalScore += SCORE_CONFIG.waveClear[wave.waveNumber] || 0;
        this.startWave(this.currentWaveIndex + 1);
    }

    finishRun(reason) {
        if (this.state !== 'running') return;
        this.state = reason;
        this.scene.physics.pause();
        const hpBonus = Math.round((this.scene.player.hp || 0) * SCORE_CONFIG.highHpBonusMultiplier);
        this.scoreRunData.finalScore += hpBonus;
        if (reason === 'victory') this.scoreRunData.finalScore += SCORE_CONFIG.runCompletionBonus;
        this.scoreRunData.finalScore = Math.round(this.scoreRunData.finalScore);
        this.scoreRunData.survivalTime = Math.floor((this.scene.time.now - this.runStartedAt) / 1000);
        this.updateHud();
    }

    mockSubmitScore() {
        if (this.submittedScore) return this.submittedScore;
        this.submittedScore = {
            ...this.scoreRunData,
            playerId: this.scene.activeAccountId || 'guest',
            submittedAt: new Date().toISOString(),
            timestamp: Date.now(),
        };
        console.info('Mock submit score payload', this.submittedScore);
        // Broadcast to co-op peers so their seasonal leaderboards update live.
        if (this.net) this.net.broadcastSubmit(this.scoreRunData);
        window.showNotification && window.showNotification('Score submitted to mock leaderboard', 'success');
        this.updateHud();
        return this.submittedScore;
    }

    updateHud() {
        const player = this.scene.player;
        if (!player) return;
        const wave = this.currentWave;
        const elapsed = Math.floor((this.scene.time.now - this.waveStartedAt) / 1000);
        const remaining = Math.max(0, wave.durationSeconds - elapsed);

        this.setText('score-value', Math.round(this.scoreRunData.finalScore).toLocaleString());
        this.setText('coin-value', this.scoreRunData.coinsCollected.toLocaleString());
        this.setText('wave-value', `${wave.waveNumber}/5`);
        this.setText('wave-timer-value', formatTime(remaining));
        this.setText('enemy-remaining-value', this.enemies ? this.enemies.countActive(true) : 0);
        this.setText('survival-time-value', formatTime(this.scoreRunData.survivalTime));
        this.setText('shield-value', Math.round(player.shield || 0));
        this.setText('season-id-value', SEASON_CONFIG.seasonId);
        this.setText('reward-pool-value', `${SEASON_CONFIG.rewardPool.toLocaleString()} coin`);
        this.setText('player-rank-value', `#${SEASON_CONFIG.playerRank}`);
        this.setText('estimated-reward-value', `${SEASON_CONFIG.estimatedReward.toLocaleString()} coin`);

        const progress = Math.min(100, elapsed / wave.durationSeconds * 100);
        this.setWidth('wave-progress-bar', clampPercent(progress));
        this.setWidth('hp-bar', clampPercent(player.hp));
        this.setWidth('shield-bar', clampPercent(player.shield || 0));

        const activeBuffText = Object.keys(this.activeBuffs).map(key => {
            const left = Math.max(0, Math.ceil((this.activeBuffs[key].expiresAt - this.scene.time.now) / 1000));
            return `${this.activeBuffs[key].name} ${left}s`;
        }).join(' | ') || 'None';
        this.setText('active-buffs-value', activeBuffText);

        const boss = this.enemies && this.enemies.getChildren().find(enemy => enemy.active && enemy.config.type === 'boss');
        const bossPanel = document.getElementById('boss-panel');
        if (bossPanel) bossPanel.style.display = boss ? 'block' : 'none';
        if (boss) {
            this.setText('boss-name-value', boss.config.name);
            this.setWidth('boss-hp-bar', clampPercent(boss.hp / boss.maxHp * 100));
        }

        const overlay = document.getElementById('run-result-overlay');
        if (overlay) {
            overlay.style.display = this.state === 'running' ? 'none' : 'flex';
            overlay.className = this.state === 'victory' ? 'run-result-overlay victory' : 'run-result-overlay gameover';
        }
        this.setText('run-result-title', this.state === 'victory' ? 'Victory' : 'Game Over');
        this.setText('final-score-value', Math.round(this.scoreRunData.finalScore).toLocaleString());
        this.setText('final-wave-value', this.scoreRunData.waveReached);
        this.setText('final-kills-value', this.scoreRunData.monstersKilled);
        this.setText('final-coins-value', this.scoreRunData.coinsCollected);
        this.setText('submit-status-value', this.submittedScore ? 'Submitted' : 'Ready');

        if (this.state !== 'running') this.renderSeasonResult();
    }

    // Merge the local run, peer submissions, and the season mock into a single
    // ranked board shown on the result screen. Falls back to static config when
    // running solo (no co-op net).
    renderSeasonResult() {
        let playerRank = SEASON_CONFIG.playerRank;
        let estimatedReward = SEASON_CONFIG.estimatedReward;
        let rows = SEASON_CONFIG.leaderboard.map(e => ({
            rank: e.rank, displayName: e.playerId, score: e.score, you: false,
        }));

        if (this.net) {
            const merged = this.net.getMergedLeaderboard(this.scoreRunData);
            playerRank = merged.playerRank;
            estimatedReward = merged.estimatedReward;
            rows = merged.rows;
        }

        this.setText('player-rank-value', `#${playerRank}`);
        this.setText('estimated-reward-value', `${estimatedReward.toLocaleString()} coin`);

        const container = document.getElementById('season-leaderboard-rows');
        if (container) {
            container.innerHTML = rows.slice(0, 6).map(r =>
                `<span class="${r.you ? 'lb-you' : ''}">#${r.rank} ${escapeHtml(r.displayName)} — ${(r.score || 0).toLocaleString()}</span>`
            ).join('');
        }
    }

    setText(id, text) {
        const element = document.getElementById(id);
        if (element) element.innerText = text;
    }

    setWidth(id, width) {
        const element = document.getElementById(id);
        if (element) element.style.width = width;
    }
}

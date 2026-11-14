import { sound } from './audio';
import { ATTACK_DEFINITIONS } from './constants';
import {
  AttackPatternId,
  BattleBoxState,
  Bullet,
  KnightState,
  SlashHazard,
  SoulState
} from './types';

// Deterministic PRNG so every single attack pattern plays identically on retry (just like real Deltarune!)
class DeterministicRng {
  private seed = 1337;
  public reset(seed: number): void {
    this.seed = seed >>> 0;
  }
  public next(): number {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export class AttackController {
  public bullets: Bullet[] = [];
  public slashes: SlashHazard[] = [];
  public elapsed = 0;
  public duration = 8;
  public patternId: AttackPatternId = 'stars_1';
  public screenFlashAlpha = 0;
  public finalRoaringSlashActive = false;

  private rng = new DeterministicRng();
  private nextBulletId = 1;
  private stepIndex = 0;
  private subStepIndex = 0;
  private grazeSoundCooldown = 0;

  public startAttack(
    patternId: AttackPatternId,
    box: BattleBoxState,
    soul: SoulState,
    knight: KnightState
  ): void {
    this.patternId = patternId;
    const def = ATTACK_DEFINITIONS[patternId];
    this.duration = def.duration;
    this.elapsed = 0;
    this.bullets = [];
    this.slashes = [];
    this.stepIndex = 0;
    this.subStepIndex = 0;
    this.screenFlashAlpha = 0;
    this.finalRoaringSlashActive = false;

    // Seed uniquely but deterministically per patternId!
    let hash = 2166136261;
    for (let i = 0; i < patternId.length; i++) {
      hash ^= patternId.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    this.rng.reset(hash);

    box.targetWidth = def.boxWidth;
    box.targetHeight = def.boxHeight;
    box.splitAxis = 'none';
    box.splitGap = 0;
    box.targetSplitGap = 0;
    box.rotation = 0;
    box.borderColor = patternId === 'roaring_final' ? '#ffffff' : '#33ff55';

    soul.x = box.cx;
    soul.y = box.cy;

    if (patternId.startsWith('stars')) {
      knight.pose = 'point';
    } else if (patternId === 'roaring_final') {
      knight.pose = 'roar';
    } else if (patternId.startsWith('box_splitter')) {
      knight.pose = 'raise_sword';
    } else {
      knight.pose = 'idle';
    }

    // Pre-spawn confining ring for Tracking Swords III & Lethal!
    if (patternId === 'tracking_swords_3' || patternId === 'tracking_swords_lethal') {
      const count = patternId === 'tracking_swords_lethal' ? 14 : 12;
      const ringRadius = patternId === 'tracking_swords_lethal' ? 68 : 74;
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2;
        this.spawnBullet({
          x: box.cx + Math.cos(theta) * ringRadius,
          y: box.cy + Math.sin(theta) * ringRadius,
          vx: 0,
          vy: 0,
          radius: 5,
          length: 20,
          width: 5,
          angle: theta + Math.PI,
          spin: 0,
          shape: 'dagger',
          color: '#d8b4fe',
          maxAge: this.duration + 1,
          customTag: 'ring_dagger',
          state: i,
          targetX: ringRadius
        });
      }
    }
  }

  private spawnBullet(partial: Partial<Bullet> & { x: number; y: number; shape: Bullet['shape'] }): Bullet {
    const b: Bullet = {
      id: this.nextBulletId++,
      x: partial.x,
      y: partial.y,
      vx: partial.vx ?? 0,
      vy: partial.vy ?? 0,
      ax: partial.ax ?? 0,
      ay: partial.ay ?? 0,
      radius: partial.radius ?? 6,
      length: partial.length,
      width: partial.width,
      angle: partial.angle ?? 0,
      spin: partial.spin ?? 0,
      shape: partial.shape,
      color: partial.color ?? '#ffffff',
      coreColor: partial.coreColor,
      age: 0,
      maxAge: partial.maxAge ?? 10,
      grazed: false,
      damageMultiplier: partial.damageMultiplier ?? 1,
      customTag: partial.customTag,
      state: partial.state ?? 0,
      stateTimer: partial.stateTimer ?? 0,
      targetX: partial.targetX,
      targetY: partial.targetY
    };
    this.bullets.push(b);
    return b;
  }

  public update(
    dt: number,
    box: BattleBoxState,
    soul: SoulState,
    knight: KnightState
  ): {
    hitOccurred: boolean;
    isBoxCleaveHit: boolean;
    isFinalRoaringSlashHit: boolean;
    tpGained: number;
    finished: boolean;
  } {
    this.elapsed += dt;
    this.grazeSoundCooldown = Math.max(0, this.grazeSoundCooldown - dt);
    this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt * 2.4);

    // Smoothly interpolate battle box dimensions & split gap
    box.width += (box.targetWidth - box.width) * Math.min(1, dt * 12);
    box.height += (box.targetHeight - box.height) * Math.min(1, dt * 12);
    box.splitGap += (box.targetSplitGap - box.splitGap) * Math.min(1, dt * 14);

    // Execute deterministic pattern script
    this.runPatternScript(dt, box, soul, knight);

    // Update bullets
    this.updateBullets(dt, box, soul);

    // Update slash hazards
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      const prevElapsed = s.elapsed;
      s.elapsed += dt;
      if (s.elapsed < s.telegraphTime) {
        s.angle += s.rotateSpeed * dt;
      } else if (prevElapsed < s.telegraphTime && s.elapsed >= s.telegraphTime) {
        // Slash just activated!
        sound.playSfx(s.isBoxCleave ? 'box_split' : 'slash_ring');
        knight.pose = knight.pose === 'roar' ? 'roar' : 'slash';
        if (s.isBoxCleave) {
          this.screenFlashAlpha = 0.35;
        }
      }
      if (s.elapsed >= s.telegraphTime + s.activeTime + s.fadeTime) {
        this.slashes.splice(i, 1);
      }
    }

    // Check collisions & TP grazing
    let hitOccurred = false;
    let isBoxCleaveHit = false;
    let isFinalRoaringSlashHit = false;
    let tpGained = 0;

    const grazeDistBase = 24;

    // 1. Check SlashHazards
    for (const s of this.slashes) {
      const activeStart = s.telegraphTime;
      const activeEnd = s.telegraphTime + s.activeTime;
      if (s.elapsed >= activeStart && s.elapsed <= activeEnd) {
        const dist = this.pointToLineDistance(soul.x, soul.y, s.x, s.y, s.angle, s.length);
        const hitHalfWidth = s.thickness * 0.46 + soul.radius * 0.65;
        if (dist <= hitHalfWidth) {
          if (soul.invulnTimer <= 0 && !s.hitTriggered) {
            s.hitTriggered = true;
            hitOccurred = true;
            if (s.isBoxCleave) isBoxCleaveHit = true;
            if (s.color === '#fffffe') isFinalRoaringSlashHit = true;
          }
        } else if (dist <= hitHalfWidth + grazeDistBase && !s.grazed) {
          s.grazed = true;
          tpGained += 2.2;
          soul.grazeFlashTimer = 0.16;
          if (this.grazeSoundCooldown <= 0) {
            sound.playSfx('graze');
            this.grazeSoundCooldown = 0.06;
          }
        }
      }
    }

    // 2. Check Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      // Hovering un-launched tracking swords outside box don't hurt during spawn fade-in
      if (b.customTag === 'tracking' && b.state === 0 && b.age < 0.25) continue;

      const dist = this.distanceToBullet(soul.x, soul.y, b);
      // Canonical detail: Roaring Final stars cover full visual sprite!
      const hitThreshold =
        this.patternId === 'roaring_final' && b.shape === 'star'
          ? soul.radius + b.radius * 0.96
          : soul.radius + (b.shape === 'sword' || b.shape === 'dagger' ? 2.5 : b.radius * 0.78);

      if (dist <= hitThreshold) {
        if (soul.invulnTimer <= 0) {
          hitOccurred = true;
        }
      } else if (dist <= hitThreshold + grazeDistBase) {
        if (!b.grazed) {
          b.grazed = true;
          tpGained += 1.6;
          soul.grazeFlashTimer = 0.14;
          if (this.grazeSoundCooldown <= 0) {
            sound.playSfx('graze');
            this.grazeSoundCooldown = 0.055;
          }
        } else {
          // Continuous micro-TP while skimming close to blades/stars!
          tpGained += dt * 3.2;
          soul.grazeFlashTimer = Math.max(soul.grazeFlashTimer, 0.06);
        }
      }
    }

    const finished = this.elapsed >= this.duration;
    if (finished) {
      box.splitAxis = 'none';
      box.targetSplitGap = 0;
      box.splitGap = 0;
      box.rotation = 0;
      knight.pose = knight.phase4Completed ? 'cracked' : 'idle';
    }

    return {
      hitOccurred,
      isBoxCleaveHit,
      isFinalRoaringSlashHit,
      tpGained,
      finished
    };
  }

  private runPatternScript(
    dt: number,
    box: BattleBoxState,
    soul: SoulState,
    knight: KnightState
  ): void {
    const t = this.elapsed;

    switch (this.patternId) {
      // ==========================================================
      // STARS 1, 2, 3 (Reverse & Shatter Dark/Mauve Stars)
      // ==========================================================
      case 'stars_1':
      case 'stars_2':
      case 'stars_3': {
        const tier = this.patternId === 'stars_1' ? 1 : this.patternId === 'stars_2' ? 2 : 3;
        const interval = tier === 1 ? 0.58 : tier === 2 ? 0.44 : 0.36;
        const maxSpawnTime = this.duration - 1.9;
        while (t < maxSpawnTime && t >= this.stepIndex * interval) {
          const idx = this.stepIndex++;
          const rightX = box.cx + box.width * 0.5 + 24;
          const ySpread = box.height * 0.42;
          const yOff = Math.sin(idx * 1.35) * ySpread + this.rng.range(-12, 12);
          const shardCount = tier === 1 ? 4 : tier === 2 ? 6 : 8;
          this.spawnBullet({
            x: rightX,
            y: box.cy + yOff,
            vx: -this.rng.range(115, 148),
            vy: this.rng.range(-22, 22),
            radius: 9,
            angle: 0,
            spin: 2.6,
            shape: 'star',
            color: '#c084fc',
            coreColor: '#ffffff',
            maxAge: 6,
            customTag: `star_tier_${shardCount}`,
            state: 0,
            stateTimer: this.rng.range(1.05, 1.45)
          });

          // Tier 3 adds alternating top/bottom drifting star!
          if (tier === 3 && idx % 2 === 1) {
            const fromTop = idx % 4 === 1;
            this.spawnBullet({
              x: box.cx + this.rng.range(-box.width * 0.35, box.width * 0.35),
              y: box.cy + (fromTop ? -box.height * 0.5 - 20 : box.height * 0.5 + 20),
              vx: this.rng.range(-20, 20),
              vy: fromTop ? 105 : -105,
              radius: 8,
              spin: -3,
              shape: 'star',
              color: '#a855f7',
              maxAge: 6,
              customTag: 'star_tier_6',
              state: 0,
              stateTimer: 1.15
            });
          }
        }
        break;
      }

      // ==========================================================
      // TRACKING SWORDS 1, 2, 3, LETHAL
      // ==========================================================
      case 'tracking_swords_1':
      case 'tracking_swords_2':
      case 'tracking_swords_3':
      case 'tracking_swords_lethal': {
        const tier =
          this.patternId === 'tracking_swords_1'
            ? 1
            : this.patternId === 'tracking_swords_2'
              ? 2
              : this.patternId === 'tracking_swords_3'
                ? 3
                : 4;
        const interval = tier === 1 ? 0.68 : tier === 2 ? 0.52 : tier === 3 ? 0.46 : 0.36;
        const maxSpawnTime = this.duration - 1.1;

        while (t < maxSpawnTime && t >= this.stepIndex * interval + 0.2) {
          const idx = this.stepIndex++;
          // Deterministic cardinal/intercardinal angles
          const baseAngle = ((idx * 3) % 8) * (Math.PI / 4) + (tier >= 3 ? idx * 0.18 : 0);
          const spawnDist = 112;
          this.spawnTrackingSword(box, soul, baseAngle, spawnDist, tier);

          // Tier 2 & 4 spawn occasional perpendicular dual-blade!
          if ((tier === 2 && idx % 3 === 2) || (tier === 4 && idx % 2 === 1)) {
            this.spawnTrackingSword(box, soul, baseAngle + Math.PI * 0.5, spawnDist, tier);
          }
        }
        break;
      }

      // ==========================================================
      // BOX SPLITTER 1, 2, 3 (Physical Battle Box Cleave + Diamonds!)
      // ==========================================================
      case 'box_splitter_1':
      case 'box_splitter_2':
      case 'box_splitter_3': {
        const tier =
          this.patternId === 'box_splitter_1'
            ? 1
            : this.patternId === 'box_splitter_2'
              ? 2
              : 3;
        const cycleDur = tier === 1 ? 2.05 : tier === 2 ? 1.72 : 1.48;
        const maxCycles = Math.floor((this.duration - 0.7) / cycleDur);

        if (this.stepIndex < maxCycles && t >= this.stepIndex * cycleDur + 0.25) {
          const cIdx = this.stepIndex++;
          knight.pose = 'raise_sword';

          let axis: BattleBoxState['splitAxis'] = 'vertical';
          let slashAngle = Math.PI / 2;
          if (tier === 1) {
            axis = 'vertical';
            slashAngle = Math.PI / 2;
          } else if (tier === 2) {
            axis = cIdx % 2 === 0 ? 'vertical' : 'horizontal';
            slashAngle = axis === 'vertical' ? Math.PI / 2 : 0;
          } else {
            const modes: Array<{ ax: BattleBoxState['splitAxis']; ang: number }> = [
              { ax: 'vertical', ang: Math.PI / 2 },
              { ax: 'horizontal', ang: 0 },
              { ax: 'diag1', ang: Math.PI / 4 },
              { ax: 'diag2', ang: -Math.PI / 4 }
            ];
            const pick = modes[cIdx % modes.length];
            axis = pick.ax;
            slashAngle = pick.ang;
          }

          const telegraph = tier === 3 ? 0.46 : 0.54;
          this.slashes.push({
            x: box.cx,
            y: box.cy,
            angle: slashAngle,
            thickness: 18,
            length: 250,
            telegraphTime: telegraph,
            activeTime: 0.2,
            fadeTime: 0.25,
            elapsed: 0,
            rotateSpeed: 0,
            hitTriggered: false,
            grazed: false,
            isBoxCleave: true,
            color: '#ffffff'
          });

          // Schedule box split & perpendicular diamond burst when cleave lands!
          this.spawnBullet({
            x: box.cx,
            y: box.cy,
            vx: 0,
            vy: 0,
            radius: 0,
            angle: slashAngle,
            spin: 0,
            shape: 'shard',
            color: 'transparent',
            maxAge: telegraph + 0.65,
            customTag: `cleave_emitter_${axis}_${tier}`,
            state: 0,
            stateTimer: telegraph
          });
        }
        break;
      }

      // ==========================================================
      // SWORD TUNNEL 1, 2, FINISHER, 3 (Low i-frame weaving corridor!)
      // ==========================================================
      case 'sword_tunnel_1':
      case 'sword_tunnel_2':
      case 'sword_tunnel_finisher':
      case 'sword_tunnel_3': {
        const isTwoAxis = this.patternId === 'sword_tunnel_2';
        const isFinisher = this.patternId === 'sword_tunnel_finisher';
        const isRotating = this.patternId === 'sword_tunnel_3';

        if (isRotating) {
          // Subtle menacing box tilt in Sword Tunnel 3!
          box.rotation = Math.sin(t * 1.4) * 0.22;
        }

        const spawnRate = isFinisher ? 0.085 : 0.1;
        const cutoff = isFinisher ? this.duration - 2.1 : this.duration - 0.9;

        while (t < cutoff && t >= this.stepIndex * spawnRate + 0.15) {
          const idx = this.stepIndex++;
          const st = idx * spawnRate;

          // In Sword Tunnel 2, switch from Horizontal to Vertical halfway through!
          if (isTwoAxis && st > 3.8 && st < 4.45) {
            continue; // clean transition gap!
          }

          const verticalMode = isTwoAxis && st >= 4.45;
          const gapHalf = isFinisher ? 25 : isRotating ? 26 : 28;

          if (!verticalMode) {
            // Horizontal corridor: blades enter on the right, move left
            const freq = isFinisher ? 3.3 : 2.4;
            const amp = box.height * 0.31;
            const centerOffset = Math.sin(st * freq) * amp;
            const rotAngle = isRotating ? Math.sin(st * 1.2) * 0.24 : 0;
            const cosR = Math.cos(rotAngle);
            const sinR = Math.sin(rotAngle);

            const spawnLocalX = box.width * 0.5 + 26;
            const topTipY = centerOffset - gapHalf;
            const botTipY = centerOffset + gapHalf;
            const speed = isFinisher ? 235 : 195;

            // Top blade pointing down
            const tx = box.cx + spawnLocalX * cosR - (topTipY - 18) * sinR;
            const ty = box.cy + spawnLocalX * sinR + (topTipY - 18) * cosR;
            this.spawnBullet({
              x: tx,
              y: ty,
              vx: -speed * cosR,
              vy: -speed * sinR,
              radius: 4,
              length: 36,
              width: 6,
              angle: Math.PI / 2 + rotAngle,
              spin: 0,
              shape: 'sword',
              color: '#f3e8ff',
              maxAge: 2.2
            });

            // Bottom blade pointing up
            const bx = box.cx + spawnLocalX * cosR - (botTipY + 18) * sinR;
            const by = box.cy + spawnLocalX * sinR + (botTipY + 18) * cosR;
            this.spawnBullet({
              x: bx,
              y: by,
              vx: -speed * cosR,
              vy: -speed * sinR,
              radius: 4,
              length: 36,
              width: 6,
              angle: -Math.PI / 2 + rotAngle,
              spin: 0,
              shape: 'sword',
              color: '#f3e8ff',
              maxAge: 2.2
            });
          } else {
            // Vertical corridor: blades enter at top, stream downward!
            const amp = box.width * 0.31;
            const centerOffset = Math.sin((st - 4.45) * 2.8) * amp;
            const spawnY = box.cy - box.height * 0.5 - 26;
            const leftTipX = box.cx + centerOffset - gapHalf;
            const rightTipX = box.cx + centerOffset + gapHalf;

            this.spawnBullet({
              x: leftTipX - 18,
              y: spawnY,
              vx: 0,
              vy: 190,
              radius: 4,
              length: 36,
              width: 6,
              angle: 0,
              spin: 0,
              shape: 'sword',
              color: '#f3e8ff',
              maxAge: 2.2
            });
            this.spawnBullet({
              x: rightTipX + 18,
              y: spawnY,
              vx: 0,
              vy: 190,
              radius: 4,
              length: 36,
              width: 6,
              angle: Math.PI,
              spin: 0,
              shape: 'sword',
              color: '#f3e8ff',
              maxAge: 2.2
            });
          }
        }

        // Phase 2 Finisher closing triple slash gates!
        if (isFinisher && t >= this.duration - 1.7 && this.subStepIndex < 3) {
          const gateTime = this.duration - 1.7 + this.subStepIndex * 0.42;
          if (t >= gateTime) {
            const gIdx = this.subStepIndex++;
            this.slashes.push({
              x: soul.x,
              y: soul.y,
              angle: gIdx * (Math.PI / 3) + 0.3,
              thickness: 14,
              length: 260,
              telegraphTime: 0.42,
              activeTime: 0.14,
              fadeTime: 0.2,
              elapsed: 0,
              rotateSpeed: 1.1,
              hitTriggered: false,
              grazed: false,
              color: '#ff3366'
            });
          }
        }
        break;
      }

      // ==========================================================
      // ROTATING SLASH 1, 2, 3 (Party-wide Rotating Red Telegraphs!)
      // ==========================================================
      case 'rotating_slash_1':
      case 'rotating_slash_2':
      case 'rotating_slash_3': {
        const tier =
          this.patternId === 'rotating_slash_1'
            ? 1
            : this.patternId === 'rotating_slash_2'
              ? 2
              : 3;
        const beatInterval = tier === 1 ? 1.18 : tier === 2 ? 1.05 : 0.92;
        const totalBeats = tier === 1 ? 6 : tier === 2 ? 7 : 8;

        if (this.stepIndex < totalBeats && t >= this.stepIndex * beatInterval + 0.2) {
          const beat = this.stepIndex++;
          const lineCounts =
            tier === 1
              ? [1, 2, 2, 3, 3, 4]
              : tier === 2
                ? [2, 2, 3, 3, 4, 4, 5]
                : [3, 3, 4, 4, 5, 5, 5, 6];
          const numLines = lineCounts[Math.min(beat, lineCounts.length - 1)];
          const originX =
            beat % 2 === 0 ? soul.x : box.cx + Math.cos(beat * 2.1) * (box.width * 0.2);
          const originY =
            beat % 2 === 0 ? soul.y : box.cy + Math.sin(beat * 2.1) * (box.height * 0.2);
          const spinDir = beat % 2 === 0 ? 1 : -1;
          const rotSpeed = (tier === 1 ? 1.05 : tier === 2 ? 1.35 : 1.6) * spinDir;
          const baseAng = beat * 0.55;

          for (let i = 0; i < numLines; i++) {
            this.slashes.push({
              x: originX,
              y: originY,
              angle: baseAng + (i * Math.PI) / numLines,
              thickness: 13,
              length: 300,
              telegraphTime: tier === 3 ? 0.56 : 0.65,
              activeTime: 0.16,
              fadeTime: 0.22,
              elapsed: 0,
              rotateSpeed: rotSpeed,
              hitTriggered: false,
              grazed: false,
              color: '#ffffff'
            });
          }
        }
        break;
      }

      // ==========================================================
      // THE ROARING (Phase 4 Turn 3 — Full-Screen Star Vortex + Final Slash!)
      // ==========================================================
      case 'roaring_final': {
        knight.pose = 'roar';
        // Stage 1 (0.0s .. 5.2s): Swirling Star Vortex!
        if (t < 4.7) {
          const vortexRate = 0.13;
          while (t >= this.stepIndex * vortexRate) {
            const idx = this.stepIndex++;
            const arms = 3;
            for (let a = 0; a < arms; a++) {
              const theta = idx * 0.34 + (a * Math.PI * 2) / arms;
              const spawnR = 175;
              const sx = box.cx + Math.cos(theta) * spawnR;
              const sy = box.cy + Math.sin(theta) * spawnR;
              // Tangential + inward spiral velocity!
              const inward = 92;
              const tangent = 78;
              const vx = -Math.cos(theta) * inward - Math.sin(theta) * tangent;
              const vy = -Math.sin(theta) * inward + Math.cos(theta) * tangent;
              this.spawnBullet({
                x: sx,
                y: sy,
                vx,
                vy,
                radius: 7.5,
                spin: 3.5,
                shape: 'star',
                color: idx % 2 === 0 ? '#e879f9' : '#ffffff',
                coreColor: '#1e0836',
                maxAge: 5.5,
                customTag: 'vortex_star',
                state: 0,
                stateTimer: 1.55
              });
            }
          }
        } else if (t >= 5.2 && t < 10.1) {
          // Stage 2 (5.2s .. 10.1s): Giant Sword Slashes + Starfall!
          const slashInterval = 0.62;
          const stage2Elapsed = t - 5.2;
          while (stage2Elapsed >= this.subStepIndex * slashInterval) {
            const sIdx = this.subStepIndex++;
            const px = box.cx + Math.sin(sIdx * 1.9) * (box.width * 0.28);
            const py = box.cy + Math.cos(sIdx * 1.4) * (box.height * 0.26);
            this.slashes.push({
              x: px,
              y: py,
              angle: sIdx * 0.72,
              thickness: 16,
              length: 360,
              telegraphTime: 0.52,
              activeTime: 0.16,
              fadeTime: 0.22,
              elapsed: 0,
              rotateSpeed: sIdx % 2 === 0 ? 1.2 : -1.2,
              hitTriggered: false,
              grazed: false,
              color: '#ffffff'
            });

            // Falling star pair
            for (let k = -1; k <= 1; k += 2) {
              this.spawnBullet({
                x: box.cx + k * this.rng.range(22, box.width * 0.44),
                y: box.cy - box.height * 0.5 - 24,
                vx: this.rng.range(-18, 18),
                vy: this.rng.range(125, 155),
                radius: 7,
                spin: 3,
                shape: 'star',
                color: '#f0abfc',
                maxAge: 3.2
              });
            }
          }
        } else if (t >= 10.3 && !this.finalRoaringSlashActive) {
          // Stage 3 (10.3s .. 13.8s): Clear minor bullets & unleash THE FINAL CLEAVE!
          this.finalRoaringSlashActive = true;
          this.bullets = [];
          // Colossal center X-cleave leaving corner pockets safe (or clamping living party at 1 HP if hit!)
          const angles = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4];
          for (const ang of angles) {
            this.slashes.push({
              x: box.cx,
              y: box.cy,
              angle: ang,
              thickness: 26,
              length: 440,
              telegraphTime: 1.35,
              activeTime: 0.45,
              fadeTime: 0.8,
              elapsed: 0,
              rotateSpeed: 0.22,
              hitTriggered: false,
              grazed: false,
              color: '#fffffe' // Sentinel color for Canonical Final 75-dmg Slash!
            });
          }
        }
        break;
      }
    }
  }

  private spawnTrackingSword(
    box: BattleBoxState,
    soul: SoulState,
    angleAroundBox: number,
    dist: number,
    tier: number
  ): void {
    const sx = box.cx + Math.cos(angleAroundBox) * dist;
    const sy = box.cy + Math.sin(angleAroundBox) * dist;
    const aim = Math.atan2(soul.y - sy, soul.x - sx);
    const trackTime = tier === 1 ? 0.65 : tier === 2 ? 0.55 : tier === 3 ? 0.48 : 0.38;

    this.spawnBullet({
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      radius: 5,
      length: 38,
      width: 7,
      angle: aim,
      spin: 0,
      shape: 'sword',
      color: '#ffffff',
      maxAge: 4.5,
      customTag: 'tracking',
      state: 0, // 0 = tracking, 1 = red lock, 2 = lunging!
      stateTimer: trackTime,
      targetX: angleAroundBox,
      targetY: tier
    });
  }

  private updateBullets(dt: number, box: BattleBoxState, soul: SoulState): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt;
      if (b.age >= b.maxAge) {
        this.bullets.splice(i, 1);
        continue;
      }

      // Invisible Box Splitter Emitter Controller
      if (b.customTag && b.customTag.startsWith('cleave_emitter_')) {
        if (b.state === 0 && b.age >= (b.stateTimer ?? 0.5)) {
          b.state = 1;
          const parts = b.customTag.split('_');
          const axis = parts[2] as BattleBoxState['splitAxis'];
          const tier = Number(parts[3] || 1);
          box.splitAxis = axis;
          box.targetSplitGap = 22;

          // Emit fast and slow diamond projectiles perpendicular to the split!
          const slashAng = b.angle;
          const perp1 = slashAng + Math.PI / 2;
          const perp2 = slashAng - Math.PI / 2;
          const count = tier === 1 ? 5 : tier === 2 ? 6 : 7;
          for (let k = 0; k < count; k++) {
            const along = ((k / (count - 1)) - 0.5) * 128;
            const ox = box.cx + Math.cos(slashAng) * along;
            const oy = box.cy + Math.sin(slashAng) * along;
            for (const pAng of [perp1, perp2]) {
              const fast = k % 2 === 0;
              const spd = fast ? 168 : 104;
              this.spawnBullet({
                x: ox,
                y: oy,
                vx: Math.cos(pAng) * spd,
                vy: Math.sin(pAng) * spd,
                radius: 5.5,
                angle: pAng,
                spin: 0,
                shape: 'diamond',
                color: fast ? '#ff3366' : '#c084fc',
                maxAge: 2.4
              });
            }
          }
        } else if (b.state === 1 && b.age >= (b.stateTimer ?? 0.5) + 0.42) {
          b.state = 2;
          box.targetSplitGap = 0;
        }
        continue;
      }

      // Orbiting Ring Daggers (Tracking Swords III & Lethal)
      if (b.customTag === 'ring_dagger') {
        const count = this.patternId === 'tracking_swords_lethal' ? 14 : 12;
        const baseR = b.targetX ?? 72;
        const theta = ((b.state ?? 0) / count) * Math.PI * 2 + this.elapsed * 0.85;
        b.x = box.cx + Math.cos(theta) * baseR;
        b.y = box.cy + Math.sin(theta) * baseR;
        b.angle = theta + Math.PI;
        continue;
      }

      // Star Reversal & Detonation Logic
      if (b.customTag && b.customTag.startsWith('star_tier_')) {
        const shardCount = Number(b.customTag.split('_')[2] || 4);
        if (b.state === 0 && b.age >= (b.stateTimer ?? 1.2)) {
          // Reverse direction & flash red!
          b.state = 1;
          b.vx = -b.vx * 0.55;
          b.vy = -b.vy * 0.55;
          b.color = '#ff2455';
          b.spin = 7;
          b.stateTimer = b.age + 0.52;
        } else if (b.state === 1 && b.age >= (b.stateTimer ?? 1.7)) {
          // Detonate into radial star shards!
          for (let s = 0; s < shardCount; s++) {
            const ang = (s / shardCount) * Math.PI * 2 + 0.35;
            const spd = s % 2 === 0 ? 138 : 98;
            this.spawnBullet({
              x: b.x,
              y: b.y,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              radius: 4.5,
              angle: ang,
              spin: 0,
              shape: 'shard',
              color: '#ff6b9d',
              maxAge: 2.8
            });
          }
          this.bullets.splice(i, 1);
          continue;
        }
      }

      // Roaring Final Vortex Stars: spiral in, then reverse outward!
      if (b.customTag === 'vortex_star' && b.state === 0 && b.age >= (b.stateTimer ?? 1.55)) {
        b.state = 1;
        const away = Math.atan2(b.y - box.cy, b.x - box.cx);
        b.vx = Math.cos(away) * 155;
        b.vy = Math.sin(away) * 155;
        b.color = '#ff3864';
      }

      // Tracking Sword State Machine
      if (b.customTag === 'tracking') {
        const tier = b.targetY ?? 1;
        if (b.state === 0) {
          // Smoothly hover toward desired angle offset around the SOUL and aim at SOUL!
          const orbitAng = b.targetX ?? 0;
          const desiredX = soul.x * 0.35 + box.cx * 0.65 + Math.cos(orbitAng) * 98;
          const desiredY = soul.y * 0.35 + box.cy * 0.65 + Math.sin(orbitAng) * 92;
          b.x += (desiredX - b.x) * Math.min(1, dt * 6);
          b.y += (desiredY - b.y) * Math.min(1, dt * 6);
          b.angle = Math.atan2(soul.y - b.y, soul.x - b.x);

          if (b.age >= (b.stateTimer ?? 0.6)) {
            b.state = 1; // Lock on!
            b.color = '#ff244c';
            b.stateTimer = b.age + (tier === 4 ? 0.22 : 0.28);
            sound.playSfx('sword_lock');
          }
          continue;
        } else if (b.state === 1) {
          // Frozen red lock-on window!
          if (b.age >= (b.stateTimer ?? 0.9)) {
            b.state = 2; // Lunge!
            const lungeSpeed = tier === 4 ? 540 : tier >= 2 ? 490 : 445;
            b.vx = Math.cos(b.angle) * lungeSpeed;
            b.vy = Math.sin(b.angle) * lungeSpeed;
            sound.playSfx('slash');

            // Tier 3 & 4 split secondary crimson shards!
            if (tier >= 3) {
              for (const off of [-0.24, 0.24]) {
                const sa = b.angle + off;
                this.spawnBullet({
                  x: b.x,
                  y: b.y,
                  vx: Math.cos(sa) * 265,
                  vy: Math.sin(sa) * 265,
                  radius: 4.5,
                  angle: sa,
                  spin: 0,
                  shape: 'shard',
                  color: '#ff3366',
                  maxAge: 1.8
                });
              }
            }
          }
          continue;
        }
      }

      // Standard kinematic integration
      b.vx += (b.ax ?? 0) * dt;
      b.vy += (b.ay ?? 0) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.spin * dt;
    }
  }

  private distanceToBullet(px: number, py: number, b: Bullet): number {
    if (b.shape === 'sword' || b.shape === 'dagger') {
      const halfLen = (b.length ?? 32) * 0.42;
      return this.pointToLineDistance(px, py, b.x, b.y, b.angle, halfLen * 2);
    }
    return Math.hypot(px - b.x, py - b.y);
  }

  private pointToLineDistance(
    px: number,
    py: number,
    cx: number,
    cy: number,
    angle: number,
    totalLen: number
  ): number {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const dx = px - cx;
    const dy = py - cy;
    const half = totalLen * 0.5;
    const proj = Math.max(-half, Math.min(half, dx * ux + dy * uy));
    const closestX = cx + ux * proj;
    const closestY = cy + uy * proj;
    return Math.hypot(px - closestX, py - closestY);
  }

  public renderArenaAndHazards(
    ctx: CanvasRenderingContext2D,
    box: BattleBoxState,
    soul: SoulState,
    time: number
  ): void {
    // 1. Render Battle Box (with Box Splitter physical cleave displacement!)
    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.rotate(box.rotation);

    const hw = box.width * 0.5;
    const hh = box.height * 0.5;
    const gap = box.splitGap * 0.5;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.strokeStyle = box.borderColor;
    ctx.lineWidth = 4;

    if (box.splitAxis === 'vertical' && gap > 0.5) {
      // Left half & Right half pushed apart!
      ctx.fillRect(-hw - gap, -hh, hw, box.height);
      ctx.strokeRect(-hw - gap, -hh, hw, box.height);

      ctx.fillRect(gap, -hh, hw, box.height);
      ctx.strokeRect(gap, -hh, hw, box.height);
    } else if (box.splitAxis === 'horizontal' && gap > 0.5) {
      ctx.fillRect(-hw, -hh - gap, box.width, hh);
      ctx.strokeRect(-hw, -hh - gap, box.width, hh);

      ctx.fillRect(-hw, gap, box.width, hh);
      ctx.strokeRect(-hw, gap, box.width, hh);
    } else {
      ctx.fillRect(-hw, -hh, box.width, box.height);
      ctx.strokeRect(-hw, -hh, box.width, box.height);
    }
    ctx.restore();

    // 2. Render Slash Hazards (Red rotating telegraphs -> Stark White/Crimson slashes!)
    for (const s of this.slashes) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);

      if (s.elapsed < s.telegraphTime) {
        const pct = s.elapsed / s.telegraphTime;
        ctx.strokeStyle =
          pct > 0.78 && Math.floor(time * 30) % 2 === 0 ? '#ffffff' : '#ff1e4d';
        ctx.lineWidth = pct > 0.8 ? 3.5 : 2;
        ctx.beginPath();
        ctx.moveTo(-s.length * 0.5, 0);
        ctx.lineTo(s.length * 0.5, 0);
        ctx.stroke();
      } else if (s.elapsed <= s.telegraphTime + s.activeTime) {
        ctx.fillStyle = s.color === '#fffffe' ? '#ffffff' : (s.color ?? '#ffffff');
        ctx.fillRect(-s.length * 0.5, -s.thickness * 0.5, s.length, s.thickness);
        ctx.fillStyle = '#ff2455';
        ctx.fillRect(-s.length * 0.5, -s.thickness * 0.18, s.length, s.thickness * 0.36);
      } else {
        const fadePct =
          1 - (s.elapsed - s.telegraphTime - s.activeTime) / Math.max(0.01, s.fadeTime);
        ctx.globalAlpha = Math.max(0, fadePct * 0.65);
        ctx.fillStyle = '#d946ef';
        ctx.fillRect(-s.length * 0.5, -s.thickness * 0.3, s.length, s.thickness * 0.6);
      }
      ctx.restore();
    }

    // 3. Render Screen Cleave Flash
    if (this.screenFlashAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.screenFlashAlpha;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 640, 480);
      ctx.restore();
    }

    // Note: Bullets & SOUL are rendered in main/ui layer so SOUL sits cleanly with bullets!
  }
}

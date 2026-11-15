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
    box.borderColor = patternId === 'roaring_final' ? 'transparent' : '#00c800';

    if (patternId === 'roaring_final') {
      // Place SOUL in lower-left outer orbit so it doesn't spawn on top of the centered Knight (yt_sd3.jpg!)
      soul.x = box.cx - 175;
      soul.y = box.cy + 95;
    } else {
      soul.x = box.cx;
      soul.y = box.cy;
    }

    if (patternId.startsWith('stars')) {
      knight.pose = 'point';
    } else if (patternId === 'roaring_final') {
      knight.pose = 'raise_sword';
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
        knight.pose = this.patternId === 'roaring_final' ? 'raise_sword' : 'slash';
        if (s.isBoxCleave || s.color === '#fffffe') {
          this.screenFlashAlpha = s.color === '#fffffe' ? 0.55 : 0.35;
        }
      }
      if (s.elapsed >= s.telegraphTime + s.activeTime + s.fadeTime) {
        this.slashes.splice(i, 1);
      }
    }

    // Gentle inward vortex pull during THE ROARING while the Knight inhales stars (yt_sd3.jpg!)
    if (this.patternId === 'roaring_final' && this.elapsed < 10.0) {
      const pullTargetX = box.cx;
      const pullTargetY = box.cy - 24;
      const dx = pullTargetX - soul.x;
      const dy = pullTargetY - soul.y;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        const pullSpd = 38;
        soul.x += (dx / d) * pullSpd * dt;
        soul.y += (dy / d) * pullSpd * dt;
      }
    }

    // Check collisions & TP grazing
    let hitOccurred = false;
    let isBoxCleaveHit = false;
    let isFinalRoaringSlashHit = false;
    let tpGained = 0;

    const grazeDistBase = 24;

    // Central Knight body hazard during full-screen Roaring inhalation
    if (this.patternId === 'roaring_final' && this.elapsed < 10.2) {
      const distToKnight = Math.hypot(soul.x - box.cx, soul.y - (box.cy - 24));
      if (distToKnight < 22 && soul.invulnTimer <= 0) {
        hitOccurred = true;
      }
    }

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
      // Decorative depth stars in The Roaring never collide
      if (b.customTag === 'bg_star') continue;
      // Hovering un-launched tracking swords outside box don't hurt during spawn fade-in
      if (b.customTag === 'tracking' && b.state === 0 && b.age < 0.25) continue;

      const dist = this.distanceToBullet(soul.x, soul.y, b);
      // Canonical detail: Drifting Stars 1..3 use forgiving core hitbox; Roaring Final stars cover full sprite!
      const isDriftingStar = b.customTag?.startsWith('star_tier_') && b.state === 0;
      const hitThreshold =
        this.patternId === 'roaring_final' && b.shape === 'star'
          ? soul.radius + b.radius * 0.96
          : isDriftingStar
            ? soul.radius + b.radius * 0.56
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
            spin: 0,
            shape: 'star',
            color: idx % 2 === 0 ? '#ffffff' : '#f5d0fe',
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
              spin: 0,
              shape: 'star',
              color: '#f5d0fe',
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
      // SWORD TUNNEL 1, 2, FINISHER, 3 (Proximity Red-Shift + Aimed Finale!)
      // ==========================================================
      case 'sword_tunnel_1':
      case 'sword_tunnel_2':
      case 'sword_tunnel_finisher':
      case 'sword_tunnel_3': {
        const isSpinningTunnel = this.patternId === 'sword_tunnel_2';
        const isFinisher = this.patternId === 'sword_tunnel_finisher';
        const isTightCornered = this.patternId === 'sword_tunnel_3';
        const hasAimedVolleyEnd =
          this.patternId === 'sword_tunnel_1' || this.patternId === 'sword_tunnel_3';

        if (isSpinningTunnel) {
          // "...Your head is spinning." — smooth counter-clockwise box & corridor twist!
          box.rotation = Math.sin(t * 0.95) * -0.2;
        } else if (isTightCornered) {
          box.rotation = Math.sin(t * 1.4) * 0.18;
        }

        const spawnRate = isFinisher ? 0.085 : 0.095;
        const cutoff = isFinisher
          ? this.duration - 2.1
          : hasAimedVolleyEnd
            ? this.duration - 1.65
            : this.duration - 0.9;

        while (t < cutoff && t >= this.stepIndex * spawnRate + 0.15) {
          const idx = this.stepIndex++;
          const st = idx * spawnRate;

          const gapHalf = isFinisher ? 25 : isTightCornered ? 24 : 28;
          const freq = isFinisher ? 3.3 : isTightCornered ? 2.8 : 2.35;
          const amp = box.height * 0.31;
          const centerOffset = Math.sin(st * freq) * amp;

          // Counter-clockwise rotating corridor angle in Sword Tunnel 2!
          const rotAngle = isSpinningTunnel
            ? -(st * 0.68)
            : isTightCornered
              ? Math.sin(st * 1.2) * 0.22
              : 0;
          const cosR = Math.cos(rotAngle);
          const sinR = Math.sin(rotAngle);

          const spawnLocalX = Math.max(box.width, box.height) * 0.5 + 30;
          const topTipY = centerOffset - gapHalf;
          const botTipY = centerOffset + gapHalf;
          const speed = isFinisher ? 235 : 198;

          // Top blade pointing inward toward corridor center
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
            color: '#f8f0ff',
            customTag: 'tunnel_sword',
            maxAge: 2.3
          });

          // Bottom blade pointing inward toward corridor center
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
            color: '#f8f0ff',
            customTag: 'tunnel_sword',
            maxAge: 2.3
          });
        }

        // Canonical End-of-Tunnel Aimed Red-Line Sword Volley (Sword Tunnel 1 & 3!)
        if (hasAimedVolleyEnd && t >= cutoff + 0.1) {
          const volleyCount = isTightCornered ? 7 : 5;
          while (this.subStepIndex < volleyCount && t >= cutoff + 0.1 + this.subStepIndex * 0.12) {
            const vIdx = this.subStepIndex++;
            const ang = (vIdx / volleyCount) * Math.PI * 2 + 0.4;
            this.spawnTrackingSword(box, soul, ang, 108, isTightCornered ? 3 : 1);
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
              thickness: 16,
              length: 280,
              telegraphTime: 0.42,
              activeTime: 0.16,
              fadeTime: 0.22,
              elapsed: 0,
              rotateSpeed: 1.1,
              hitTriggered: false,
              grazed: false,
              color: '#ffffff'
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
              thickness: 15,
              length: 320,
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
      // THE ROARING (Phase 4 Turn 3 — Full-Screen Star Inhalation + Rift Slashes! yt_sd3.jpg)
      // ==========================================================
      case 'roaring_final': {
        const inhaleCenterX = box.cx;
        const inhaleCenterY = box.cy - 24;
        knight.pose = t >= 10.2 ? 'slash' : 'raise_sword';

        // Stage 1 & 2 (0.0s .. 9.8s): Continuous Full-Screen Star Inhalation from all edges!
        if (t < 9.8) {
          const starInterval = t < 4.2 ? 0.14 : 0.17;
          while (t >= this.stepIndex * starInterval) {
            const idx = this.stepIndex++;
            // Spawn 2 active spiky pixel stars per tick from opposite/varied perimeter angles
            for (let a = 0; a < 2; a++) {
              const theta = idx * 0.67 + a * Math.PI + this.rng.range(-0.18, 0.18);
              const spawnR = 370;
              const sx = inhaleCenterX + Math.cos(theta) * spawnR;
              const sy = inhaleCenterY + Math.sin(theta) * (spawnR * 0.76);

              const dx = inhaleCenterX - sx;
              const dy = inhaleCenterY - sy;
              const d = Math.max(1, Math.hypot(dx, dy));
              const inwardSpd = this.rng.range(132, 168);
              const swirl = (idx % 2 === 0 ? 1 : -1) * 26;

              this.spawnBullet({
                x: sx,
                y: sy,
                vx: (dx / d) * inwardSpd - (dy / d) * swirl,
                vy: (dy / d) * inwardSpd + (dx / d) * swirl,
                radius: idx % 3 === 0 ? 8.5 : 7,
                spin: 0,
                shape: 'star',
                color: idx % 3 === 1 ? '#f5d0fe' : '#ffffff',
                maxAge: 4.2,
                customTag: 'inhale_star'
              });
            }

            // Faint decorative depth star (matching translucent background stars in yt_sd3.jpg!)
            if (idx % 2 === 0) {
              const bgAng = idx * 1.13;
              const bgSx = inhaleCenterX + Math.cos(bgAng) * 340;
              const bgSy = inhaleCenterY + Math.sin(bgAng) * 260;
              const bdx = inhaleCenterX - bgSx;
              const bdy = inhaleCenterY - bgSy;
              const bd = Math.max(1, Math.hypot(bdx, bdy));
              this.spawnBullet({
                x: bgSx,
                y: bgSy,
                vx: (bdx / bd) * 95,
                vy: (bdy / bd) * 95,
                radius: 6,
                spin: 0,
                shape: 'star',
                color: '#d8b4fe',
                maxAge: 4.2,
                customTag: 'bg_star'
              });
            }
          }

          // Stage 2 (3.8s .. 9.6s): Diagonal Crimson-Glowing Black Rift Slashes across the center! (yt_sd3.jpg)
          if (t >= 3.8 && t < 9.6) {
            const slashInterval = 0.72;
            const stage2Elapsed = t - 3.8;
            while (stage2Elapsed >= this.subStepIndex * slashInterval) {
              const sIdx = this.subStepIndex++;
              // Diagonal rift slashes cutting across the Knight & SOUL orbit (just like yt_sd3.jpg!)
              const angles = [1.12, -1.08, 0.65, -0.58, 1.32, -1.24, 0.35, -0.88];
              const ox =
                sIdx % 2 === 0
                  ? inhaleCenterX + Math.sin(sIdx * 1.7) * 36
                  : soul.x * 0.6 + inhaleCenterX * 0.4;
              const oy =
                sIdx % 2 === 0
                  ? inhaleCenterY + Math.cos(sIdx * 1.3) * 24
                  : soul.y * 0.6 + inhaleCenterY * 0.4;

              this.slashes.push({
                x: ox,
                y: oy,
                angle: angles[sIdx % angles.length],
                thickness: 22,
                length: 680,
                telegraphTime: 0.56,
                activeTime: 0.22,
                fadeTime: 0.28,
                elapsed: 0,
                rotateSpeed: sIdx % 2 === 0 ? 0.35 : -0.35,
                hitTriggered: false,
                grazed: false,
                color: '#ffffff'
              });
            }
          }
        } else if (t >= 10.2 && !this.finalRoaringSlashActive) {
          // Stage 3 (10.2s .. 14.2s): Stop inhaling & unleash THE COLOSSAL CENTER RIFT CLEAVE!
          // Leaves the far-left (x < 185) and far-right (x > 455) edges safe (just like Merg's dodge!),
          // and clamps living party members at 1 HP if hit!
          this.finalRoaringSlashActive = true;
          this.bullets = [];
          this.slashes.push({
            x: box.cx,
            y: box.cy,
            angle: Math.PI / 2 - 0.06,
            thickness: 240,
            length: 720,
            telegraphTime: 1.35,
            activeTime: 0.55,
            fadeTime: 0.9,
            elapsed: 0,
            rotateSpeed: 0,
            hitTriggered: false,
            grazed: false,
            color: '#fffffe' // Sentinel color for Canonical Final 75-dmg Slash!
          });
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

      // Star Reversal & Detonation Logic (Stars 1..3)
      if (b.customTag && b.customTag.startsWith('star_tier_')) {
        const shardCount = Number(b.customTag.split('_')[2] || 4);
        if (b.state === 0 && b.age >= (b.stateTimer ?? 1.2)) {
          // Turn bright red & briefly decelerate/reverse before bursting!
          b.state = 1;
          b.vx = -b.vx * 0.42;
          b.vy = -b.vy * 0.42;
          b.color = '#ff2044';
          b.stateTimer = b.age + 0.46;
        } else if (b.state === 1 && b.age >= (b.stateTimer ?? 1.7)) {
          // Detonate into diagonal/upward diamond shrapnel!
          for (let s = 0; s < shardCount; s++) {
            const ang = (s / shardCount) * Math.PI * 2 + Math.PI * 0.25;
            const spd = s % 2 === 0 ? 128 : 90;
            this.spawnBullet({
              x: b.x,
              y: b.y,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd - 14,
              radius: 4.5,
              angle: ang,
              spin: 0,
              shape: 'diamond',
              color: '#ff2855',
              maxAge: 2.8
            });
          }
          this.bullets.splice(i, 1);
          continue;
        }
      }

      // Roaring Final Inhaled Stars: vanish cleanly when absorbed into the Knight's center!
      if (b.customTag === 'inhale_star' || b.customTag === 'bg_star') {
        const distToKnight = Math.hypot(b.x - box.cx, b.y - (box.cy - 24));
        if (distToKnight < 22) {
          this.bullets.splice(i, 1);
          continue;
        }
      }

      // Sword Tunnel Proximity Red-Shift (blades glow crimson when within 44px of the SOUL!)
      if (b.customTag === 'tunnel_sword') {
        const dToSoul = this.distanceToBullet(soul.x, soul.y, b);
        b.color = dToSoul < 44 ? '#ff2448' : '#f8f0ff';
      }

      // Tracking Sword State Machine (smooth white -> pink -> crimson color shift!)
      if (b.customTag === 'tracking') {
        const tier = b.targetY ?? 1;
        if (b.state === 0) {
          // Smoothly shadow the SOUL's movement and aim at SOUL!
          const orbitAng = b.targetX ?? 0;
          const desiredX = soul.x * 0.42 + box.cx * 0.58 + Math.cos(orbitAng) * 96;
          const desiredY = soul.y * 0.42 + box.cy * 0.58 + Math.sin(orbitAng) * 90;
          b.x += (desiredX - b.x) * Math.min(1, dt * 6.5);
          b.y += (desiredY - b.y) * Math.min(1, dt * 6.5);
          b.angle = Math.atan2(soul.y - b.y, soul.x - b.x);

          // Gradual white -> rose -> crimson color transition while tracking!
          const lockRatio = Math.min(1, b.age / Math.max(0.1, b.stateTimer ?? 0.6));
          const gChannel = Math.round(255 * (1 - lockRatio * 0.85));
          const bChannel = Math.round(255 * (1 - lockRatio * 0.76));
          b.color = `rgb(255, ${gChannel}, ${bChannel})`;

          if (b.age >= (b.stateTimer ?? 0.6)) {
            b.state = 1; // Lock on!
            b.color = '#ff1e3c';
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
    _soul: SoulState,
    time: number
  ): void {
    // 1. Render Battle Box (completely borderless full-screen during THE ROARING — matching yt_sd3.jpg!)
    if (this.patternId !== 'roaring_final') {
      ctx.save();
      ctx.translate(box.cx, box.cy);
      ctx.rotate(box.rotation);

      const hw = box.width * 0.5;
      const hh = box.height * 0.5;
      const gap = box.splitGap * 0.5;

      // Iconic Deltarune expanding wireframe echo rings when the Bullet Board zooms in!
      if (Math.abs(box.targetWidth - box.width) > 4) {
        for (let e = 1; e <= 3; e++) {
          const s = 1 - e * 0.16;
          if (s <= 0.1) continue;
          ctx.save();
          ctx.globalAlpha = 0.35 / e;
          ctx.strokeStyle = box.borderColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(-hw * s, -hh * s, box.width * s, box.height * s);
          ctx.restore();
        }
      }

      ctx.fillStyle = '#000000';
      ctx.strokeStyle = box.borderColor;
      ctx.lineWidth = 4;

      if (box.splitAxis === 'vertical' && gap > 0.5) {
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
        // Subtle purple Dark/Star aura inside the board when the Knight points in Stars 1..3!
        if (this.patternId.startsWith('stars')) {
          ctx.fillStyle = 'rgba(105, 24, 155, 0.16)';
          ctx.fillRect(-hw, -hh, box.width, box.height);
        }
        ctx.strokeRect(-hw, -hh, box.width, box.height);
      }
      ctx.restore();
    }

    // 2. Render Slash Hazards (Crimson-Glowing Pitch-Black Razor Rifts matching yt_sd3.jpg!)
    for (const s of this.slashes) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);

      if (s.elapsed < s.telegraphTime) {
        const pct = s.elapsed / s.telegraphTime;
        // Wide danger zone preview for the colossal center Roaring cleave!
        if (s.thickness >= 100) {
          ctx.fillStyle = `rgba(220, 16, 44, ${0.12 + pct * 0.24})`;
          ctx.fillRect(-s.length * 0.5, -s.thickness * 0.46, s.length, s.thickness * 0.92);
          ctx.strokeStyle = pct > 0.8 && Math.floor(time * 30) % 2 === 0 ? '#ffffff' : '#ff1e42';
          ctx.lineWidth = 3;
          ctx.strokeRect(-s.length * 0.5, -s.thickness * 0.46, s.length, s.thickness * 0.92);
        }

        ctx.strokeStyle =
          pct > 0.78 && Math.floor(time * 30) % 2 === 0 ? '#ffffff' : '#ff1a3c';
        ctx.lineWidth = pct > 0.8 ? 3.5 : 2;
        ctx.beginPath();
        ctx.moveTo(-s.length * 0.5, 0);
        ctx.lineTo(s.length * 0.5, 0);
        ctx.stroke();
      } else if (s.elapsed <= s.telegraphTime + s.activeTime) {
        const activeAge = s.elapsed - s.telegraphTime;
        // Initial 35ms blinding white flash, then iconic crimson-bordered pitch-black rift (yt_sd3.jpg!)
        if (activeAge < 0.035) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-s.length * 0.5, -s.thickness * 0.7, s.length, s.thickness * 1.4);
        } else {
          // Outer soft crimson glow band
          ctx.fillStyle = 'rgba(175, 10, 28, 0.44)';
          ctx.fillRect(-s.length * 0.5, -s.thickness * 1.25, s.length, s.thickness * 2.5);
          // Mid vivid red glow band
          ctx.fillStyle = 'rgba(235, 24, 46, 0.82)';
          ctx.fillRect(-s.length * 0.5, -s.thickness * 0.78, s.length, s.thickness * 1.56);
          // Inner hot scarlet edge
          ctx.fillStyle = '#ff3850';
          ctx.fillRect(-s.length * 0.5, -s.thickness * 0.45, s.length, s.thickness * 0.9);
          // Pitch-black #000000 razor rift core right down the middle!
          ctx.fillStyle = '#000000';
          ctx.fillRect(-s.length * 0.5, -s.thickness * 0.22, s.length, s.thickness * 0.44);
        }
      } else {
        const fadePct =
          1 - (s.elapsed - s.telegraphTime - s.activeTime) / Math.max(0.01, s.fadeTime);
        ctx.globalAlpha = Math.max(0, fadePct * 0.72);
        ctx.fillStyle = '#b91c3c';
        ctx.fillRect(-s.length * 0.5, -s.thickness * 0.5, s.length, s.thickness);
        ctx.fillStyle = '#000000';
        ctx.fillRect(-s.length * 0.5, -s.thickness * 0.16, s.length, s.thickness * 0.32);
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
  }
}

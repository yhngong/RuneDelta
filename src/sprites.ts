import { hasShadowMantle } from './combat';
import { KNIGHT_SPRITE_FRAMES } from './knightSpriteData';
import { Bullet, KnightState, PartyMember } from './types';

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawPixelMatrix(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rows: string[],
  palette: Record<string, string>
): void {
  const ox = Math.round(x);
  const oy = Math.round(y);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + c * scale, oy + r * scale, scale, scale);
    }
  }
}

export function drawSoulHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
  color = '#ff0000',
  grazeRingAlpha = 0
): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));

  // Authentic Deltarune white/pink pixel TP graze outline around the SOUL!
  if (grazeRingAlpha > 0.01) {
    const a = Math.min(1, grazeRingAlpha);
    const grazeRows = [
      '  xxxx    xxxx  ',
      ' x....x  x....x ',
      'x......xx......x',
      'x..............x',
      'x..............x',
      'x..............x',
      ' x............x ',
      '  x..........x  ',
      '   x........x   ',
      '    x......x    ',
      '     x....x     ',
      '      x..x      ',
      '       xx       '
    ];
    ctx.save();
    ctx.globalAlpha = a;
    const gs = scale * 1.65;
    drawPixelMatrix(ctx, -8 * gs, -6.5 * gs, Math.max(1, Math.round(gs)), grazeRows, {
      x: '#ffffff'
    });
    ctx.restore();
  }

  const rows = [
    '  xxxx    xxxx  ',
    ' xxxxxx  xxxxxx ',
    'xxxxxxxxxxxxxxxx',
    'xxxxxxxxxxxxxxxx',
    'xxxxxxxxxxxxxxxx',
    'xxxxxxxxxxxxxxxx',
    ' xxxxxxxxxxxxxx ',
    '  xxxxxxxxxxxx  ',
    '   xxxxxxxxxx   ',
    '    xxxxxxxx    ',
    '     xxxxxx     ',
    '      xxxx      ',
    '       xx       '
  ];
  ctx.fillStyle = color;
  const s = scale;
  const ox = -8 * s;
  const oy = -6.5 * s;
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r];
    for (let c = 0; c < line.length; c++) {
      if (line[c] === 'x') {
        ctx.fillRect(ox + c * s, oy + r * s, Math.ceil(s), Math.ceil(s));
      }
    }
  }
  ctx.restore();
}

export function drawBrokenSoul(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  elapsed: number
): void {
  if (elapsed < 0.75) {
    ctx.save();
    const split = elapsed > 0.25 ? 4 : 0;
    ctx.beginPath();
    ctx.rect(x - 40, y - 30, 39, 60);
    ctx.clip();
    drawSoulHeart(ctx, x - split, y, 1.25, '#ff0000');
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 1, y - 30, 41, 60);
    ctx.clip();
    drawSoulHeart(ctx, x + split, y + 1, 1.25, '#ff0000');
    ctx.restore();
  } else {
    const t = elapsed - 0.75;
    const angles = [-2.4, -1.9, -1.2, -0.7, -0.3, -2.8];
    const speeds = [110, 145, 130, 150, 115, 95];
    ctx.fillStyle = '#ff0000';
    for (let i = 0; i < 6; i++) {
      const vx = Math.cos(angles[i]) * speeds[i];
      const vy = Math.sin(angles[i]) * speeds[i];
      const sx = x + vx * t;
      const sy = y + vy * t + 0.5 * 340 * t * t;
      const rot = t * (i % 2 === 0 ? 9 : -9);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      ctx.fillRect(-3, -2, 6, 4);
      ctx.fillRect(-1, -4, 3, 2);
      ctx.restore();
    }
  }
}

// ============================================================================
// AUTHENTIC DELTARUNE HUD CHARACTER HEADSHOT PORTRAITS (13x12 @ 2px = 26x24)
// ============================================================================
export function drawMemberPortrait(
  ctx: CanvasRenderingContext2D,
  member: PartyMember,
  x: number,
  y: number
): void {
  const down = member.status !== 'UP';
  const hurt = member.hurtFlash > 0 || down;

  if (member.id === 'kris') {
    const rows = [
      '...hhhhhhh...',
      '..hhhhhhhhh..',
      '.hhhhhhhhhhh.',
      '.hhhhhhhhhhh.',
      '.hhhssssshhh.',
      '.hhssssssshh.',
      '..sssssssss..',
      '..sssmmmsss..',
      '...sssssss...',
      '..ppppppppp..',
      '.ppppppppppp.'
    ];
    drawPixelMatrix(ctx, x, y, 2, rows, {
      h: down ? '#1a2442' : '#0b1838',
      s: down ? '#185b8a' : '#00c8ff',
      m: hurt ? '#0b1838' : '#0088bb',
      p: down ? '#6e1c4a' : '#ff2a85'
    });
  } else if (member.id === 'susie') {
    const rows = [
      '..hhhhhhhh...',
      '.hhhhhhhhhh..',
      '.hhhhssshhh..',
      'hhhhseyepsss.',
      'hhhssssssssss',
      'hhhssssssssss',
      '.hhsssswwwss.',
      '.hhssssssss..',
      '..hhhssss....',
      '..jjjjjjjj...',
      '.jjjjyyyyjj..'
    ];
    drawPixelMatrix(ctx, x, y, 2, rows, {
      h: down ? '#270b29' : '#420c3d',
      s: down ? '#6d2966' : '#d252b6',
      e: member.status === 'SWOON' ? '#ff1e42' : '#1a051d',
      y: member.status === 'SWOON' ? '#ff1e42' : '#ffe642',
      p: down ? '#6d2966' : '#d252b6',
      w: hurt ? '#1a051d' : '#ffffff',
      j: '#3c1347',
      // collar
    });
  } else {
    // Hatless Ralsei headshot (pink horns, white fluff, green glasses, magenta scarf)
    const rows = [
      '..pp.....pp..',
      '..pp.www.pp..',
      '...wwwwwww...',
      '..wwwwwwwww..',
      '.wwgggggggww.',
      'wwwg.wgw.gwww',
      'wwwgggggggwww',
      '.wwwwwwwwwww.',
      '..wwwwwwwww..',
      '..sssssssss..',
      '.ggggggggggg.'
    ];
    drawPixelMatrix(ctx, x, y, 2, rows, {
      p: down ? '#8f3d62' : '#ff70a6',
      w: down ? '#8e96ab' : '#ffffff',
      g: down ? '#256e46' : '#35eb75',
      s: down ? '#8a1e52' : '#ff2a85'
    });
  }

  // Stark red slash across SWOONed portrait!
  if (member.status === 'SWOON') {
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 20);
    ctx.lineTo(x + 24, y + 3);
    ctx.stroke();
  }
}

// ============================================================================
// AUTHENTIC DELTARUNE 5 PIXEL-ART ACTION ICONS (FIGHT, ACT/MAGIC, ITEM, SPARE, DEFEND)
// ============================================================================
export function drawCommandIcon(
  ctx: CanvasRenderingContext2D,
  kind: 'FIGHT' | 'ACT' | 'MAGIC' | 'ITEM' | 'SPARE' | 'DEFEND',
  x: number,
  y: number,
  selected: boolean
): void {
  // Button frame (31x24) matching Deltarune's orange/yellow command boxes!
  const borderCol = selected ? '#ffff00' : '#eb7d22';
  const iconCol = selected ? '#ffff00' : '#eb7d22';

  px(ctx, x, y, 31, 24, '#000000');
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(x) + 1, Math.round(y) + 1, 29, 22);

  let glyph: string[] = [];
  if (kind === 'FIGHT') {
    glyph = [
      '........xx',
      '.......xxx',
      '......xxx.',
      '.....xxx..',
      '.x..xxx...',
      '..xxxx....',
      '..xxx.....',
      '.xx.xx....',
      'xx...x....'
    ];
  } else if (kind === 'ACT') {
    // Deltarune's ACT speech/wave icon
    glyph = [
      '....xx....',
      '..xx..xx..',
      '.x..xx..x.',
      '.x.x..x.x.',
      '.x..xx..x.',
      '..xx..xx..',
      '....xx..x.',
      '.......xx.',
      '......xx..'
    ];
  } else if (kind === 'MAGIC') {
    // Deltarune's MAGIC flame/starburst icon
    glyph = [
      '....x.....',
      '...xxx....',
      '..xx.xx.x.',
      '.xx...xxx.',
      '.xx.x..xx.',
      '.xx.xx.xx.',
      '..xxxxxx..',
      '...xxxx...',
      '....xx....'
    ];
  } else if (kind === 'ITEM') {
    // Deltarune's ITEM tied pouch icon
    glyph = [
      '...xxxx...',
      '....xx....',
      '..xxxxxx..',
      '.xxxxxxxx.',
      '.xxx..xxx.',
      '.xx....xx.',
      '.xxx..xxx.',
      '..xxxxxx..',
      '...xxxx...'
    ];
  } else if (kind === 'SPARE') {
    // SPARE X-icon (dimmed/crossed since The Roaring Knight cannot be spared!)
    glyph = [
      '.xx....xx.',
      '..xx..xx..',
      '...xxxx...',
      '....xx....',
      '...xxxx...',
      '..xx..xx..',
      '.xx....xx.',
      '..........',
      '.xxxxxxxx.'
    ];
  } else {
    // DEFEND shield icon
    glyph = [
      '.xxxxxxxx.',
      'xxxxxxxxxx',
      'xx..xx..xx',
      'xx..xx..xx',
      '.xx.xx.xx.',
      '.xxxxxxxx.',
      '..xxxxxx..',
      '...xxxx...',
      '....xx....'
    ];
  }

  const finalColor =
    kind === 'SPARE' ? (selected ? '#ff5566' : '#803c46') : iconCol;
  drawPixelMatrix(ctx, x + 6, y + 3, 2, glyph, { x: finalColor });
}

// ============================================================================
// PARTY BATTLE SPRITES (Crisp Pixel-Snapped Dark World Sprites)
// ============================================================================
export function drawPartyMemberSprite(
  ctx: CanvasRenderingContext2D,
  member: PartyMember,
  x: number,
  y: number,
  time: number
): void {
  ctx.save();
  const idleStep = Math.floor(time * 3.5) % 2;
  const bob = member.status === 'UP' ? idleStep * -2 : 0;
  const hurtShake = member.hurtFlash > 0 ? (Math.random() - 0.5) * 6 : 0;
  const lunge =
    member.pose === 'attack' || member.pose === 'magic'
      ? Math.sin(Math.min(1, member.poseTimer * 4) * Math.PI) * 24
      : 0;

  ctx.translate(Math.round(x + hurtShake + lunge), Math.round(y + bob));

  // Shadow on snow
  ctx.fillStyle = 'rgba(20, 32, 62, 0.55)';
  ctx.fillRect(-18, 28, 36, 6);

  // Subtle dark-mantle shimmer on whoever wears ShadowMantle
  if (hasShadowMantle(member) && member.status === 'UP') {
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(time * 5) * 0.1;
    ctx.strokeStyle = '#11071f';
    ctx.lineWidth = 4;
    ctx.strokeRect(-18, -28, 36, 56);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-19, -29, 38, 58);
    ctx.restore();
  }

  const flashWhite =
    member.hurtFlash > 0 && Math.floor(member.hurtFlash * 24) % 2 === 0;

  if (member.status !== 'UP') {
    if (member.id === 'kris') {
      // Kris kneeling on one knee (DOWN)
      px(ctx, -14, 6, 28, 22, '#000000');
      px(ctx, -12, 8, 24, 18, '#5a729c');
      px(ctx, -10, -6, 20, 14, '#0b1838');
      px(ctx, -8, 0, 16, 8, '#00c8ff');
      px(ctx, -20, 6, 14, 6, '#ff2a85');
    } else if (member.id === 'susie') {
      // Susie collapsed flat on snow (SWOON)
      px(ctx, -24, 12, 46, 18, '#000000');
      px(ctx, -22, 14, 42, 14, '#3e124d');
      px(ctx, -12, 6, 22, 12, '#cc52b8');
      px(ctx, -20, 4, 18, 12, '#3b0938');
    } else {
      // Ralsei collapsed pile of green robe + scarf + glasses (iconic Deltarune KO!)
      px(ctx, -18, 14, 36, 16, '#000000');
      px(ctx, -16, 16, 32, 12, '#12b868');
      px(ctx, -12, 12, 24, 6, '#ff2e93');
      px(ctx, 10, 20, 8, 5, '#47ff88');
    }
    ctx.restore();
    return;
  }

  if (member.id === 'kris') {
    const scarfLift = idleStep * 2;
    // Black pixel outline backing
    px(ctx, -12, -24, 24, 52, '#000000');
    // Fluttering pink/magenta cape-scarf
    px(ctx, -26, -6 + scarfLift, 16, 8, '#000000');
    px(ctx, -24, -4 + scarfLift, 14, 5, '#ff2a85');
    // Dark boots & legs
    px(ctx, -9, 16, 7, 12, '#1c2442');
    px(ctx, 2, 16, 7, 12, '#1c2442');
    px(ctx, -9, 24, 8, 4, '#9cb4d8');
    px(ctx, 2, 24, 8, 4, '#9cb4d8');
    // Silver Dark World armor & pauldrons
    px(ctx, -10, -4, 20, 20, flashWhite ? '#ffffff' : '#9cb4d8');
    px(ctx, -7, -1, 14, 14, '#526b96');
    px(ctx, -14, -6, 7, 8, '#d4e4ff');
    px(ctx, 7, -6, 7, 8, '#d4e4ff');
    px(ctx, -10, -6, 20, 4, '#ff2a85'); // scarf wrap
    // Cyan face & navy hair covering eyes
    px(ctx, -8, -20, 16, 14, flashWhite ? '#ffffff' : '#00c8ff');
    px(ctx, -10, -23, 20, 11, '#0b1636');
    px(ctx, -8, -12, 15, 4, '#0b1636');

    if (member.defending) {
      // Kris's iconic Dark World knight shield!
      px(ctx, 8, -14, 10, 32, '#000000');
      px(ctx, 10, -12, 6, 28, '#9cb4d8');
      px(ctx, 12, -10, 4, 24, '#00f0ff');
    } else {
      // Saber10 / Pink-Cyan Dark World Blade held behind/ready
      ctx.save();
      ctx.translate(10, 4);
      ctx.rotate(member.pose === 'attack' ? 0.45 : -0.62);
      px(ctx, -3, -30, 6, 34, '#000000');
      px(ctx, -3, -4, 6, 6, '#ffd166');
      px(ctx, -1, -28, 4, 24, '#ff3ca8');
      px(ctx, 1, -28, 2, 24, '#9efcff');
      ctx.restore();
    }
  } else if (member.id === 'susie') {
    px(ctx, -15, -28, 30, 56, '#000000');
    // Boots & pants
    px(ctx, -12, 14, 10, 14, '#241433');
    px(ctx, 3, 14, 10, 14, '#241433');
    // Spiked dark plum vest & magenta shirt + gold buckle
    px(ctx, -13, -8, 26, 22, flashWhite ? '#ffffff' : '#3d1042');
    px(ctx, -5, -6, 12, 18, '#90298c');
    px(ctx, -13, 10, 26, 4, '#f4c430');
    px(ctx, -16, -8, 5, 6, '#f4c430');
    px(ctx, 11, -8, 5, 6, '#f4c430');
    // Head, snout, grin & wild hair
    px(ctx, -9, -24, 21, 16, flashWhite ? '#ffffff' : '#cc52b8');
    px(ctx, 6, -19, 10, 10, '#000000');
    px(ctx, 6, -18, 9, 8, '#cc52b8');
    px(ctx, 8, -12, 5, 2, '#ffffff');
    px(ctx, -16, -27, 24, 15, '#360836');
    px(ctx, -19, -18 + idleStep * 2, 10, 15, '#360836');
    px(ctx, 4, -20, 4, 3, '#ffe642');

    // ToxicAxe resting on shoulder or swinging!
    ctx.save();
    ctx.translate(6, -4);
    ctx.rotate(member.pose === 'attack' || member.pose === 'magic' ? 0.6 : -0.92);
    px(ctx, -3, -28, 6, 36, '#000000');
    px(ctx, -2, -26, 4, 34, '#8a5229');
    px(ctx, -13, -32, 24, 16, '#000000');
    px(ctx, -11, -30, 20, 12, '#b829a7');
    px(ctx, 5, -31, 6, 14, '#5affb0');
    ctx.restore();
  } else {
    // Hatless Chapter 3 Ralsei
    px(ctx, -13, -24, 26, 52, '#000000');
    px(ctx, -8, 22, 6, 6, '#ffffff');
    px(ctx, 2, 22, 6, 6, '#ffffff');
    // Green coat with black heart
    px(ctx, -11, -2, 22, 24, flashWhite ? '#ffffff' : '#12b868');
    px(ctx, -3, 6, 6, 6, '#000000');
    // Magenta FlexScarf
    px(ctx, -12, -6, 24, 6, '#ff2e93');
    px(ctx, -24, -5 + idleStep * 2, 13, 6, '#000000');
    px(ctx, -23, -4 + idleStep * 2, 12, 4, '#ff2e93');
    // White goat head, floppy ears & pink horns
    px(ctx, -10, -21, 20, 15, flashWhite ? '#ffffff' : '#ffffff');
    px(ctx, -14, -17, 4, 10, '#e5e9f5');
    px(ctx, 10, -17, 4, 10, '#e5e9f5');
    px(ctx, -7, -27, 4, 6, '#ff70a6');
    px(ctx, 3, -27, 4, 6, '#ff70a6');
    // Round green glasses
    px(ctx, -6, -15, 6, 5, '#35eb75');
    px(ctx, 2, -15, 6, 5, '#35eb75');
    px(ctx, -4, -14, 2, 3, '#0b2918');
    px(ctx, 4, -14, 2, 3, '#0b2918');

    if (member.defending) {
      px(ctx, -13, -8, 26, 22, '#ff2e93');
      px(ctx, -10, -5, 20, 16, '#ff77bd');
    }
  }

  ctx.restore();
}

// ============================================================================
// THE ROARING KNIGHT — EXACT 68x65 PIXEL SPRITE (FROM Roaring_Knight_Idle.webp)
// ============================================================================
const knightBitmapCache = new Map<string, HTMLCanvasElement>();

function getKnightBitmap(
  frameKey: string,
  variant: 'normal' | 'ghost' | 'hurt'
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cacheKey = `${frameKey}_${variant}`;
  const cached = knightBitmapCache.get(cacheKey);
  if (cached) return cached;

  const rows = KNIGHT_SPRITE_FRAMES[frameKey] ?? KNIGHT_SPRITE_FRAMES.idle;
  const h = rows.length;
  const w = rows[0]?.length ?? 68;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  if (!octx) return null;

  for (let r = 0; r < h; r++) {
    const line = rows[r];
    for (let c = 0; c < w; c++) {
      const ch = line[c];
      if (ch === '.') continue;
      if (ch === 'W') {
        octx.fillStyle = '#ffffff';
      } else {
        octx.fillStyle =
          variant === 'hurt'
            ? '#525266'
            : variant === 'ghost'
              ? 'rgba(0, 0, 0, 0.35)'
              : '#000000';
      }
      octx.fillRect(c, r, 1, 1);
    }
  }

  knightBitmapCache.set(cacheKey, off);
  return off;
}

export function drawRoaringKnight(
  ctx: CanvasRenderingContext2D,
  knight: KnightState,
  x: number,
  y: number,
  time: number
): void {
  const frameKey =
    knight.pose === 'point'
      ? 'point'
      : knight.pose === 'raise_sword'
        ? 'raise_sword'
        : knight.pose === 'slash'
          ? 'slash'
          : knight.pose === 'roar'
            ? 'roar'
            : 'idle';

  // 1. Monochrome white-outline ghost afterimages trailing behind the exact 68x65 sprite!
  for (let i = 3; i >= 1; i--) {
    const lag = i * 0.12;
    const ax = x + Math.sin((time - lag) * 2.1) * 6 + i * 5;
    const ay = y + Math.sin((time - lag) * 3.2) * 7;
    ctx.save();
    ctx.globalAlpha = 0.24 / i;
    drawKnightPixelSprite(ctx, frameKey, 'ghost', ax, ay, knight, time - lag, true);
    ctx.restore();
  }

  const shakeX = knight.shakeTimer > 0 ? (Math.random() - 0.5) * 10 : 0;
  const hoverX = Math.sin(time * 2.1) * 4 + shakeX;
  const hoverY = Math.sin(time * 3.2) * 6;

  // Dark shadow pool on the snowy ground directly under the vertical needle-leg (gx = 41)
  if (knight.pose !== 'roar') {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.ellipse(x + hoverX + 4, y + 76, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const isHurtFlash =
    knight.pose === 'hurt' && Math.floor(time * 30) % 2 === 0;
  drawKnightPixelSprite(
    ctx,
    frameKey,
    isHurtFlash ? 'hurt' : 'normal',
    x + hoverX,
    y + hoverY,
    knight,
    time,
    false
  );
}

function drawKnightPixelSprite(
  ctx: CanvasRenderingContext2D,
  frameKey: string,
  variant: 'normal' | 'ghost' | 'hurt',
  x: number,
  y: number,
  knight: KnightState,
  time: number,
  isAfterimage: boolean
): void {
  const scale = 2; // Exact Deltarune 2x pixel scale (68x65 -> 136x130 on 640x480)
  const anchorGx = 39;
  const anchorGy = 32;
  const drawX = Math.round(x - anchorGx * scale);
  const drawY = Math.round(y - anchorGy * scale);

  // Rising dark fountain pixel motes behind torso
  if (!isAfterimage) {
    for (let i = 0; i < 4; i++) {
      const p = (time * 1.3 + i * 0.25) % 1;
      const mx = Math.round(x + Math.sin(time * 3 + i * 2.1) * 14);
      const my = Math.round(y - 12 - p * 44);
      const sz = p < 0.5 ? 4 : 2;
      px(ctx, mx - 2, my - 2, sz + 4, sz + 4, '#ffffff');
      px(ctx, mx, my, sz, sz, '#000000');
    }
  }

  const bmp = getKnightBitmap(frameKey, variant);
  if (bmp) {
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, drawX, drawY, bmp.width * scale, bmp.height * scale);
    ctx.imageSmoothingEnabled = prevSmooth;
  } else {
    const rows = KNIGHT_SPRITE_FRAMES[frameKey] ?? KNIGHT_SPRITE_FRAMES.idle;
    drawPixelMatrix(ctx, drawX, drawY, scale, rows, {
      W: '#ffffff',
      B: variant === 'hurt' ? '#525266' : '#000000'
    });
  }

  if (!isAfterimage) {
    // Glowing star spark at fingertip during Stars 'point' pose
    if (frameKey === 'point') {
      const pulse = Math.floor(time * 16) % 2 === 0 ? '#ffffff' : '#e879f9';
      px(ctx, drawX + 6 * scale, drawY + 23 * scale, 6, 6, pulse);
      px(ctx, drawX + 7 * scale, drawY + 21 * scale, 2, 10, '#ffffff');
      px(ctx, drawX + 4 * scale, drawY + 24 * scale, 10, 2, '#ffffff');
    }

    // Fractured crimson crack on visor & Black Blade once Phase 4 is survived!
    if (knight.phase4Completed || knight.pose === 'cracked') {
      px(ctx, drawX + 35 * scale, drawY + 15 * scale, 2, 4, '#ff1744');
      px(ctx, drawX + 36 * scale, drawY + 17 * scale, 2, 6, '#ff1744');
      if (frameKey === 'idle' || frameKey === 'point') {
        px(ctx, drawX + 14 * scale, drawY + 32 * scale, 2, 6, '#ff1744');
        px(ctx, drawX + 15 * scale, drawY + 35 * scale, 2, 6, '#ff1744');
      }
    }
  }
}

// ============================================================================
// DIAGONAL SLASH ANIMATION ON ENEMY WHEN PARTY STRIKES
// ============================================================================
export function drawAttackSlashEffect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number, // 0..1
  color: string,
  isCrit: boolean
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.62);
  const len = 118;
  const start = -len * 0.5 + len * Math.max(0, progress - 0.45);
  const end = -len * 0.5 + len * Math.min(1, progress * 1.55);
  const width = (1 - progress) * (isCrit ? 14 : 9);

  if (end > start && width > 0.5) {
    ctx.fillStyle = color;
    ctx.fillRect(start, -width * 0.5, end - start, width);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(start, -width * 0.22, end - start, width * 0.44);
  }
  ctx.restore();
}

export function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet): void {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);

  switch (b.shape) {
    case 'star': {
      const rOuter = b.radius * 1.45;
      const rInner = b.radius * 0.52;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const rad = i % 2 === 0 ? rOuter : rInner;
        const a = (i * Math.PI) / 6;
        const bx = Math.cos(a) * rad;
        const by = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = b.coreColor ?? '#000000';
      ctx.beginPath();
      ctx.arc(0, 0, b.radius * 0.36, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'shard': {
      const r = b.radius * 1.3;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(0, r * 0.55);
      ctx.lineTo(-r, 0);
      ctx.lineTo(0, -r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-1.5, -1.5, 3, 3);
      break;
    }

    case 'diamond': {
      const rx = b.radius * 1.5;
      const ry = b.radius * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(0, ry);
      ctx.lineTo(-rx, 0);
      ctx.lineTo(0, -ry);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }

    case 'sword':
    case 'dagger': {
      const len = b.length ?? (b.shape === 'sword' ? 36 : 22);
      const wid = b.width ?? (b.shape === 'sword' ? 7 : 5);

      if (b.state === 1 && b.customTag === 'tracking') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 32, 64, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(len * 0.5, 0);
        ctx.lineTo(260, 0);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = '#000000';
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(len * 0.55, 0);
      ctx.lineTo(len * 0.2, wid * 0.55);
      ctx.lineTo(-len * 0.35, wid * 0.45);
      ctx.lineTo(-len * 0.35, -wid * 0.45);
      ctx.lineTo(len * 0.2, -wid * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = b.color;
      ctx.fillRect(-len * 0.38, -wid * 1.1, 3, wid * 2.2);
      ctx.fillRect(-len * 0.52, -2, len * 0.15, 4);
      break;
    }

    case 'beam_orb': {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, b.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

import { hasShadowMantle } from './combat';
import { Bullet, KnightState, PartyMember } from './types';

function pxRect(
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

export function drawSoulHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
  color = '#ff0022',
  grazeRingAlpha = 0
): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));

  // Deltarune white TP graze outline when grazing bullets!
  if (grazeRingAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, grazeRingAlpha);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 17 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffbdf7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 21 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Authentic 16x16 pixel heart grid centered at (0,0)
  const s = scale;
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
    // Cracked in two halves
    ctx.save();
    const split = elapsed > 0.25 ? 4 : 0;
    ctx.beginPath();
    ctx.rect(x - 40, y - 30, 39, 60);
    ctx.clip();
    drawSoulHeart(ctx, x - split, y, 1.25, '#ff0022');
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 1, y - 30, 41, 60);
    ctx.clip();
    drawSoulHeart(ctx, x + split, y + 1, 1.25, '#ff0022');
    ctx.restore();
  } else {
    // 6 bouncing pixel shards
    const t = elapsed - 0.75;
    const angles = [-2.4, -1.9, -1.2, -0.7, -0.3, -2.8];
    const speeds = [110, 145, 130, 150, 115, 95];
    ctx.fillStyle = '#ff1133';
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

export function drawPartyMemberSprite(
  ctx: CanvasRenderingContext2D,
  member: PartyMember,
  x: number,
  y: number,
  time: number
): void {
  ctx.save();
  const bob = member.status === 'UP' ? Math.sin(time * 4 + (member.id === 'susie' ? 1 : 2)) * 2 : 0;
  const hurtShake = member.hurtFlash > 0 ? (Math.random() - 0.5) * 6 : 0;
  const attackLunge =
    member.pose === 'attack' || member.pose === 'magic'
      ? Math.sin(Math.min(1, member.poseTimer * 4) * Math.PI) * 18
      : 0;

  ctx.translate(Math.round(x + hurtShake + attackLunge), Math.round(y + bob));

  // Shadow Mantle protective dark-violet aura!
  if (hasShadowMantle(member) && member.status === 'UP') {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(time * 5) * 0.1;
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 28, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (member.status !== 'UP') {
    // DOWN or SWOON fallen sprite
    if (member.id === 'kris') {
      // Kris kneeling DOWN
      pxRect(ctx, -12, 8, 24, 14, '#1b3b75');
      pxRect(ctx, -10, -4, 18, 13, '#00b8e6');
      pxRect(ctx, -11, -7, 20, 9, '#0d1b3d'); // hair
      pxRect(ctx, -16, 4, 14, 5, '#ff2a85'); // scarf
    } else if (member.id === 'susie') {
      // Susie SWOON collapsed with stark slash mark
      pxRect(ctx, -20, 10, 36, 14, '#3e124d');
      pxRect(ctx, -14, 2, 22, 12, '#b9469a');
      pxRect(ctx, -18, 0, 18, 10, '#4e0f3e');
      if (member.status === 'SWOON') {
        ctx.strokeStyle = '#ff1e42';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-22, 22);
        ctx.lineTo(20, 2);
        ctx.stroke();
      }
    } else {
      // Ralsei SWOON collapsed (pile of robe & glasses/scarf, just like Deltarune!)
      pxRect(ctx, -16, 12, 30, 12, '#0fa35b');
      pxRect(ctx, -12, 8, 22, 6, '#ff2e93'); // scarf
      pxRect(ctx, 8, 16, 8, 5, '#65ff8f'); // glasses
      if (member.status === 'SWOON') {
        ctx.strokeStyle = '#ff1e42';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-18, 22);
        ctx.lineTo(18, 4);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  const flashWhite = member.hurtFlash > 0 && Math.floor(member.hurtFlash * 24) % 2 === 0;

  if (member.id === 'kris') {
    // Cape / Magenta Scarf fluttering back
    const flutter = Math.sin(time * 8) * 3;
    pxRect(ctx, -22, -6 + flutter * 0.5, 16, 7, '#ff2a85');
    pxRect(ctx, -28, -4 + flutter, 10, 5, '#c81464');
    // Boots & Dark Trousers
    pxRect(ctx, -8, 16, 6, 12, '#1f2544');
    pxRect(ctx, 2, 16, 6, 12, '#1f2544');
    pxRect(ctx, -9, 24, 8, 4, '#8aa1c7');
    pxRect(ctx, 2, 24, 8, 4, '#8aa1c7');
    // Silver Chestplate & Pauldrons
    pxRect(ctx, -10, -4, 20, 20, flashWhite ? '#ffffff' : '#9cb4d8');
    pxRect(ctx, -7, -1, 14, 14, '#5a729c');
    pxRect(ctx, -13, -5, 6, 7, '#d0e2ff');
    pxRect(ctx, 7, -5, 6, 7, '#d0e2ff');
    // Head & Dark Navy Hair covering eyes
    pxRect(ctx, -8, -19, 16, 15, flashWhite ? '#ffffff' : '#00c8f8');
    pxRect(ctx, -10, -22, 20, 11, '#0c1633');
    pxRect(ctx, -9, -12, 14, 4, '#0c1633');

    if (member.defending) {
      // Glowing cyan-silver shield in front!
      pxRect(ctx, 8, -12, 7, 28, '#00f0ff');
      pxRect(ctx, 10, -10, 5, 24, '#d8f8ff');
    } else {
      // Saber10 / Dark World Sword
      ctx.save();
      const angle = member.pose === 'attack' ? 0.35 : -0.55;
      ctx.translate(10, 4);
      ctx.rotate(angle);
      pxRect(ctx, -2, -4, 5, 8, '#ffd166'); // hilt
      pxRect(ctx, -1, -28, 4, 24, '#ff4db8');
      pxRect(ctx, 0, -28, 2, 24, '#9efcff');
      ctx.restore();
    }
  } else if (member.id === 'susie') {
    // Tall Dark World Susie
    const hairWave = Math.sin(time * 6) * 2;
    // Boots & baggy pants
    pxRect(ctx, -11, 14, 9, 14, '#241433');
    pxRect(ctx, 3, 14, 9, 14, '#241433');
    pxRect(ctx, -11, 24, 10, 4, '#13091c');
    pxRect(ctx, 3, 24, 10, 4, '#13091c');
    // Jacket & Gold belt
    pxRect(ctx, -13, -8, 26, 23, flashWhite ? '#ffffff' : '#4a154b');
    pxRect(ctx, -6, -6, 12, 18, '#90298c');
    pxRect(ctx, -13, 10, 26, 4, '#f4c430'); // gold belt
    pxRect(ctx, -15, -8, 5, 6, '#f4c430'); // shoulder studs
    pxRect(ctx, 10, -8, 5, 6, '#f4c430');
    // Snout, Head & Wild Hair
    pxRect(ctx, -9, -24, 21, 16, flashWhite ? '#ffffff' : '#cc52b8');
    pxRect(ctx, 6, -18, 9, 9, '#cc52b8'); // snout
    pxRect(ctx, 8, -11, 5, 2, '#ffffff'); // fang grin
    pxRect(ctx, -15, -27, 23, 15, '#3b0938');
    pxRect(ctx, -18, -18 + hairWave, 10, 14, '#3b0938');
    pxRect(ctx, 4, -20, 4, 3, '#ffe659'); // fierce yellow eye!

    // ToxicAxe / Rude Buster Aura
    ctx.save();
    const axeAngle = member.pose === 'attack' || member.pose === 'magic' ? 0.55 : -0.85;
    ctx.translate(8, -2);
    ctx.rotate(axeAngle);
    pxRect(ctx, -2, -26, 4, 34, '#7d4e2d'); // handle
    pxRect(ctx, -12, -30, 22, 14, '#b829a7'); // axe head
    pxRect(ctx, 4, -32, 8, 18, '#5affb0'); // ToxicAxe neon edge!
    ctx.restore();

    if (member.pose === 'magic') {
      ctx.strokeStyle = '#ff33ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 28 + Math.sin(time * 25) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // Hatless Chapter 3 Ralsei!
    const scarfWave = Math.sin(time * 7 + 1) * 3;
    // White paws
    pxRect(ctx, -8, 22, 6, 6, '#ffffff');
    pxRect(ctx, 2, 22, 6, 6, '#ffffff');
    // Green Robe with black heart emblem
    pxRect(ctx, -11, -2, 22, 25, flashWhite ? '#ffffff' : '#12b868');
    pxRect(ctx, -3, 6, 6, 6, '#0b1c14');
    // Magenta FlexScarf
    pxRect(ctx, -12, -6, 24, 6, '#ff2e93');
    pxRect(ctx, -24, -4 + scarfWave, 14, 5, '#ff2e93');
    // White fluffy head & pink horns
    pxRect(ctx, -10, -21, 20, 16, flashWhite ? '#ffffff' : '#f8f9ff');
    pxRect(ctx, -13, -17, 4, 9, '#eef0ff'); // floppy ears
    pxRect(ctx, 9, -17, 4, 9, '#eef0ff');
    pxRect(ctx, -7, -27, 4, 6, '#ff6fae'); // left pink horn
    pxRect(ctx, 3, -27, 4, 6, '#ff6fae'); // right pink horn
    // Round green glasses
    pxRect(ctx, -6, -15, 6, 5, '#47ff88');
    pxRect(ctx, 2, -15, 6, 5, '#47ff88');
    pxRect(ctx, -4, -14, 2, 3, '#0b2918');
    pxRect(ctx, 4, -14, 2, 3, '#0b2918');

    if (member.defending) {
      // Wrapped snugly in FlexScarf shield!
      pxRect(ctx, -13, -8, 26, 22, '#ff2e93');
      pxRect(ctx, -10, -5, 20, 16, '#ff77bd');
    } else if (member.pose === 'magic') {
      // Healing sparkles around hands
      ctx.fillStyle = '#7aff9e';
      for (let i = 0; i < 4; i++) {
        const a = time * 6 + (i * Math.PI) / 2;
        pxRect(ctx, Math.cos(a) * 18, -4 + Math.sin(a) * 14, 3, 3, '#7aff9e');
      }
    }
  }

  ctx.restore();
}

export function drawRoaringKnight(
  ctx: CanvasRenderingContext2D,
  knight: KnightState,
  x: number,
  y: number,
  time: number
): void {
  // Draw eerie trailing monochromatic/purple afterimages first!
  for (let i = 3; i >= 1; i--) {
    const lag = i * 0.14;
    const ax = x + Math.sin((time - lag) * 2.2) * 8 - i * 4;
    const ay = y + Math.sin((time - lag) * 3.4) * 9;
    ctx.save();
    ctx.globalAlpha = 0.16 / i;
    drawKnightBody(ctx, knight, ax, ay, time - lag, true);
    ctx.restore();
  }

  const shakeX = knight.shakeTimer > 0 ? (Math.random() - 0.5) * 10 : 0;
  const hoverX = Math.sin(time * 2.2) * 5 + shakeX;
  const hoverY = Math.sin(time * 3.4) * 7;

  drawKnightBody(ctx, knight, x + hoverX, y + hoverY, time, false);
}

function drawKnightBody(
  ctx: CanvasRenderingContext2D,
  knight: KnightState,
  x: number,
  y: number,
  time: number,
  isSilhouette: boolean
): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));

  const outlineColor = isSilhouette
    ? '#a855f7'
    : knight.pose === 'roar'
      ? '#ffffff'
      : '#f0ecff';
  const fillColor = knight.pose === 'hurt' && Math.floor(time * 30) % 2 === 0 ? '#3a225d' : '#050308';

  // Dark fountain smoke wisps rising from torso/cape
  if (!isSilhouette) {
    for (let i = 0; i < 5; i++) {
      const wy = -20 + ((time * 40 + i * 22) % 75);
      const wx = Math.sin(time * 4 + i * 1.7) * 18;
      ctx.fillStyle = knight.pose === 'roar' ? 'rgba(255,255,255,0.22)' : 'rgba(139, 62, 225, 0.22)';
      ctx.fillRect(wx - 4, 40 - wy, 8, 8);
    }
  }

  // Flowing tattered dark cape
  ctx.fillStyle = '#0c0617';
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const capeSway = Math.sin(time * 4.5) * 8;
  ctx.moveTo(-16, -24);
  ctx.lineTo(18, -24);
  ctx.lineTo(30 + capeSway, 52);
  ctx.lineTo(12 + capeSway * 0.7, 40);
  ctx.lineTo(2 + capeSway * 0.5, 58);
  ctx.lineTo(-10 + capeSway * 0.4, 42);
  ctx.lineTo(-24 + capeSway * 0.3, 52);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Slender armored legs (hovering off the ground like a marionette/wraith)
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(-9, 14);
  ctx.lineTo(-14, 54);
  ctx.lineTo(-8, 64);
  ctx.lineTo(-3, 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(4, 14);
  ctx.lineTo(9, 56);
  ctx.lineTo(15, 66);
  ctx.lineTo(11, 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hourglass / angular armored chest & jagged shoulder pauldrons
  ctx.beginPath();
  ctx.moveTo(-28, -28); // left pauldron tip
  ctx.lineTo(-8, -32);
  ctx.lineTo(10, -32);
  ctx.lineTo(30, -28); // right pauldron tip
  ctx.lineTo(14, -10);
  ctx.lineTo(8, 16);
  ctx.lineTo(-8, 16);
  ctx.lineTo(-14, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // White chest core / rib glint
  if (!isSilhouette) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-7, -18);
    ctx.lineTo(0, -13);
    ctx.lineTo(7, -18);
    ctx.moveTo(-5, -9);
    ctx.lineTo(0, -5);
    ctx.lineTo(5, -9);
    ctx.stroke();
  }

  // Helmet & Tall Branching Antler-Horns!
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-11, -33);
  ctx.lineTo(-13, -53);
  ctx.lineTo(0, -59);
  ctx.lineTo(13, -53);
  ctx.lineTo(11, -33);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Left Antler Horn
  ctx.beginPath();
  ctx.moveTo(-9, -52);
  ctx.lineTo(-22, -74);
  ctx.lineTo(-28, -90);
  ctx.lineTo(-18, -76);
  ctx.lineTo(-13, -84);
  ctx.lineTo(-12, -70);
  ctx.lineTo(-5, -55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right Antler Horn
  ctx.beginPath();
  ctx.moveTo(9, -52);
  ctx.lineTo(22, -74);
  ctx.lineTo(28, -90);
  ctx.lineTo(18, -76);
  ctx.lineTo(13, -84);
  ctx.lineTo(12, -70);
  ctx.lineTo(5, -55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing Visor Slit / Roaring Eye Star!
  if (!isSilhouette) {
    ctx.fillStyle = '#ffffff';
    if (knight.pose === 'roar') {
      // Blazing 4-point star flare across the visor!
      pxRect(ctx, -20, -45, 40, 4, '#ffffff');
      pxRect(ctx, -2, -62, 4, 36, '#ffffff');
      pxRect(ctx, -8, -48, 16, 10, '#ffffff');
    } else {
      // Eerie curved white visor slit
      ctx.beginPath();
      ctx.moveTo(-9, -45);
      ctx.quadraticCurveTo(-2, -40, 8, -45);
      ctx.quadraticCurveTo(-2, -43, -9, -45);
      ctx.fill();
      pxRect(ctx, -8, -45, 15, 3, '#ffffff');
    }

    // Post-Phase 4 cracked armor detail!
    if (knight.phase4Completed || knight.pose === 'cracked') {
      ctx.strokeStyle = '#ff3864';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, -56);
      ctx.lineTo(2, -44);
      ctx.lineTo(-3, -34);
      ctx.stroke();
    }
  }

  // Left Arm (Pointing forward during Stars, or poised)
  ctx.save();
  if (knight.pose === 'point') {
    ctx.translate(-16, -22);
    ctx.rotate(0.15);
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = outlineColor;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(-38, -2);
    ctx.lineTo(-46, 0);
    ctx.lineTo(-38, 4);
    ctx.lineTo(0, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Glowing star spark at fingertip!
    if (!isSilhouette) {
      pxRect(ctx, -50, -3, 6, 6, '#e879f9');
      pxRect(ctx, -49, -2, 4, 4, '#ffffff');
    }
  } else {
    ctx.translate(-18, -22);
    ctx.rotate(knight.pose === 'roar' ? 0.8 : -0.35);
    pxRect(ctx, -4, 0, 7, 28, outlineColor);
    pxRect(ctx, -3, 1, 5, 26, fillColor);
  }
  ctx.restore();

  // Right Arm + THE BLACK BLADE!
  ctx.save();
  let swordAngle = -0.65;
  if (knight.pose === 'raise_sword') swordAngle = -2.15;
  else if (knight.pose === 'slash') swordAngle = 0.85;
  else if (knight.pose === 'roar') swordAngle = -1.57;

  ctx.translate(18, -22);
  ctx.rotate(swordAngle);

  // Gauntlet
  pxRect(ctx, -4, -4, 8, 22, outlineColor);
  pxRect(ctx, -2, -2, 4, 18, fillColor);

  // The Black Blade (Pitch-black core, stark white razor edge, crimson/violet glint)
  ctx.translate(0, 16);
  ctx.fillStyle = '#030106';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, 0); // crossguard
  ctx.lineTo(10, 0);
  ctx.lineTo(4, 5);
  ctx.lineTo(6, 66);
  ctx.lineTo(0, 82); // lethal tip
  ctx.lineTo(-5, 64);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (knight.phase4Completed || knight.pose === 'cracked') {
    // Fractured Black Shard crack on the blade!
    ctx.strokeStyle = '#ff2a6d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 38);
    ctx.lineTo(3, 44);
    ctx.lineTo(-2, 52);
    ctx.lineTo(5, 58);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

export function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet): void {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);

  switch (b.shape) {
    case 'star': {
      // 6-pointed glowing Dark/Mauve or Crimson star!
      const rOuter = b.radius * 1.45;
      const rInner = b.radius * 0.55;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const rad = i % 2 === 0 ? rOuter : rInner;
        const a = (i * Math.PI) / 6;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = b.coreColor ?? '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, b.radius * 0.42, 0, Math.PI * 2);
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

      // Lock-on laser line when Tracking Sword turns red (state === 1)!
      if (b.state === 1 && b.customTag === 'tracking') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 36, 76, 0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(len * 0.5, 0);
        ctx.lineTo(260, 0);
        ctx.stroke();
        ctx.restore();
      }

      // Blade pointing along +X axis
      ctx.fillStyle = '#08040f';
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(len * 0.55, 0); // tip
      ctx.lineTo(len * 0.2, wid * 0.55);
      ctx.lineTo(-len * 0.35, wid * 0.45);
      ctx.lineTo(-len * 0.35, -wid * 0.45);
      ctx.lineTo(len * 0.2, -wid * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Crossguard & pommel
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

import {
  calculateHealPrayerAmount,
  getMemberAt,
  getMemberDf,
  getMemberMag,
  hasShadowMantle
} from './combat';
import { ATTACK_DEFINITIONS, SCREEN_HEIGHT, SCREEN_WIDTH } from './constants';
import {
  drawCommandIcon,
  drawMemberPortrait,
  drawMiniActionGlyph,
  drawSoulHeart
} from './sprites';
import {
  AttackPatternId,
  FightLane,
  FloatingPopup,
  InventoryItem,
  KnightState,
  PartyId,
  PartyMember,
  QueuedAction,
  RudeBusterBolt
} from './types';

export type MenuSubMode =
  | 'ROOT'
  | 'TARGET_ENEMY'
  | 'ACT_MAGIC_LIST'
  | 'ITEM_LIST'
  | 'TARGET_ALLY';

export interface MenuUiState {
  activeActorIndex: number; // 0, 1, 2
  rootButtonIndex: number; // 0: FIGHT, 1: ACT/MAGIC, 2: ITEM, 3: SPARE, 4: DEFEND
  subMode: MenuSubMode;
  listCursor: number;
  allyCursor: number;
  pendingActionKind: 'FIGHT' | 'ACT' | 'MAGIC' | 'ITEM' | 'SPARE';
  pendingSubId?: string;
  pendingItemSlot?: number;
  reservedItemSlots: Set<number>;
}

// ============================================================================
// CHAPTER 3 ROARING KNIGHT STAGE ARCH, PURPLE MIST ARENA & ROARING VORTEX
// (Directly matching reference video https://www.youtube.com/watch?v=KOu-Zaw-uhc)
// ============================================================================
export function drawBattleBackground(
  ctx: CanvasRenderingContext2D,
  time: number,
  isRoaringPhase: boolean,
  isTitleScene = false
): void {
  // Pitch-black void base
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  // Full-screen concentric jagged purple vortex during THE ROARING (yt_sd3.jpg)
  if (isRoaringPhase) {
    const vcx = SCREEN_WIDTH * 0.5;
    const vcy = 212;

    ctx.fillStyle = '#14021d';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Outer swirling dark-magenta mist bands
    for (let y = 0; y < SCREEN_HEIGHT; y += 6) {
      const wave = Math.sin(y * 0.045 + time * 3.2) * 28 + Math.cos(y * 0.09 - time * 2.1) * 14;
      ctx.fillStyle = y % 12 === 0 ? '#2b063d' : '#1f042c';
      ctx.fillRect(Math.round(wave), y, SCREEN_WIDTH - Math.abs(Math.round(wave)), 5);
    }

    // Concentric jagged vortex rings pulsing inward toward the Knight
    const ringColors = ['#3c0954', '#580e7a', '#35074a', '#1d0329', '#0c0112'];
    const baseRadii = [340, 265, 200, 145, 96];
    const pulse = ((time * 1.4) % 1) * 24;

    for (let rIdx = 0; rIdx < ringColors.length; rIdx++) {
      const rad = Math.max(48, baseRadii[rIdx] - (rIdx < 4 ? pulse * 0.7 : 0));
      ctx.fillStyle = ringColors[rIdx];
      ctx.beginPath();
      const steps = 48;
      for (let s = 0; s <= steps; s++) {
        const ang = (s / steps) * Math.PI * 2;
        const jag =
          Math.sin(ang * 11 + time * 4.5 + rIdx) * 12 +
          Math.cos(ang * 7 - time * 3.1) * 9;
        const rx = (rad + jag) * 1.12;
        const ry = (rad + jag) * 0.94;
        const px = vcx + Math.cos(ang) * rx;
        const py = vcy + Math.sin(ang) * ry;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Subtle swirling violet wisps inside the mid vortex ring
    ctx.fillStyle = 'rgba(148, 36, 204, 0.22)';
    for (let i = 0; i < 14; i++) {
      const wy = Math.round(((i * 34 + time * 42) % 360) + 40);
      const wx = Math.round(vcx + Math.sin(wy * 0.05 + time * 2 + i) * 140 - 45);
      ctx.fillRect(wx, wy, 90, 4);
    }
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SCREEN_WIDTH, 326);
  ctx.clip();

  // 1. Top-Center Curved Stage Curtain Arch & Jagged Fringe Teeth (y: 0..88)
  // Warm golden-ochre in active battle (yt_sd2.jpg), moody blue-slate on intro/title (yt_sd1.jpg)
  const archOuterGlow = isTitleScene ? '#161826' : '#2a1d08';
  const archMidShade = isTitleScene ? '#22253a' : '#5e4215';
  const archMainColor = isTitleScene ? '#323652' : '#9c7129';
  const teethBackColor = isTitleScene ? '#1e2134' : '#573d14';
  const teethFrontColor = isTitleScene ? '#2f334d' : '#8f6724';

  // Soft outer arch aura
  ctx.fillStyle = archOuterGlow;
  for (let y = 0; y < 88; y += 2) {
    const curve = Math.pow(y / 88, 1.55) * 26;
    ctx.fillRect(Math.round(156 + curve), y, Math.round(328 - curve * 2), 2);
  }

  // Dark inner recess behind the hanging fringe teeth
  ctx.fillStyle = isTitleScene ? '#0b0c14' : '#1b1205';
  for (let y = 0; y < 88; y += 2) {
    const curve = Math.pow(y / 88, 1.55) * 26;
    ctx.fillRect(Math.round(196 + curve), y, Math.round(248 - curve * 2), 2);
  }

  // Jagged hanging curtain fringe / stalactite teeth across top center (x: 206..434)
  const teethHeights = [
    36, 40, 42, 41, 38, 44, 24, 48, 46, 22, 39, 32, 46, 52, 44, 30, 54, 48, 38, 45, 34, 26, 18
  ];
  const toothStartX = 212;
  const toothW = 9.5;
  teethHeights.forEach((th, idx) => {
    const tx = Math.round(toothStartX + idx * toothW);
    const sway = Math.sin(time * 1.6 + idx * 0.7) * 1.2;
    ctx.fillStyle = teethBackColor;
    ctx.fillRect(tx - 1, 6, Math.ceil(toothW), Math.round(th + 6 + sway));
    if (idx % 3 !== 1) {
      ctx.fillStyle = teethFrontColor;
      ctx.beginPath();
      ctx.moveTo(tx, 10);
      ctx.lineTo(tx + toothW - 1, 10);
      ctx.lineTo(tx + toothW * 0.5, 10 + th + sway);
      ctx.closePath();
      ctx.fill();
    }
  });

  // Left & Right Curved Stage Arch Pillars
  for (let y = 0; y < 88; y += 2) {
    const curve = Math.pow(y / 88, 1.55) * 26;
    // Inner bevel
    ctx.fillStyle = archMidShade;
    ctx.fillRect(Math.round(170 + curve), y, 36, 2);
    ctx.fillRect(Math.round(434 - curve), y, 36, 2);
    // Main bright pillar band
    ctx.fillStyle = archMainColor;
    ctx.fillRect(Math.round(174 + curve), y, 26, 2);
    ctx.fillRect(Math.round(440 - curve), y, 26, 2);
  }

  // 2. Main Battleground (y: 88..324)
  if (!isTitleScene) {
    // Deep Dark Purple-Magenta Undulating Mist Clouds (yt_sd2.jpg!)
    ctx.fillStyle = '#0d0114';
    ctx.fillRect(0, 88, SCREEN_WIDTH, 238);

    const cloudBands = [
      { yBase: 94, h: 228, col: '#1a0326', amp: 14, spd: 0.9, freq: 0.022 },
      { yBase: 122, h: 200, col: '#2b063e', amp: 16, spd: -1.2, freq: 0.028 },
      { yBase: 166, h: 156, col: '#3e0a57', amp: 12, spd: 1.45, freq: 0.034 },
      { yBase: 224, h: 98, col: '#520e70', amp: 10, spd: -1.7, freq: 0.04 }
    ];

    for (const band of cloudBands) {
      ctx.fillStyle = band.col;
      for (let x = 0; x < SCREEN_WIDTH; x += 8) {
        const yOff =
          Math.sin(x * band.freq + time * band.spd) * band.amp +
          Math.cos(x * band.freq * 1.7 - time * band.spd * 0.6) * (band.amp * 0.5);
        const topY = Math.max(88, Math.round(band.yBase + yOff));
        ctx.fillRect(x, topY, 8, Math.max(0, 324 - topY));
      }
    }

    // Horizontal dark-purple smoke wisps across the lower/mid arena (matching yt_sd2.jpg)
    for (let i = 0; i < 22; i++) {
      const wx = Math.round(((i * 79 - time * (18 + (i % 3) * 7)) % (SCREEN_WIDTH + 120)) - 60);
      const wrappedWx = wx < -60 ? wx + SCREEN_WIDTH + 120 : wx;
      const wy = 104 + ((i * 31) % 208);
      const ww = 48 + (i % 4) * 22;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(118, 22, 158, 0.28)' : 'rgba(20, 2, 30, 0.45)';
      ctx.fillRect(wrappedWx, wy, ww, 6);
      ctx.fillRect(wrappedWx + 10, wy - 3, ww - 20, 3);
    }

    // Top edge dark vignette blending the purple mist cleanly below y = 88
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.fillRect(0, 88, SCREEN_WIDTH, 8);
  }

  // 3. Stepped Jagged Pale Ice-Blue Snow Ledges on the Left beneath Kris, Susie & Ralsei (yt_sd1.jpg)
  const ledges = isTitleScene
    ? [
        { x: 0, y: 146, w: 128, h: 14 },
        { x: 0, y: 174, w: 96, h: 18 },
        { x: 0, y: 214, w: 72, h: 14 },
        { x: 148, y: 214, w: 52, h: 10 },
        { x: 0, y: 252, w: 152, h: 34 },
        { x: 138, y: 294, w: 68, h: 12 },
        { x: 0, y: 298, w: 186, h: 28 }
      ]
    : [
        { x: 58, y: 142, w: 68, h: 8 },
        { x: 48, y: 204, w: 72, h: 9 },
        { x: 56, y: 268, w: 78, h: 10 }
      ];

  for (const l of ledges) {
    ctx.save();
    if (!isTitleScene) ctx.globalAlpha = 0.26;
    // Underside icy shadow
    ctx.fillStyle = '#7e96b8';
    ctx.beginPath();
    ctx.moveTo(l.x, l.y + 4);
    ctx.lineTo(l.x + l.w - 14, l.y + 4);
    ctx.lineTo(l.x + l.w + 4, l.y + l.h * 0.65);
    ctx.lineTo(l.x + l.w - 22, l.y + l.h + 4);
    ctx.lineTo(l.x, l.y + l.h + 4);
    ctx.closePath();
    ctx.fill();

    // Crisp pale snow crust
    ctx.fillStyle = '#bacde8';
    ctx.beginPath();
    ctx.moveTo(l.x, l.y + 2);
    ctx.lineTo(l.x + l.w * 0.55, l.y);
    ctx.lineTo(l.x + l.w, l.y + l.h * 0.45);
    ctx.lineTo(l.x + l.w - 16, l.y + l.h);
    ctx.lineTo(l.x, l.y + l.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// ============================================================================
// AUTHENTIC DELTARUNE SLANTED BLADE TP BAR (Matching yt_sd2.jpg!)
// ============================================================================
export function drawTpBar(ctx: CanvasRenderingContext2D, tp: number): void {
  const barX = 40;
  const barY = 44;
  const barW = 20;
  const barH = 192;
  const slant = 20;

  // Left-side stacked "T" "P" "0" "%" text matching yt_sd2.jpg!
  const pct = Math.max(0, Math.min(100, Math.floor(tp)));
  ctx.save();
  ctx.font = 'bold 13px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('T', 15, barY + 38);
  ctx.fillText('P', 15, barY + 56);

  if (pct >= 100) {
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffff00';
    ctx.fillText('M', 15, barY + 84);
    ctx.fillText('A', 15, barY + 99);
    ctx.fillText('X', 15, barY + 114);
  } else {
    ctx.font = 'bold 13px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${pct}`, 22, barY + 86);
    ctx.fillText('%', 22, barY + 108);
    ctx.textAlign = 'left';
  }

  // Helper path for the 45°-slanted blade silhouette
  const traceBladePath = () => {
    ctx.beginPath();
    ctx.moveTo(barX, barY + slant);
    ctx.lineTo(barX + barW, barY);
    ctx.lineTo(barX + barW, barY + barH - slant);
    ctx.lineTo(barX, barY + barH);
    ctx.closePath();
  };

  // Subtle dark backing + deep crimson #680008 track
  ctx.fillStyle = '#000000';
  ctx.save();
  ctx.translate(-2, -2);
  traceBladePath();
  ctx.fill();
  ctx.restore();

  traceBladePath();
  ctx.fillStyle = '#680008';
  ctx.fill();

  // Clip orange (#ffa040) / MAX yellow (#ffff00) fill inside the slanted blade!
  if (pct > 0) {
    ctx.save();
    traceBladePath();
    ctx.clip();

    const fillTopY = Math.round(barY + barH - (barH * pct) / 100);
    ctx.fillStyle = pct >= 100 ? '#ffff00' : '#ffa040';
    ctx.fillRect(barX - 2, fillTopY, barW + 4, barH + 4);

    if (pct < 100) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(barX - 2, fillTopY, barW + 4, 3);
    }
    ctx.restore();
  }

  // Subtle dark-red or golden rim
  traceBladePath();
  ctx.strokeStyle = pct >= 100 ? '#ffff88' : '#3a0006';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawTopHudBadge(
  ctx: CanvasRenderingContext2D,
  _knight: KnightState,
  isPractice: boolean,
  muted: boolean
): void {
  if (!isPractice && !muted) return;
  ctx.save();
  ctx.font = '16px "VT323", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(210, 225, 255, 0.78)';
  const tags: string[] = [];
  if (isPractice) tags.push('PRACTICE');
  if (muted) tags.push('MUTED [M]');
  ctx.fillText(tags.join('  •  '), SCREEN_WIDTH - 10, 18);
  ctx.restore();
}

// ============================================================================
// AUTHENTIC DELTARUNE PARTY STRIP + BORDERLESS DIALOGUE / MENU AREA (yt_sd2.jpg)
// ============================================================================
export function drawPartyStripAndBottomBox(
  ctx: CanvasRenderingContext2D,
  party: PartyMember[],
  knight: KnightState,
  inventory: InventoryItem[],
  tp: number,
  holdBreathUsed: boolean,
  subState: string,
  menu: MenuUiState,
  dialogueText: string,
  dialogueCharsShown: number,
  fightLanes: FightLane[],
  queuedActions: QueuedAction[] = [],
  activeResolveActorIndex = -1
): void {
  // Solid black HUD base (y: 326..480)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 326, SCREEN_WIDTH, SCREEN_HEIGHT - 326);

  // Sleek horizontal Dark World purple divider lines at y = 326 & y = 362 (yt_sd2.jpg!)
  ctx.fillStyle = '#3b1c5e';
  ctx.fillRect(0, 326, SCREEN_WIDTH, 2);
  ctx.fillRect(0, 362, SCREEN_WIDTH, 2);

  const cardW = 204;
  const startX = 14;

  // 1. Render the 3 Party Member HUD Slots (KRIS, SUSIE, RALSEI)
  party.forEach((m, idx) => {
    const isActiveMenu = subState === 'PARTY_MENU' && menu.activeActorIndex === idx;
    const cx = startX + idx * cardW;
    const cy = isActiveMenu ? 294 : 328;
    const cardH = isActiveMenu ? 69 : 34;

    if (isActiveMenu) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, cy + 1, cardW - 2, cardH - 2);
      ctx.fillStyle = m.color;
      ctx.fillRect(cx + 1, cy + 34, cardW - 2, 2);
    }

    // Show colored mini action glyph when this member has a queued command waiting (yt_sd2.jpg!),
    // or their pixel-art portrait otherwise!
    const queued = queuedActions.find((q) => q.actorIndex === idx);
    const showActionGlyph =
      !isActiveMenu &&
      queued !== undefined &&
      m.status === 'UP' &&
      (subState === 'PARTY_MENU' ||
        (subState === 'RESOLVE_ACTIONS' && activeResolveActorIndex !== idx));

    if (showActionGlyph && queued) {
      drawMiniActionGlyph(ctx, queued.type, cx + 6, cy + 8, m.hpBarColor);
    } else {
      drawMemberPortrait(ctx, m, cx + 4, cy + 4);
    }

    // Character Name
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.fillStyle =
      m.status === 'SWOON'
        ? '#ff1e42'
        : m.status === 'DOWN'
          ? '#aa4444'
          : isActiveMenu
            ? m.color
            : '#ffffff';
    ctx.fillText(m.name, cx + 32, cy + 21);

    // Subtle ShadowMantle mini-emblem next to name during menu selection
    if (hasShadowMantle(m) && isActiveMenu) {
      ctx.fillStyle = '#c084fc';
      ctx.fillRect(cx + 32, cy + 24, 6, 5);
    }

    // HP Label, Numbers & Character-Specific Colored HP Bar (#00ffff, #ff00ff, #00ff00)!
    const hpLabelX = cx + 102;
    const barX = cx + 122;
    const barW = 74;
    const barY = cy + 19;
    const barH = 9;

    ctx.font = 'bold 7px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('HP', hpLabelX, cy + 27);

    ctx.textAlign = 'right';
    ctx.font = 'bold 8px "Press Start 2P", monospace';
    if (m.status === 'SWOON') {
      ctx.fillStyle = '#ff1744';
      ctx.fillText('-999', barX + barW, cy + 14);
    } else if (m.status === 'DOWN') {
      ctx.fillStyle = '#ff4444';
      ctx.fillText(`${m.hp}/${m.maxHp}`, barX + barW, cy + 14);
    } else {
      ctx.fillStyle = m.hp <= m.maxHp * 0.25 ? '#ffff00' : '#ffffff';
      ctx.fillText(`${m.hp}/${m.maxHp}`, barX + barW, cy + 14);
    }
    ctx.textAlign = 'left';

    // Character-Colored HP Gauge over #550000 Dark Maroon (exact match to yt_sd2.jpg!)
    ctx.fillStyle = '#550000';
    ctx.fillRect(barX, barY, barW, barH);
    if (m.hp > 0) {
      const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));
      ctx.fillStyle = m.hpBarColor;
      ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
    }

    // Active Character's 5 Deltarune Pixel-Art Command Icons!
    if (isActiveMenu) {
      const icons: Array<'FIGHT' | 'ACT' | 'MAGIC' | 'ITEM' | 'SPARE' | 'DEFEND'> =
        m.id === 'kris'
          ? ['FIGHT', 'ACT', 'ITEM', 'SPARE', 'DEFEND']
          : ['FIGHT', 'MAGIC', 'ITEM', 'SPARE', 'DEFEND'];

      icons.forEach((iconKind, bIdx) => {
        const ix = cx + 8 + bIdx * 38;
        const iy = cy + 40;
        const selected = menu.subMode === 'ROOT' && menu.rootButtonIndex === bIdx;
        drawCommandIcon(ctx, iconKind, ix, iy, selected);
      });
    }
  });

  // 2. Bottom Area below y = 364
  const boxX = 6;
  const boxY = 366;
  const boxW = SCREEN_WIDTH - 12;
  const boxH = 108;

  // During BULLET_HELL or ENEMY_INTRO, keep bottom area clean pitch-black (matching Deltarune!)
  if (subState === 'BULLET_HELL' || subState === 'ENEMY_INTRO') {
    return;
  }

  if (subState === 'FIGHT_BARS') {
    ctx.strokeStyle = '#3b1c5e';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    drawFightReticles(ctx, boxX, boxY, boxW, boxH, party, fightLanes);
    return;
  }

  if (subState === 'PARTY_MENU' && menu.subMode !== 'ROOT') {
    drawSubMenuContent(
      ctx,
      boxX,
      boxY,
      boxW,
      boxH,
      party,
      knight,
      inventory,
      tp,
      holdBreathUsed,
      menu
    );
    return;
  }

  // Borderless black dialogue area for "* Susie used RUDE BUSTER!" & turn flavor text (yt_sd2.jpg!)
  const shown = dialogueText.slice(0, dialogueCharsShown);
  const lines = wrapText(shown, 52);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Press Start 2P", monospace';
  lines.slice(0, 3).forEach((ln, idx) => {
    ctx.fillText(ln, 34, boxY + 34 + idx * 28);
  });
}

function drawSubMenuContent(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  party: PartyMember[],
  knight: KnightState,
  inventory: InventoryItem[],
  tp: number,
  holdBreathUsed: boolean,
  menu: MenuUiState
): void {
  const actor = party[menu.activeActorIndex];

  if (menu.subMode === 'TARGET_ENEMY') {
    // Column headers matching real Deltarune enemy target list!
    ctx.font = '16px "VT323", monospace';
    ctx.fillStyle = '#8888aa';
    ctx.fillText('HP', boxX + 380, boxY + 20);
    ctx.fillText('MERCY', boxX + 516, boxY + 20);

    drawSoulHeart(ctx, boxX + 28, boxY + 42, 0.85, '#ff0000');
    ctx.font = '24px "VT323", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Roaring Knight', boxX + 48, boxY + 49);

    // Deltarune Green/Maroon Enemy HP Bar
    const hpRatio = Math.max(0, Math.min(1, knight.hp / knight.maxHp));
    const barX = boxX + 380;
    const barY = boxY + 34;
    const barW = 110;
    ctx.fillStyle = '#800000';
    ctx.fillRect(barX, barY, barW, 15);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), 15);

    ctx.font = '16px "VT323", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.ceil(hpRatio * 100)}%`, barX + 6, barY + 13);

    // Crossed-out MERCY bar (cannot be spared in real Deltarune!)
    const mercyX = boxX + 516;
    ctx.fillStyle = '#4a1c24';
    ctx.fillRect(mercyX, barY, 82, 15);
    ctx.strokeStyle = '#ff2244';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mercyX + 32, barY + 2);
    ctx.lineTo(mercyX + 50, barY + 13);
    ctx.moveTo(mercyX + 50, barY + 2);
    ctx.lineTo(mercyX + 32, barY + 13);
    ctx.stroke();
    return;
  }

  if (menu.subMode === 'TARGET_ALLY') {
    ctx.font = '23px "VT323", monospace';
    party.forEach((m, idx) => {
      const rowY = boxY + 32 + idx * 29;
      if (menu.allyCursor === idx) {
        drawSoulHeart(ctx, boxX + 26, rowY - 6, 0.85, '#ff0000');
      }
      ctx.fillStyle = m.status === 'SWOON' ? '#ff2244' : '#ffffff';
      ctx.fillText(m.name, boxX + 48, rowY);

      // Mini HP bar in ally selector
      const bx = boxX + 180;
      const by = rowY - 13;
      ctx.fillStyle = '#800000';
      ctx.fillRect(bx, by, 120, 12);
      if (m.hp > 0) {
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(bx, by, Math.round(120 * (m.hp / m.maxHp)), 12);
      }

      ctx.fillStyle =
        m.status === 'SWOON' ? '#ff2244' : m.status === 'DOWN' ? '#ff6666' : '#ffffff';
      const statusLabel =
        m.status === 'SWOON'
          ? `SWOON (-999/${m.maxHp})`
          : m.status === 'DOWN'
            ? `DOWN (${m.hp}/${m.maxHp})`
            : `${m.hp} / ${m.maxHp}`;
      ctx.fillText(statusLabel, boxX + 318, rowY);
    });
    return;
  }

  if (menu.subMode === 'ACT_MAGIC_LIST') {
    const entries = getActorSpecialEntries(actor, tp, holdBreathUsed);
    entries.forEach((e, idx) => {
      const rowY = boxY + 36 + idx * 32;
      if (menu.listCursor === idx) {
        drawSoulHeart(ctx, boxX + 26, rowY - 6, 0.85, '#ff0000');
      }
      ctx.font = '24px "VT323", monospace';
      ctx.fillStyle = e.enabled ? '#ffffff' : '#666677';
      ctx.fillText(e.label, boxX + 48, rowY);
      if (e.tpText) {
        ctx.fillStyle = e.enabled ? '#ffa040' : '#666677';
        ctx.fillText(e.tpText, boxX + 215, rowY);
      }
    });

    const current = entries[menu.listCursor];
    if (current) {
      ctx.fillStyle = '#332066';
      ctx.fillRect(boxX + 320, boxY + 8, 2, boxH - 16);

      ctx.font = '19px "VT323", monospace';
      ctx.fillStyle = '#bbbbdd';
      wrapText(current.desc, 30)
        .slice(0, 3)
        .forEach((ln, i) => {
          ctx.fillText(ln, boxX + 334, boxY + 32 + i * 23);
        });
    }
    return;
  }

  if (menu.subMode === 'ITEM_LIST') {
    if (inventory.length === 0) {
      ctx.font = '24px "VT323", monospace';
      ctx.fillStyle = '#777799';
      ctx.fillText('* (Your ITEMS are empty.)', boxX + 24, boxY + 42);
      return;
    }

    const pageStart = Math.floor(menu.listCursor / 6) * 6;
    const visible = inventory.slice(pageStart, pageStart + 6);
    visible.forEach((item, localIdx) => {
      const realIdx = pageStart + localIdx;
      const col = localIdx % 2;
      const row = Math.floor(localIdx / 2);
      const ix = boxX + 46 + col * 184;
      const iy = boxY + 32 + row * 28;

      if (menu.listCursor === realIdx) {
        drawSoulHeart(ctx, ix - 20, iy - 6, 0.8, '#ff0000');
      }
      const reserved = menu.reservedItemSlots.has(realIdx);
      ctx.font = '23px "VT323", monospace';
      ctx.fillStyle = reserved ? '#555566' : '#ffffff';
      ctx.fillText(item.shortName, ix, iy);
    });

    // Scroll indicator dots + Right description panel
    ctx.fillStyle = '#332066';
    ctx.fillRect(boxX + 404, boxY + 8, 2, boxH - 16);

    const selectedItem = inventory[menu.listCursor];
    if (selectedItem) {
      ctx.font = '18px "VT323", monospace';
      ctx.fillStyle = '#bbbbdd';
      wrapText(selectedItem.desc, 23)
        .slice(0, 3)
        .forEach((ln, i) => {
          ctx.fillText(ln, boxX + 416, boxY + 28 + i * 21);
        });
      ctx.fillStyle = '#ffa040';
      ctx.fillText(
        `PAGE ${Math.floor(menu.listCursor / 6) + 1}/2  (${inventory.length} left)`,
        boxX + 416,
        boxY + boxH - 12
      );
    }
  }
}

export function getActorSpecialEntries(
  actor: PartyMember,
  tp: number,
  holdBreathUsed: boolean
): Array<{
  id: string;
  label: string;
  tpCost: number;
  tpText: string;
  enabled: boolean;
  desc: string;
}> {
  if (actor.id === 'kris') {
    return [
      {
        id: 'check',
        label: 'Check',
        tpCost: 0,
        tpText: '',
        enabled: true,
        desc: 'Inspect stats and behavior.'
      },
      {
        id: 'hold_breath',
        label: 'HoldBreath',
        tpCost: 0,
        tpText: holdBreathUsed ? 'ACTIVE' : '',
        enabled: !holdBreathUsed,
        desc: holdBreathUsed
          ? 'SOUL speed boost is already active!'
          : 'Increases SOUL speed for the rest of battle.'
      }
    ];
  }

  if (actor.id === 'susie') {
    return [
      {
        id: 'rude_buster',
        label: 'Rude Buster',
        tpCost: 50,
        tpText: '50% TP',
        enabled: tp >= 50,
        desc: 'Rude Damage. Press [Z] before impact!'
      },
      {
        id: 'ultimat_heal',
        label: 'UltimatHeal',
        tpCost: 100,
        tpText: '100% TP',
        enabled: tp >= 100,
        desc: `Heals 1 ally (${getMemberMag(actor) + 12} HP).`
      }
    ];
  }

  const healAmt = calculateHealPrayerAmount(actor);
  return [
    {
      id: 'heal_prayer',
      label: 'Heal Prayer',
      tpCost: 32,
      tpText: '32% TP',
      enabled: tp >= 32,
      desc: `Heavenly light restores ${healAmt} HP to 1 ally.`
    },
    {
      id: 'pacify',
      label: 'Pacify',
      tpCost: 16,
      tpText: '16% TP',
      enabled: tp >= 16,
      desc: 'Spare a TIRED enemy by putting them to sleep.'
    }
  ];
}

// ============================================================================
// AUTHENTIC DELTARUNE 3-LANE FIGHT PRESS-TIMING BARS
// ============================================================================
function drawFightReticles(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxW: number,
  _boxH: number,
  party: PartyMember[],
  fightLanes: FightLane[]
): void {
  const laneH = 30;
  const startY = boxY + 8;
  const trackStartX = boxX + 54;
  const targetSlotX = trackStartX + 8;

  fightLanes.forEach((lane, idx) => {
    const m = party[lane.actorIndex];
    const ly = startY + idx * (laneH + 2);

    // Character headshot icon on left of lane!
    drawMemberPortrait(ctx, m, boxX + 12, ly + 3);

    // Deltarune segmented dark colored track blocks
    const trackW = boxW - 72;
    ctx.strokeStyle = m.id === 'kris' ? '#004477' : m.id === 'susie' ? '#660066' : '#005522';
    ctx.lineWidth = 1;
    for (let bx = 0; bx < trackW; bx += 28) {
      ctx.strokeRect(trackStartX + bx, ly + 3, 26, laneH - 6);
    }

    // Colored target reticle box on the left (Kris cyan / Susie magenta / Ralsei green)
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(targetSlotX - 6, ly + 1, 12, laneH - 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(targetSlotX - 3, ly + 4, 6, laneH - 8);

    // Sliding white attack bar + colored trailing afterimages!
    if (!lane.resolved || lane.flashTimer > 0) {
      const cx = trackStartX + lane.cursorX;
      if (!lane.resolved) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = m.color;
        ctx.fillRect(cx + 6, ly + 2, 5, laneH - 4);
        ctx.globalAlpha = 0.16;
        ctx.fillRect(cx + 13, ly + 2, 5, laneH - 4);
        ctx.restore();
      }
      const expand = lane.resolved ? (0.25 - lane.flashTimer) * 18 : 0;
      ctx.fillStyle = lane.isCrit ? '#ffff00' : '#ffffff';
      ctx.fillRect(cx - 3, ly - expand * 0.5, 6, laneH + expand);
    }
  });
}

export function drawRudeBusterBolt(ctx: CanvasRenderingContext2D, bolt: RudeBusterBolt): void {
  if (!bolt.active) return;

  // Helper to draw a sweeping jagged crescent shockwave matching yt_sd2.jpg!
  const drawCrescentWave = (
    cx: number,
    cy: number,
    scale: number,
    fillColor: string,
    alpha: number,
    tilt: number
  ) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    // Outer sweeping arc (top-left tail to bottom-left tip)
    ctx.moveTo(-48, -42);
    ctx.quadraticCurveTo(8, -54, 46, -6);
    ctx.quadraticCurveTo(18, 42, -32, 48);
    // Jagged inner trailing edge
    ctx.lineTo(-12, 32);
    ctx.lineTo(-24, 24);
    ctx.lineTo(-2, 14);
    ctx.lineTo(-16, 4);
    ctx.lineTo(10, -6);
    ctx.lineTo(-8, -18);
    ctx.lineTo(4, -26);
    ctx.lineTo(-26, -32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // 1. Multi-layered trailing purple/violet crescent wakes (yt_sd2.jpg!)
  const wakeColors = ['#3b0778', '#6814c7', '#9f2bff'];
  bolt.trail.slice(-6).forEach((pt, idx, arr) => {
    const frac = (idx + 1) / arr.length;
    const col = bolt.boosted && idx === arr.length - 1
      ? '#ffe659'
      : wakeColors[Math.min(wakeColors.length - 1, Math.floor(frac * wakeColors.length))];
    drawCrescentWave(
      pt.x - (1 - frac) * 18,
      pt.y + (1 - frac) * 8,
      0.72 + frac * 0.36,
      col,
      pt.alpha * 0.85,
      0.12 - frac * 0.08
    );
  });

  // 2. Immediate violet body behind the leading edge
  drawCrescentWave(bolt.x - 10, bolt.y + 8, 1.08, '#9f2bff', 0.95, 0.08);

  // 3. Iconic blazing Mint-Cyan (#58ffd0) top/leading crescent blade (yt_sd2.jpg!)
  ctx.save();
  ctx.translate(bolt.x, bolt.y - 12);
  ctx.rotate(-0.18);
  ctx.fillStyle = bolt.boosted ? '#ffff99' : '#58ffd0';
  ctx.beginPath();
  ctx.moveTo(-56, -24);
  ctx.quadraticCurveTo(-4, -44, 48, -4);
  ctx.lineTo(34, 12);
  ctx.quadraticCurveTo(-10, -16, -48, -8);
  ctx.closePath();
  ctx.fill();

  // Crisp inner highlight along the mint crest
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-44, -20);
  ctx.quadraticCurveTo(-2, -36, 42, -4);
  ctx.stroke();
  ctx.restore();
}

export function drawPopups(ctx: CanvasRenderingContext2D, popups: FloatingPopup[]): void {
  for (const p of popups) {
    ctx.save();
    const alpha = Math.min(1, (p.life / p.maxLife) * 2.2);
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.round(14 * (p.scale ?? 1))}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText(p.text, p.x + 2, p.y + 2);
    ctx.fillText(p.text, p.x - 2, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  }
}

export function drawLoadoutOverlay(
  ctx: CanvasRenderingContext2D,
  party: PartyMember[],
  shadowMantleHolder: PartyId,
  cursor: number
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(24, 24, SCREEN_WIDTH - 48, SCREEN_HEIGHT - 48);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, SCREEN_WIDTH - 48, SCREEN_HEIGHT - 48);

  ctx.font = 'bold 14px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('PARTY STATS & EQUIPMENT', SCREEN_WIDTH / 2, 56);
  ctx.textAlign = 'left';

  ctx.font = '20px "VT323", monospace';
  ctx.fillStyle = '#c084fc';
  ctx.fillText(
    '* Choose who equips the ShadowMantle (+3 DF, -67% Dark/Star damage):',
    48,
    86
  );

  party.forEach((m, idx) => {
    const y = 108 + idx * 74;
    const selected = cursor === idx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(46, y, SCREEN_WIDTH - 92, 64);
    ctx.strokeStyle = selected ? m.color : '#332066';
    ctx.lineWidth = 2;
    ctx.strokeRect(46, y, SCREEN_WIDTH - 92, 64);

    if (selected) {
      drawSoulHeart(ctx, 64, y + 32, 0.88, '#ff0000');
    }
    drawMemberPortrait(ctx, m, 80, y + 19);

    ctx.font = 'bold 12px "Press Start 2P", monospace';
    ctx.fillStyle = m.color;
    ctx.fillText(`${m.name}  LV 3`, 116, y + 24);

    if (shadowMantleHolder === m.id) {
      ctx.fillStyle = '#ffff00';
      ctx.fillText('[SHADOW MANTLE]', 285, y + 24);
    }

    ctx.font = '20px "VT323", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      `HP ${m.maxHp}   AT ${getMemberAt(m)}   DF ${getMemberDf(m)}   MAG ${getMemberMag(m)}`,
      116,
      y + 50
    );
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(`${m.weapon.name} / ${m.armor1.name} / ${m.armor2.name}`, 362, y + 50);
  });

  ctx.fillStyle = '#000000';
  ctx.fillRect(46, 340, SCREEN_WIDTH - 92, 64);
  ctx.strokeStyle = '#332066';
  ctx.strokeRect(46, 340, SCREEN_WIDTH - 92, 64);

  ctx.font = '20px "VT323", monospace';
  ctx.fillStyle = '#00ff00';
  ctx.fillText('* ITEMS: 4x ReviveMint  •  3x SpinCake (150 HP)  •  3x TopCake (160 HP)', 58, 365);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('* KNIGHT: 7,300 HP  •  AT 40  •  DF 0  •  Phase 4 at <= 80% HP (5,840 HP)', 58, 391);

  ctx.font = '19px "VT323", monospace';
  ctx.fillStyle = '#ffff00';
  ctx.textAlign = 'center';
  ctx.fillText('[Up/Down] Select   [Z/Enter] Equip ShadowMantle   [X/Shift] Back', SCREEN_WIDTH / 2, 438);
  ctx.textAlign = 'left';
}

export function drawPracticeSelector(
  ctx: CanvasRenderingContext2D,
  patternIds: AttackPatternId[],
  cursor: number
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(24, 20, SCREEN_WIDTH - 48, SCREEN_HEIGHT - 40);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 20, SCREEN_WIDTH - 48, SCREEN_HEIGHT - 40);

  ctx.font = 'bold 13px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('PRACTICE SPECIFIC ATTACK', SCREEN_WIDTH / 2, 50);
  ctx.textAlign = 'left';

  const perCol = 9;
  patternIds.forEach((id, idx) => {
    const def = ATTACK_DEFINITIONS[id];
    const col = Math.floor(idx / perCol);
    const row = idx % perCol;
    const x = 58 + col * 284;
    const y = 84 + row * 37;
    const selected = cursor === idx;

    if (selected) {
      drawSoulHeart(ctx, x - 18, y - 5, 0.78, '#ff0000');
    }
    ctx.font = '21px "VT323", monospace';
    ctx.fillStyle = selected ? '#ffff00' : '#ffffff';
    ctx.fillText(`Phase ${def.phase}: ${def.name}`, x, y);
  });

  ctx.font = '19px "VT323", monospace';
  ctx.fillStyle = '#ffff00';
  ctx.textAlign = 'center';
  ctx.fillText('[Arrows] Select Attack   [Z/Enter] Start   [X/Shift] Back', SCREEN_WIDTH / 2, 438);
  ctx.textAlign = 'left';
}

function wrapText(text: string, maxChars: number): string[] {
  const paragraphs = text.split('\n');
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(' ');
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars && cur.length > 0) {
        out.push(cur);
        cur = w;
      } else {
        cur = cur ? `${cur} ${w}` : w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

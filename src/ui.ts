import {
  calculateHealPrayerAmount,
  getMemberAt,
  getMemberDf,
  getMemberMag,
  hasShadowMantle
} from './combat';
import { ATTACK_DEFINITIONS, SCREEN_HEIGHT, SCREEN_WIDTH } from './constants';
import { drawCommandIcon, drawMemberPortrait, drawSoulHeart } from './sprites';
import {
  AttackPatternId,
  FightLane,
  FloatingPopup,
  InventoryItem,
  KnightState,
  PartyId,
  PartyMember,
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
// CHAPTER 3 "COLD PLACE" SNOWY GROUND & DARK FOUNTAIN BACKGROUND
// ============================================================================
export function drawBattleBackground(
  ctx: CanvasRenderingContext2D,
  time: number,
  isRoaringPhase: boolean
): void {
  // Pitch-black void sky
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SCREEN_WIDTH, 326);
  ctx.clip();

  // 1. Distant Towering Dark Fountain Pillar in the sky (y: 0..242)
  const fountainCx = isRoaringPhase ? 320 : 350;
  const baseHalfW = isRoaringPhase ? 120 : 68;
  for (let y = 0; y < 242; y += 4) {
    const wave1 = Math.sin(y * 0.045 - time * 2.8) * 10;
    const wave2 = Math.cos(y * 0.08 + time * 1.9) * 5;
    const spread = (1 - y / 242) * 20;
    const hw = baseHalfW + spread;

    // Outer dark aura band
    ctx.fillStyle = isRoaringPhase ? '#2b2b36' : '#0a1428';
    ctx.fillRect(
      Math.round(fountainCx + wave1 - hw * 1.35),
      y,
      Math.round(hw * 2.7),
      4
    );

    // Mid fountain band
    ctx.fillStyle = isRoaringPhase ? '#6e6e82' : '#13264a';
    ctx.fillRect(
      Math.round(fountainCx + wave1 * 0.7 + wave2 - hw * 0.82),
      y,
      Math.round(hw * 1.64),
      4
    );

    // Inner bright geyser core
    ctx.fillStyle = isRoaringPhase ? '#e4e4f0' : '#1f3d73';
    ctx.fillRect(
      Math.round(fountainCx - wave2 - hw * 0.34),
      y,
      Math.round(hw * 0.68),
      4
    );
  }

  // Subtle eerie TV-static horizontal scanline glints in the dark sky
  ctx.fillStyle = isRoaringPhase
    ? 'rgba(255, 255, 255, 0.09)'
    : 'rgba(130, 170, 235, 0.05)';
  for (let i = 0; i < 9; i++) {
    const sy = Math.floor(((time * 38 + i * 29) % 230) / 2) * 2;
    ctx.fillRect(0, sy, SCREEN_WIDTH, 2);
  }

  // 2. Distant Cold Place dark pine/cliff horizon silhouettes (y: 206..242)
  ctx.fillStyle = '#070d1c';
  const treePositions = [22, 58, 95, 148, 210, 468, 522, 566, 608];
  for (const tx of treePositions) {
    ctx.beginPath();
    ctx.moveTo(tx, 204);
    ctx.lineTo(tx - 20, 242);
    ctx.lineTo(tx + 20, 242);
    ctx.closePath();
    ctx.fill();
  }

  // 3. Snowy Cold Place Ground (y: 238..326) — Pale icy blue & pixel snowbanks!
  if (isRoaringPhase) {
    // Stark high-contrast monochrome snowground during The Roaring!
    ctx.fillStyle = '#181820';
    ctx.fillRect(0, 238, SCREEN_WIDTH, 88);
    ctx.fillStyle = '#323242';
    ctx.fillRect(0, 238, SCREEN_WIDTH, 10);
    ctx.fillStyle = '#bcbcd0';
    ctx.fillRect(0, 238, SCREEN_WIDTH, 3);
  } else {
    // Deep blue-slate snow base
    ctx.fillStyle = '#1b2847';
    ctx.fillRect(0, 238, SCREEN_WIDTH, 88);

    // Mid pale-blue snowfield
    ctx.fillStyle = '#334978';
    ctx.fillRect(0, 240, SCREEN_WIDTH, 66);

    ctx.fillStyle = '#5874ab';
    ctx.fillRect(0, 242, SCREEN_WIDTH, 42);

    // Bright crisp snowdrift top crust with pixel undulations
    ctx.fillStyle = '#9bb3de';
    for (let x = 0; x < SCREEN_WIDTH; x += 8) {
      const h = 14 + Math.round(Math.sin(x * 0.035) * 4);
      ctx.fillRect(x, 238, 8, h);
    }
    ctx.fillStyle = '#d4e2fa';
    for (let x = 0; x < SCREEN_WIDTH; x += 8) {
      const yOff = Math.round(Math.sin(x * 0.05 + 1) * 2);
      ctx.fillRect(x, 236 + yOff, 8, 5);
    }

    // Scattered pixel snow speckles on the ground
    ctx.fillStyle = '#9bb3de';
    for (let i = 0; i < 28; i++) {
      const sx = ((i * 73) % 620) + 10;
      const sy = 258 + ((i * 37) % 56);
      ctx.fillRect(sx, sy, 4, 2);
    }
  }

  // 4. Gently drifting pixelated snow / static particles
  ctx.fillStyle = isRoaringPhase ? '#ffffff' : '#dce8ff';
  for (let i = 0; i < 34; i++) {
    const px = Math.round((i * 97 - time * (16 + (i % 4) * 5)) % SCREEN_WIDTH);
    const wrappedX = px < 0 ? px + SCREEN_WIDTH : px;
    const py = Math.round((i * 53 + time * (22 + (i % 3) * 8)) % 320);
    const sz = i % 3 === 0 ? 3 : 2;
    ctx.fillRect(wrappedX, py, sz, sz);
  }

  ctx.restore();
}

// ============================================================================
// AUTHENTIC DELTARUNE LEFT-SIDE TP BAR
// ============================================================================
export function drawTpBar(ctx: CanvasRenderingContext2D, tp: number): void {
  const barX = 38;
  const barY = 42;
  const barW = 21;
  const barH = 178;

  // Stacked "T" "P" text on the left of the gauge (just like real Deltarune!)
  ctx.font = 'bold 14px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('T', 12, barY + 26);
  ctx.fillText('P', 12, barY + 44);

  const pct = Math.max(0, Math.min(100, Math.floor(tp)));
  if (pct >= 100) {
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffff00';
    ctx.fillText('M', 12, barY + 76);
    ctx.fillText('A', 12, barY + 91);
    ctx.fillText('X', 12, barY + 106);
  } else {
    ctx.font = 'bold 12px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${pct}`, 21, barY + 78);
    ctx.fillText('%', 21, barY + 96);
    ctx.textAlign = 'left';
  }

  // Black shadow + White outer border + Dark maroon empty track
  ctx.fillStyle = '#000000';
  ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.fillStyle = '#540d1e';
  ctx.fillRect(barX + 2, barY + 2, barW - 4, barH - 4);

  // Bright Deltarune Orange (#ffa040) or MAX Yellow (#ffff00) fill
  const innerH = barH - 4;
  const fillH = Math.round((innerH * pct) / 100);
  if (fillH > 0) {
    ctx.fillStyle = pct >= 100 ? '#ffff00' : '#ffa040';
    ctx.fillRect(barX + 2, barY + 2 + (innerH - fillH), barW - 4, fillH);
    // Crisp white liquid surface highlight
    if (pct < 100) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(barX + 2, barY + 2 + (innerH - fillH), barW - 4, 3);
    }
  }
}

export function drawTopHudBadge(
  ctx: CanvasRenderingContext2D,
  knight: KnightState,
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
// AUTHENTIC DELTARUNE 3-CARD PARTY STRIP + DARK WORLD DIALOGUE BOX
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
  fightLanes: FightLane[]
): void {
  // Solid black HUD base (y: 326..480)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 326, SCREEN_WIDTH, SCREEN_HEIGHT - 326);

  // Decorative Deltarune Dark World purple-blue divider lines at y = 326 & y = 363
  ctx.fillStyle = '#332066';
  ctx.fillRect(0, 326, SCREEN_WIDTH, 3);
  ctx.fillRect(0, 362, SCREEN_WIDTH, 3);

  const cardW = 212;
  const startX = 2;

  // 1. Render the 3 Party Member HUD Cards (KRIS, SUSIE, RALSEI)
  party.forEach((m, idx) => {
    const isActiveMenu = subState === 'PARTY_MENU' && menu.activeActorIndex === idx;
    const cx = startX + idx * (cardW + 1);
    const cy = isActiveMenu ? 294 : 328;
    const cardH = isActiveMenu ? 69 : 34;

    // Card background & border
    ctx.fillStyle = '#000000';
    ctx.fillRect(cx, cy, cardW, cardH);

    if (isActiveMenu) {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, cy + 1, cardW - 2, cardH - 2);
      // Inner divider separating Portrait/HP from the 5 Action Icons
      ctx.fillStyle = m.color;
      ctx.fillRect(cx + 1, cy + 34, cardW - 2, 2);
    } else if (idx > 0) {
      ctx.fillStyle = '#221544';
      ctx.fillRect(cx, 329, 2, 33);
    }

    // Pixel-art Character Headshot Portrait on left!
    drawMemberPortrait(ctx, m, cx + 6, cy + 5);

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
    ctx.fillText(m.name, cx + 38, cy + 17);

    // Subtle ShadowMantle mini-star indicator next to name
    if (hasShadowMantle(m)) {
      ctx.fillStyle = '#b983ff';
      ctx.fillRect(cx + 38, cy + 22, 6, 6);
      ctx.fillStyle = '#000000';
      ctx.fillRect(cx + 40, cy + 24, 2, 2);
    }

    // HP Label, Numbers & Canonical #00FF00 Green Bar over #800000 Maroon!
    const hpAreaX = cx + 112;
    ctx.font = 'bold 8px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('HP', hpAreaX, cy + 13);

    ctx.textAlign = 'right';
    ctx.font = '16px "VT323", monospace';
    if (m.status === 'SWOON') {
      ctx.fillStyle = '#ff1744';
      ctx.fillText('SWOON -999', cx + cardW - 6, cy + 14);
    } else if (m.status === 'DOWN') {
      ctx.fillStyle = '#ff4444';
      ctx.fillText(`${m.hp}/${m.maxHp}`, cx + cardW - 6, cy + 14);
    } else {
      ctx.fillStyle = m.hp <= m.maxHp * 0.25 ? '#ffff00' : '#ffffff';
      ctx.fillText(`${m.hp}/${m.maxHp}`, cx + cardW - 6, cy + 14);
    }
    ctx.textAlign = 'left';

    // HP Gauge (Deltarune exact #800000 empty + #00ff00 fill!)
    const barX = hpAreaX;
    const barY = cy + 19;
    const barW = cardW - 118;
    const barH = 9;
    ctx.fillStyle = '#800000';
    ctx.fillRect(barX, barY, barW, barH);
    if (m.hp > 0) {
      const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
    }

    // Active Character's 5 Deltarune Pixel-Art Command Icons!
    if (isActiveMenu) {
      const icons: Array<'FIGHT' | 'ACT' | 'MAGIC' | 'ITEM' | 'SPARE' | 'DEFEND'> =
        m.id === 'kris'
          ? ['FIGHT', 'ACT', 'ITEM', 'SPARE', 'DEFEND']
          : ['FIGHT', 'MAGIC', 'ITEM', 'SPARE', 'DEFEND'];

      icons.forEach((iconKind, bIdx) => {
        const ix = cx + 12 + bIdx * 39;
        const iy = cy + 40;
        const selected = menu.subMode === 'ROOT' && menu.rootButtonIndex === bIdx;
        drawCommandIcon(ctx, iconKind, ix, iy, selected);
      });
    }
  });

  // 2. Bottom Dark World Frame Box (y: 365..476)
  const boxX = 6;
  const boxY = 366;
  const boxW = SCREEN_WIDTH - 12;
  const boxH = 108;

  ctx.fillStyle = '#000000';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  // Outer Deltarune Dark World indigo-violet frame + inner crisp accent
  ctx.strokeStyle = '#332066';
  ctx.lineWidth = 3;
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#1b1038';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 4, boxY + 4, boxW - 8, boxH - 8);

  if (subState === 'FIGHT_BARS') {
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

  // Typewriter flavor / battle dialogue text
  const shown = dialogueText.slice(0, dialogueCharsShown);
  const lines = wrapText(shown, 54);
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px "VT323", monospace';
  lines.slice(0, 3).forEach((ln, idx) => {
    ctx.fillText(ln, boxX + 22, boxY + 34 + idx * 28);
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

  for (const pt of bolt.trail) {
    ctx.save();
    ctx.globalAlpha = pt.alpha * 0.65;
    ctx.strokeStyle = bolt.boosted ? '#ffff00' : '#ff00dd';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 18, -0.9, 0.9);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(bolt.x, bolt.y);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 22, -1.05, 1.05);
  ctx.stroke();

  ctx.strokeStyle = bolt.boosted ? '#ffff00' : '#ff00dd';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(4, 0, 25, -1.1, 1.1);
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

import {
  calculateHealPrayerAmount,
  getMemberAt,
  getMemberDf,
  getMemberMag,
  hasShadowMantle
} from './combat';
import { ATTACK_DEFINITIONS, SCREEN_HEIGHT, SCREEN_WIDTH } from './constants';
import { drawSoulHeart } from './sprites';
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

const ROOT_LABELS_KRIS = ['FIGHT', 'ACT', 'ITEM', 'SPARE', 'DEFEND'];
const ROOT_LABELS_MAGE = ['FIGHT', 'MAGIC', 'ITEM', 'SPARE', 'DEFEND'];

export function drawBattleBackground(
  ctx: CanvasRenderingContext2D,
  time: number,
  isRoaringPhase: boolean
): void {
  ctx.fillStyle = '#030108';
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  // Authentic Deltarune scrolling Dark World battle grid
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SCREEN_WIDTH, 326);
  ctx.clip();

  const gridStroke = isRoaringPhase
    ? 'rgba(220, 195, 255, 0.22)'
    : 'rgba(98, 42, 168, 0.24)';
  ctx.strokeStyle = gridStroke;
  ctx.lineWidth = 1;

  const spacing = 40;
  const ox = (time * 18) % spacing;
  const oy = (time * 14) % spacing;

  for (let x = -spacing + ox; x < SCREEN_WIDTH + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 326);
    ctx.stroke();
  }
  for (let y = -spacing + oy; y < 326 + spacing; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SCREEN_WIDTH, y);
    ctx.stroke();
  }

  // Dark Fountain background rift glow on the right
  const grad = ctx.createRadialGradient(490, 155, 8, 490, 155, 195);
  if (isRoaringPhase) {
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(0.45, 'rgba(168, 85, 247, 0.14)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    grad.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
    grad.addColorStop(0.55, 'rgba(59, 7, 100, 0.1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(260, 0, 380, 326);

  ctx.restore();
}

export function drawTpBar(ctx: CanvasRenderingContext2D, tp: number): void {
  const x = 16;
  const y = 44;
  const w = 19;
  const h = 166;

  // TP Label
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px "Press Start 2P", monospace';
  ctx.fillText('T', x + 2, y - 20);
  ctx.fillText('P', x + 2, y - 6);

  const pct = Math.max(0, Math.min(100, Math.floor(tp)));
  ctx.font = '18px "VT323", monospace';
  ctx.fillStyle = pct >= 100 ? '#ffe64d' : '#ffffff';
  ctx.fillText(pct >= 100 ? 'MAX' : `${pct}%`, x - 2, y + h + 18);

  // Outer Frame
  ctx.fillStyle = '#140b24';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // Orange / Gold Fill from bottom up
  const fillH = Math.round(((h - 4) * pct) / 100);
  if (fillH > 0) {
    ctx.fillStyle = pct >= 100 ? '#ffd93d' : '#ff8c24';
    ctx.fillRect(x + 2, y + h - 2 - fillH, w - 4, fillH);
    // White highlight cap line
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 2, y + h - 2 - fillH, w - 4, 2);
  }
}

export function drawTopHudBadge(
  ctx: CanvasRenderingContext2D,
  knight: KnightState,
  isPractice: boolean,
  muted: boolean
): void {
  ctx.save();
  ctx.font = '16px "VT323", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(216, 196, 255, 0.78)';
  const phaseLabel = isPractice
    ? 'PRACTICE MODE'
    : knight.phase4Completed
      ? 'FINAL THRESHOLD — FINISH IT!'
      : `TURN ${knight.turnCount}  •  PHASE ${knight.phase}`;
  ctx.fillText(
    `${phaseLabel}${muted ? '  [MUTED]' : ''}`,
    SCREEN_WIDTH - 14,
    20
  );
  ctx.restore();
}

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
  const stripY = 328;
  const cardW = 204;
  const gap = 8;
  const startX = 8;

  // 1. Draw the 3 Character Cards
  party.forEach((m, idx) => {
    const isActiveMenu = subState === 'PARTY_MENU' && menu.activeActorIndex === idx;
    const lift = isActiveMenu ? -24 : 0;
    const cx = startX + idx * (cardW + gap);
    const cy = stripY + lift;
    const cardH = isActiveMenu ? 68 : 44;

    ctx.fillStyle = '#05020a';
    ctx.fillRect(cx, cy, cardW, cardH);

    ctx.strokeStyle = isActiveMenu ? m.color : '#2c1f4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cardW, cardH);

    // Name + Mantle badge
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.fillStyle = m.status === 'UP' ? m.color : '#7b6f94';
    ctx.fillText(m.name, cx + 8, cy + 18);

    if (hasShadowMantle(m)) {
      ctx.font = '14px "VT323", monospace';
      ctx.fillStyle = '#d8b4fe';
      ctx.fillText('[MANTLE]', cx + 74, cy + 17);
    }

    // HP Text & Status Tag (DOWN / SWOON -999!)
    ctx.textAlign = 'right';
    ctx.font = '17px "VT323", monospace';
    if (m.status === 'SWOON') {
      ctx.fillStyle = '#ff244c';
      ctx.fillText(`SWOON ${m.hp}/${m.maxHp}`, cx + cardW - 7, cy + 17);
    } else if (m.status === 'DOWN') {
      ctx.fillStyle = '#ff5c5c';
      ctx.fillText(`DOWN ${m.hp}/${m.maxHp}`, cx + cardW - 7, cy + 17);
    } else {
      ctx.fillStyle = m.hp <= m.maxHp * 0.25 ? '#ffe64d' : '#ffffff';
      ctx.fillText(`HP ${m.hp}/${m.maxHp}`, cx + cardW - 7, cy + 17);
    }
    ctx.textAlign = 'left';

    // HP Bar
    const barX = cx + 82;
    const barY = cy + 24;
    const barW = cardW - 90;
    const barH = 9;
    ctx.fillStyle = '#421222';
    ctx.fillRect(barX, barY, barW, barH);
    if (m.hp > 0) {
      const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));
      ctx.fillStyle = m.hpBarColor;
      ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
    }

    // Active Character's 5 Deltarune Command Icons!
    if (isActiveMenu) {
      const labels = m.id === 'kris' ? ROOT_LABELS_KRIS : ROOT_LABELS_MAGE;
      const btnW = 37;
      labels.forEach((lbl, bIdx) => {
        const bx = cx + 6 + bIdx * (btnW + 2);
        const by = cy + 40;
        const selected = menu.subMode === 'ROOT' && menu.rootButtonIndex === bIdx;
        ctx.fillStyle = selected ? '#2a1608' : '#0f081c';
        ctx.fillRect(bx, by, btnW, 21);
        ctx.strokeStyle = selected ? '#ffae2b' : '#583c7a';
        ctx.lineWidth = selected ? 2 : 1;
        ctx.strokeRect(bx, by, btnW, 21);

        ctx.font = '13px "VT323", monospace';
        ctx.fillStyle = selected ? '#ffe659' : '#d58a3d';
        ctx.textAlign = 'center';
        ctx.fillText(lbl, bx + btnW / 2, by + 15);
        ctx.textAlign = 'left';
      });
    }
  });

  // 2. Draw Bottom Dialogue / Submenu / FIGHT Reticle Box
  const boxX = 8;
  const boxY = 374;
  const boxW = SCREEN_WIDTH - 16;
  const boxH = 98;

  ctx.fillStyle = '#000000';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#3e2772';
  ctx.lineWidth = 3;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

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

  // Typewriter flavor / action resolution text
  const shown = dialogueText.slice(0, dialogueCharsShown);
  const lines = wrapText(shown, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = '22px "VT323", monospace';
  lines.slice(0, 3).forEach((ln, idx) => {
    ctx.fillText(ln, boxX + 20, boxY + 32 + idx * 26);
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
    drawSoulHeart(ctx, boxX + 28, boxY + 32, 0.85, '#ff0022');
    ctx.font = '22px "VT323", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('THE ROARING KNIGHT', boxX + 48, boxY + 38);

    // Canonical enemy HP gauge on target select
    const hpRatio = Math.max(0, Math.min(1, knight.hp / knight.maxHp));
    const barX = boxX + 340;
    const barY = boxY + 23;
    const barW = 190;
    ctx.fillStyle = '#3c1324';
    ctx.fillRect(barX, barY, barW, 14);
    ctx.fillStyle = hpRatio <= 0.8 ? '#c084fc' : '#2ee65f';
    ctx.fillRect(barX, barY, Math.round(barW * hpRatio), 14);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, 14);

    // 80% Phase 4 Threshold tick mark!
    const threshX = barX + Math.round(barW * 0.8);
    ctx.fillStyle = '#ffe659';
    ctx.fillRect(threshX, barY - 2, 2, 18);

    ctx.font = '18px "VT323", monospace';
    ctx.fillStyle = '#b4a5d4';
    ctx.fillText(`${Math.ceil(hpRatio * 100)}%`, barX + barW + 10, boxY + 36);
    return;
  }

  if (menu.subMode === 'TARGET_ALLY') {
    ctx.font = '21px "VT323", monospace';
    party.forEach((m, idx) => {
      const rowY = boxY + 28 + idx * 26;
      if (menu.allyCursor === idx) {
        drawSoulHeart(ctx, boxX + 26, rowY - 6, 0.8, '#ff0022');
      }
      ctx.fillStyle = m.status === 'SWOON' ? '#ff3355' : '#ffffff';
      ctx.fillText(m.name, boxX + 46, rowY);

      ctx.fillStyle =
        m.status === 'SWOON' ? '#ff3355' : m.status === 'DOWN' ? '#ff7777' : '#65ff8f';
      const statusLabel =
        m.status === 'SWOON'
          ? `SWOON (-999/${m.maxHp})`
          : m.status === 'DOWN'
            ? `DOWN (${m.hp}/${m.maxHp})`
            : `${m.hp} / ${m.maxHp} HP`;
      ctx.fillText(statusLabel, boxX + 180, rowY);
    });
    return;
  }

  if (menu.subMode === 'ACT_MAGIC_LIST') {
    const entries = getActorSpecialEntries(actor, tp, holdBreathUsed);
    entries.forEach((e, idx) => {
      const rowY = boxY + 32 + idx * 30;
      if (menu.listCursor === idx) {
        drawSoulHeart(ctx, boxX + 26, rowY - 6, 0.8, '#ff0022');
      }
      ctx.font = '22px "VT323", monospace';
      ctx.fillStyle = e.enabled ? '#ffffff' : '#665b7c';
      ctx.fillText(e.label, boxX + 46, rowY);
      if (e.tpText) {
        ctx.fillStyle = e.enabled ? '#ffa938' : '#665b7c';
        ctx.fillText(e.tpText, boxX + 215, rowY);
      }
    });

    // Right-hand description pane
    const current = entries[menu.listCursor];
    if (current) {
      ctx.strokeStyle = '#2d1c52';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(boxX + 320, boxY + 10);
      ctx.lineTo(boxX + 320, boxY + boxH - 10);
      ctx.stroke();

      ctx.font = '18px "VT323", monospace';
      ctx.fillStyle = '#d3c5f0';
      wrapText(current.desc, 30)
        .slice(0, 3)
        .forEach((ln, i) => {
          ctx.fillText(ln, boxX + 334, boxY + 30 + i * 22);
        });
    }
    return;
  }

  if (menu.subMode === 'ITEM_LIST') {
    if (inventory.length === 0) {
      ctx.font = '22px "VT323", monospace';
      ctx.fillStyle = '#8b7fa8';
      ctx.fillText('* (No items remaining.)', boxX + 24, boxY + 42);
      return;
    }

    // 2-column scrollable Deltarune Dark Item grid (shows 6 items per window)
    const pageStart = Math.floor(menu.listCursor / 6) * 6;
    const visible = inventory.slice(pageStart, pageStart + 6);
    visible.forEach((item, localIdx) => {
      const realIdx = pageStart + localIdx;
      const col = localIdx % 2;
      const row = Math.floor(localIdx / 2);
      const ix = boxX + 44 + col * 185;
      const iy = boxY + 28 + row * 26;

      if (menu.listCursor === realIdx) {
        drawSoulHeart(ctx, ix - 18, iy - 6, 0.78, '#ff0022');
      }
      const reserved = menu.reservedItemSlots.has(realIdx);
      ctx.font = '21px "VT323", monospace';
      ctx.fillStyle = reserved ? '#5f5475' : '#ffffff';
      ctx.fillText(item.shortName, ix, iy);
    });

    // Right description pane + item counter
    ctx.strokeStyle = '#2d1c52';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(boxX + 402, boxY + 10);
    ctx.lineTo(boxX + 402, boxY + boxH - 10);
    ctx.stroke();

    const selectedItem = inventory[menu.listCursor];
    if (selectedItem) {
      ctx.font = '17px "VT323", monospace';
      ctx.fillStyle = '#d3c5f0';
      wrapText(selectedItem.desc, 24)
        .slice(0, 3)
        .forEach((ln, i) => {
          ctx.fillText(ln, boxX + 414, boxY + 26 + i * 20);
        });
      ctx.fillStyle = '#ffe659';
      ctx.fillText(
        `ITEM ${menu.listCursor + 1}/${inventory.length}`,
        boxX + 414,
        boxY + boxH - 10
      );
    }
  }
}

export function getActorSpecialEntries(
  actor: PartyMember,
  tp: number,
  holdBreathUsed: boolean
): Array<{ id: string; label: string; tpCost: number; tpText: string; enabled: boolean; desc: string }> {
  if (actor.id === 'kris') {
    return [
      {
        id: 'check',
        label: 'Check',
        tpCost: 0,
        tpText: '',
        enabled: true,
        desc: 'Inspect THE ROARING KNIGHT stats and vulnerabilities.'
      },
      {
        id: 'hold_breath',
        label: 'HoldBreath',
        tpCost: 0,
        tpText: holdBreathUsed ? 'ACTIVE' : '0% TP',
        enabled: !holdBreathUsed,
        desc: holdBreathUsed
          ? 'SOUL speed boost is already active for this fight!'
          : 'Permanently boosts SOUL speed for the rest of the battle!'
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
        desc: 'Heavy Rude damage! Press [Z] right before impact for bonus damage!'
      },
      {
        id: 'ultimat_heal',
        label: 'UltimatHeal',
        tpCost: 100,
        tpText: '100% TP',
        enabled: tp >= 100,
        desc: `Susie's "ultimate" heal. Restores ${getMemberMag(actor) + 12} HP to one ally.`
      }
    ];
  }

  // Ralsei
  const healAmt = calculateHealPrayerAmount(actor);
  return [
    {
      id: 'heal_prayer',
      label: 'Heal Prayer',
      tpCost: 32,
      tpText: '32% TP',
      enabled: tp >= 32,
      desc: `Heavenly light restores ${healAmt} HP (MAGx5) to one conscious ally.`
    },
    {
      id: 'pacify',
      label: 'Pacify',
      tpCost: 16,
      tpText: '16% TP',
      enabled: tp >= 16,
      desc: 'Put a TIRED enemy to sleep.'
    }
  ];
}

function drawFightReticles(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  party: PartyMember[],
  fightLanes: FightLane[]
): void {
  const laneH = 26;
  const startY = boxY + 10;
  const targetSlotX = boxX + 56;

  fightLanes.forEach((lane, idx) => {
    const m = party[lane.actorIndex];
    const ly = startY + idx * (laneH + 3);

    // Character tag
    ctx.font = 'bold 10px "Press Start 2P", monospace';
    ctx.fillStyle = m.color;
    ctx.fillText(m.name.slice(0, 4), boxX + 10, ly + 17);

    // Track background
    ctx.fillStyle = '#0e071c';
    ctx.fillRect(boxX + 48, ly + 2, boxW - 64, laneH - 4);
    ctx.strokeStyle = m.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 48, ly + 2, boxW - 64, laneH - 4);
    ctx.globalAlpha = 1;

    // Target bullseye box [ ]
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(targetSlotX - 5, ly + 1, 10, laneH - 2);

    // Moving cursor bar!
    if (!lane.resolved || lane.flashTimer > 0) {
      const cx = boxX + 48 + lane.cursorX;
      ctx.fillStyle = lane.isCrit ? '#ffe64d' : '#ffffff';
      const barWidth = lane.resolved ? 8 : 5;
      ctx.fillRect(cx - barWidth * 0.5, ly, barWidth, laneH);
    }
  });

  ctx.font = '16px "VT323", monospace';
  ctx.fillStyle = '#a89ac9';
  ctx.textAlign = 'right';
  ctx.fillText('Press [Z] when bar aligns with [ ]!', boxX + boxW - 14, boxY + boxH - 8);
  ctx.textAlign = 'left';
}

export function drawRudeBusterBolt(ctx: CanvasRenderingContext2D, bolt: RudeBusterBolt): void {
  if (!bolt.active) return;

  // Magenta crescent trail
  for (const pt of bolt.trail) {
    ctx.save();
    ctx.globalAlpha = pt.alpha * 0.65;
    ctx.strokeStyle = bolt.boosted ? '#ffe659' : '#ff2ee6';
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

  ctx.strokeStyle = bolt.boosted ? '#ffe659' : '#ff00dd';
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
    // Crisp black outline
    ctx.fillStyle = '#000000';
    ctx.fillText(p.text, p.x + 2, p.y + 2);
    ctx.fillText(p.text, p.x - 1, p.y - 1);
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
  ctx.fillStyle = 'rgba(4, 1, 10, 0.95)';
  ctx.fillRect(24, 24, SCREEN_WIDTH - 48, SCREEN_HEIGHT - 48);
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, SCREEN_WIDTH - 48, SCREEN_HEIGHT - 48);

  ctx.font = 'bold 14px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('CANONICAL CH.3 STATS & SHADOW MANTLE', SCREEN_WIDTH / 2, 56);
  ctx.textAlign = 'left';

  ctx.font = '19px "VT323", monospace';
  ctx.fillStyle = '#d8b4fe';
  ctx.fillText(
    'Select who equips the ShadowMantle (+3 DF, -67% Dark/Star dmg, 1/2 Box Cleave):',
    48,
    86
  );

  party.forEach((m, idx) => {
    const y = 112 + idx * 74;
    const selected = cursor === idx;
    ctx.fillStyle = selected ? '#1e0e38' : '#0b0517';
    ctx.fillRect(46, y, SCREEN_WIDTH - 92, 64);
    ctx.strokeStyle = selected ? m.color : '#3a2463';
    ctx.lineWidth = 2;
    ctx.strokeRect(46, y, SCREEN_WIDTH - 92, 64);

    if (selected) {
      drawSoulHeart(ctx, 64, y + 32, 0.9, '#ff0022');
    }

    ctx.font = 'bold 12px "Press Start 2P", monospace';
    ctx.fillStyle = m.color;
    ctx.fillText(`${m.name} (LV 3)`, 84, y + 24);

    if (shadowMantleHolder === m.id) {
      ctx.fillStyle = '#ffe659';
      ctx.fillText('★ SHADOW MANTLE EQUIPPED', 258, y + 24);
    }

    ctx.font = '19px "VT323", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      `HP ${m.maxHp}  |  AT ${getMemberAt(m)}  |  DF ${getMemberDf(m)}  |  MAG ${getMemberMag(m)}`,
      84,
      y + 49
    );
    ctx.fillStyle = '#b4a3d6';
    ctx.fillText(`${m.weapon.name} • ${m.armor1.name} • ${m.armor2.name}`, 360, y + 49);
  });

  // Canonical Starting Inventory Summary
  ctx.fillStyle = '#120826';
  ctx.fillRect(46, 344, SCREEN_WIDTH - 92, 62);
  ctx.strokeStyle = '#4c2c85';
  ctx.strokeRect(46, 344, SCREEN_WIDTH - 92, 62);

  ctx.font = '19px "VT323", monospace';
  ctx.fillStyle = '#65ff8f';
  ctx.fillText('STARTING ITEMS: 4x ReviveMint (MAX Revive) • 3x SpinCake (150 HP All) • 3x TopCake (160 HP All)', 58, 368);
  ctx.fillStyle = '#c4b5fd';
  ctx.fillText('BOSS STATS: THE ROARING KNIGHT — 7,300 HP (Phase 4 <= 80% / 5,840 HP), AT 40, DF 0 (0.20->0.35x Mult)', 58, 392);

  ctx.font = '18px "VT323", monospace';
  ctx.fillStyle = '#ffe659';
  ctx.textAlign = 'center';
  ctx.fillText('[Up/Down] Choose Member   [Z/Enter] Equip ShadowMantle   [X/Shift] Back to Title', SCREEN_WIDTH / 2, 438);
  ctx.textAlign = 'left';
}

export function drawPracticeSelector(
  ctx: CanvasRenderingContext2D,
  patternIds: AttackPatternId[],
  cursor: number
): void {
  ctx.fillStyle = 'rgba(4, 1, 10, 0.96)';
  ctx.fillRect(24, 20, SCREEN_WIDTH - 48, SCREEN_HEIGHT - 40);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 20, SCREEN_WIDTH - 48, SCREEN_HEIGHT - 40);

  ctx.font = 'bold 13px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('PRACTICE ROARING KNIGHT ATTACKS', SCREEN_WIDTH / 2, 50);
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
      drawSoulHeart(ctx, x - 18, y - 5, 0.78, '#ff0022');
    }
    ctx.font = '20px "VT323", monospace';
    ctx.fillStyle = selected ? '#ffe659' : '#e2d9f3';
    ctx.fillText(`P${def.phase}: ${def.name}`, x, y);
  });

  ctx.font = '18px "VT323", monospace';
  ctx.fillStyle = '#7dd3fc';
  ctx.textAlign = 'center';
  ctx.fillText('[Arrows] Select Attack   [Z/Enter] Start Practice   [X/Shift] Back to Title', SCREEN_WIDTH / 2, 438);
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

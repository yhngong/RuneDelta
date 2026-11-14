import {
  ATTACK_DEFINITIONS,
  KNIGHT_PHASE4_HP_THRESHOLD,
  PHASE_1_SEQUENCE,
  PHASE_2_SEQUENCE,
  PHASE_3_SEQUENCE,
  PHASE_4_SEQUENCE
} from './constants';
import {
  AttackDefinition,
  AttackPatternId,
  InventoryItem,
  KnightState,
  PartyMember
} from './types';

export function getMemberAt(m: PartyMember): number {
  return m.baseAt + m.weapon.at + m.armor1.at + m.armor2.at;
}

export function getMemberDf(m: PartyMember): number {
  return m.baseDf + m.weapon.df + m.armor1.df + m.armor2.df;
}

export function getMemberMag(m: PartyMember): number {
  return Math.max(0, m.baseMag + m.weapon.mag + m.armor1.mag + m.armor2.mag);
}

export function hasShadowMantle(m: PartyMember): boolean {
  return Boolean(m.armor1.shadowMantle || m.armor2.shadowMantle);
}

export function getPartyGrazeRadiusBonus(party: PartyMember[]): number {
  let bonus = 0;
  for (const m of party) {
    if (m.status === 'UP') {
      bonus += (m.armor1.grazeBonus ?? 0) + (m.armor2.grazeBonus ?? 0);
    }
  }
  return bonus;
}

export function getPartyTpGainMultiplier(party: PartyMember[]): number {
  let mult = 1;
  for (const m of party) {
    if (m.status === 'UP') {
      mult += (m.armor1.tpGainBonus ?? 0) + (m.armor2.tpGainBonus ?? 0);
    }
  }
  return mult;
}

// Knight's incoming damage multiplier starts at 0.20 on Turn 1 and rises +0.01/turn up to 0.35
export function getKnightDamageMultiplier(turnCount: number): number {
  return Math.min(0.35, 0.2 + Math.max(0, turnCount - 1) * 0.01);
}

// Kris deals 0.5x damage when both Susie & Ralsei are UP, 1.0x when one is down, 2.0x when both are down/SWOON!
export function getKrisAllyMultiplier(party: PartyMember[]): number {
  const susieUp = party[1]?.status === 'UP';
  const ralseiUp = party[2]?.status === 'UP';
  if (susieUp && ralseiUp) return 0.5;
  if (!susieUp && !ralseiUp) return 2.0;
  return 1.0;
}

// Compute Deltarune FIGHT reticle accuracy from distance to target slot (x = 38)
export function computeBarAccuracy(distancePx: number): {
  accuracy: number;
  isCrit: boolean;
  tpGain: number;
} {
  const d = Math.abs(distancePx);
  if (d <= 3.5) {
    return { accuracy: 150, isCrit: true, tpGain: 6 };
  }
  if (d <= 9) {
    return { accuracy: 120, isCrit: false, tpGain: 4 };
  }
  if (d <= 16) {
    return { accuracy: 110, isCrit: false, tpGain: 3 };
  }
  const framesOff = Math.floor(d / 3);
  const acc = Math.max(40, 100 - framesOff * 2);
  return { accuracy: acc, isCrit: false, tpGain: 2 };
}

export function calculateFightDamage(
  actor: PartyMember,
  accuracy: number,
  party: PartyMember[],
  knight: KnightState
): number {
  if (accuracy <= 0) return 0;
  const at = getMemberAt(actor);
  const raw = Math.round((at * accuracy) / 20 - knight.df * 3);
  const turnMult = getKnightDamageMultiplier(knight.turnCount);
  const allyMult = actor.id === 'kris' ? getKrisAllyMultiplier(party) : 1.0;
  return Math.max(1, Math.ceil(raw * turnMult * allyMult));
}

// Canonical Deltarune Rude Buster formula vs The Roaring Knight
export function calculateRudeBusterDamage(
  susie: PartyMember,
  timingBonus: number,
  knight: KnightState
): number {
  const at = getMemberAt(susie);
  const mag = getMemberMag(susie);
  const raw = at * 11 + mag * 5 - knight.df * 3 + timingBonus;
  const turnMult = getKnightDamageMultiplier(knight.turnCount);
  return Math.max(1, Math.ceil((raw * (turnMult + 0.65)) / 2));
}

// Canonical Heal Prayer formula: MAG * 5
export function calculateHealPrayerAmount(ralsei: PartyMember): number {
  return getMemberMag(ralsei) * 5;
}

export function applyHealToMember(
  target: PartyMember,
  amount: number,
  revivesSwoon: boolean
): { healed: number; revived: boolean; blockedBySwoon: boolean } {
  if (target.status === 'SWOON' && !revivesSwoon) {
    return { healed: 0, revived: false, blockedBySwoon: true };
  }

  if (revivesSwoon) {
    if (target.status === 'SWOON' || target.status === 'DOWN') {
      target.hp = target.maxHp;
      target.status = 'UP';
      target.pose = 'idle';
      return { healed: target.maxHp, revived: true, blockedBySwoon: false };
    } else {
      const restore = Math.ceil(target.maxHp * 0.5);
      const prev = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + restore);
      return { healed: target.hp - prev, revived: false, blockedBySwoon: false };
    }
  }

  // Standard heal (Heal Prayer, SpinCake, TopCake)
  const wasDown = target.status === 'DOWN';
  const prev = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  if (wasDown && target.hp > 0) {
    target.status = 'UP';
    target.pose = 'idle';
  }
  return {
    healed: target.hp - prev,
    revived: wasDown && target.status === 'UP',
    blockedBySwoon: false
  };
}

export function useInventoryItemOnParty(
  item: InventoryItem,
  party: PartyMember[],
  targetIndex: number
): Array<{ memberIndex: number; text: string; color: string }> {
  const results: Array<{ memberIndex: number; text: string; color: string }> = [];
  if (item.targetType === 'ally') {
    const target = party[targetIndex];
    if (!target) return results;
    const outcome = applyHealToMember(target, item.healAmount, item.revivesSwoon);
    if (outcome.blockedBySwoon) {
      results.push({ memberIndex: targetIndex, text: 'SWOON', color: '#ff3355' });
    } else if (outcome.revived && item.revivesSwoon) {
      results.push({ memberIndex: targetIndex, text: 'MAX', color: '#55ff77' });
    } else {
      results.push({
        memberIndex: targetIndex,
        text: `+${outcome.healed}`,
        color: '#55ff77'
      });
    }
  } else {
    // Party-wide item (SpinCake: 150 HP, TopCake: 160 HP)
    party.forEach((member, idx) => {
      const outcome = applyHealToMember(member, item.healAmount, item.revivesSwoon);
      if (outcome.blockedBySwoon) {
        results.push({ memberIndex: idx, text: 'SWOON', color: '#ff3355' });
      } else {
        results.push({
          memberIndex: idx,
          text: `+${outcome.healed}`,
          color: '#55ff77'
        });
      }
    });
  }
  return results;
}

// Start-of-turn natural regen: ONLY Kris can recover from DOWN (+14 HP/turn); SWOON (-999) NEVER regenerates!
export function applyStartOfTurnRegen(party: PartyMember[]): Array<{
  memberIndex: number;
  amount: number;
}> {
  const regens: Array<{ memberIndex: number; amount: number }> = [];
  party.forEach((m, idx) => {
    m.defending = false;
    if (m.pose !== 'down') {
      m.pose = 'idle';
    }
    if (m.status === 'DOWN' && m.id === 'kris') {
      const tick = Math.ceil(m.maxHp / 12); // +14 HP for 160 MaxHP
      m.hp += tick;
      if (m.hp > 0) {
        m.hp = Math.ceil(m.maxHp / 6); // stands up at 27 HP
        m.status = 'UP';
        m.pose = 'idle';
      }
      regens.push({ memberIndex: idx, amount: tick });
    }
  });
  return regens;
}

export interface DamageHitResult {
  memberIndex: number;
  damage: number;
  downed: boolean;
  swooned: boolean;
}

export function applyHitToMember(
  member: PartyMember,
  memberIndex: number,
  baseDamage: number,
  element: 'dark_star' | 'physical' | 'roaring',
  options?: { isBoxCleave?: boolean; isFinalRoaringSlash?: boolean }
): DamageHitResult | null {
  if (member.status !== 'UP') return null;

  let dmg = 0;

  if (options?.isBoxCleave) {
    // Canonical Box Splitter cleave: 66% MaxHP (or 33% with Shadow Mantle), leaves at >= 1 HP!
    if (member.hp <= 1) {
      dmg = 0;
    } else {
      const ratio = hasShadowMantle(member) ? 0.33 : 0.66;
      const rawCleave = Math.floor(member.maxHp * ratio);
      dmg = Math.min(member.hp - 1, rawCleave);
    }
    member.hp -= dmg;
    member.hurtFlash = 0.35;
    return { memberIndex, damage: dmg, downed: false, swooned: false };
  }

  if (element === 'roaring') {
    if (options?.isFinalRoaringSlash) {
      // Canonical Final Slash: 75 fixed damage, bypasses DEFEND & items, clamps living allies at 1 HP!
      if (member.hp <= 1) {
        dmg = 0;
      } else {
        dmg = Math.min(75, member.hp - 1);
      }
      member.hp -= dmg;
      member.hurtFlash = 0.45;
      return { memberIndex, damage: dmg, downed: false, swooned: false };
    } else {
      // Canonical Roaring bullets: fixed 40 damage, leaves >1 HP member at 1 HP before knocking down on next hit
      if (member.hp > 1 && member.hp - baseDamage <= 0) {
        dmg = member.hp - 1;
        member.hp = 1;
        member.hurtFlash = 0.35;
        return { memberIndex, damage: dmg, downed: false, swooned: false };
      }
      dmg = baseDamage;
    }
  } else {
    const df = getMemberDf(member);
    dmg = Math.max(1, baseDamage - df * 3);
    if (member.defending) {
      dmg = Math.max(1, Math.ceil((dmg * 2) / 3));
    }
    if (element === 'dark_star' && hasShadowMantle(member)) {
      // Shadow Mantle applies a final 0.33x multiplier!
      dmg = Math.max(1, Math.ceil(dmg * 0.33));
    }
  }

  member.hp -= dmg;
  member.hurtFlash = 0.4;

  if (member.hp <= 0) {
    member.defending = false;
    member.pose = 'down';
    if (member.id === 'kris') {
      // The Knight holds back against Kris: normal DOWN (-MaxHP/2 = -80)
      member.status = 'DOWN';
      member.hp = -Math.floor(member.maxHp / 2);
      return { memberIndex, damage: dmg, downed: true, swooned: false };
    } else {
      // Susie and Ralsei suffer SWOON (-999 HP, no natural recovery!)
      member.status = 'SWOON';
      member.hp = -999;
      return { memberIndex, damage: dmg, downed: true, swooned: true };
    }
  }

  return { memberIndex, damage: dmg, downed: false, swooned: false };
}

export function pickSingleTargetIndex(party: PartyMember[]): number {
  const living: number[] = [];
  party.forEach((m, i) => {
    if (m.status === 'UP') living.push(i);
  });
  if (living.length === 0) return 0;
  // Slight aggro bias toward Shadow Mantle bearer (like Deltarune front-line aggro) while keeping everyone at risk
  const weights = living.map((idx) => (hasShadowMantle(party[idx]) ? 1.35 : 1.0));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < living.length; i++) {
    r -= weights[i];
    if (r <= 0) return living[i];
  }
  return living[living.length - 1];
}

// Determines the Knight's next deterministic attack & flavor text at the start of a turn
export function advanceAndPeekKnightTurn(
  knight: KnightState,
  party: PartyMember[],
  practicePatternId?: AttackPatternId | null
): { attack: AttackDefinition; flavorText: string } {
  if (practicePatternId) {
    const def = ATTACK_DEFINITIONS[practicePatternId];
    return { attack: def, flavorText: `[PRACTICE] ${def.name} — ${def.flavorText}` };
  }

  // Check Phase 4 threshold at the start of turn: <= 80% HP (<= 5,840 HP)
  if (!knight.phase4Started && !knight.phase4Completed && knight.hp <= KNIGHT_PHASE4_HP_THRESHOLD) {
    knight.phase4Started = true;
    knight.phase = 4;
    // Canonical Deltarune transition rule: if Rotating Slash 2/3 was just used at the end of Phase 3, skip Phase 4 Turn 1!
    if (knight.lastAttackId === 'rotating_slash_2' || knight.lastAttackId === 'rotating_slash_3') {
      knight.phaseStep = 1;
    } else {
      knight.phaseStep = 0;
    }
  }

  let patternId: AttackPatternId;
  if (knight.phase4Completed) {
    // Post-Phase 4 reverts to Phase 3 loop while waiting for the player's finishing blow!
    patternId = PHASE_3_SEQUENCE[knight.phaseStep % PHASE_3_SEQUENCE.length];
    return {
      attack: ATTACK_DEFINITIONS[patternId],
      flavorText: "* The Knight's black armor is fractured! One strike will end this!"
    };
  }

  if (knight.phase === 1) {
    patternId = PHASE_1_SEQUENCE[knight.phaseStep];
  } else if (knight.phase === 2) {
    patternId = PHASE_2_SEQUENCE[knight.phaseStep];
  } else if (knight.phase === 3) {
    patternId = PHASE_3_SEQUENCE[knight.phaseStep % PHASE_3_SEQUENCE.length];
  } else {
    patternId = PHASE_4_SEQUENCE[Math.min(knight.phaseStep, PHASE_4_SEQUENCE.length - 1)];
  }

  const def = ATTACK_DEFINITIONS[patternId];
  let flavor = def.flavorText;
  if (patternId === 'tracking_swords_lethal' && party[1]?.status === 'SWOON') {
    flavor = '* Susie struggled to give some kind of warning.';
  }

  return { attack: def, flavorText: flavor };
}

export function commitKnightTurnEnd(
  knight: KnightState,
  usedAttackId: AttackPatternId,
  isPractice: boolean
): void {
  knight.lastAttackId = usedAttackId;
  knight.turnCount += 1;

  if (isPractice) return;

  if (knight.phase === 1) {
    knight.phaseStep += 1;
    if (knight.phaseStep >= PHASE_1_SEQUENCE.length) {
      knight.phase = 2;
      knight.phaseStep = 0;
    }
  } else if (knight.phase === 2) {
    knight.phaseStep += 1;
    if (knight.phaseStep >= PHASE_2_SEQUENCE.length) {
      knight.phase = 3;
      knight.phaseStep = 0;
    }
  } else if (knight.phase === 3) {
    knight.phaseStep = (knight.phaseStep + 1) % PHASE_3_SEQUENCE.length;
  } else if (knight.phase === 4) {
    knight.phaseStep += 1;
    if (knight.phaseStep >= PHASE_4_SEQUENCE.length) {
      // Survived Phase 4 (including The Roaring)! Next hit wins!
      knight.phase4Completed = true;
      knight.phase = 3;
      knight.phaseStep = 0;
    }
  }
}

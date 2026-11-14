export type PartyId = 'kris' | 'susie' | 'ralsei';

export type MemberStatus = 'UP' | 'DOWN' | 'SWOON';

export interface Weapon {
  id: string;
  name: string;
  at: number;
  df: number;
  mag: number;
  desc: string;
}

export interface Armor {
  id: string;
  name: string;
  at: number;
  df: number;
  mag: number;
  shadowMantle?: boolean;
  grazeBonus?: number;
  tpGainBonus?: number;
  desc: string;
}

export interface PartyMember {
  id: PartyId;
  name: string;
  color: string;
  hpBarColor: string;
  baseHp: number;
  maxHp: number;
  hp: number;
  baseAt: number;
  baseDf: number;
  baseMag: number;
  weapon: Weapon;
  armor1: Armor;
  armor2: Armor;
  status: MemberStatus;
  defending: boolean;
  pose: 'idle' | 'act' | 'attack' | 'magic' | 'item' | 'defend' | 'hurt' | 'down';
  poseTimer: number;
  hurtFlash: number;
}

export type ItemId = 'revive_mint' | 'spin_cake' | 'top_cake';

export interface InventoryItem {
  id: ItemId;
  name: string;
  shortName: string;
  targetType: 'ally' | 'all';
  healAmount: number;
  revivesSwoon: boolean;
  desc: string;
}

export type ActionType = 'FIGHT' | 'ACT' | 'MAGIC' | 'ITEM' | 'DEFEND';

export interface QueuedAction {
  actorIndex: number;
  type: ActionType;
  subId?: string;
  targetIndex?: number; // party index for item/heal, or 0 for Knight
  itemSlotIndex?: number;
  tpDelta: number; // positive for DEFEND, negative for spells
}

export interface FightLane {
  actorIndex: number;
  cursorX: number; // starts around 240..360, moves left toward targetX = 38
  speed: number;
  resolved: boolean;
  hitAccuracy: number; // 0..150
  isCrit: boolean;
  flashTimer: number;
}

export type AttackPatternId =
  | 'stars_1'
  | 'tracking_swords_1'
  | 'box_splitter_1'
  | 'sword_tunnel_1'
  | 'rotating_slash_1'
  | 'tracking_swords_2'
  | 'sword_tunnel_2'
  | 'box_splitter_2'
  | 'stars_2'
  | 'sword_tunnel_finisher'
  | 'box_splitter_3'
  | 'stars_3'
  | 'tracking_swords_3'
  | 'sword_tunnel_3'
  | 'rotating_slash_2'
  | 'rotating_slash_3'
  | 'tracking_swords_lethal'
  | 'roaring_final';

export interface AttackDefinition {
  id: AttackPatternId;
  name: string;
  phase: 1 | 2 | 3 | 4;
  duration: number;
  targetMode: 'single' | 'all';
  baseDamage: number;
  invulnDuration: number;
  element: 'dark_star' | 'physical' | 'roaring';
  flavorText: string;
  boxWidth: number;
  boxHeight: number;
}

export type BulletShape =
  | 'star'
  | 'shard'
  | 'sword'
  | 'diamond'
  | 'dagger'
  | 'beam_orb';

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax?: number;
  ay?: number;
  radius: number;
  length?: number; // for directional sword hitboxes
  width?: number;
  angle: number;
  spin: number;
  shape: BulletShape;
  color: string;
  coreColor?: string;
  age: number;
  maxAge: number;
  grazed: boolean;
  damageMultiplier?: number;
  customTag?: string;
  state?: number;
  stateTimer?: number;
  targetX?: number;
  targetY?: number;
}

export interface SlashHazard {
  x: number;
  y: number;
  angle: number;
  thickness: number;
  length: number;
  telegraphTime: number;
  activeTime: number;
  fadeTime: number;
  elapsed: number;
  rotateSpeed: number;
  hitTriggered: boolean;
  grazed: boolean;
  isBoxCleave?: boolean;
  color?: string;
}

export interface FloatingPopup {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale?: number;
}

export interface RudeBusterBolt {
  active: boolean;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number; // 0..1
  boosted: boolean;
  bonusAccuracy: number; // +0..+30
  trail: Array<{ x: number; y: number; alpha: number }>;
}

export interface SoulState {
  x: number;
  y: number;
  radius: number;
  baseSpeed: number;
  holdBreathActive: boolean;
  invulnTimer: number;
  grazeFlashTimer: number;
  visible: boolean;
}

export interface BattleBoxState {
  cx: number;
  cy: number;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
  splitAxis: 'none' | 'horizontal' | 'vertical' | 'diag1' | 'diag2';
  splitGap: number;
  targetSplitGap: number;
  borderColor: string;
  rotation: number;
}

export interface KnightState {
  name: string;
  hp: number;
  maxHp: number;
  at: number;
  df: number;
  turnCount: number;
  phase: 1 | 2 | 3 | 4;
  phaseStep: number; // index within current phase
  phase4Started: boolean;
  phase4Completed: boolean; // once true, next hit wins!
  lastAttackId: AttackPatternId | null;
  pose: 'idle' | 'point' | 'raise_sword' | 'slash' | 'roar' | 'hurt' | 'cracked';
  poseTimer: number;
  shakeTimer: number;
  afterimages: Array<{ x: number; y: number; alpha: number; pose: string }>;
}

export type BattleSubState =
  | 'PARTY_MENU'
  | 'FIGHT_BARS'
  | 'RESOLVE_ACTIONS'
  | 'ENEMY_INTRO'
  | 'BULLET_HELL'
  | 'VICTORY_SEQUENCE'
  | 'GAME_OVER';

export type ScreenMode = 'TITLE' | 'LOADOUT' | 'PRACTICE_SELECT' | 'BATTLE';

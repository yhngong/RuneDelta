import {
  Armor,
  AttackDefinition,
  AttackPatternId,
  InventoryItem,
  PartyId,
  PartyMember,
  Weapon
} from './types';

export const SCREEN_WIDTH = 640;
export const SCREEN_HEIGHT = 480;

// Canonical Deltarune Chapter 3 Boss Stats
export const KNIGHT_MAX_HP = 7300;
export const KNIGHT_PHASE4_HP_THRESHOLD = 5840; // 80% of 7300 (1,460 damage dealt)
export const KNIGHT_AT = 40;
export const KNIGHT_DF = 0;

// Canonical Chapter 3 Weapons
export const WEAPONS: Record<PartyId, Weapon> = {
  kris: {
    id: 'saber10',
    name: 'Saber10',
    at: 6,
    df: 0,
    mag: 0,
    desc: 'A saber made of 10 cactus needles. (+6 AT)'
  },
  susie: {
    id: 'toxic_axe',
    name: 'ToxicAxe',
    at: 6,
    df: 0,
    mag: 0,
    desc: 'Heavy swamp-clearing axe. (+6 AT)'
  },
  ralsei: {
    id: 'flex_scarf',
    name: 'FlexScarf',
    at: 4,
    df: 0,
    mag: 2,
    desc: 'Warm scarf with a flexible metal core. (+4 AT, +2 MAG)'
  }
};

// Canonical Chapter 3 Armors (including the secret Shadow Mantle!)
export const ARMORS: Record<string, Armor> = {
  shadow_mantle: {
    id: 'shadow_mantle',
    name: 'ShadowMantle',
    at: 0,
    df: 3, // DF = Chapter number (3)
    mag: 0,
    shadowMantle: true,
    desc: '+3 DF. Cuts Dark/Star damage by 67% & halves Box Cleave!'
  },
  tenna_tie: {
    id: 'tenna_tie',
    name: 'TennaTie',
    at: 0,
    df: 5,
    mag: -2,
    desc: '+5 DF, -2 MAG. A heavy-duty, bullet-proof tie.'
  },
  twin_ribbon: {
    id: 'twin_ribbon',
    name: 'TwinRibbon',
    at: 0,
    df: 3,
    mag: 0,
    grazeBonus: 0.25,
    desc: '+3 DF. Expands SOUL graze detection range.'
  },
  ginger_guard: {
    id: 'ginger_guard',
    name: 'GingerGuard',
    at: 0,
    df: 3,
    mag: 0,
    desc: '+3 DF. Steel bangle tempered by extreme flame.'
  },
  lode_stone: {
    id: 'lode_stone',
    name: 'LodeStone',
    at: 0,
    df: 2,
    mag: 0,
    tpGainBonus: 0.25,
    desc: '+2 DF. Bullets grant extra TP when grazed.'
  },
  royal_pin: {
    id: 'royal_pin',
    name: 'RoyalPin',
    at: 0,
    df: 3,
    mag: 1,
    desc: '+3 DF, +1 MAG. Brooch engraved with the Delta Rune.'
  }
};

// Starting Inventory: 4 Revive Mints, 3 Spin Cakes, 3 Top Cakes (10 items total)
export const ITEM_TEMPLATES: Record<'revive_mint' | 'spin_cake' | 'top_cake', InventoryItem> = {
  revive_mint: {
    id: 'revive_mint',
    name: 'ReviveMint',
    shortName: 'ReviveMint',
    targetType: 'ally',
    healAmount: 999,
    revivesSwoon: true,
    desc: 'Heals a fallen/SWOONed ally to MAX HP. (50% if UP)'
  },
  spin_cake: {
    id: 'spin_cake',
    name: 'SpinCake',
    shortName: 'SpinCake',
    targetType: 'all',
    healAmount: 150, // Canonical Chapter 3 SpinCake value (150 HP all)
    revivesSwoon: false,
    desc: 'Heals 150 HP to the team. (Ch.3 potency)'
  },
  top_cake: {
    id: 'top_cake',
    name: 'TopCake',
    shortName: 'TopCake',
    targetType: 'all',
    healAmount: 160, // Canonical TopCake value (160 HP all)
    revivesSwoon: false,
    desc: 'Heals 160 HP to the entire team!'
  }
};

export function createStartingInventory(): InventoryItem[] {
  return [
    { ...ITEM_TEMPLATES.revive_mint },
    { ...ITEM_TEMPLATES.revive_mint },
    { ...ITEM_TEMPLATES.revive_mint },
    { ...ITEM_TEMPLATES.revive_mint },
    { ...ITEM_TEMPLATES.spin_cake },
    { ...ITEM_TEMPLATES.spin_cake },
    { ...ITEM_TEMPLATES.spin_cake },
    { ...ITEM_TEMPLATES.top_cake },
    { ...ITEM_TEMPLATES.top_cake },
    { ...ITEM_TEMPLATES.top_cake }
  ];
}

export function createParty(shadowMantleHolder: PartyId = 'susie'): PartyMember[] {
  // LV 3 Canonical Deltarune Chapter 3 Base Stats:
  // Kris: 160 HP, 14 AT, 2 DF, 0 MAG
  // Susie: 190 HP, 18 AT, 2 DF, 2 MAG
  // Ralsei: 140 HP, 12 AT, 2 DF, 11 MAG
  const krisArmor1 = shadowMantleHolder === 'kris' ? ARMORS.shadow_mantle : ARMORS.tenna_tie;
  const susieArmor1 = shadowMantleHolder === 'susie' ? ARMORS.shadow_mantle : ARMORS.tenna_tie;
  const ralseiArmor1 = shadowMantleHolder === 'ralsei' ? ARMORS.shadow_mantle : ARMORS.lode_stone;

  return [
    {
      id: 'kris',
      name: 'KRIS',
      color: '#00ffff',
      hpBarColor: '#00ff00',
      baseHp: 160,
      maxHp: 160,
      hp: 160,
      baseAt: 14,
      baseDf: 2,
      baseMag: 0,
      weapon: { ...WEAPONS.kris },
      armor1: { ...krisArmor1 },
      armor2: { ...ARMORS.twin_ribbon },
      status: 'UP',
      defending: false,
      pose: 'idle',
      poseTimer: 0,
      hurtFlash: 0
    },
    {
      id: 'susie',
      name: 'SUSIE',
      color: '#ff00ff',
      hpBarColor: '#00ff00',
      baseHp: 190,
      maxHp: 190,
      hp: 190,
      baseAt: 18,
      baseDf: 2,
      baseMag: 2,
      weapon: { ...WEAPONS.susie },
      armor1: { ...susieArmor1 },
      armor2: { ...ARMORS.ginger_guard },
      status: 'UP',
      defending: false,
      pose: 'idle',
      poseTimer: 0,
      hurtFlash: 0
    },
    {
      id: 'ralsei',
      name: 'RALSEI',
      color: '#00ff00',
      hpBarColor: '#00ff00',
      baseHp: 140,
      maxHp: 140,
      hp: 140,
      baseAt: 12,
      baseDf: 2,
      baseMag: 11,
      weapon: { ...WEAPONS.ralsei },
      armor1: { ...ralseiArmor1 },
      armor2: { ...ARMORS.royal_pin },
      status: 'UP',
      defending: false,
      pose: 'idle',
      poseTimer: 0,
      hurtFlash: 0
    }
  ];
}

// Deterministic Attack Definitions matching Deltarune Chapter 3 Wiki
export const ATTACK_DEFINITIONS: Record<AttackPatternId, AttackDefinition> = {
  // === PHASE 1 ===
  stars_1: {
    id: 'stars_1',
    name: 'Stars I',
    phase: 1,
    duration: 8.2,
    targetMode: 'all',
    baseDamage: 75,
    invulnDuration: 1.0,
    element: 'dark_star',
    flavorText: '* The Roaring Knight appeared.',
    boxWidth: 186,
    boxHeight: 148
  },
  tracking_swords_1: {
    id: 'tracking_swords_1',
    name: 'Tracking Swords I',
    phase: 1,
    duration: 8.0,
    targetMode: 'single',
    baseDamage: 145,
    invulnDuration: 0.75,
    element: 'dark_star',
    flavorText: "* Darkness pools beneath the Knight's visor.",
    boxWidth: 165,
    boxHeight: 150
  },
  box_splitter_1: {
    id: 'box_splitter_1',
    name: 'Box Splitter I',
    phase: 1,
    duration: 8.6,
    targetMode: 'single',
    baseDamage: 140,
    invulnDuration: 0.8,
    element: 'dark_star',
    flavorText: '* A cold wind leaks from the black blade.',
    boxWidth: 170,
    boxHeight: 150
  },
  sword_tunnel_1: {
    id: 'sword_tunnel_1',
    name: 'Sword Tunnel I',
    phase: 1,
    duration: 8.2,
    targetMode: 'single',
    baseDamage: 96,
    invulnDuration: 0.35, // Canonical low i-frames!
    element: 'dark_star',
    flavorText: '* Your vision narrows.',
    boxWidth: 196,
    boxHeight: 142
  },
  rotating_slash_1: {
    id: 'rotating_slash_1',
    name: 'Rotating Slash I',
    phase: 1,
    duration: 8.6,
    targetMode: 'all',
    baseDamage: 75,
    invulnDuration: 1.0,
    element: 'dark_star',
    flavorText: '* Your chest feels tight.',
    boxWidth: 168,
    boxHeight: 150
  },

  // === PHASE 2 ===
  tracking_swords_2: {
    id: 'tracking_swords_2',
    name: 'Tracking Swords II',
    phase: 2,
    duration: 8.5,
    targetMode: 'single',
    baseDamage: 158,
    invulnDuration: 0.65,
    element: 'dark_star',
    flavorText: '* You felt something hovering close behind your head...',
    boxWidth: 162,
    boxHeight: 150
  },
  sword_tunnel_2: {
    id: 'sword_tunnel_2',
    name: 'Sword Tunnel II',
    phase: 2,
    duration: 8.6,
    targetMode: 'single',
    baseDamage: 102,
    invulnDuration: 0.35,
    element: 'dark_star',
    flavorText: '* You feel cornered.',
    boxWidth: 186,
    boxHeight: 148
  },
  box_splitter_2: {
    id: 'box_splitter_2',
    name: 'Box Splitter II',
    phase: 2,
    duration: 9.0,
    targetMode: 'single',
    baseDamage: 152,
    invulnDuration: 0.75,
    element: 'dark_star',
    flavorText: '* The north and east winds blew fiercely.',
    boxWidth: 170,
    boxHeight: 154
  },
  stars_2: {
    id: 'stars_2',
    name: 'Stars II',
    phase: 2,
    duration: 8.8,
    targetMode: 'all',
    baseDamage: 80,
    invulnDuration: 0.95,
    element: 'dark_star',
    flavorText: '* Starlight curdles into mauve shadow.',
    boxWidth: 192,
    boxHeight: 150
  },
  sword_tunnel_finisher: {
    id: 'sword_tunnel_finisher',
    name: 'Sword Tunnel (Finisher)',
    phase: 2,
    duration: 8.8,
    targetMode: 'single',
    baseDamage: 108,
    invulnDuration: 0.35,
    element: 'dark_star',
    flavorText: '* Dozens of blades rattle in unison.',
    boxWidth: 194,
    boxHeight: 146
  },

  // === PHASE 3 ===
  box_splitter_3: {
    id: 'box_splitter_3',
    name: 'Box Splitter III',
    phase: 3,
    duration: 9.2,
    targetMode: 'single',
    baseDamage: 165,
    invulnDuration: 0.7,
    element: 'dark_star',
    flavorText: '* Suddenly, the north wind blew fiercely. A tempest.',
    boxWidth: 174,
    boxHeight: 156
  },
  stars_3: {
    id: 'stars_3',
    name: 'Stars III',
    phase: 3,
    duration: 9.0,
    targetMode: 'all',
    baseDamage: 84,
    invulnDuration: 0.9,
    element: 'dark_star',
    flavorText: '* The dark sky is collapsing inward.',
    boxWidth: 196,
    boxHeight: 154
  },
  tracking_swords_3: {
    id: 'tracking_swords_3',
    name: 'Tracking Swords III',
    phase: 3,
    duration: 8.8,
    targetMode: 'single',
    baseDamage: 175,
    invulnDuration: 0.5,
    element: 'dark_star',
    flavorText: '* A ring of cold steel surrounds your SOUL.',
    boxWidth: 172,
    boxHeight: 160
  },
  sword_tunnel_3: {
    id: 'sword_tunnel_3',
    name: 'Sword Tunnel III',
    phase: 3,
    duration: 9.0,
    targetMode: 'single',
    baseDamage: 112,
    invulnDuration: 0.3,
    element: 'dark_star',
    flavorText: '* Nowhere left to run.',
    boxWidth: 184,
    boxHeight: 156
  },
  rotating_slash_2: {
    id: 'rotating_slash_2',
    name: 'Rotating Slash II',
    phase: 3,
    duration: 9.0,
    targetMode: 'all',
    baseDamage: 78,
    invulnDuration: 0.95,
    element: 'dark_star',
    flavorText: '* Your heartbeat becomes twisted.',
    boxWidth: 172,
    boxHeight: 154
  },

  // === PHASE 4 (HP <= 80% / <= 5840 HP) ===
  rotating_slash_3: {
    id: 'rotating_slash_3',
    name: 'Rotating Slash III',
    phase: 4,
    duration: 9.2,
    targetMode: 'all',
    baseDamage: 75,
    invulnDuration: 1.0,
    element: 'dark_star',
    flavorText: '* Your heartbeat becomes twisted.',
    boxWidth: 174,
    boxHeight: 156
  },
  tracking_swords_lethal: {
    id: 'tracking_swords_lethal',
    name: 'Tracking Swords (Lethal)',
    phase: 4,
    duration: 9.0,
    targetMode: 'single',
    baseDamage: 206, // Canonical Phase 4 Turn 2 206 Base Damage!
    invulnDuration: 0.4,
    element: 'dark_star',
    flavorText: '* Susie grew pale.',
    boxWidth: 170,
    boxHeight: 158
  },
  roaring_final: {
    id: 'roaring_final',
    name: 'THE ROARING (Final Attack)',
    phase: 4,
    duration: 13.8,
    targetMode: 'all',
    baseDamage: 40, // Fixed 40 bullet dmg + 75 final slash!
    invulnDuration: 0.65,
    element: 'roaring',
    flavorText: '* Blinding white darkness fills the arena... Survive!!',
    boxWidth: 250,
    boxHeight: 174
  }
};

export const PHASE_1_SEQUENCE: AttackPatternId[] = [
  'stars_1',
  'tracking_swords_1',
  'box_splitter_1',
  'sword_tunnel_1',
  'rotating_slash_1'
];

export const PHASE_2_SEQUENCE: AttackPatternId[] = [
  'tracking_swords_2',
  'sword_tunnel_2',
  'box_splitter_2',
  'stars_2',
  'sword_tunnel_finisher'
];

export const PHASE_3_SEQUENCE: AttackPatternId[] = [
  'box_splitter_3',
  'stars_3',
  'tracking_swords_3',
  'sword_tunnel_3',
  'rotating_slash_2'
];

export const PHASE_4_SEQUENCE: AttackPatternId[] = [
  'rotating_slash_3',
  'tracking_swords_lethal',
  'roaring_final'
];

import './style.css';
import { AttackController } from './attacks';
import { sound } from './audio';
import {
  advanceAndPeekKnightTurn,
  applyHealToMember,
  applyHitToMember,
  applyStartOfTurnRegen,
  calculateFightDamage,
  calculateHealPrayerAmount,
  calculateRudeBusterDamage,
  commitKnightTurnEnd,
  computeBarAccuracy,
  getMemberMag,
  getPartyTpGainMultiplier,
  pickSingleTargetIndex,
  useInventoryItemOnParty
} from './combat';
import {
  ATTACK_DEFINITIONS,
  KNIGHT_AT,
  KNIGHT_DF,
  KNIGHT_MAX_HP,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  createParty,
  createStartingInventory
} from './constants';
import {
  drawAttackSlashEffect,
  drawBrokenSoul,
  drawBullet,
  drawPartyMemberSprite,
  drawRoaringKnight,
  drawSoulHeart
} from './sprites';
import {
  AttackDefinition,
  AttackPatternId,
  BattleBoxState,
  BattleSubState,
  FightLane,
  FloatingPopup,
  InventoryItem,
  KnightState,
  PartyId,
  PartyMember,
  QueuedAction,
  RudeBusterBolt,
  ScreenMode,
  SoulState
} from './types';
import {
  MenuUiState,
  drawBattleBackground,
  drawLoadoutOverlay,
  drawPartyStripAndBottomBox,
  drawPopups,
  drawPracticeSelector,
  drawRudeBusterBolt,
  drawTopHudBadge,
  drawTpBar,
  getActorSpecialEntries
} from './ui';

interface ResolvedStep {
  actorIndex: number;
  kind: 'ACT_TEXT' | 'HOLD_BREATH' | 'ITEM' | 'HEAL_SPELL' | 'RUDE_BUSTER';
  text: string;
  item?: InventoryItem;
  targetIndex?: number;
}

const ALL_PRACTICE_PATTERNS: AttackPatternId[] = [
  'stars_1',
  'tracking_swords_1',
  'box_splitter_1',
  'sword_tunnel_1',
  'rotating_slash_1',
  'tracking_swords_2',
  'sword_tunnel_2',
  'box_splitter_2',
  'stars_2',
  'sword_tunnel_finisher',
  'box_splitter_3',
  'stars_3',
  'tracking_swords_3',
  'sword_tunnel_3',
  'rotating_slash_2',
  'rotating_slash_3',
  'tracking_swords_lethal',
  'roaring_final'
];

const PARTY_SPRITE_POS: Array<{ x: number; y: number }> = [
  { x: 124, y: 118 },
  { x: 106, y: 188 },
  { x: 120, y: 256 }
];

const KNIGHT_POS = { x: 502, y: 162 };

class RuneDeltaGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private screenMode: ScreenMode = 'TITLE';
  private titleCursor = 0;
  private loadoutCursor = 1; // Defaults cursor to Susie
  private practiceCursor = 0;
  private shadowMantleHolder: PartyId = 'susie';
  private practicePatternId: AttackPatternId | null = null;

  private party: PartyMember[] = [];
  private inventory: InventoryItem[] = [];
  private knight!: KnightState;
  private tp = 0;
  private holdBreathUsed = false;

  private subState: BattleSubState = 'PARTY_MENU';
  private currentAttackDef: AttackDefinition = ATTACK_DEFINITIONS.stars_1;
  private attackController = new AttackController();

  private box: BattleBoxState = {
    cx: 320,
    cy: 184,
    width: 180,
    height: 150,
    targetWidth: 180,
    targetHeight: 150,
    splitAxis: 'none',
    splitGap: 0,
    targetSplitGap: 0,
    borderColor: '#00c800',
    rotation: 0
  };

  private soul: SoulState = {
    x: 320,
    y: 184,
    radius: 6,
    baseSpeed: 198,
    holdBreathActive: false,
    invulnTimer: 0,
    grazeFlashTimer: 0,
    visible: false
  };

  private menu: MenuUiState = {
    activeActorIndex: 0,
    rootButtonIndex: 0,
    subMode: 'ROOT',
    listCursor: 0,
    allyCursor: 0,
    pendingActionKind: 'FIGHT',
    reservedItemSlots: new Set()
  };

  private queuedActions: Array<QueuedAction & { snapshotItem?: InventoryItem }> = [];
  private resolveSteps: ResolvedStep[] = [];
  private currentResolveStep: ResolvedStep | null = null;
  private resolveStepExecuted = false;
  private resolveTimer = 0;

  private fightLanes: FightLane[] = [];
  private fightPostDelay = 0;

  private rudeBolt: RudeBusterBolt = {
    active: false,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    progress: 0,
    boosted: false,
    bonusAccuracy: 0,
    trail: []
  };

  private dialogueText = '';
  private dialogueCharsShown = 0;
  private dialogueCharAccum = 0;

  private popups: FloatingPopup[] = [];
  private knightSlashBursts: Array<{
    x: number;
    y: number;
    progress: number;
    color: string;
    isCrit: boolean;
  }> = [];
  private swoonSlashBannerTimer = 0;
  private enemyIntroTimer = 0;
  private stateElapsed = 0;
  private globalTime = 0;
  private lastTimestamp = 0;

  private keysHeld = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D Canvas not supported');
    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;

    this.party = createParty(this.shadowMantleHolder);
    this.inventory = createStartingInventory();
    this.resetKnightState();

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  private resetKnightState(): void {
    this.knight = {
      name: 'THE ROARING KNIGHT',
      hp: KNIGHT_MAX_HP,
      maxHp: KNIGHT_MAX_HP,
      at: KNIGHT_AT,
      df: KNIGHT_DF,
      turnCount: 1,
      phase: 1,
      phaseStep: 0,
      phase4Started: false,
      phase4Completed: false,
      lastAttackId: null,
      pose: 'idle',
      poseTimer: 0,
      shakeTimer: 0,
      afterimages: []
    };
  }

  public start(): void {
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.lastTimestamp) / 1000));
      this.lastTimestamp = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private startBattle(practicePattern: AttackPatternId | null): void {
    this.practicePatternId = practicePattern;
    this.party = createParty(this.shadowMantleHolder);
    this.inventory = createStartingInventory();
    this.resetKnightState();
    this.tp = practicePattern ? 100 : 0;
    this.holdBreathUsed = false;
    this.soul.holdBreathActive = false;
    this.soul.invulnTimer = 0;
    this.popups = [];
    this.knightSlashBursts = [];
    this.rudeBolt.active = false;
    this.swoonSlashBannerTimer = 0;

    this.screenMode = 'BATTLE';
    sound.setIntenseMusic(practicePattern === 'roaring_final');
    sound.startMusic();

    this.beginPlayerTurn();
  }

  private beginPlayerTurn(): void {
    // 1. Check if everyone fell
    if (this.party.every((m) => m.status !== 'UP')) {
      this.enterGameOver();
      return;
    }

    // 2. Apply start-of-turn natural regen (Kris DOWN +14 HP; SWOON -999 NEVER regenerates!)
    const regens = applyStartOfTurnRegen(this.party);
    for (const rg of regens) {
      const pos = PARTY_SPRITE_POS[rg.memberIndex];
      this.spawnPopup(pos.x, pos.y - 26, `+${rg.amount}`, '#55ff88', 0.9);
    }

    // 3. Determine Knight's deterministic attack & flavor text for this turn
    const turnData = advanceAndPeekKnightTurn(
      this.knight,
      this.party,
      this.practicePatternId
    );
    this.currentAttackDef = turnData.attack;
    this.setDialogue(turnData.flavorText);

    sound.setIntenseMusic(
      this.knight.phase === 4 ||
        this.knight.phase4Completed ||
        this.currentAttackDef.id === 'roaring_final'
    );

    // 4. Set up party menu for first UP ally
    this.queuedActions = [];
    this.menu.reservedItemSlots.clear();
    this.menu.subMode = 'ROOT';
    this.menu.rootButtonIndex = 0;
    this.menu.activeActorIndex = this.findNextUpMemberIndex(-1);
    this.subState = 'PARTY_MENU';
  }

  private findNextUpMemberIndex(afterIndex: number): number {
    for (let i = afterIndex + 1; i < this.party.length; i++) {
      if (this.party[i].status === 'UP') return i;
    }
    return -1;
  }

  private setDialogue(text: string): void {
    this.dialogueText = text;
    this.dialogueCharsShown = 0;
    this.dialogueCharAccum = 0;
  }

  private spawnPopup(
    x: number,
    y: number,
    text: string,
    color: string,
    scale = 1
  ): void {
    this.popups.push({
      x,
      y,
      vy: -36,
      text,
      color,
      life: 1.05,
      maxLife: 1.05,
      scale
    });
  }

  private addTp(amount: number): number {
    const prev = this.tp;
    this.tp = Math.max(0, Math.min(100, this.tp + amount));
    return this.tp - prev;
  }

  // ============================================================================
  // INPUT HANDLING
  // ============================================================================
  private onKeyUp(e: KeyboardEvent): void {
    this.keysHeld.delete(e.code);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
        e.code
      )
    ) {
      e.preventDefault();
    }

    const firstPress = !this.keysHeld.has(e.code);
    this.keysHeld.add(e.code);
    if (!firstPress) return;

    if (e.code === 'KeyM') {
      sound.toggleMute();
      return;
    }

    const isConfirm =
      e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'Space';
    const isCancel =
      e.code === 'KeyX' ||
      e.code === 'ShiftLeft' ||
      e.code === 'ShiftRight' ||
      e.code === 'Backspace';
    const isUp = e.code === 'ArrowUp' || e.code === 'KeyW';
    const isDown = e.code === 'ArrowDown' || e.code === 'KeyS';
    const isLeft = e.code === 'ArrowLeft' || e.code === 'KeyA';
    const isRight = e.code === 'ArrowRight' || e.code === 'KeyD';

    if (this.screenMode === 'TITLE') {
      if (isUp) {
        this.titleCursor = (this.titleCursor + 2) % 3;
        sound.playSfx('ui_move');
      } else if (isDown) {
        this.titleCursor = (this.titleCursor + 1) % 3;
        sound.playSfx('ui_move');
      } else if (isConfirm) {
        sound.playSfx('ui_select');
        if (this.titleCursor === 0) {
          this.startBattle(null);
        } else if (this.titleCursor === 1) {
          this.screenMode = 'LOADOUT';
        } else {
          this.screenMode = 'PRACTICE_SELECT';
        }
      }
      return;
    }

    if (this.screenMode === 'LOADOUT') {
      if (isUp) {
        this.loadoutCursor = (this.loadoutCursor + 2) % 3;
        sound.playSfx('ui_move');
      } else if (isDown) {
        this.loadoutCursor = (this.loadoutCursor + 1) % 3;
        sound.playSfx('ui_move');
      } else if (isConfirm) {
        const ids: PartyId[] = ['kris', 'susie', 'ralsei'];
        this.shadowMantleHolder = ids[this.loadoutCursor];
        this.party = createParty(this.shadowMantleHolder);
        sound.playSfx('revive');
      } else if (isCancel || e.code === 'Escape') {
        sound.playSfx('ui_cancel');
        this.screenMode = 'TITLE';
      }
      return;
    }

    if (this.screenMode === 'PRACTICE_SELECT') {
      const total = ALL_PRACTICE_PATTERNS.length;
      if (isUp) {
        this.practiceCursor = (this.practiceCursor - 1 + total) % total;
        sound.playSfx('ui_move');
      } else if (isDown) {
        this.practiceCursor = (this.practiceCursor + 1) % total;
        sound.playSfx('ui_move');
      } else if (isLeft || isRight) {
        this.practiceCursor = (this.practiceCursor + 9) % total;
        sound.playSfx('ui_move');
      } else if (isConfirm) {
        sound.playSfx('ui_select');
        this.startBattle(ALL_PRACTICE_PATTERNS[this.practiceCursor]);
      } else if (isCancel || e.code === 'Escape') {
        sound.playSfx('ui_cancel');
        this.screenMode = 'TITLE';
      }
      return;
    }

    // BATTLE MODE
    if (e.code === 'Escape') {
      sound.stopMusic();
      sound.playSfx('ui_cancel');
      this.screenMode = this.practicePatternId ? 'PRACTICE_SELECT' : 'TITLE';
      return;
    }

    if (this.subState === 'GAME_OVER' || this.subState === 'VICTORY_SEQUENCE') {
      if ((isConfirm || e.code === 'KeyR') && this.stateElapsed > 1.1) {
        sound.playSfx('ui_select');
        this.startBattle(this.practicePatternId);
      }
      return;
    }

    if (this.subState === 'PARTY_MENU') {
      this.handlePartyMenuInput(isUp, isDown, isLeft, isRight, isConfirm, isCancel);
      return;
    }

    if (this.subState === 'RESOLVE_ACTIONS') {
      // Timed [Z] boost during Rude Buster flight!
      if (isConfirm && this.rudeBolt.active && !this.rudeBolt.boosted) {
        const distFromImpact = Math.abs(0.88 - this.rudeBolt.progress);
        if (distFromImpact <= 0.08) {
          this.rudeBolt.bonusAccuracy = 30;
        } else if (distFromImpact <= 0.16) {
          this.rudeBolt.bonusAccuracy = 22;
        } else if (distFromImpact <= 0.28) {
          this.rudeBolt.bonusAccuracy = 13;
        } else {
          this.rudeBolt.bonusAccuracy = 7;
        }
        this.rudeBolt.boosted = true;
        sound.playSfx('rude_boost');
      } else if (isConfirm && !this.rudeBolt.active && this.resolveTimer > 0.25) {
        // Let player advance text briskly if desired
        if (this.dialogueCharsShown < this.dialogueText.length) {
          this.dialogueCharsShown = this.dialogueText.length;
        } else {
          this.resolveTimer = 99;
        }
      }
      return;
    }

    if (this.subState === 'FIGHT_BARS') {
      if (isConfirm) {
        this.triggerNextFightLaneStrike();
      }
    }
  }

  private handlePartyMenuInput(
    isUp: boolean,
    isDown: boolean,
    isLeft: boolean,
    isRight: boolean,
    isConfirm: boolean,
    isCancel: boolean
  ): void {
    const actor = this.party[this.menu.activeActorIndex];
    if (!actor) return;

    if (this.menu.subMode === 'ROOT') {
      if (isLeft) {
        this.menu.rootButtonIndex = (this.menu.rootButtonIndex + 4) % 5;
        sound.playSfx('ui_move');
      } else if (isRight) {
        this.menu.rootButtonIndex = (this.menu.rootButtonIndex + 1) % 5;
        sound.playSfx('ui_move');
      } else if (isCancel) {
        this.undoLastQueuedAction();
      } else if (isConfirm) {
        sound.playSfx('ui_select');
        switch (this.menu.rootButtonIndex) {
          case 0: // FIGHT
            this.menu.pendingActionKind = 'FIGHT';
            this.menu.subMode = 'TARGET_ENEMY';
            break;
          case 1: // ACT / MAGIC
            this.menu.pendingActionKind = actor.id === 'kris' ? 'ACT' : 'MAGIC';
            this.menu.listCursor = 0;
            this.menu.subMode = 'ACT_MAGIC_LIST';
            break;
          case 2: // ITEM
            this.menu.pendingActionKind = 'ITEM';
            this.menu.listCursor = 0;
            this.menu.subMode = 'ITEM_LIST';
            break;
          case 3: // SPARE
            this.commitActorAction({
              actorIndex: this.menu.activeActorIndex,
              type: 'ACT',
              subId: 'spare',
              tpDelta: 0
            });
            break;
          case 4: {
            // DEFEND (+16% TP & 2/3 incoming damage)
            actor.defending = true;
            actor.pose = 'defend';
            const added = this.addTp(16);
            this.commitActorAction({
              actorIndex: this.menu.activeActorIndex,
              type: 'DEFEND',
              tpDelta: added
            });
            break;
          }
        }
      }
      return;
    }

    if (this.menu.subMode === 'TARGET_ENEMY') {
      if (isCancel) {
        sound.playSfx('ui_cancel');
        this.menu.subMode =
          this.menu.pendingActionKind === 'FIGHT' ? 'ROOT' : 'ACT_MAGIC_LIST';
      } else if (isConfirm) {
        sound.playSfx('ui_select');
        if (this.menu.pendingActionKind === 'FIGHT') {
          this.commitActorAction({
            actorIndex: this.menu.activeActorIndex,
            type: 'FIGHT',
            targetIndex: 0,
            tpDelta: 0
          });
        } else {
          // Rude Buster or Pacify / ACT on Knight
          const entries = getActorSpecialEntries(actor, this.tp, this.holdBreathUsed);
          const entry = entries.find((e) => e.id === this.menu.pendingSubId);
          const cost = entry?.tpCost ?? 0;
          const delta = this.addTp(-cost);
          this.commitActorAction({
            actorIndex: this.menu.activeActorIndex,
            type: this.menu.pendingActionKind === 'MAGIC' ? 'MAGIC' : 'ACT',
            subId: this.menu.pendingSubId,
            targetIndex: 0,
            tpDelta: delta
          });
        }
      }
      return;
    }

    if (this.menu.subMode === 'ACT_MAGIC_LIST') {
      const entries = getActorSpecialEntries(actor, this.tp, this.holdBreathUsed);
      if (isUp || isDown) {
        this.menu.listCursor = (this.menu.listCursor + 1) % entries.length;
        sound.playSfx('ui_move');
      } else if (isCancel) {
        sound.playSfx('ui_cancel');
        this.menu.subMode = 'ROOT';
      } else if (isConfirm) {
        const picked = entries[this.menu.listCursor];
        if (!picked || !picked.enabled) {
          sound.playSfx('ui_cancel');
          return;
        }
        sound.playSfx('ui_select');
        this.menu.pendingSubId = picked.id;
        if (picked.id === 'heal_prayer' || picked.id === 'ultimat_heal') {
          this.menu.allyCursor = 0;
          this.menu.subMode = 'TARGET_ALLY';
        } else if (picked.id === 'rude_buster' || picked.id === 'pacify') {
          this.menu.subMode = 'TARGET_ENEMY';
        } else {
          // Kris Check or HoldBreath
          this.commitActorAction({
            actorIndex: this.menu.activeActorIndex,
            type: 'ACT',
            subId: picked.id,
            targetIndex: 0,
            tpDelta: 0
          });
        }
      }
      return;
    }

    if (this.menu.subMode === 'ITEM_LIST') {
      if (isCancel) {
        sound.playSfx('ui_cancel');
        this.menu.subMode = 'ROOT';
        return;
      }
      if (this.inventory.length === 0) return;

      const total = this.inventory.length;
      if (isLeft && this.menu.listCursor % 2 === 1) {
        this.menu.listCursor -= 1;
        sound.playSfx('ui_move');
      } else if (
        isRight &&
        this.menu.listCursor % 2 === 0 &&
        this.menu.listCursor + 1 < total
      ) {
        this.menu.listCursor += 1;
        sound.playSfx('ui_move');
      } else if (isUp && this.menu.listCursor - 2 >= 0) {
        this.menu.listCursor -= 2;
        sound.playSfx('ui_move');
      } else if (isDown && this.menu.listCursor + 2 < total) {
        this.menu.listCursor += 2;
        sound.playSfx('ui_move');
      } else if (isConfirm) {
        if (this.menu.reservedItemSlots.has(this.menu.listCursor)) {
          sound.playSfx('ui_cancel');
          return;
        }
        const item = this.inventory[this.menu.listCursor];
        if (!item) return;
        sound.playSfx('ui_select');
        this.menu.pendingItemSlot = this.menu.listCursor;

        if (item.targetType === 'ally') {
          // Smart default cursor: highlight SWOONed or DOWNed ally first!
          const fallenIdx = this.party.findIndex((m) => m.status !== 'UP');
          this.menu.allyCursor = fallenIdx >= 0 ? fallenIdx : 0;
          this.menu.subMode = 'TARGET_ALLY';
        } else {
          // Party-wide cake (SpinCake / TopCake)
          this.menu.reservedItemSlots.add(this.menu.listCursor);
          this.commitActorAction({
            actorIndex: this.menu.activeActorIndex,
            type: 'ITEM',
            itemSlotIndex: this.menu.listCursor,
            snapshotItem: { ...item },
            tpDelta: 0
          });
        }
      }
      return;
    }

    if (this.menu.subMode === 'TARGET_ALLY') {
      if (isUp) {
        this.menu.allyCursor = (this.menu.allyCursor + 2) % 3;
        sound.playSfx('ui_move');
      } else if (isDown) {
        this.menu.allyCursor = (this.menu.allyCursor + 1) % 3;
        sound.playSfx('ui_move');
      } else if (isCancel) {
        sound.playSfx('ui_cancel');
        this.menu.subMode =
          this.menu.pendingActionKind === 'ITEM' ? 'ITEM_LIST' : 'ACT_MAGIC_LIST';
      } else if (isConfirm) {
        const target = this.party[this.menu.allyCursor];
        if (this.menu.pendingActionKind === 'ITEM') {
          const slot = this.menu.pendingItemSlot ?? 0;
          const item = this.inventory[slot];
          if (!item) return;
          sound.playSfx('ui_select');
          this.menu.reservedItemSlots.add(slot);
          this.commitActorAction({
            actorIndex: this.menu.activeActorIndex,
            type: 'ITEM',
            itemSlotIndex: slot,
            snapshotItem: { ...item },
            targetIndex: this.menu.allyCursor,
            tpDelta: 0
          });
        } else {
          // Heal Prayer or UltimatHeal
          if (target.status === 'SWOON') {
            // Warn player don't waste TP on SWOON (-999)! Only ReviveMint revives SWOON!
            sound.playSfx('ui_cancel');
            return;
          }
          sound.playSfx('ui_select');
          const entries = getActorSpecialEntries(actor, this.tp, this.holdBreathUsed);
          const entry = entries.find((e) => e.id === this.menu.pendingSubId);
          const cost = entry?.tpCost ?? 32;
          const delta = this.addTp(-cost);
          this.commitActorAction({
            actorIndex: this.menu.activeActorIndex,
            type: 'MAGIC',
            subId: this.menu.pendingSubId,
            targetIndex: this.menu.allyCursor,
            tpDelta: delta
          });
        }
      }
    }
  }

  private commitActorAction(
    action: QueuedAction & { snapshotItem?: InventoryItem }
  ): void {
    this.queuedActions.push(action);
    this.menu.subMode = 'ROOT';
    this.menu.rootButtonIndex = 0;

    const nextActor = this.findNextUpMemberIndex(this.menu.activeActorIndex);
    if (nextActor !== -1) {
      this.menu.activeActorIndex = nextActor;
    } else {
      this.lockInPartyTurnAndResolve();
    }
  }

  private undoLastQueuedAction(): void {
    if (this.queuedActions.length === 0) return;
    sound.playSfx('ui_cancel');
    const prev = this.queuedActions.pop()!;
    this.tp = Math.max(0, Math.min(100, this.tp - prev.tpDelta));
    const actor = this.party[prev.actorIndex];
    if (actor) {
      actor.defending = false;
      actor.pose = 'idle';
    }
    if (prev.itemSlotIndex !== undefined) {
      this.menu.reservedItemSlots.delete(prev.itemSlotIndex);
    }
    this.menu.activeActorIndex = prev.actorIndex;
    this.menu.subMode = 'ROOT';
    this.menu.rootButtonIndex = 0;
  }

  private lockInPartyTurnAndResolve(): void {
    // Remove consumed inventory slots in descending order so indices never shift out of sync!
    const usedSlots = Array.from(this.menu.reservedItemSlots).sort((a, b) => b - a);
    for (const s of usedSlots) {
      this.inventory.splice(s, 1);
    }
    this.menu.reservedItemSlots.clear();

    // Build sequential resolution steps for ACTs, ITEMs, and MAGIC
    this.resolveSteps = [];
    for (const q of this.queuedActions) {
      const actor = this.party[q.actorIndex];
      if (!actor || actor.status !== 'UP') continue;

      if (q.type === 'ACT') {
        if (q.subId === 'check') {
          this.resolveSteps.push({
            actorIndex: q.actorIndex,
            kind: 'ACT_TEXT',
            text: `* THE ROARING KNIGHT - AT 40 DF 0\n* Overwhelming darkness in blade form. Survive and break its guard!`
          });
        } else if (q.subId === 'hold_breath') {
          this.resolveSteps.push({
            actorIndex: q.actorIndex,
            kind: 'HOLD_BREATH',
            text: `* Kris held their breath...\n* Your heartbeat quickened! SOUL speed permanently increased!`
          });
        } else if (q.subId === 'spare') {
          this.resolveSteps.push({
            actorIndex: q.actorIndex,
            kind: 'ACT_TEXT',
            text: `* ${actor.name} tried to spare THE ROARING KNIGHT...\n* But your voice was swallowed by darkness.`
          });
        }
      } else if (q.type === 'ITEM' && q.snapshotItem) {
        const targetLabel =
          q.snapshotItem.targetType === 'all'
            ? 'the party'
            : this.party[q.targetIndex ?? 0]?.name ?? 'ally';
        this.resolveSteps.push({
          actorIndex: q.actorIndex,
          kind: 'ITEM',
          item: q.snapshotItem,
          targetIndex: q.targetIndex ?? 0,
          text: `* ${actor.name} used the ${q.snapshotItem.name} on ${targetLabel}!`
        });
      } else if (q.type === 'MAGIC') {
        if (q.subId === 'rude_buster') {
          this.resolveSteps.push({
            actorIndex: q.actorIndex,
            kind: 'RUDE_BUSTER',
            text: `* Susie cast RUDE BUSTER! (Press [Z] right before impact!)`
          });
        } else if (q.subId === 'heal_prayer' || q.subId === 'ultimat_heal') {
          const tgt = this.party[q.targetIndex ?? 0];
          this.resolveSteps.push({
            actorIndex: q.actorIndex,
            kind: 'HEAL_SPELL',
            targetIndex: q.targetIndex ?? 0,
            text:
              q.subId === 'ultimat_heal'
                ? `* Susie cast ULTIMATHEAL on ${tgt.name}!`
                : `* Ralsei cast HEAL PRAYER on ${tgt.name}!`
          });
        } else if (q.subId === 'pacify') {
          this.resolveSteps.push({
            actorIndex: q.actorIndex,
            kind: 'ACT_TEXT',
            text: `* Ralsei cast PACIFY!\n* ...But THE ROARING KNIGHT could never become TIRED!`
          });
        }
      }
    }

    // Prepare FIGHT timing lanes for everyone who chose FIGHT
    const fighters = this.queuedActions.filter(
      (q) => q.type === 'FIGHT' && this.party[q.actorIndex]?.status === 'UP'
    );
    this.fightLanes = fighters.map((f, idx) => ({
      actorIndex: f.actorIndex,
      cursorX: 255 + idx * 68, // staggered Deltarune cadence!
      speed: 235,
      resolved: false,
      hitAccuracy: 0,
      isCrit: false,
      flashTimer: 0
    }));
    this.fightPostDelay = 0;

    if (this.resolveSteps.length > 0) {
      this.subState = 'RESOLVE_ACTIONS';
      this.advanceResolveStep();
    } else if (this.fightLanes.length > 0) {
      this.subState = 'FIGHT_BARS';
    } else {
      this.beginEnemyIntro();
    }
  }

  private advanceResolveStep(): void {
    const next = this.resolveSteps.shift() ?? null;
    this.currentResolveStep = next;
    this.resolveStepExecuted = false;
    this.resolveTimer = 0;

    if (!next) {
      if (this.fightLanes.length > 0) {
        this.subState = 'FIGHT_BARS';
      } else {
        this.beginEnemyIntro();
      }
      return;
    }

    this.setDialogue(next.text);
    const actor = this.party[next.actorIndex];
    if (actor && actor.status === 'UP') {
      actor.pose =
        next.kind === 'RUDE_BUSTER' || next.kind === 'HEAL_SPELL'
          ? 'magic'
          : next.kind === 'ITEM'
            ? 'item'
            : 'act';
      actor.poseTimer = 0;
    }
  }

  private triggerNextFightLaneStrike(): void {
    // Strike the frontmost unresolved cursor (closest to targetX = 8 inside track!)
    const unresolved = this.fightLanes.filter((l) => !l.resolved);
    if (unresolved.length === 0) return;

    unresolved.sort((a, b) => a.cursorX - b.cursorX);
    const lane = unresolved[0];
    lane.resolved = true;
    lane.flashTimer = 0.25;

    // Target box center inside track is at x = 8
    const dist = lane.cursorX - 8;
    const { accuracy, isCrit, tpGain } = computeBarAccuracy(dist);
    lane.hitAccuracy = accuracy;
    lane.isCrit = isCrit;
    this.addTp(tpGain);

    const actor = this.party[lane.actorIndex];
    if (!actor || actor.status !== 'UP') return;
    actor.pose = 'attack';
    actor.poseTimer = 0;

    if (this.knight.phase4Completed) {
      // Post-Phase 4 Final Blow! Instant Victory!
      sound.playSfx('crit_slash');
      this.triggerFinalVictoryStrike(9999);
      return;
    }

    const dmg = calculateFightDamage(actor, accuracy, this.party, this.knight);
    this.knight.hp = Math.max(1, this.knight.hp - dmg);
    this.knight.pose = 'hurt';
    this.knight.shakeTimer = 0.24;

    sound.playSfx(isCrit ? 'crit_slash' : 'slash');
    sound.playSfx('knight_hurt');
    this.knightSlashBursts.push({
      x: KNIGHT_POS.x + (lane.actorIndex - 1) * 10,
      y: KNIGHT_POS.y - 10 + (lane.actorIndex - 1) * 14,
      progress: 0,
      color: isCrit ? '#ffff00' : actor.color,
      isCrit
    });
    this.spawnPopup(
      KNIGHT_POS.x - 16 + (Math.random() - 0.5) * 26,
      KNIGHT_POS.y - 45 + lane.actorIndex * 18,
      `${dmg}`,
      isCrit ? '#ffff00' : actor.color,
      isCrit ? 1.25 : 1.0
    );
  }

  private triggerFinalVictoryStrike(displayDmg: number): void {
    this.knight.hp = 0;
    this.knight.pose = 'cracked';
    this.knight.shakeTimer = 0.9;
    this.spawnPopup(KNIGHT_POS.x, KNIGHT_POS.y - 50, `${displayDmg}`, '#ffe659', 1.45);
    sound.stopMusic();
    sound.playSfx('rude_hit');
    sound.playSfx('victory');
    this.subState = 'VICTORY_SEQUENCE';
    this.stateElapsed = 0;
    this.setDialogue(
      `* Your strike shattered a fragment off the Black Blade!\n* Obtained the SHADOW CRYSTAL and BLACK SHARD!`
    );
  }

  private beginEnemyIntro(): void {
    this.subState = 'ENEMY_INTRO';
    this.enemyIntroTimer = 0.35;
    this.box.width = 48;
    this.box.height = 48;
    this.box.targetWidth = this.currentAttackDef.boxWidth;
    this.box.targetHeight = this.currentAttackDef.boxHeight;
    this.soul.x = this.box.cx;
    this.soul.y = this.box.cy;
    this.soul.visible = true;
  }

  private enterGameOver(): void {
    this.subState = 'GAME_OVER';
    this.stateElapsed = 0;
    sound.stopMusic();
    sound.playSfx('shatter');
  }

  // ============================================================================
  // MAIN UPDATE LOOP
  // ============================================================================
  private update(dt: number): void {
    this.globalTime += dt;
    if (this.screenMode !== 'BATTLE') return;

    this.stateElapsed += dt;
    this.swoonSlashBannerTimer = Math.max(0, this.swoonSlashBannerTimer - dt);

    // Update character & knight pose/flash timers
    for (const m of this.party) {
      m.hurtFlash = Math.max(0, m.hurtFlash - dt);
      if (m.pose !== 'idle' && m.pose !== 'defend' && m.pose !== 'down') {
        m.poseTimer += dt;
        if (m.poseTimer >= 0.55) {
          m.pose = m.defending ? 'defend' : 'idle';
        }
      }
    }
    this.knight.shakeTimer = Math.max(0, this.knight.shakeTimer - dt);
    if (this.knight.pose === 'hurt' && this.knight.shakeTimer <= 0) {
      this.knight.pose = this.knight.phase4Completed ? 'cracked' : 'idle';
    }

    // Update floating damage/heal popups & slash bursts
    for (let i = this.knightSlashBursts.length - 1; i >= 0; i--) {
      this.knightSlashBursts[i].progress += dt * 3.8;
      if (this.knightSlashBursts[i].progress >= 1) {
        this.knightSlashBursts.splice(i, 1);
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.y += p.vy * dt;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }

    // Typewriter effect
    if (this.dialogueCharsShown < this.dialogueText.length) {
      this.dialogueCharAccum += dt * 58;
      const nextCount = Math.min(
        this.dialogueText.length,
        Math.floor(this.dialogueCharAccum)
      );
      if (nextCount > this.dialogueCharsShown) {
        if (nextCount % 3 === 0) sound.playSfx('text_blip');
        this.dialogueCharsShown = nextCount;
      }
    }

    // State-specific logic
    if (this.subState === 'RESOLVE_ACTIONS') {
      this.updateResolveActions(dt);
    } else if (this.subState === 'FIGHT_BARS') {
      this.updateFightBars(dt);
    } else if (this.subState === 'ENEMY_INTRO') {
      this.box.width += (this.box.targetWidth - this.box.width) * Math.min(1, dt * 14);
      this.box.height += (this.box.targetHeight - this.box.height) * Math.min(1, dt * 14);
      this.enemyIntroTimer -= dt;
      if (this.enemyIntroTimer <= 0) {
        this.subState = 'BULLET_HELL';
        this.attackController.startAttack(
          this.currentAttackDef.id,
          this.box,
          this.soul,
          this.knight
        );
      }
    } else if (this.subState === 'BULLET_HELL') {
      this.updateBulletHell(dt);
    }
  }

  private updateResolveActions(dt: number): void {
    const step = this.currentResolveStep;
    if (!step) return;
    this.resolveTimer += dt;

    if (!this.resolveStepExecuted && this.resolveTimer >= 0.14) {
      this.resolveStepExecuted = true;

      if (step.kind === 'HOLD_BREATH') {
        this.holdBreathUsed = true;
        this.soul.holdBreathActive = true;
        sound.playSfx('heartbeat');
        const kPos = PARTY_SPRITE_POS[0];
        this.spawnPopup(kPos.x, kPos.y - 26, 'SPEED UP!', '#00f0ff', 0.95);
      } else if (step.kind === 'ITEM' && step.item) {
        const outcomes = useInventoryItemOnParty(
          step.item,
          this.party,
          step.targetIndex ?? 0
        );
        sound.playSfx(step.item.revivesSwoon ? 'revive' : 'heal');
        for (const o of outcomes) {
          const pPos = PARTY_SPRITE_POS[o.memberIndex];
          this.spawnPopup(pPos.x, pPos.y - 24, o.text, o.color, 0.95);
        }
      } else if (step.kind === 'HEAL_SPELL') {
        const caster = this.party[step.actorIndex];
        const targetIdx = step.targetIndex ?? 0;
        const target = this.party[targetIdx];
        if (caster && target) {
          const amt =
            caster.id === 'susie'
              ? getMemberMag(caster) + 12
              : calculateHealPrayerAmount(caster);
          const res = applyHealToMember(target, amt, false);
          sound.playSfx('heal');
          const pPos = PARTY_SPRITE_POS[targetIdx];
          this.spawnPopup(
            pPos.x,
            pPos.y - 24,
            res.blockedBySwoon ? 'SWOON' : `+${res.healed}`,
            res.blockedBySwoon ? '#ff3355' : '#55ff88',
            0.95
          );
        }
      } else if (step.kind === 'RUDE_BUSTER') {
        const sPos = PARTY_SPRITE_POS[1];
        this.rudeBolt = {
          active: true,
          x: sPos.x + 28,
          y: sPos.y - 8,
          targetX: KNIGHT_POS.x - 12,
          targetY: KNIGHT_POS.y - 12,
          progress: 0,
          boosted: false,
          bonusAccuracy: 0,
          trail: []
        };
        sound.playSfx('rude_cast');
      }
    }

    // Animate Rude Buster projectile!
    if (this.rudeBolt.active) {
      this.rudeBolt.progress += dt * 1.65;
      const p = Math.min(1, this.rudeBolt.progress);
      const arcLift = Math.sin(p * Math.PI) * -28;
      const sx = PARTY_SPRITE_POS[1].x + 28;
      const sy = PARTY_SPRITE_POS[1].y - 8;
      this.rudeBolt.x = sx + (this.rudeBolt.targetX - sx) * p;
      this.rudeBolt.y = sy + (this.rudeBolt.targetY - sy) * p + arcLift;
      this.rudeBolt.trail.push({ x: this.rudeBolt.x, y: this.rudeBolt.y, alpha: 1 });
      for (let i = this.rudeBolt.trail.length - 1; i >= 0; i--) {
        this.rudeBolt.trail[i].alpha -= dt * 5;
        if (this.rudeBolt.trail[i].alpha <= 0) this.rudeBolt.trail.splice(i, 1);
      }

      if (this.rudeBolt.progress >= 1) {
        this.rudeBolt.active = false;
        if (this.knight.phase4Completed) {
          this.triggerFinalVictoryStrike(9999);
          return;
        }
        const susie = this.party[1];
        const dmg = calculateRudeBusterDamage(
          susie,
          this.rudeBolt.bonusAccuracy,
          this.knight
        );
        this.knight.hp = Math.max(1, this.knight.hp - dmg);
        this.knight.pose = 'hurt';
        this.knight.shakeTimer = 0.34;
        sound.playSfx('rude_hit');
        this.spawnPopup(
          KNIGHT_POS.x - 10,
          KNIGHT_POS.y - 36,
          `${dmg}`,
          this.rudeBolt.boosted ? '#ffe64d' : '#ff55ff',
          this.rudeBolt.boosted ? 1.35 : 1.15
        );
      }
      return;
    }

    if (this.resolveTimer >= 1.18) {
      this.advanceResolveStep();
    }
  }

  private updateFightBars(dt: number): void {
    let allDone = true;
    for (const lane of this.fightLanes) {
      lane.flashTimer = Math.max(0, lane.flashTimer - dt);
      if (!lane.resolved) {
        allDone = false;
        lane.cursorX -= lane.speed * dt;
        if (lane.cursorX < -16) {
          // Missed!
          lane.resolved = true;
          lane.hitAccuracy = 0;
          const actor = this.party[lane.actorIndex];
          this.spawnPopup(
            KNIGHT_POS.x - 12,
            KNIGHT_POS.y - 35 + lane.actorIndex * 18,
            'MISS',
            '#9ca3af',
            0.95
          );
          if (actor) actor.pose = 'idle';
        }
      }
    }

    if (allDone) {
      this.fightPostDelay += dt;
      if (this.fightPostDelay >= 0.45) {
        this.beginEnemyIntro();
      }
    }
  }

  private updateBulletHell(dt: number): void {
    this.soul.invulnTimer = Math.max(0, this.soul.invulnTimer - dt);
    this.soul.grazeFlashTimer = Math.max(0, this.soul.grazeFlashTimer - dt);

    // 1. Move SOUL with HoldBreath speed boost + Shift/X precision slow mode!
    let dx = 0;
    let dy = 0;
    if (this.keysHeld.has('ArrowLeft') || this.keysHeld.has('KeyA')) dx -= 1;
    if (this.keysHeld.has('ArrowRight') || this.keysHeld.has('KeyD')) dx += 1;
    if (this.keysHeld.has('ArrowUp') || this.keysHeld.has('KeyW')) dy -= 1;
    if (this.keysHeld.has('ArrowDown') || this.keysHeld.has('KeyS')) dy += 1;

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    const slowHeld =
      this.keysHeld.has('KeyX') ||
      this.keysHeld.has('ShiftLeft') ||
      this.keysHeld.has('ShiftRight');
    const baseSpd = this.soul.holdBreathActive ? 258 : this.soul.baseSpeed;
    const speed = slowHeld ? baseSpd * 0.5 : baseSpd;

    this.soul.x += dx * speed * dt;
    this.soul.y += dy * speed * dt;

    // Clamp SOUL inside rotated / split Battle Box!
    this.clampSoulInsideBox();

    // 2. Step Attack Controller
    const stepResult = this.attackController.update(
      dt,
      this.box,
      this.soul,
      this.knight
    );

    if (stepResult.tpGained > 0) {
      const tpMult = getPartyTpGainMultiplier(this.party);
      this.addTp(stepResult.tpGained * tpMult);
    }

    if (stepResult.hitOccurred) {
      this.soul.invulnTimer = this.currentAttackDef.invulnDuration;
      this.resolveIncomingKnightHit(
        stepResult.isBoxCleaveHit,
        stepResult.isFinalRoaringSlashHit
      );
      if (this.party.every((m) => m.status !== 'UP')) {
        this.enterGameOver();
        return;
      }
    }

    if (stepResult.finished) {
      this.soul.visible = false;
      commitKnightTurnEnd(
        this.knight,
        this.currentAttackDef.id,
        Boolean(this.practicePatternId)
      );
      this.beginPlayerTurn();
    }
  }

  private clampSoulInsideBox(): void {
    const dx = this.soul.x - this.box.cx;
    const dy = this.soul.y - this.box.cy;
    const cos = Math.cos(-this.box.rotation);
    const sin = Math.sin(-this.box.rotation);
    let lx = dx * cos - dy * sin;
    let ly = dx * sin + dy * cos;

    const extraX = this.box.splitAxis === 'vertical' ? this.box.splitGap * 0.5 : 0;
    const extraY = this.box.splitAxis === 'horizontal' ? this.box.splitGap * 0.5 : 0;
    const maxX = this.box.width * 0.5 + extraX - this.soul.radius - 3;
    const maxY = this.box.height * 0.5 + extraY - this.soul.radius - 3;

    lx = Math.max(-maxX, Math.min(maxX, lx));
    ly = Math.max(-maxY, Math.min(maxY, ly));

    const rCos = Math.cos(this.box.rotation);
    const rSin = Math.sin(this.box.rotation);
    this.soul.x = this.box.cx + lx * rCos - ly * rSin;
    this.soul.y = this.box.cy + lx * rSin + ly * rCos;
  }

  private resolveIncomingKnightHit(
    isBoxCleave: boolean,
    isFinalRoaringSlash: boolean
  ): void {
    const def = this.currentAttackDef;
    const targets: number[] =
      def.targetMode === 'all'
        ? [0, 1, 2].filter((idx) => this.party[idx].status === 'UP')
        : [pickSingleTargetIndex(this.party)];

    let anySwoon = false;
    for (const idx of targets) {
      const m = this.party[idx];
      if (!m || m.status !== 'UP') continue;
      const res = applyHitToMember(m, idx, def.baseDamage, def.element, {
        isBoxCleave,
        isFinalRoaringSlash
      });
      if (!res) continue;

      const pos = PARTY_SPRITE_POS[idx];
      if (res.swooned) {
        anySwoon = true;
        this.swoonSlashBannerTimer = 0.55;
        this.spawnPopup(pos.x + 12, pos.y - 30, 'SWOON', '#ff1e42', 1.2);
        this.spawnPopup(pos.x, pos.y - 10, '-999', '#ff4d6d', 0.95);
      } else if (res.downed) {
        this.spawnPopup(pos.x, pos.y - 26, 'DOWN', '#ff6666', 1.05);
      } else {
        this.spawnPopup(pos.x, pos.y - 22, `${res.damage}`, '#ffffff', 0.95);
      }
    }

    sound.playSfx(anySwoon ? 'swoon' : 'hurt');
  }

  // ============================================================================
  // RENDER PIPELINE
  // ============================================================================
  private render(): void {
    const ctx = this.ctx;

    if (this.screenMode === 'TITLE') {
      this.renderTitleScreen(ctx);
      return;
    }

    if (this.screenMode === 'LOADOUT') {
      this.renderTitleScreen(ctx);
      drawLoadoutOverlay(ctx, this.party, this.shadowMantleHolder, this.loadoutCursor);
      return;
    }

    if (this.screenMode === 'PRACTICE_SELECT') {
      this.renderTitleScreen(ctx);
      drawPracticeSelector(ctx, ALL_PRACTICE_PATTERNS, this.practiceCursor);
      return;
    }

    // GAME OVER SCREEN
    if (this.subState === 'GAME_OVER') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawBrokenSoul(ctx, this.soul.x, this.soul.y, this.stateElapsed);

      if (this.stateElapsed > 1.05) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (this.stateElapsed - 1.05) * 1.4);
        ctx.textAlign = 'center';
        ctx.font = 'bold 28px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('GAME OVER', SCREEN_WIDTH / 2, 140);

        ctx.font = '22px "VT323", monospace';
        ctx.fillStyle = '#c4b5fd';
        ctx.fillText(
          'Darkness swallowed the stage... Yet your fate is not sealed.',
          SCREEN_WIDTH / 2,
          210
        );
        ctx.fillStyle = '#ffe659';
        ctx.fillText(
          'Press [Z] or [Enter] to Retry Instantly   •   [Esc] Title',
          SCREEN_WIDTH / 2,
          268
        );
        ctx.restore();
      }
      return;
    }

    // BATTLE SCENE
    const isRoaring =
      this.currentAttackDef.id === 'roaring_final' &&
      (this.subState === 'BULLET_HELL' || this.subState === 'ENEMY_INTRO');

    drawBattleBackground(ctx, this.globalTime, isRoaring);

    // Draw Party Members (dimmed slightly during full-screen Roaring storm so bullets stay ultra-clear)
    ctx.save();
    if (isRoaring) ctx.globalAlpha = 0.35;
    this.party.forEach((m, idx) => {
      const p = PARTY_SPRITE_POS[idx];
      drawPartyMemberSprite(ctx, m, p.x, p.y, this.globalTime);
    });
    ctx.restore();

    // Draw The Roaring Knight (shifts to top-center during The Roaring Final Attack!)
    const kx = isRoaring ? SCREEN_WIDTH / 2 : KNIGHT_POS.x;
    const ky = isRoaring ? 74 : KNIGHT_POS.y;
    drawRoaringKnight(ctx, this.knight, kx, ky, this.globalTime);

    // Draw FIGHT weapon slash bursts across the Knight
    for (const sb of this.knightSlashBursts) {
      drawAttackSlashEffect(ctx, sb.x, sb.y, sb.progress, sb.color, sb.isCrit);
    }

    // Draw Rude Buster Bolt if active
    drawRudeBusterBolt(ctx, this.rudeBolt);

    // Draw SWOON crimson screen-slash effect when Susie or Ralsei gets SWOONed!
    if (this.swoonSlashBannerTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#ff1744';
      ctx.lineWidth = 8 * (this.swoonSlashBannerTimer / 0.55);
      ctx.beginPath();
      ctx.moveTo(20, 310);
      ctx.lineTo(230, 80);
      ctx.stroke();
      ctx.restore();
    }

    // Draw Bullet-Hell Arena, Slash Telegraphs, Bullets & SOUL
    if (this.subState === 'ENEMY_INTRO' || this.subState === 'BULLET_HELL') {
      this.attackController.renderArenaAndHazards(
        ctx,
        this.box,
        this.soul,
        this.globalTime
      );

      for (const b of this.attackController.bullets) {
        if (b.color !== 'transparent') {
          drawBullet(ctx, b);
        }
      }

      if (this.soul.visible) {
        const blinkHide =
          this.soul.invulnTimer > 0 &&
          Math.floor(this.soul.invulnTimer * 22) % 2 === 0;
        if (!blinkHide) {
          drawSoulHeart(
            ctx,
            this.soul.x,
            this.soul.y,
            0.9,
            this.soul.holdBreathActive ? '#ff1e56' : '#ff0022',
            this.soul.grazeFlashTimer / 0.16
          );
        }
      }
    }

    // HUD: TP Bar, Top Turn/Phase Indicator, Party Strip & Bottom Dialogue/Menu Box
    drawTpBar(ctx, this.tp);
    drawTopHudBadge(
      ctx,
      this.knight,
      Boolean(this.practicePatternId),
      sound.isMuted()
    );
    drawPartyStripAndBottomBox(
      ctx,
      this.party,
      this.knight,
      this.inventory,
      this.tp,
      this.holdBreathUsed,
      this.subState,
      this.menu,
      this.dialogueText,
      this.dialogueCharsShown,
      this.fightLanes
    );

    drawPopups(ctx, this.popups);

    // VICTORY BANNER OVERLAY
    if (this.subState === 'VICTORY_SEQUENCE' && this.stateElapsed > 0.8) {
      ctx.save();
      ctx.fillStyle = 'rgba(8, 3, 18, 0.86)';
      ctx.fillRect(70, 56, SCREEN_WIDTH - 140, 210);
      ctx.strokeStyle = '#ffe659';
      ctx.lineWidth = 3;
      ctx.strokeRect(70, 56, SCREEN_WIDTH - 140, 210);

      ctx.textAlign = 'center';
      ctx.font = 'bold 18px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffe659';
      ctx.fillText('VICTORY — KNIGHT REPELLED!', SCREEN_WIDTH / 2, 102);

      ctx.font = '21px "VT323", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(
        `Turns Survived: ${this.knight.turnCount}   •   Items Remaining: ${this.inventory.length}/10`,
        SCREEN_WIDTH / 2,
        146
      );
      ctx.fillStyle = '#d8b4fe';
      ctx.fillText(
        'Rewards: [ShadowCrystal] & [BlackShard (+16 AT Slaying Weapon)]',
        SCREEN_WIDTH / 2,
        180
      );
      ctx.fillStyle = '#65ff8f';
      ctx.fillText(
        'Press [Z] or [R] to Play Again   •   [Esc] Return to Title',
        SCREEN_WIDTH / 2,
        232
      );
      ctx.restore();
    }
  }

  private renderTitleScreen(ctx: CanvasRenderingContext2D): void {
    drawBattleBackground(ctx, this.globalTime, false);

    // Hovering Roaring Knight centerpiece
    drawRoaringKnight(ctx, this.knight, SCREEN_WIDTH / 2, 168, this.globalTime);

    // Title Logo
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px "Press Start 2P", monospace';
    ctx.fillStyle = '#000000';
    ctx.fillText('RUNEDELTA', SCREEN_WIDTH / 2 + 3, 56);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('RUNEDELTA', SCREEN_WIDTH / 2, 53);

    ctx.font = '22px "VT323", monospace';
    ctx.fillStyle = '#c084fc';
    ctx.fillText('THE ROARING KNIGHT BOSS RECREATION', SCREEN_WIDTH / 2, 80);

    // Authentic Deltarune Menu Box
    const bx = 136;
    const by = 292;
    const bw = SCREEN_WIDTH - 272;
    const bh = 134;
    ctx.fillStyle = '#000000';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bw, bh);

    const options = [
      'FIGHT',
      'PARTY STATS',
      'PRACTICE SPECIFIC ATTACK'
    ];

    ctx.textAlign = 'left';
    options.forEach((opt, idx) => {
      const oy = by + 36 + idx * 36;
      const selected = this.titleCursor === idx;
      if (selected) {
        drawSoulHeart(ctx, bx + 28, oy - 6, 0.85, '#ff0000');
      }
      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.fillStyle = selected ? '#ffff00' : '#ffffff';
      ctx.fillText(opt, bx + 50, oy);
    });

    ctx.textAlign = 'center';
    ctx.font = '18px "VT323", monospace';
    ctx.fillStyle = '#8b9bb8';
    ctx.fillText(
      '[Arrows] Move   •   [Z / Enter] Confirm   •   [X / Shift] Cancel / Slow   •   [M] Mute',
      SCREEN_WIDTH / 2,
      456
    );
    ctx.restore();
  }
}

const canvasEl = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new RuneDeltaGame(canvasEl);
game.start();

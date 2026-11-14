# RuneDelta — The Roaring Knight (Deltarune Chapter 3 Recreation)

A playable, faithful 60fps HTML5 Canvas + TypeScript recreation of the secret **Chapter 3 Roaring Knight** boss fight from *Deltarune*, complete with authentic LV 3 party stats, Chapter 3 equipment (including the **Shadow Mantle**), exact damage/healing formulas, the **SWOON (-999 HP)** mechanic, **HoldBreath** ACT, timed **Rude Buster**, TP grazing, procedural dark-synth boss music, and all **4 Phases / 18 deterministic bullet-hell attack patterns**.

---

## Quick Start

```bash
npm install
npm run dev
```

To build a static production bundle (`dist/`):

```bash
npm run build
npm run preview
```

---

## Controls

| Key | Action |
| :--- | :--- |
| **Arrow Keys** / **WASD** | Navigate menus & move the **SOUL** during bullet-hell turns |
| **Z** / **Enter** / **Space** | Confirm selection, strike on **FIGHT** reticle bars, & boost **Rude Buster** right before impact |
| **X** / **Shift** | Cancel / undo previous party member's queued action, or hold during dodging for **Precision Slow (0.5x)** movement |
| **M** | Mute / unmute procedural Web Audio music & SFX |
| **Esc** | Return to Title / Practice Selector |

---

## Canonical Deltarune Chapter 3 Stats & Mechanics

### Starting Inventory (10 Items)
* **4x ReviveMint**: Fully restores a `DOWN`ed or `SWOON`ed (`-999 HP`) party member to **100% Max HP** (or heals **50% Max HP** if used on an `UP` ally).
* **3x SpinCake**: Restores **150 HP** to all conscious/`DOWN` allies (*canonical Chapter 3 SpinCake scaling*).
* **3x TopCake**: Restores **160 HP** to all conscious/`DOWN` allies.

### Party Stats (LV 3 + Chapter 3 Equipment)
*(Note: You can swap who wears the **ShadowMantle** in the Title Screen's `PARTY STATS & MANTLE` menu; defaults to Susie.)*

| Member | Max HP | Base AT / DF / MAG | Equipped Gear | Total AT / DF / MAG | Unique Mechanics |
| :--- | :---: | :---: | :--- | :---: | :--- |
| **Kris** | **160** | `14 / 2 / 0` | `Saber10` (+6 AT), `TennaTie` (+5 DF, -2 MAG), `TwinRibbon` (+3 DF, +25% Graze) | `20 / 10 / 0` | **HoldBreath** ACT permanently increases SOUL speed. Normal **DOWN** (`-80 HP`, `+14 HP/turn` regen). Deals `0.5x` FIGHT dmg if both allies are UP, `1.0x` if one is down, `2.0x` if both are SWOONed. |
| **Susie** | **190** | `18 / 2 / 2` | `ToxicAxe` (+6 AT), `ShadowMantle` (+3 DF, `-67%` Dark/Star dmg), `GingerGuard` (+3 DF) | `24 / 8 / 2` | **Rude Buster** (`50% TP`) bypasses heavy boss reduction (`ceil(Raw * (Mult + 0.65) / 2)`), plus up to `+30` base bonus if `[Z]` is timed right before impact. Suffers **SWOON (`-999 HP`)** on KO. |
| **Ralsei** | **140** | `12 / 2 / 11` | `FlexScarf` (+4 AT, +2 MAG), `LodeStone` (+2 DF, +25% TP gain), `RoyalPin` (+3 DF, +1 MAG) | `16 / 7 / 14` | **Heal Prayer** (`32% TP`) heals `MAG × 5` (`70 HP`). Suffers **SWOON (`-999 HP`)** on KO. |

### Boss Stats — The Roaring Knight
* **HP**: `7,300`
* **AT**: `40` | **DF**: `0`
* **Turn Damage-Taken Multiplier**: Starts at `0.20x` on Turn 1 and increases by `+0.01x` per turn up to `0.35x`.
* **SWOON Status**: Knocking out Susie or Ralsei sets their HP to **`-999`** (`SWOON`) with zero natural turn-start regeneration—requiring a **ReviveMint** to bring them back.
* **Phase 4 Threshold (`<= 80% HP` / `1,460+` Damage Dealt)**: Entering a turn at or below `5,840 HP` triggers **Phase 4**, culminating in the full-screen **Roaring** star-vortex & final cleave. Surviving Phase 4 fractures the Knight's armor so the next successful offensive hit wins the encounter!

---

## Deterministic Attack Schedule

* **Phase 1**: `Stars I` → `Tracking Swords I` → `Box Splitter I` → `Sword Tunnel I` → `Rotating Slash I`
* **Phase 2**: `Tracking Swords II` → `Sword Tunnel II` → `Box Splitter II` → `Stars II` → `Sword Tunnel (Finisher)`
* **Phase 3** *(loops until `<= 80% HP`)*: `Box Splitter III` → `Stars III` → `Tracking Swords III` → `Sword Tunnel III` → `Rotating Slash II`
* **Phase 4** *(`<= 80% HP`)*: `Rotating Slash III` *(skipped if Rotating Slash II just ended Phase 3)* → `Tracking Swords (Lethal — 206 Base DMG)` → `THE ROARING (Full-Screen Vortex & Final Cleave)` → **Fractured Finale**

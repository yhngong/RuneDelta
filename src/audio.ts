// Procedural 16-bit Dark Synth & Deltarune SFX Engine ("Black Knife" inspired boss music)

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private muted = false;
  private musicPlaying = false;
  private musicTimer: number | null = null;
  private step = 0;
  private intenseMode = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.85;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.36;
      this.musicGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime);
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setIntenseMusic(intense: boolean): void {
    this.intenseMode = intense;
  }

  public startMusic(): void {
    this.ensureContext();
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    // 168 BPM 16th-note sequencer (~89ms per step)
    const stepMs = 89;
    this.musicTimer = window.setInterval(() => {
      if (!this.muted && this.musicPlaying) {
        this.playMusicStep(this.step);
        this.step = (this.step + 1) % 64;
      }
    }, stepMs);
  }

  public stopMusic(): void {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private playMusicStep(s: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    // Driving F# minor / Phrygian dark bassline ("Black Knife" style urgent ostinato)
    const bar = Math.floor(s / 16);
    const rootProgression = [42, 42, 38, 37]; // F#2, F#2, D2, C#2
    const root = rootProgression[bar] + (this.intenseMode ? 2 : 0);

    // Bass on every 8th + syncopated 16ths
    if (s % 2 === 0 || s % 8 === 7) {
      const octaveBump = s % 4 === 2 ? 12 : 0;
      this.triggerOsc(
        'sawtooth',
        this.midiToFreq(root + octaveBump),
        0.08,
        0.18,
        now,
        this.musicGain
      );
    }

    // Sharp chiptune lead motif
    // Bar 0-1 & Bar 2-3 dark blade motif
    const leadPattern: Array<number | null> = [
      66, null, 69, 66, 73, null, 72, null, 69, null, 66, 65, 66, null, 61, null,
      66, null, 69, 73, 78, null, 77, null, 73, null, 69, 68, 66, null, null, null,
      62, null, 66, 69, 74, null, 73, null, 69, null, 66, 62, 61, null, 65, null,
      68, null, 65, 61, 68, null, 73, null, 72, 68, 65, null, 61, null, 65, null
    ];

    const note = leadPattern[s];
    if (note !== null) {
      const shift = this.intenseMode ? 2 : 0;
      this.triggerOsc(
        'square',
        this.midiToFreq(note + shift),
        0.11,
        0.13,
        now,
        this.musicGain
      );
    }

    // High dark arpeggio shimmer in Phase 4 / Roaring
    if (this.intenseMode) {
      const arpOffsets = [0, 3, 7, 11];
      const arpMidi = root + 24 + arpOffsets[s % 4];
      this.triggerOsc('triangle', this.midiToFreq(arpMidi), 0.06, 0.09, now, this.musicGain);
    }

    // Percussion: Kick on 0, 6, 8, 14; Snare on 4, 12; Hi-hat on odd 16ths
    const local = s % 16;
    if (local === 0 || local === 6 || local === 8 || (this.intenseMode && local === 14)) {
      this.triggerKick(now, this.musicGain);
    }
    if (local === 4 || local === 12) {
      this.triggerNoise(0.08, 0.14, 1400, now, this.musicGain);
    } else if (local % 2 === 1) {
      this.triggerNoise(0.025, 0.045, 5500, now, this.musicGain);
    }
  }

  private triggerOsc(
    type: OscillatorType,
    freq: number,
    duration: number,
    vol: number,
    time: number,
    dest: AudioNode
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  private triggerKick(time: number, dest: AudioNode): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.09);
    g.gain.setValueAtTime(0.32, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.11);
  }

  private triggerNoise(
    duration: number,
    vol: number,
    filterFreq: number,
    time: number,
    dest: AudioNode
  ): void {
    if (!this.ctx) return;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(filterFreq, time);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(time);
  }

  public playSfx(
    kind:
      | 'ui_move'
      | 'ui_select'
      | 'ui_cancel'
      | 'text_blip'
      | 'slash'
      | 'crit_slash'
      | 'knight_hurt'
      | 'rude_cast'
      | 'rude_boost'
      | 'rude_hit'
      | 'heal'
      | 'revive'
      | 'heartbeat'
      | 'graze'
      | 'hurt'
      | 'swoon'
      | 'box_split'
      | 'sword_lock'
      | 'slash_ring'
      | 'shatter'
      | 'victory'
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    switch (kind) {
      case 'ui_move':
        this.triggerOsc('square', 520, 0.035, 0.12, now, this.sfxGain);
        break;
      case 'ui_select':
        this.triggerOsc('square', 680, 0.04, 0.14, now, this.sfxGain);
        this.triggerOsc('square', 960, 0.06, 0.14, now + 0.035, this.sfxGain);
        break;
      case 'ui_cancel':
        this.triggerOsc('square', 420, 0.045, 0.13, now, this.sfxGain);
        this.triggerOsc('square', 280, 0.055, 0.13, now + 0.035, this.sfxGain);
        break;
      case 'text_blip':
        this.triggerOsc('square', 390 + Math.random() * 60, 0.022, 0.055, now, this.sfxGain);
        break;
      case 'slash':
        this.triggerNoise(0.11, 0.28, 1200, now, this.sfxGain);
        this.triggerOsc('sawtooth', 320, 0.1, 0.18, now, this.sfxGain);
        break;
      case 'crit_slash':
        this.triggerNoise(0.15, 0.34, 900, now, this.sfxGain);
        this.triggerOsc('square', 740, 0.07, 0.22, now, this.sfxGain);
        this.triggerOsc('square', 1120, 0.14, 0.24, now + 0.05, this.sfxGain);
        break;
      case 'knight_hurt':
        this.triggerNoise(0.14, 0.32, 400, now, this.sfxGain);
        this.triggerOsc('sawtooth', 160, 0.16, 0.25, now, this.sfxGain);
        break;
      case 'rude_cast':
        this.triggerOsc('sawtooth', 220, 0.1, 0.22, now, this.sfxGain);
        this.triggerOsc('sawtooth', 440, 0.16, 0.24, now + 0.06, this.sfxGain);
        this.triggerOsc('square', 660, 0.2, 0.2, now + 0.12, this.sfxGain);
        break;
      case 'rude_boost':
        this.triggerOsc('square', 880, 0.06, 0.24, now, this.sfxGain);
        this.triggerOsc('square', 1320, 0.1, 0.24, now + 0.04, this.sfxGain);
        break;
      case 'rude_hit':
        this.triggerNoise(0.26, 0.42, 300, now, this.sfxGain);
        this.triggerOsc('sawtooth', 140, 0.25, 0.32, now, this.sfxGain);
        this.triggerOsc('square', 520, 0.18, 0.22, now + 0.03, this.sfxGain);
        break;
      case 'heal':
        this.triggerOsc('triangle', 523.25, 0.09, 0.22, now, this.sfxGain);
        this.triggerOsc('triangle', 659.25, 0.09, 0.22, now + 0.07, this.sfxGain);
        this.triggerOsc('triangle', 783.99, 0.16, 0.24, now + 0.14, this.sfxGain);
        break;
      case 'revive':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
          this.triggerOsc('square', f, 0.11, 0.18, now + idx * 0.06, this.sfxGain!);
        });
        break;
      case 'heartbeat':
        this.triggerKick(now, this.sfxGain);
        this.triggerKick(now + 0.18, this.sfxGain);
        this.triggerOsc('sine', 640, 0.25, 0.15, now + 0.28, this.sfxGain);
        break;
      case 'graze':
        this.triggerOsc('square', 1280, 0.035, 0.1, now, this.sfxGain);
        break;
      case 'hurt':
        this.triggerNoise(0.16, 0.36, 500, now, this.sfxGain);
        this.triggerOsc('sawtooth', 190, 0.16, 0.28, now, this.sfxGain);
        this.triggerOsc('sawtooth', 120, 0.16, 0.28, now + 0.06, this.sfxGain);
        break;
      case 'swoon':
        // Chilling Roaring Knight cleave + deep sub-drop!
        this.triggerNoise(0.32, 0.48, 700, now, this.sfxGain);
        this.triggerOsc('sawtooth', 880, 0.09, 0.3, now, this.sfxGain);
        this.triggerOsc('sawtooth', 95, 0.45, 0.38, now + 0.04, this.sfxGain);
        this.triggerOsc('sine', 52, 0.55, 0.42, now + 0.05, this.sfxGain);
        break;
      case 'box_split':
        this.triggerNoise(0.18, 0.34, 1000, now, this.sfxGain);
        this.triggerOsc('sawtooth', 620, 0.08, 0.22, now, this.sfxGain);
        this.triggerOsc('sawtooth', 210, 0.18, 0.26, now + 0.05, this.sfxGain);
        break;
      case 'sword_lock':
        this.triggerOsc('square', 1040, 0.045, 0.13, now, this.sfxGain);
        break;
      case 'slash_ring':
        this.triggerNoise(0.14, 0.28, 1600, now, this.sfxGain);
        this.triggerOsc('square', 920, 0.09, 0.18, now, this.sfxGain);
        break;
      case 'shatter':
        this.triggerNoise(0.28, 0.4, 1500, now, this.sfxGain);
        [620, 480, 350, 220].forEach((f, i) => {
          this.triggerOsc('square', f, 0.09, 0.2, now + i * 0.05, this.sfxGain!);
        });
        break;
      case 'victory':
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
          this.triggerOsc('square', f, 0.22, 0.2, now + i * 0.1, this.sfxGain!);
        });
        break;
    }
  }
}

export const sound = new SoundEngine();

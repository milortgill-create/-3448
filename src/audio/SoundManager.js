/**
 * Procedural WebAudio synthesizer for GoreBox-style physical impacts:
 * glass shattering, wooden crate splintering, realistic fuel-barrel explosions,
 * bone snap / flesh dismemberment, footsteps, gunshots, and NPC vocal reactions.
 */
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  _init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playFootstep(isSprint = false) {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isSprint ? 115 : 88, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.08);

    gain.gain.setValueAtTime(isSprint ? 0.14 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playGlassShatter() {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const freqs = [2450, 3180, 4120, 5340, 6200, 3750];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const delay = idx * 0.015;
      osc.frequency.setValueAtTime(f + (Math.random() - 0.5) * 350, now + delay);
      osc.frequency.exponentialRampToValueAtTime(f * 0.65, now + delay + 0.18);

      gain.gain.setValueAtTime(0.08, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + delay + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.23);
    });

    this._noiseBurst(0.16, 2800, 0.16);
  }

  playWoodBreak() {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const delay = i * 0.035;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180 - i * 30, now + delay);
      osc.frequency.exponentialRampToValueAtTime(38, now + delay + 0.18);

      gain.gain.setValueAtTime(0.2, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.21);
    }
    this._noiseBurst(0.22, 950, 0.22);
  }

  playImpact(material = 'concrete', intensity = 0.5) {
    this._init();
    if (!this.ctx) return;
    const vol = Math.min(0.28, Math.max(0.03, intensity * 0.2));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (material === 'metal') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.22);
    } else if (material === 'flesh') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(155, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
      this._noiseBurst(0.08, 650, vol * 0.7);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(125, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
    }

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playGoreSever() {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Sharp bone snap transient
    const snap = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snap.type = 'sawtooth';
    snap.frequency.setValueAtTime(520, now);
    snap.frequency.exponentialRampToValueAtTime(85, now + 0.09);
    snapGain.gain.setValueAtTime(0.28, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    snap.connect(snapGain);
    snapGain.connect(this.ctx.destination);
    snap.start(now);
    snap.stop(now + 0.11);

    // 2. Wet visceral tearing squelch
    this._noiseBurst(0.26, 780, 0.28);
    this._noiseBurst(0.18, 1650, 0.18);
  }

  playGunshot() {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.16);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);

    this._noiseBurst(0.22, 1800, 0.32);
  }

  /**
   * Realistic multi-stage fuel barrel detonation:
   * 1) Sharp metallic container rupture crack
   * 2) Deep sub-bass shockwave thump
   * 3) Roaring fireball rumble + shrapnel hiss
   */
  playExplosion() {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Stage 1: Metallic rupture transient
    const crack = this.ctx.createOscillator();
    const crackGain = this.ctx.createGain();
    crack.type = 'square';
    crack.frequency.setValueAtTime(420, now);
    crack.frequency.exponentialRampToValueAtTime(52, now + 0.14);
    crackGain.gain.setValueAtTime(0.38, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    crack.connect(crackGain);
    crackGain.connect(this.ctx.destination);
    crack.start(now);
    crack.stop(now + 0.16);

    // Stage 2: Deep chest-thumping sub-bass shockwave
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(95, now);
    sub.frequency.exponentialRampToValueAtTime(16, now + 0.95);
    subGain.gain.setValueAtTime(0.55, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    sub.connect(subGain);
    subGain.connect(this.ctx.destination);
    sub.start(now);
    sub.stop(now + 1.02);

    // Stage 3: Fireball roar & rolling thunder
    this._noiseBurst(0.35, 1300, 0.48);
    this._noiseBurst(1.15, 280, 0.52);
  }

  playNpcVocal(emotion = 'shock') {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (emotion === 'shock') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.linearRampToValueAtTime(275, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.24);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    } else if (emotion === 'pain') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);
      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.linearRampToValueAtTime(175, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.26);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    }

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.29);
  }

  _noiseBurst(duration = 0.15, filterFreq = 1200, volume = 0.2) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.38));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }
}

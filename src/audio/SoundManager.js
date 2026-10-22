/**
 * ШАГ 3: Обновлённый аудио-движок (WebAudio API):
 * - Тяжёлые глухие удары (низкочастотный резонанс + компрессия)
 * - Громкие выстрелы с многоступенчатым раскатистым эхом полигона (DelayNode + BiquadFilterNode)
 * - Звук перезарядки оружия (магазин + затвор)
 * - Пул из 10 различных голосовых реакций НПС (крики, стоны от боли, возгласы при получении урона и сдаче)
 */
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this._lastVoiceIdx = -1;

    // Pool of 10 distinct formant voice profiles for NPCs
    this.npcVoicePool = [
      // 0: Резкий вскрик при попадании
      { f0Start: 245, f0Mid: 310, f0End: 165, dur: 0.34, f1: 780, f2: 1450, vibrato: 12, breath: 0.16 },
      // 1: Глубокий протяжный стон от боли
      { f0Start: 138, f0Mid: 122, f0End: 88, dur: 0.58, f1: 520, f2: 1080, vibrato: 6, breath: 0.14 },
      // 2: Короткий тяжёлый выдох при тупом ударе
      { f0Start: 160, f0Mid: 115, f0End: 72, dur: 0.22, f1: 610, f2: 1190, vibrato: 0, breath: 0.24 },
      // 3: Громкий крик тревоги / шока
      { f0Start: 210, f0Mid: 340, f0End: 220, dur: 0.48, f1: 860, f2: 1720, vibrato: 18, breath: 0.18 },
      // 4: Дрожащий стон при тяжёлой травме
      { f0Start: 175, f0Mid: 158, f0End: 112, dur: 0.52, f1: 640, f2: 1320, vibrato: 22, breath: 0.15 },
      // 5: Сдавленный вдох при контузии
      { f0Start: 195, f0Mid: 235, f0End: 130, dur: 0.28, f1: 710, f2: 1580, vibrato: 8, breath: 0.26 },
      // 6: Возглас при сдаче (руки вверх)
      { f0Start: 185, f0Mid: 255, f0End: 190, dur: 0.42, f1: 740, f2: 1490, vibrato: 14, breath: 0.12 },
      // 7: Грозный окрик при начале отпора
      { f0Start: 142, f0Mid: 188, f0End: 125, dur: 0.36, f1: 680, f2: 1250, vibrato: 9, breath: 0.20 },
      // 8: Хриплый стон при повреждении конечности
      { f0Start: 152, f0Mid: 198, f0End: 96, dur: 0.46, f1: 580, f2: 1150, vibrato: 16, breath: 0.28 },
      // 9: Протяжный выдох при обездвиживании
      { f0Start: 128, f0Mid: 102, f0End: 64, dur: 0.65, f1: 460, f2: 940, vibrato: 5, breath: 0.22 }
    ];
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
    osc.frequency.setValueAtTime(isSprint ? 105 : 82, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.085);

    gain.gain.setValueAtTime(isSprint ? 0.15 : 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  /**
   * ШАГ 3: Новые реалистичные тяжёлые, глухие звуки ударов.
   */
  playImpact(material = 'concrete', intensity = 0.6) {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const power = Math.min(1.0, Math.max(0.2, intensity));

    // 1. Sub-bass heavy thud (глухой тяжёлый удар)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    const startFreq = material === 'metal' ? 135 : material === 'wood' ? 98 : 84;
    subOsc.frequency.setValueAtTime(startFreq, now);
    subOsc.frequency.exponentialRampToValueAtTime(24, now + 0.21);

    subGain.gain.setValueAtTime(0.42 * power, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.24);

    // 2. Muffled punch body transient
    const bodyOsc = this.ctx.createOscillator();
    const bodyFilter = this.ctx.createBiquadFilter();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(165, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(38, now + 0.12);

    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(380, now);

    bodyGain.gain.setValueAtTime(0.32 * power, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    bodyOsc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(this.ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.15);

    // 3. Low-filtered impact texture burst
    const cutoff = material === 'metal' ? 1100 : material === 'wood' ? 580 : 420;
    this._noiseBurst(0.11, cutoff, 0.24 * power, 'lowpass');
  }

  /**
   * ШАГ 3: Новые громкие реалистичные выстрелы с раскатистым эхом полигона.
   */
  playGunshot() {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. High-pressure muzzle blast transient
    const blastOsc = this.ctx.createOscillator();
    const blastGain = this.ctx.createGain();
    blastOsc.type = 'sawtooth';
    blastOsc.frequency.setValueAtTime(320, now);
    blastOsc.frequency.exponentialRampToValueAtTime(32, now + 0.14);
    blastGain.gain.setValueAtTime(0.48, now);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    blastOsc.connect(blastGain);
    blastGain.connect(this.ctx.destination);
    blastOsc.start(now);
    blastOsc.stop(now + 0.17);

    // 2. Crisp gunshot crack & powder burst
    this._noiseBurst(0.19, 2200, 0.46, 'bandpass');
    this._noiseBurst(0.09, 420, 0.42, 'lowpass');

    // 3. Multi-tap Polygon Echo (эхо на бетонном полигоне: 135мс, 285мс, 460мс)
    const echoTaps = [
      { delay: 0.135, vol: 0.22, freq: 1150, dur: 0.24 },
      { delay: 0.285, vol: 0.13, freq: 780, dur: 0.30 },
      { delay: 0.460, vol: 0.07, freq: 520, dur: 0.38 }
    ];
    for (const tap of echoTaps) {
      this._noiseBurstAt(now + tap.delay, tap.dur, tap.freq, tap.vol, 'lowpass');
    }
  }

  /**
   * ШАГ 4: Звук перезарядки пистолета (извлечение магазина, вставка нового и затвор).
   */
  playReload() {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const clickAt = (timeOffset, freq1, freq2) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq1, now + timeOffset);
      osc.frequency.exponentialRampToValueAtTime(freq2, now + timeOffset + 0.055);
      gain.gain.setValueAtTime(0.16, now + timeOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.06);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + timeOffset);
      osc.stop(now + timeOffset + 0.065);
    };

    // 1. Mag release out (0.05s)
    clickAt(0.05, 620, 240);
    // 2. Fresh mag lock in (0.42s)
    clickAt(0.42, 310, 780);
    // 3. Slide rack back & forward (0.75s & 0.86s)
    clickAt(0.75, 920, 480);
    clickAt(0.86, 540, 1120);
  }

  /**
   * ШАГ 3: Пул из 10 разных голосовых звуков для НПС (крики, стоны от боли, звуки при уроне и сдаче).
   */
  playNpcVocal(categoryOrIndex = 'pain') {
    this._init();
    if (!this.ctx) return;

    let idx;
    if (typeof categoryOrIndex === 'number') {
      idx = ((categoryOrIndex % 10) + 10) % 10;
    } else if (categoryOrIndex === 'surrender') {
      idx = 6;
    } else if (categoryOrIndex === 'angry') {
      idx = 7;
    } else if (categoryOrIndex === 'shock') {
      idx = Math.random() > 0.5 ? 3 : 5;
    } else if (categoryOrIndex === 'immobilized') {
      idx = 9;
    } else {
      // Pain / damage: pick from all 10 voice presets without repeating the previous one
      do {
        idx = Math.floor(Math.random() * this.npcVoicePool.length);
      } while (idx === this._lastVoiceIdx);
    }
    this._lastVoiceIdx = idx;

    const p = this.npcVoicePool[idx];
    const now = this.ctx.currentTime;

    // Glottal vocal cord source (sawtooth + triangle blend)
    const glottal = this.ctx.createOscillator();
    glottal.type = 'sawtooth';
    const pitchJitter = 0.94 + Math.random() * 0.12;
    glottal.frequency.setValueAtTime(p.f0Start * pitchJitter, now);
    glottal.frequency.linearRampToValueAtTime(p.f0Mid * pitchJitter, now + p.dur * 0.38);
    glottal.frequency.exponentialRampToValueAtTime(p.f0End * pitchJitter, now + p.dur);

    // Optional vibrato for cries/groans
    if (p.vibrato > 0) {
      const vib = this.ctx.createOscillator();
      const vibGain = this.ctx.createGain();
      vib.frequency.setValueAtTime(p.vibrato, now);
      vibGain.gain.setValueAtTime(11, now);
      vib.connect(vibGain);
      vibGain.connect(glottal.frequency);
      vib.start(now);
      vib.stop(now + p.dur);
    }

    // Dual Vocal Tract Formant Filters (F1 & F2)
    const formant1 = this.ctx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.frequency.setValueAtTime(p.f1, now);
    formant1.Q.setValueAtTime(4.5, now);

    const formant2 = this.ctx.createBiquadFilter();
    formant2.type = 'bandpass';
    formant2.frequency.setValueAtTime(p.f2, now);
    formant2.Q.setValueAtTime(5.5, now);

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(0.01, now);
    voiceGain.gain.linearRampToValueAtTime(0.24, now + 0.035);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, now + p.dur);

    glottal.connect(formant1);
    glottal.connect(formant2);
    formant1.connect(voiceGain);
    formant2.connect(voiceGain);
    voiceGain.connect(this.ctx.destination);

    glottal.start(now);
    glottal.stop(now + p.dur + 0.02);

    // Breath / throat aspiration layer
    if (p.breath > 0) {
      this._noiseBurstAt(now, p.dur * 0.85, p.f1 * 1.4, p.breath * 0.45, 'bandpass');
    }
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

    this._noiseBurst(0.16, 2800, 0.16, 'bandpass');
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
    this._noiseBurst(0.22, 950, 0.22, 'bandpass');
  }

  playGoreSever() {
    this._init();
    if (!this.ctx) return;
    this.playImpact('concrete', 0.85);
  }

  playExplosion() {
    this._init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

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

    this._noiseBurst(0.35, 1300, 0.48, 'bandpass');
    this._noiseBurst(1.15, 280, 0.52, 'lowpass');
  }

  _noiseBurst(duration = 0.15, filterFreq = 1200, volume = 0.2, filterType = 'bandpass') {
    if (!this.ctx) return;
    this._noiseBurstAt(this.ctx.currentTime, duration, filterFreq, volume, filterType);
  }

  _noiseBurstAt(startTime, duration = 0.15, filterFreq = 1200, volume = 0.2, filterType = 'bandpass') {
    if (!this.ctx) return;
    const bufferSize = Math.max(64, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.38));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(startTime);
  }
}

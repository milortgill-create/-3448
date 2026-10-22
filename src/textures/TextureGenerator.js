import * as THREE from 'three';

/**
 * Procedural 2K (2048x2048) Texture Generator + GoreBox 56 Wound Drawings Atlas
 * + 40 Red Blood & Gore Decal Pool.
 */
export class TextureGenerator {
  constructor(renderer) {
    this.maxAnisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  }

  _configureTexture(canvas, repeatX = 1, repeatY = 1, isSRGB = true) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = this.maxAnisotropy;
    if (isSRGB) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * 2048x2048 PBR Industrial Concrete Slab Texture
   */
  createConcrete2K() {
    const size = 2048;
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const ctx = diffCanvas.getContext('2d');

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d');

    ctx.fillStyle = '#4a5058';
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);

    for (let i = 0; i < 160; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 80 + Math.random() * 280;
      const grd = ctx.createRadialGradient(x, y, 5, x, y, r);
      const dark = Math.random() > 0.45;
      grd.addColorStop(0, dark ? 'rgba(26, 30, 36, 0.16)' : 'rgba(105, 114, 126, 0.14)');
      grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grd;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    for (let i = 0; i < 42000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const s = 1 + Math.random() * 3.5;
      const v = 45 + Math.floor(Math.random() * 60);
      ctx.fillStyle = `rgba(${v}, ${v + 3}, ${v + 7}, 0.28)`;
      ctx.fillRect(x, y, s, s);

      const bv = 90 + Math.floor(Math.random() * 80);
      bCtx.fillStyle = `rgb(${bv}, ${bv}, ${bv})`;
      bCtx.fillRect(x, y, s, s);
    }

    const step = 512;
    for (let pos = 0; pos < size; pos += step) {
      ctx.fillStyle = 'rgba(18, 20, 24, 0.85)';
      ctx.fillRect(pos, 0, 6, size);
      ctx.fillRect(0, pos, size, 6);

      ctx.fillStyle = 'rgba(115, 124, 136, 0.35)';
      ctx.fillRect(pos + 6, 0, 4, size);
      ctx.fillRect(0, pos + 6, size, 4);

      bCtx.fillStyle = '#181818';
      bCtx.fillRect(pos, 0, 8, size);
      bCtx.fillRect(0, pos, size, 8);
    }

    ctx.lineCap = 'round';
    bCtx.lineCap = 'round';
    for (let c = 0; c < 28; c++) {
      let cx = Math.random() * size;
      let cy = Math.random() * size;
      const segs = 8 + Math.floor(Math.random() * 14);
      ctx.beginPath();
      bCtx.beginPath();
      ctx.moveTo(cx, cy);
      bCtx.moveTo(cx, cy);
      for (let s = 0; s < segs; s++) {
        cx += (Math.random() - 0.5) * 90;
        cy += (Math.random() - 0.5) * 90;
        ctx.lineTo(cx, cy);
        bCtx.lineTo(cx, cy);
      }
      ctx.strokeStyle = 'rgba(20, 23, 28, 0.55)';
      ctx.lineWidth = 1.2 + Math.random() * 2.2;
      ctx.stroke();

      bCtx.strokeStyle = '#242424';
      bCtx.lineWidth = 2.5;
      bCtx.stroke();
    }

    return {
      map: this._configureTexture(diffCanvas, 12, 12, true),
      bumpMap: this._configureTexture(bumpCanvas, 12, 12, false)
    };
  }

  /**
   * 2048x2048 Pine Supply Crate Texture
   */
  createWoodCrate2K() {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#9c6b3b';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 600; i++) {
      const y = (i / 600) * size;
      const h = 4 + Math.random() * 8;
      const shade = Math.random() > 0.5 ? 'rgba(62, 38, 16, 0.14)' : 'rgba(194, 145, 90, 0.12)';
      ctx.fillStyle = shade;
      ctx.fillRect(0, y, size, h);
    }

    const plankCount = 6;
    const plankH = size / plankCount;
    for (let p = 0; p < plankCount; p++) {
      const py = p * plankH;
      ctx.fillStyle = '#2b190a';
      ctx.fillRect(0, py, size, 10);
      ctx.fillStyle = 'rgba(220, 175, 120, 0.25)';
      ctx.fillRect(0, py + 10, size, 6);
    }

    const border = 175;
    ctx.fillStyle = '#7c5128';
    ctx.fillRect(0, 0, size, border);
    ctx.fillRect(0, size - border, size, border);
    ctx.fillRect(0, 0, border, size);
    ctx.fillRect(size - border, 0, border, size);

    ctx.strokeStyle = '#331e0c';
    ctx.lineWidth = 12;
    ctx.strokeRect(border, border, size - border * 2, size - border * 2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(border, border);
    ctx.lineTo(size - border, size - border);
    ctx.lineWidth = 150;
    ctx.strokeStyle = '#734a23';
    ctx.stroke();
    ctx.lineWidth = 158;
    ctx.strokeStyle = '#2d1a0a';
    ctx.stroke();
    ctx.restore();

    const bracketSize = 160;
    const corners = [
      [0, 0],
      [size - bracketSize, 0],
      [0, size - bracketSize],
      [size - bracketSize, size - bracketSize]
    ];
    for (const [cx, cy] of corners) {
      ctx.fillStyle = '#272a30';
      ctx.fillRect(cx, cy, bracketSize, bracketSize);
      ctx.strokeStyle = '#141619';
      ctx.lineWidth = 8;
      ctx.strokeRect(cx + 4, cy + 4, bracketSize - 8, bracketSize - 8);

      ctx.fillStyle = '#525866';
      for (const [rx, ry] of [
        [36, 36],
        [bracketSize - 36, 36],
        [36, bracketSize - 36],
        [bracketSize - 36, bracketSize - 36]
      ]) {
        ctx.beginPath();
        ctx.arc(cx + rx, cy + ry, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.save();
    ctx.translate(size / 2, size / 2 - 40);
    ctx.fillStyle = 'rgba(20, 22, 25, 0.78)';
    ctx.font = 'bold 92px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('МЕЖДУГОРНЫЙ-04', 0, 0);
    ctx.font = 'bold 64px monospace';
    ctx.fillText('ГРУЗ // ТАРА 42КГ', 0, 95);
    ctx.restore();

    return this._configureTexture(canvas, 1, 1, true);
  }

  /**
   * 2048x2048 Steel / Explosive Barrel Texture
   */
  createMetalBarrel2K(primaryColor = '#b91c1c', stripeColor = '#f59e0b', label = 'ОГНЕОПАСНО // ПРОПАН') {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = primaryColor;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = stripeColor;
    ctx.fillRect(0, size * 0.36, size, size * 0.28);

    for (const ry of [size * 0.32, size * 0.68]) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, ry - 24, size, 48);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.fillRect(0, ry - 8, size, 16);
    }

    for (let i = 0; i < 950; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = 8 + Math.random() * 48;
      const h = 3 + Math.random() * 14;
      ctx.fillStyle = Math.random() > 0.4 ? 'rgba(30, 32, 36, 0.35)' : 'rgba(120, 53, 15, 0.32)';
      ctx.fillRect(x, y, w, h);
    }

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 88px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, size * 0.5, size * 0.52);

    return this._configureTexture(canvas, 1, 1, true);
  }

  /**
   * 56 ВИДОВ РАН И 56 УНИКАЛЬНЫХ РИСУНКОВ РАН В СТИЛЕ GOREBOX!
   * Каждая рана имеет:
   * - id (0..55)
   * - code, name, category ('bullet' | 'blunt' | 'slash' | 'blast')
   * - bleedRate (скорость кровотечения), arterial (пульсирующая струя крови),
   *   painFactor, limpFactor, aimPenalty
   * - texture (индивидуальный 128x128 CanvasTexture рисунок раны с красной кровью, мышцами, костью, гематомой или ожогом)
   * - previewDataUrl (для отображения рисунка раны в 2D Инспекторе куклы!)
   */
  createWoundAtlas56() {
    const defs = [
      // === I. ПУЛЕВЫЕ РАНЕНИЯ (1–14) ===
      { name: 'Пулевое входное (9×18мм)', cat: 'bullet', style: 'hole_clean', bleed: 1.4, arterial: false },
      { name: 'Пулевое сквозное ранение', cat: 'bullet', style: 'hole_exit', bleed: 2.1, arterial: false },
      { name: 'Ожог и пробой в упор', cat: 'bullet', style: 'hole_powder', bleed: 1.8, arterial: false },
      { name: 'Рикошетная пулевая борозда', cat: 'bullet', style: 'graze_furrow', bleed: 1.1, arterial: false },
      { name: 'Слепое ранение с гематомой', cat: 'bullet', style: 'hole_bruise', bleed: 1.3, arterial: false },
      { name: 'Прострел мягких тканей', cat: 'bullet', style: 'hole_flesh', bleed: 1.6, arterial: false },
      { name: 'Осколочный кратер экспансивной пули', cat: 'bullet', style: 'hole_crater', bleed: 2.5, arterial: true },
      { name: 'Артериальный прострел (пульсирующий)', cat: 'bullet', style: 'arterial_spurt', bleed: 3.4, arterial: true },
      { name: 'Венозный пробой (тёмная кровь)', cat: 'bullet', style: 'venous_pool', bleed: 2.3, arterial: false },
      { name: 'Сдвоенный пулевой канал', cat: 'bullet', style: 'double_hole', bleed: 2.6, arterial: true },
      { name: 'Касательный срыв эпидермиса', cat: 'bullet', style: 'graze_strip', bleed: 0.9, arterial: false },
      { name: 'Пулевой скол кости', cat: 'bullet', style: 'hole_bone', bleed: 2.0, arterial: false },
      { name: 'Разрыв фасции пулей', cat: 'bullet', style: 'hole_fascia', bleed: 1.9, arterial: false },
      { name: 'Глубокий полостной прострел', cat: 'bullet', style: 'hole_deep', bleed: 2.8, arterial: true },

      // === II. ТУПЫЕ ТРАВМЫ, УШИБЫ И ГЕМАТОМЫ ОТ УДАРОВ (15–28) ===
      { name: 'Свежий багровый кровоподтёк', cat: 'blunt', style: 'bruise_fresh', bleed: 0.2, arterial: false },
      { name: 'Обширная тёмно-красная гематома', cat: 'blunt', style: 'bruise_deep', bleed: 0.3, arterial: false },
      { name: 'Глубокий ушиб мышечной ткани', cat: 'blunt', style: 'contusion_muscle', bleed: 0.4, arterial: false },
      { name: 'Ссадина с каплями крови', cat: 'blunt', style: 'abrasion_red', bleed: 0.6, arterial: false },
      { name: 'Ушибленное размозжение кожи', cat: 'blunt', style: 'crush_skin', bleed: 1.1, arterial: false },
      { name: 'Ушибленная рваная рана', cat: 'blunt', style: 'blunt_split', bleed: 1.3, arterial: false },
      { name: 'Трещина надкостницы с кровоизлиянием', cat: 'blunt', style: 'periosteum_crack', bleed: 0.8, arterial: false },
      { name: 'Отёчная пульсирующая гематома', cat: 'blunt', style: 'swollen_hematoma', bleed: 0.5, arterial: false },
      { name: 'Разрыв капиллярной сетки', cat: 'blunt', style: 'capillary_burst', bleed: 0.7, arterial: false },
      { name: 'Вдавленная травма от удара', cat: 'blunt', style: 'dent_trauma', bleed: 1.0, arterial: false },
      { name: 'Сорванный кожный лоскут (удар)', cat: 'blunt', style: 'knuckle_tear', bleed: 1.2, arterial: false },
      { name: 'Контузионное пятно с кровью', cat: 'blunt', style: 'contusion_ring', bleed: 0.6, arterial: false },
      { name: 'Подкожное венозное кровоизлияние', cat: 'blunt', style: 'subcutaneous_bleed', bleed: 0.5, arterial: false },
      { name: 'Тяжёлый разрыв волокон от удара', cat: 'blunt', style: 'fiber_rupture', bleed: 1.4, arterial: false },

      // === III. РЕЗАНЫЕ, РУБЛЕНЫЕ И КОЛОТЫЕ РАНЫ ОТ МОНТИРОВКИ (29–42) ===
      { name: 'Рваный разрез монтировкой', cat: 'slash', style: 'slash_crowbar', bleed: 2.2, arterial: false },
      { name: 'Глубокое рассечение до кости', cat: 'slash', style: 'slash_bone', bleed: 2.7, arterial: true },
      { name: 'Косой рубленый разрыв тканей', cat: 'slash', style: 'slash_diagonal', bleed: 2.0, arterial: false },
      { name: 'Лоскутная рваная рана', cat: 'slash', style: 'flap_laceration', bleed: 2.3, arterial: false },
      { name: 'Колотая рана остриём лома', cat: 'slash', style: 'puncture_chisel', bleed: 2.1, arterial: true },
      { name: 'Двойная борозда от зубцов гвоздодёра', cat: 'slash', style: 'claw_double', bleed: 2.4, arterial: false },
      { name: 'Поверхностный кровоточащий порез', cat: 'slash', style: 'cut_shallow', bleed: 1.2, arterial: false },
      { name: 'Вскрытая красная мышечная ткань', cat: 'slash', style: 'exposed_muscle', bleed: 2.5, arterial: false },
      { name: 'Надрез сухожилия с кровотечением', cat: 'slash', style: 'tendon_cut', bleed: 1.9, arterial: false },
      { name: 'Зияющая резаная рана', cat: 'slash', style: 'gaping_gash', bleed: 2.8, arterial: true },
      { name: 'Скальпированное повреждение кожи', cat: 'slash', style: 'deglove_patch', bleed: 2.4, arterial: false },
      { name: 'Крестообразный разрыв тканей', cat: 'slash', style: 'cross_slash', bleed: 2.6, arterial: true },
      { name: 'Глубокий прокол с венозным стоком', cat: 'slash', style: 'deep_stab', bleed: 2.5, arterial: false },
      { name: 'Зубчатая рваная рана краёв', cat: 'slash', style: 'jagged_tear', bleed: 2.1, arterial: false },

      // === IV. ОСКОЛОЧНЫЕ, ВЗРЫВНЫЕ, ОЖОГОВЫЕ И КРИТИЧЕСКИЕ РАНЫ (43–56) ===
      { name: 'Осколочное проникающее ранение', cat: 'blast', style: 'shrapnel_pierce', bleed: 2.6, arterial: true },
      { name: 'Термический кровавый ожог', cat: 'blast', style: 'burn_blister', bleed: 1.2, arterial: false },
      { name: 'Обугливание с трещинами кожи', cat: 'blast', style: 'char_fissure', bleed: 1.5, arterial: false },
      { name: 'Множественное поражение шрапнелью', cat: 'blast', style: 'shrapnel_cluster', bleed: 2.9, arterial: true },
      { name: 'Открытый перелом с выходом кости', cat: 'blast', style: 'open_fracture', bleed: 3.2, arterial: true },
      { name: 'Разрыв внутренних тканей (GoreBox)', cat: 'blast', style: 'internal_burst', bleed: 3.0, arterial: true },
      { name: 'Кратер от взрывной волны', cat: 'blast', style: 'blast_crater', bleed: 3.3, arterial: true },
      { name: 'Травматический срыв эпидермиса', cat: 'blast', style: 'avulsion_red', bleed: 2.7, arterial: false },
      { name: 'Глубокий ожог с обнажением мышц', cat: 'blast', style: 'burn_muscle', bleed: 2.0, arterial: false },
      { name: 'Критический разрыв магистрального сосуда', cat: 'blast', style: 'major_vessel', bleed: 3.8, arterial: true },
      { name: 'Осколочная рваная полость', cat: 'blast', style: 'cavity_shrapnel', bleed: 3.1, arterial: true },
      { name: 'Травматическая кровавая эрозия', cat: 'blast', style: 'erosion_blood', bleed: 2.2, arterial: false },
      { name: 'Размозжение мышечного пучка', cat: 'blast', style: 'mangled_flesh', bleed: 2.9, arterial: true },
      { name: 'Критическая политравма сегмента', cat: 'blast', style: 'polytrauma_gore', bleed: 3.6, arterial: true }
    ];

    return defs.map((d, idx) => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d');
      this._drawWoundVariant56(ctx, idx, d);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;

      return {
        id: idx + 1,
        name: d.name,
        category: d.cat,
        style: d.style,
        bleedRate: d.bleed,
        arterial: d.arterial,
        texture: tex,
        previewUrl: c.toDataURL()
      };
    });
  }

  /**
   * Рисует уникальный детализированный рисунок для каждого из 56 видов ран GoreBox (красная кровь, волокна, кость, ушибы).
   */
  _drawWoundVariant56(ctx, idx, def) {
    ctx.clearRect(0, 0, 128, 128);
    const cx = 64;
    const cy = 64;

    // Seeded pseudo-random helper so each of the 56 wounds has a distinct deterministic look
    let seed = (idx + 1) * 9781;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // 1. Base outer bruise / blood halo
    const haloR = 38 + (idx % 5) * 4;
    const haloGrd = ctx.createRadialGradient(cx, cy, 4, cx, cy, haloR);
    if (def.category === 'blunt') {
      haloGrd.addColorStop(0, 'rgba(136, 19, 55, 0.88)');
      haloGrd.addColorStop(0.55, 'rgba(153, 27, 27, 0.65)');
      haloGrd.addColorStop(0.85, 'rgba(88, 28, 135, 0.28)');
      haloGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else if (def.category === 'blast') {
      haloGrd.addColorStop(0, 'rgba(185, 28, 28, 0.96)');
      haloGrd.addColorStop(0.5, 'rgba(127, 29, 29, 0.82)');
      haloGrd.addColorStop(0.82, 'rgba(45, 18, 18, 0.45)');
      haloGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      haloGrd.addColorStop(0, 'rgba(185, 28, 28, 0.94)');
      haloGrd.addColorStop(0.55, 'rgba(153, 27, 27, 0.72)');
      haloGrd.addColorStop(0.88, 'rgba(127, 29, 29, 0.25)');
      haloGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = haloGrd;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();

    // 2. Red blood splatters and dripping streaks around the wound
    const dropCount = def.category === 'blunt' ? 10 : 24;
    for (let i = 0; i < dropCount; i++) {
      const a = rand() * Math.PI * 2;
      const dist = 10 + rand() * 40;
      const px = cx + Math.cos(a) * dist;
      const py = cy + Math.sin(a) * dist;
      const r = 2 + rand() * 6.5;
      ctx.fillStyle = rand() > 0.35 ? '#b91c1c' : '#dc2626';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();

      // Vertical gravity blood drip on lower half
      if (i % 3 === 0 && def.bleedRate >= 1.2) {
        ctx.fillStyle = 'rgba(185, 28, 28, 0.85)';
        ctx.fillRect(px - 1.5, py, 3, 8 + rand() * 20);
      }
    }

    // 3. Category-specific detailed wound core
    if (def.category === 'bullet') {
      const holes = def.style === 'double_hole' ? [[-11, -6], [11, 7]] : [[0, 0]];
      for (const [ox, oy] of holes) {
        const hx = cx + ox;
        const hy = cy + oy;
        const r = def.style === 'hole_exit' || def.style === 'hole_crater' ? 18 : 12;

        // Exposed crimson tissue ring
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(hx, hy, r + 5, 0, Math.PI * 2);
        ctx.fill();

        // Deep dark-red cavity
        ctx.fillStyle = '#450a0a';
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fill();

        // Bone chip or powder burn
        if (def.style === 'hole_bone' || def.style === 'hole_crater') {
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(hx - 4, hy - 3, 7, 5);
        }
        if (def.style === 'hole_powder') {
          ctx.strokeStyle = 'rgba(20, 10, 10, 0.75)';
          ctx.lineWidth = 4;
          ctx.strokeRect(hx - r - 3, hy - r - 3, (r + 3) * 2, (r + 3) * 2);
        }
      }
      // Radial arterial spray rays
      if (def.arterial) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + rand() * 0.3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 48);
          ctx.stroke();
        }
      }
    } else if (def.category === 'blunt') {
      // Mottled purple-crimson hematoma & skin splits
      for (let p = 0; p < 16; p++) {
        const px = cx + (rand() - 0.5) * 42;
        const py = cy + (rand() - 0.5) * 42;
        ctx.fillStyle = p % 2 === 0 ? 'rgba(153, 27, 27, 0.72)' : 'rgba(107, 33, 168, 0.45)';
        ctx.beginPath();
        ctx.ellipse(px, py, 6 + rand() * 10, 4 + rand() * 8, rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      if (def.bleedRate >= 0.8) {
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy - 6 + (idx % 5) * 2);
        ctx.lineTo(cx + 2, cy + 4);
        ctx.lineTo(cx + 19, cy - 3);
        ctx.stroke();
      }
    } else if (def.category === 'slash') {
      // Deep GoreBox slash / crowbar gash with exposed muscle striations and bone
      ctx.save();
      ctx.translate(cx, cy);
      const angle = ((idx % 7) - 3) * 0.35;
      ctx.rotate(angle);

      const slashes = def.style === 'claw_double' ? [-9, 9] : [0];
      for (const sy of slashes) {
        // Outer bright red blood rim
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.ellipse(0, sy, 42, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Inner dark crimson cavity
        ctx.fillStyle = '#450a0a';
        ctx.beginPath();
        ctx.ellipse(0, sy, 35, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Muscle fibers across gash
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 1.6;
        for (let m = -24; m <= 24; m += 8) {
          ctx.beginPath();
          ctx.moveTo(m, sy - 5);
          ctx.lineTo(m + 3, sy + 5);
          ctx.stroke();
        }

        if (def.style === 'slash_bone' || def.style === 'gaping_gash') {
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(-10, sy - 2, 20, 4);
        }
      }

      if (def.style === 'cross_slash') {
        ctx.rotate(Math.PI / 2.2);
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.ellipse(0, 0, 34, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // 'blast' — jagged crater, open fracture bone, charred rim & heavy crimson gore
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      const pts = 12;
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const r = 20 + rand() * 22;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();

      // Exposed white bone fragments in open fracture / blast wounds
      if (def.style === 'open_fracture' || def.style === 'polytrauma_gore' || def.style === 'blast_crater') {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(cx - 9, cy - 4, 18, 7);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(cx - 5, cy - 2, 10, 4);
      }
    }
  }

  /**
   * Пул из 40 различных КРАСНЫХ кровавых декалей (лужи крови, брызги, капли, мазки) для пола и стен.
   */
  createDamageDecalPool40() {
    const pool = [];
    const size = 256;

    for (let i = 0; i < 40; i++) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');

      const cx = size / 2 + (Math.random() - 0.5) * 14;
      const cy = size / 2 + (Math.random() - 0.5) * 14;
      const style = i % 4;

      // Rich red GoreBox blood pool core
      const baseR = 48 + (i % 6) * 8;
      const grd = ctx.createRadialGradient(cx, cy, 8, cx, cy, baseR * 1.45);
      grd.addColorStop(0, 'rgba(127, 17, 17, 0.96)');
      grd.addColorStop(0.55, 'rgba(185, 28, 28, 0.88)');
      grd.addColorStop(0.88, 'rgba(153, 27, 27, 0.45)');
      grd.addColorStop(1, 'rgba(90, 10, 10, 0)');
      ctx.fillStyle = grd;

      ctx.beginPath();
      const lobes = 9 + (i % 7);
      for (let k = 0; k < lobes; k++) {
        const a = (k / lobes) * Math.PI * 2;
        const rad = baseR * (0.68 + Math.random() * 0.52);
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Secondary arterial splatters & droplets
      const drops = style === 0 ? 18 : style === 1 ? 32 : 24;
      for (let d = 0; d < drops; d++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 24 + Math.random() * 82;
        const dx = cx + Math.cos(ang) * dist;
        const dy = cy + Math.sin(ang) * dist;
        const dr = 2.5 + Math.random() * 9.5;
        ctx.fillStyle = d % 2 === 0 ? 'rgba(185, 28, 28, 0.92)' : 'rgba(220, 38, 38, 0.85)';
        ctx.beginPath();
        ctx.arc(dx, dy, dr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Glossy coagulated dark red center
      ctx.fillStyle = 'rgba(85, 10, 10, 0.65)';
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.42, 0, Math.PI * 2);
      ctx.fill();

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      pool.push(tex);
    }

    return pool;
  }

  /**
   * GoreBox Cross-Section Stump Texture + 56 Wounds Atlas + 40 Blood Pool Decals
   */
  createGoreAndWoundTextures() {
    // 1. Cross-section stump cap (exposed crimson muscle, fascia ring, and white bone marrow)
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 512;
    sCanvas.height = 512;
    const sCtx = sCanvas.getContext('2d');

    sCtx.fillStyle = '#7f1d1d';
    sCtx.fillRect(0, 0, 512, 512);

    const grd = sCtx.createRadialGradient(256, 256, 20, 256, 256, 240);
    grd.addColorStop(0, '#dc2626');
    grd.addColorStop(0.65, '#991b1b');
    grd.addColorStop(1, '#450a0a');
    sCtx.fillStyle = grd;
    sCtx.beginPath();
    sCtx.arc(256, 256, 236, 0, Math.PI * 2);
    sCtx.fill();

    for (let i = 0; i < 240; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 45 + Math.random() * 175;
      const x = 256 + Math.cos(a) * r;
      const y = 256 + Math.sin(a) * r;
      sCtx.fillStyle = Math.random() > 0.5 ? 'rgba(248, 113, 113, 0.42)' : 'rgba(69, 10, 10, 0.58)';
      sCtx.beginPath();
      sCtx.arc(x, y, 4 + Math.random() * 12, 0, Math.PI * 2);
      sCtx.fill();
    }

    // Center white bone cross-section with red marrow core
    sCtx.fillStyle = '#f1f5f9';
    sCtx.beginPath();
    sCtx.arc(256, 256, 56, 0, Math.PI * 2);
    sCtx.fill();

    sCtx.fillStyle = '#991b1b';
    sCtx.beginPath();
    sCtx.arc(256, 256, 24, 0, Math.PI * 2);
    sCtx.fill();

    const decalPool40 = this.createDamageDecalPool40();
    const woundAtlas56 = this.createWoundAtlas56();

    return {
      stumpMap: this._configureTexture(sCanvas, 1, 1, true),
      woundMap: woundAtlas56[0].texture,
      decalPool40,
      woundAtlas56
    };
  }

  /**
   * 512x512 Cinderblock Texture
   */
  createCinderBlockTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#68707a';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 6500; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const v = 70 + Math.floor(Math.random() * 70);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      ctx.fillRect(x, y, 3, 3);
    }

    ctx.fillStyle = '#1e2229';
    ctx.fillRect(65, 95, 145, 320);
    ctx.fillRect(302, 95, 145, 320);

    return this._configureTexture(canvas, 1, 1, true);
  }
}

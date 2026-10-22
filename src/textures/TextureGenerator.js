import * as THREE from 'three';

/**
 * Procedural 2K (2048x2048) PBR Texture Generator +
 * Pool of 40 Unique Surface Damage Decal Textures + Internal Damage Textures.
 */
export class TextureGenerator {
  constructor(renderer) {
    this.maxAnisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  }

  /**
   * Generates a 2K (2048x2048) industrial poured-concrete slab texture.
   */
  createConcrete2K() {
    const size = 2048;
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const ctx = diffCanvas.getContext('2d');

    ctx.fillStyle = '#53585e';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 420; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 40 + Math.random() * 190;
      const grd = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      const shade = Math.random() > 0.5 ? 'rgba(34, 38, 43, 0.14)' : 'rgba(118, 125, 134, 0.12)';
      grd.addColorStop(0, shade);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const tileSize = 256;
    const tCanvas = document.createElement('canvas');
    tCanvas.width = tileSize;
    tCanvas.height = tileSize;
    const tCtx = tCanvas.getContext('2d');
    const imgData = tCtx.createImageData(tileSize, tileSize);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 42;
      const v = Math.max(0, Math.min(255, 128 + n));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 54;
    }
    tCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    const pattern = ctx.createPattern(tCanvas, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    const step = 512;
    ctx.lineWidth = 4;
    for (let p = 0; p <= size; p += step) {
      ctx.strokeStyle = 'rgba(20, 22, 26, 0.72)';
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(135, 142, 152, 0.3)';
      ctx.beginPath();
      ctx.moveTo(p + 4, 0);
      ctx.lineTo(p + 4, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p + 4);
      ctx.lineTo(size, p + 4);
      ctx.stroke();
    }

    const map = new THREE.CanvasTexture(diffCanvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(10, 10);
    map.anisotropy = this.maxAnisotropy;
    map.colorSpace = THREE.SRGBColorSpace;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 1024;
    bumpCanvas.height = 1024;
    const bCtx = bumpCanvas.getContext('2d');
    bCtx.drawImage(diffCanvas, 0, 0, 1024, 1024);

    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(10, 10);
    bumpMap.anisotropy = this.maxAnisotropy;

    return { map, bumpMap, roughnessMap: bumpMap };
  }

  /**
   * Generates a 2K (2048x2048) wooden supply crate texture.
   */
  createWoodCrate2K() {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#8b5e34';
    ctx.fillRect(0, 0, size, size);

    const planks = 6;
    const plankH = size / planks;
    for (let p = 0; p < planks; p++) {
      const y0 = p * plankH;
      const toneShift = (p % 2 === 0 ? 1 : -1) * 8;
      ctx.fillStyle = `rgb(${139 + toneShift}, ${94 + toneShift}, ${52 + Math.floor(toneShift * 0.6)})`;
      ctx.fillRect(0, y0, size, plankH);

      for (let g = 0; g < 70; g++) {
        const gy = y0 + Math.random() * plankH;
        ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(58, 36, 16, 0.22)' : 'rgba(182, 134, 78, 0.16)';
        ctx.lineWidth = 2 + Math.random() * 5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        for (let x = 0; x <= size; x += 256) {
          ctx.lineTo(x, gy + Math.sin(x * 0.005 + g) * 8);
        }
        ctx.stroke();
      }

      ctx.fillStyle = '#241509';
      ctx.fillRect(0, y0, size, 8);
    }

    const border = 140;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(border, border);
    ctx.lineTo(size - border, size - border);
    ctx.lineWidth = 128;
    ctx.strokeStyle = '#694320';
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#2b190a';
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#754c27';
    ctx.fillRect(0, 0, size, border);
    ctx.fillRect(0, size - border, size, border);
    ctx.fillRect(0, 0, border, size);
    ctx.fillRect(size - border, 0, border, size);

    ctx.strokeStyle = '#291709';
    ctx.lineWidth = 8;
    ctx.strokeRect(border, border, size - border * 2, size - border * 2);

    ctx.save();
    ctx.translate(size * 0.5, size * 0.28);
    ctx.fillStyle = 'rgba(22, 20, 18, 0.72)';
    ctx.font = 'bold 74px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('МЕЖДУГОРНЫЙ // СНАБ-04', 0, 0);
    ctx.restore();

    const map = new THREE.CanvasTexture(canvas);
    map.anisotropy = this.maxAnisotropy;
    map.colorSpace = THREE.SRGBColorSpace;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 512;
    bumpCanvas.height = 512;
    const bCtx = bumpCanvas.getContext('2d');
    bCtx.drawImage(canvas, 0, 0, 512, 512);
    const bumpMap = new THREE.CanvasTexture(bumpCanvas);

    return { map, bumpMap };
  }

  /**
   * Generates a 2K (2048x2048) industrial painted steel drum texture.
   */
  createMetalBarrel2K(baseColor = '#9e1b1b', stripeColor = '#eab308', label = 'ОГНЕОПАСНО // ГАЗ') {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = stripeColor;
    ctx.fillRect(0, size * 0.36, size, size * 0.28);

    const ribs = [size * 0.32, size * 0.68];
    for (const ry of ribs) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, ry - 20, size, 40);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, ry - 8, size, 16);
    }

    ctx.fillStyle = '#141414';
    ctx.font = 'bold 84px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, size * 0.5, size * 0.52);

    const map = new THREE.CanvasTexture(canvas);
    map.anisotropy = this.maxAnisotropy;
    map.colorSpace = THREE.SRGBColorSpace;
    return { map, bumpMap: map };
  }

  createCinderBlockTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#6c737a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(30,32,36,0.25)' : 'rgba(220,225,230,0.2)';
      ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
    }
    ctx.fillStyle = '#1f2327';
    ctx.fillRect(72, 96, 145, 320);
    ctx.fillRect(295, 96, 145, 320);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * ШАГ 2: Generates a pool of 40 DISTINCT dark damage decal textures (soot, dirt, craters, cracks, scuffs)
   * so surface impacts on floors and walls never look repetitive!
   */
  createDamageDecalPool40() {
    const pool = [];
    const total = 40;

    for (let idx = 0; idx < total; idx++) {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);

      const cx = 128 + ((idx * 17) % 18) - 9;
      const cy = 128 + ((idx * 23) % 18) - 9;
      const archetype = idx % 5; // 5 distinct visual families across 40 unique seeds

      // 1. Soft dark soot / dirt cloud base
      const outerR = 72 + (idx % 7) * 6;
      const baseGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, outerR);
      const tone = 12 + (idx % 6) * 4;
      baseGrad.addColorStop(0, `rgba(${tone}, ${tone + 2}, ${tone + 4}, 0.92)`);
      baseGrad.addColorStop(0.45, `rgba(${tone + 14}, ${tone + 12}, ${tone + 10}, 0.68)`);
      baseGrad.addColorStop(0.78, `rgba(${tone + 26}, ${tone + 24}, ${tone + 20}, 0.28)`);
      baseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = baseGrad;

      ctx.beginPath();
      const lobes = 12 + (idx % 9);
      for (let i = 0; i <= lobes; i++) {
        const a = (i / lobes) * Math.PI * 2;
        const wave = Math.sin(a * (3 + (idx % 4)) + idx) * 16 + Math.cos(a * (5 + (idx % 3))) * 10;
        const r = outerR + wave;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      // 2. Archetype-specific details (craters, radial soot rays, cracks, cluster splatters, directional scuffs)
      if (archetype === 0) {
        // Deep impact crater with radial micro-cracks
        ctx.fillStyle = '#090b0e';
        ctx.beginPath();
        ctx.arc(cx, cy, 18 + (idx % 8), 0, Math.PI * 2);
        ctx.fill();

        const crackCount = 5 + (idx % 6);
        ctx.strokeStyle = 'rgba(12, 14, 18, 0.85)';
        for (let c = 0; c < crackCount; c++) {
          const ang = (c / crackCount) * Math.PI * 2 + idx * 0.4;
          ctx.lineWidth = 1.5 + (c % 2);
          ctx.beginPath();
          let px = cx + Math.cos(ang) * 12;
          let py = cy + Math.sin(ang) * 12;
          ctx.moveTo(px, py);
          for (let s = 0; s < 4; s++) {
            px += Math.cos(ang + (Math.sin(s + idx) * 0.35)) * 18;
            py += Math.sin(ang + (Math.cos(s + idx) * 0.35)) * 18;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      } else if (archetype === 1) {
        // Directional high-velocity soot & dirt spray
        const dirAngle = (idx * 0.78) % (Math.PI * 2);
        const streakCount = 14 + (idx % 10);
        for (let s = 0; s < streakCount; s++) {
          const spread = (s / streakCount - 0.5) * 1.25;
          const a = dirAngle + spread;
          const len = 35 + ((idx * 13 + s * 19) % 72);
          ctx.strokeStyle = s % 2 === 0 ? 'rgba(15, 17, 21, 0.82)' : 'rgba(42, 38, 34, 0.65)';
          ctx.lineWidth = 2 + (s % 4);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();
        }
      } else if (archetype === 2) {
        // Multi-spot dark grime & debris splatter cluster
        const blobs = 10 + (idx % 12);
        for (let b = 0; b < blobs; b++) {
          const a = (b / blobs) * Math.PI * 2 + idx * 0.3;
          const d = 14 + ((b * 17 + idx * 7) % 68);
          const br = 4 + ((b * 5 + idx) % 13);
          ctx.fillStyle = b % 3 === 0 ? 'rgba(10, 12, 15, 0.88)' : 'rgba(36, 33, 29, 0.75)';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, br, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (archetype === 3) {
        // Scorched ring with ash rim & chipped concrete core
        ctx.strokeStyle = 'rgba(18, 20, 24, 0.78)';
        ctx.lineWidth = 8 + (idx % 5);
        ctx.beginPath();
        ctx.arc(cx, cy, 34 + (idx % 12), 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(55, 52, 48, 0.65)';
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 3, 14, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Jagged abrasion / shrapnel gouge mark
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((idx * 0.52) % Math.PI);
        ctx.fillStyle = 'rgba(14, 16, 20, 0.9)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 48 + (idx % 18), 14 + (idx % 7), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 3. Fine dust speckles around perimeter
      for (let p = 0; p < 22; p++) {
        const a = ((p * 29 + idx * 11) % 360) * (Math.PI / 180);
        const dist = 30 + ((p * 13 + idx * 17) % 75);
        const pr = 1.5 + (p % 3);
        ctx.fillStyle = 'rgba(20, 22, 26, 0.72)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, pr, 0, Math.PI * 2);
        ctx.fill();
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      pool.push(tex);
    }

    return pool;
  }

  /**
   * Generates localized damage & internal cross-section textures for NPCs and props.
   */
  createGoreAndWoundTextures() {
    const decalPool40 = this.createDamageDecalPool40();

    // 1. Entry Damage Decal Texture (512x512)
    const bulletCanvas = document.createElement('canvas');
    bulletCanvas.width = 512;
    bulletCanvas.height = 512;
    const bCtx = bulletCanvas.getContext('2d');
    bCtx.clearRect(0, 0, 512, 512);

    const bruiseGrad = bCtx.createRadialGradient(256, 256, 20, 256, 256, 210);
    bruiseGrad.addColorStop(0, 'rgba(30, 20, 24, 0.96)');
    bruiseGrad.addColorStop(0.5, 'rgba(58, 32, 36, 0.78)');
    bruiseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    bCtx.fillStyle = bruiseGrad;
    bCtx.beginPath();
    bCtx.arc(256, 256, 210, 0, Math.PI * 2);
    bCtx.fill();

    bCtx.fillStyle = '#140c0e';
    bCtx.beginPath();
    bCtx.arc(256, 256, 54, 0, Math.PI * 2);
    bCtx.fill();

    const bulletWoundTex = new THREE.CanvasTexture(bulletCanvas);
    bulletWoundTex.colorSpace = THREE.SRGBColorSpace;

    // 2. Blunt / Slash Damage Decal Texture (512x512)
    const slashCanvas = document.createElement('canvas');
    slashCanvas.width = 512;
    slashCanvas.height = 512;
    const sCtx = slashCanvas.getContext('2d');
    sCtx.clearRect(0, 0, 512, 512);

    sCtx.save();
    sCtx.translate(256, 256);
    sCtx.rotate(-0.38);
    sCtx.fillStyle = 'rgba(42, 24, 28, 0.9)';
    sCtx.beginPath();
    sCtx.ellipse(0, 0, 185, 48, 0, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.fillStyle = '#180d10';
    sCtx.beginPath();
    sCtx.ellipse(0, 0, 145, 18, 0, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.restore();

    const slashWoundTex = new THREE.CanvasTexture(slashCanvas);
    slashWoundTex.colorSpace = THREE.SRGBColorSpace;

    // 3. Internal Joint Cross-Section Texture (Внутренние текстуры)
    const internalCanvas = document.createElement('canvas');
    internalCanvas.width = 512;
    internalCanvas.height = 512;
    const gCtx = internalCanvas.getContext('2d');

    gCtx.fillStyle = '#3b1518';
    gCtx.fillRect(0, 0, 512, 512);
    gCtx.fillStyle = '#e2e8f0';
    gCtx.beginPath();
    gCtx.arc(256, 256, 66, 0, Math.PI * 2);
    gCtx.fill();

    const goreCrossSectionTex = new THREE.CanvasTexture(internalCanvas);
    goreCrossSectionTex.colorSpace = THREE.SRGBColorSpace;

    return {
      decalPool40,
      bulletWound: bulletWoundTex,
      slashWound: slashWoundTex,
      goreCrossSection: goreCrossSectionTex,
      bloodPool: decalPool40[0],
      scorch: decalPool40[3]
    };
  }
}

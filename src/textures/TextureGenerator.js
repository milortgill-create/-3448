import * as THREE from 'three';

/**
 * Procedural 2K (2048x2048) PBR Texture Generator + GoreBox Wound, Bone & Viscera Textures.
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
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
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

    ctx.strokeStyle = 'rgba(24, 27, 31, 0.5)';
    for (let c = 0; c < 26; c++) {
      let cx = Math.random() * size;
      let cy = Math.random() * size;
      ctx.lineWidth = 1 + Math.random() * 2.0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const segs = 6 + Math.floor(Math.random() * 10);
      for (let s = 0; s < segs; s++) {
        cx += (Math.random() - 0.5) * 58;
        cy += (Math.random() - 0.5) * 58;
        ctx.lineTo(cx, cy);
      }
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

      for (let g = 0; g < 85; g++) {
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
    ctx.fillStyle = '#734b26';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#2b190a';

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
    ctx.strokeRect(4, 4, size - 8, size - 8);

    const drawNail = (nx, ny) => {
      ctx.fillStyle = '#2b3036';
      ctx.beginPath();
      ctx.arc(nx, ny, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6c757d';
      ctx.beginPath();
      ctx.arc(nx - 4, ny - 4, 5, 0, Math.PI * 2);
      ctx.fill();
    };
    const m = border * 0.5;
    drawNail(m, m);
    drawNail(size - m, m);
    drawNail(m, size - m);
    drawNail(size - m, size - m);

    ctx.save();
    ctx.translate(size * 0.5, size * 0.28);
    ctx.fillStyle = 'rgba(22, 20, 18, 0.72)';
    ctx.font = 'bold 74px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('МЕЖДУГОРНЫЙ // СНАБ-04', 0, 0);
    ctx.font = 'bold 52px monospace';
    ctx.fillStyle = 'rgba(165, 28, 28, 0.76)';
    ctx.fillText('ОСТОРОЖНО: ХРУПКОЕ', 0, 78);
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
   * Generates a 2K (2048x2048) industrial painted steel drum / explosive barrel texture.
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

    for (let i = 0; i < 320; i++) {
      ctx.strokeStyle = Math.random() > 0.4 ? 'rgba(30, 32, 36, 0.35)' : 'rgba(210, 215, 222, 0.3)';
      ctx.lineWidth = 2 + Math.random() * 5;
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 110, y + (Math.random() - 0.5) * 110);
      ctx.stroke();
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
   * Generates detailed GoreBox-style Wound Decals, Cross-Section Bone/Viscera, Blood Pool, and Blast Scorch textures!
   */
  createGoreAndWoundTextures() {
    // 1. Bullet Entry / Exit Wound Texture (512x512)
    const bulletCanvas = document.createElement('canvas');
    bulletCanvas.width = 512;
    bulletCanvas.height = 512;
    const bCtx = bulletCanvas.getContext('2d');
    bCtx.clearRect(0, 0, 512, 512);

    // Outer bruise & radial blood mist
    const bruiseGrad = bCtx.createRadialGradient(256, 256, 25, 256, 256, 225);
    bruiseGrad.addColorStop(0, 'rgba(136, 19, 55, 0.95)');
    bruiseGrad.addColorStop(0.45, 'rgba(127, 29, 29, 0.85)');
    bruiseGrad.addColorStop(0.75, 'rgba(76, 5, 25, 0.42)');
    bruiseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    bCtx.fillStyle = bruiseGrad;
    bCtx.beginPath();
    bCtx.arc(256, 256, 225, 0, Math.PI * 2);
    bCtx.fill();

    // Radial blood splatter streaks & droplets
    for (let i = 0; i < 42; i++) {
      const ang = (i / 42) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const len = 85 + Math.random() * 145;
      bCtx.strokeStyle = i % 3 === 0 ? 'rgba(69, 10, 10, 0.92)' : 'rgba(185, 28, 28, 0.88)';
      bCtx.lineWidth = 4 + Math.random() * 12;
      bCtx.beginPath();
      bCtx.moveTo(256 + Math.cos(ang) * 32, 256 + Math.sin(ang) * 32);
      bCtx.lineTo(256 + Math.cos(ang) * len, 256 + Math.sin(ang) * len);
      bCtx.stroke();

      // Droplets around wound
      const dropDist = len + 12 + Math.random() * 35;
      if (dropDist < 245) {
        bCtx.fillStyle = '#7f1d1d';
        bCtx.beginPath();
        bCtx.arc(
          256 + Math.cos(ang) * dropDist,
          256 + Math.sin(ang) * dropDist,
          4 + Math.random() * 9,
          0,
          Math.PI * 2
        );
        bCtx.fill();
      }
    }

    // Torn ragged flesh ring (exposed red muscle tissue)
    bCtx.fillStyle = '#991b1b';
    bCtx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r = 74 + Math.sin(i * 5.3) * 14 + (Math.random() - 0.5) * 12;
      const x = 256 + Math.cos(a) * r;
      const y = 256 + Math.sin(a) * r;
      if (i === 0) bCtx.moveTo(x, y);
      else bCtx.lineTo(x, y);
    }
    bCtx.closePath();
    bCtx.fill();

    // Striated muscle fibers inside wound
    for (let i = 0; i < 24; i++) {
      bCtx.strokeStyle = i % 2 === 0 ? '#dc2626' : '#450a0a';
      bCtx.lineWidth = 4;
      bCtx.beginPath();
      bCtx.moveTo(195 + Math.random() * 120, 195 + Math.random() * 120);
      bCtx.lineTo(195 + Math.random() * 120, 195 + Math.random() * 120);
      bCtx.stroke();
    }

    // Deep dark entry cavity with a glimpse of white bone inside
    const cavGrad = bCtx.createRadialGradient(256, 256, 6, 256, 256, 52);
    cavGrad.addColorStop(0, '#180204');
    cavGrad.addColorStop(0.65, '#3b070b');
    cavGrad.addColorStop(1, '#7f1d1d');
    bCtx.fillStyle = cavGrad;
    bCtx.beginPath();
    bCtx.arc(256, 256, 52, 0, Math.PI * 2);
    bCtx.fill();

    // Subtle bone fragment visible inside deep wound
    bCtx.fillStyle = 'rgba(241, 245, 249, 0.82)';
    bCtx.beginPath();
    bCtx.ellipse(246, 252, 16, 9, 0.4, 0, Math.PI * 2);
    bCtx.fill();

    const bulletWoundTex = new THREE.CanvasTexture(bulletCanvas);
    bulletWoundTex.colorSpace = THREE.SRGBColorSpace;

    // 2. Slash / Blunt Laceration Wound Texture (512x512)
    const slashCanvas = document.createElement('canvas');
    slashCanvas.width = 512;
    slashCanvas.height = 512;
    const sCtx = slashCanvas.getContext('2d');
    sCtx.clearRect(0, 0, 512, 512);

    // Bruised perimeter around gash
    const sGrad = sCtx.createRadialGradient(256, 256, 30, 256, 256, 230);
    sGrad.addColorStop(0, 'rgba(127, 29, 29, 0.92)');
    sGrad.addColorStop(0.6, 'rgba(88, 28, 45, 0.48)');
    sGrad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 512, 512);

    // Jagged diagonal gash exposing muscle & bone
    sCtx.save();
    sCtx.translate(256, 256);
    sCtx.rotate(-0.38);

    // Torn skin edge
    sCtx.fillStyle = '#b91c1c';
    sCtx.beginPath();
    sCtx.ellipse(0, 0, 195, 58, 0, 0, Math.PI * 2);
    sCtx.fill();

    // Inner muscle tissue
    sCtx.fillStyle = '#7f1d1d';
    sCtx.beginPath();
    sCtx.ellipse(0, 0, 172, 38, 0, 0, Math.PI * 2);
    sCtx.fill();

    // White bone / tendon lines across the gash
    sCtx.strokeStyle = '#e2e8f0';
    sCtx.lineWidth = 7;
    for (let k = -2; k <= 2; k++) {
      sCtx.beginPath();
      sCtx.moveTo(k * 42 - 12, -24);
      sCtx.lineTo(k * 42 + 10, 24);
      sCtx.stroke();
    }

    // Deep dark slit center
    sCtx.fillStyle = '#1f0406';
    sCtx.beginPath();
    sCtx.ellipse(0, 0, 150, 16, 0, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.restore();

    // Dripping blood trails downwards
    for (let d = 0; d < 12; d++) {
      const dx = 110 + d * 26 + (Math.random() - 0.5) * 14;
      const dy = 240 + (Math.random() - 0.5) * 30;
      const dLen = 70 + Math.random() * 145;
      sCtx.strokeStyle = 'rgba(136, 19, 25, 0.9)';
      sCtx.lineWidth = 5 + Math.random() * 7;
      sCtx.lineCap = 'round';
      sCtx.beginPath();
      sCtx.moveTo(dx, dy);
      sCtx.lineTo(dx + (Math.random() - 0.5) * 10, Math.min(504, dy + dLen));
      sCtx.stroke();
    }

    const slashWoundTex = new THREE.CanvasTexture(slashCanvas);
    slashWoundTex.colorSpace = THREE.SRGBColorSpace;

    // 3. Cross-Section Severed Limb Stump (Skin + Fat + Muscle + Viscera + Bone & Marrow) (512x512)
    const goreCanvas = document.createElement('canvas');
    goreCanvas.width = 512;
    goreCanvas.height = 512;
    const gCtx = goreCanvas.getContext('2d');

    // Deep crimson base
    gCtx.fillStyle = '#5c0c12';
    gCtx.fillRect(0, 0, 512, 512);

    // Outer subcutaneous rim
    gCtx.strokeStyle = '#dca884';
    gCtx.lineWidth = 22;
    gCtx.beginPath();
    gCtx.arc(256, 256, 236, 0, Math.PI * 2);
    gCtx.stroke();

    // Muscle bundles (segmented anatomical cross-section)
    const bundles = 9;
    for (let i = 0; i < bundles; i++) {
      const a = (i / bundles) * Math.PI * 2;
      const bx = 256 + Math.cos(a) * 145;
      const by = 256 + Math.sin(a) * 145;
      const grd = gCtx.createRadialGradient(bx, by, 10, bx, by, 72);
      grd.addColorStop(0, '#b91c1c');
      grd.addColorStop(0.7, '#7f1d1d');
      grd.addColorStop(1, '#3b070b');
      gCtx.fillStyle = grd;
      gCtx.beginPath();
      gCtx.arc(bx, by, 68, 0, Math.PI * 2);
      gCtx.fill();

      // White fascia connective tissue lines
      gCtx.strokeStyle = 'rgba(254, 202, 202, 0.38)';
      gCtx.lineWidth = 4;
      gCtx.stroke();
    }

    // Dark venous vessels & viscera pockets
    for (let v = 0; v < 18; v++) {
      const va = Math.random() * Math.PI * 2;
      const vr = 75 + Math.random() * 120;
      gCtx.fillStyle = v % 2 === 0 ? '#2a0408' : '#991b1b';
      gCtx.beginPath();
      gCtx.arc(256 + Math.cos(va) * vr, 256 + Math.sin(va) * vr, 10 + Math.random() * 18, 0, Math.PI * 2);
      gCtx.fill();
    }

    // Central Ivory Bone Cross-Section (Костная ткань)
    gCtx.fillStyle = '#f1f5f9';
    gCtx.beginPath();
    gCtx.arc(256, 256, 68, 0, Math.PI * 2);
    gCtx.fill();

    gCtx.strokeStyle = '#cbd5e1';
    gCtx.lineWidth = 8;
    gCtx.stroke();

    // Spongy red bone marrow inside bone core
    const marrowGrad = gCtx.createRadialGradient(256, 256, 4, 256, 256, 36);
    marrowGrad.addColorStop(0, '#4c0519');
    marrowGrad.addColorStop(0.7, '#9f1239');
    marrowGrad.addColorStop(1, '#cbd5e1');
    gCtx.fillStyle = marrowGrad;
    gCtx.beginPath();
    gCtx.arc(256, 256, 36, 0, Math.PI * 2);
    gCtx.fill();

    const goreCrossSectionTex = new THREE.CanvasTexture(goreCanvas);
    goreCrossSectionTex.colorSpace = THREE.SRGBColorSpace;

    // 4. Organic Blood Pool Floor Decal Texture (512x512)
    const poolCanvas = document.createElement('canvas');
    poolCanvas.width = 512;
    poolCanvas.height = 512;
    const pCtx = poolCanvas.getContext('2d');
    pCtx.clearRect(0, 0, 512, 512);

    const pGrad = pCtx.createRadialGradient(256, 256, 30, 256, 256, 210);
    pGrad.addColorStop(0, 'rgba(69, 10, 10, 0.96)');
    pGrad.addColorStop(0.55, 'rgba(127, 29, 29, 0.9)');
    pGrad.addColorStop(0.85, 'rgba(153, 27, 27, 0.72)');
    pGrad.addColorStop(1, 'rgba(127, 29, 29, 0)');
    pCtx.fillStyle = pGrad;
    pCtx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 165 + Math.sin(i * 3.7) * 32 + Math.cos(i * 6.1) * 18;
      const x = 256 + Math.cos(a) * r;
      const y = 256 + Math.sin(a) * r;
      if (i === 0) pCtx.moveTo(x, y);
      else pCtx.lineTo(x, y);
    }
    pCtx.closePath();
    pCtx.fill();

    // Satellite blood drops around pool
    for (let d = 0; d < 28; d++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 165 + Math.random() * 75;
      pCtx.fillStyle = 'rgba(127, 29, 29, 0.88)';
      pCtx.beginPath();
      pCtx.arc(256 + Math.cos(a) * dist, 256 + Math.sin(a) * dist, 5 + Math.random() * 14, 0, Math.PI * 2);
      pCtx.fill();
    }

    const bloodPoolTex = new THREE.CanvasTexture(poolCanvas);
    bloodPoolTex.colorSpace = THREE.SRGBColorSpace;

    // 5. Realistic Explosion Blast Crater / Scorch Decal Texture (512x512)
    const scorchCanvas = document.createElement('canvas');
    scorchCanvas.width = 512;
    scorchCanvas.height = 512;
    const scCtx = scorchCanvas.getContext('2d');
    scCtx.clearRect(0, 0, 512, 512);

    const scGrad = scCtx.createRadialGradient(256, 256, 20, 256, 256, 245);
    scGrad.addColorStop(0, 'rgba(5, 7, 11, 0.96)');
    scGrad.addColorStop(0.4, 'rgba(17, 24, 39, 0.85)');
    scGrad.addColorStop(0.72, 'rgba(45, 38, 32, 0.45)');
    scGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    scCtx.fillStyle = scGrad;
    scCtx.beginPath();
    scCtx.arc(256, 256, 245, 0, Math.PI * 2);
    scCtx.fill();

    // Radial blast soot streaks & concrete cracks
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
      const r1 = 35 + Math.random() * 30;
      const r2 = 140 + Math.random() * 105;
      scCtx.strokeStyle = i % 5 === 0 ? 'rgba(180, 83, 9, 0.35)' : 'rgba(10, 12, 16, 0.78)';
      scCtx.lineWidth = 3 + Math.random() * 9;
      scCtx.beginPath();
      scCtx.moveTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
      scCtx.lineTo(256 + Math.cos(a) * r2, 256 + Math.sin(a) * r2);
      scCtx.stroke();
    }

    const scorchTex = new THREE.CanvasTexture(scorchCanvas);
    scorchTex.colorSpace = THREE.SRGBColorSpace;

    return {
      bulletWound: bulletWoundTex,
      slashWound: slashWoundTex,
      goreCrossSection: goreCrossSectionTex,
      bloodPool: bloodPoolTex,
      scorch: scorchTex
    };
  }
}

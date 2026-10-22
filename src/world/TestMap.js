import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class TestMap {
  constructor(scene, world, textures) {
    this.scene = scene;
    this.world = world;
    this.textures = textures;
    this.spotlights = [];
    this.lightingMode = 0;
    this.dustSystem = null;

    this._buildVoidAtmosphere();
    this._buildConcretePlatform50m();
    this._buildRangeMarkingsAndTables();
    this._buildSpotlightTowers();
    this._buildFloatingDust();
  }

  _buildVoidAtmosphere() {
    this.scene.background = new THREE.Color(0x05080e);
    this.scene.fog = new THREE.FogExp2(0x05080e, 0.013);

    this.hemiLight = new THREE.HemisphereLight(0x64748b, 0x0f172a, 0.72);
    this.hemiLight.position.set(0, 35, 0);
    this.scene.add(this.hemiLight);
  }

  _buildConcretePlatform50m() {
    const size = 50; // 50x50 meters
    const thickness = 2.0;

    const concreteMat = new THREE.MeshStandardMaterial({
      map: this.textures.concrete.map,
      bumpMap: this.textures.concrete.bumpMap,
      bumpScale: 0.03,
      roughnessMap: this.textures.concrete.roughnessMap,
      roughness: 0.84,
      metalness: 0.06
    });

    const slabGeo = new THREE.BoxGeometry(size, thickness, size);
    this.platformMesh = new THREE.Mesh(slabGeo, concreteMat);
    this.platformMesh.position.set(0, -thickness / 2, 0);
    this.platformMesh.receiveShadow = true;
    this.scene.add(this.platformMesh);

    const groundShape = new CANNON.Box(new CANNON.Vec3(size / 2, thickness / 2, size / 2));
    this.groundBody = new CANNON.Body({
      mass: 0,
      shape: groundShape,
      position: new CANNON.Vec3(0, -thickness / 2, 0)
    });
    this.groundBody.userData = { type: 'ground', name: 'Бетонная платформа 50×50м' };
    this.world.addBody(this.groundBody);

    // Corner bollards
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.6,
      metalness: 0.2
    });
    const cornerOffsets = [
      [-24.2, -24.2],
      [24.2, -24.2],
      [-24.2, 24.2],
      [24.2, 24.2]
    ];
    for (const [cx, cz] of cornerOffsets) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 10), curbMat);
      bollard.position.set(cx, 0.55, cz);
      this.scene.add(bollard);

      const bBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Cylinder(0.24, 0.24, 1.1, 8),
        position: new CANNON.Vec3(cx, 0.55, cz)
      });
      this.world.addBody(bBody);
    }
  }

  _buildRangeMarkingsAndTables() {
    const markCanvas = document.createElement('canvas');
    markCanvas.width = 1024;
    markCanvas.height = 1024;
    const ctx = markCanvas.getContext('2d');
    ctx.clearRect(0, 0, 1024, 1024);

    ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
    ctx.lineWidth = 12;
    ctx.setLineDash([42, 24]);
    ctx.strokeRect(28, 28, 968, 968);

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.24)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(512, 512, 220, 0, Math.PI * 2);
    ctx.stroke();

    const markTex = new THREE.CanvasTexture(markCanvas);
    const markMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshBasicMaterial({
        map: markTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    markMesh.rotation.x = -Math.PI / 2;
    markMesh.position.y = 0.008;
    this.scene.add(markMesh);

    // 2 Workbenches for Breakable Glass Bottles
    this._createWorkbench(-4.5, -5.5, 3.2, 0.9, 1.1, 'Верстак с бутылками #1');
    this._createWorkbench(5.2, -4.8, 2.6, 0.9, 1.0, 'Лабораторный стол #2');
  }

  _createWorkbench(x, z, w, h, d, label) {
    const topMat = new THREE.MeshStandardMaterial({
      map: this.textures.wood.map,
      roughness: 0.72,
      metalness: 0.1
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x262d38,
      roughness: 0.5,
      metalness: 0.75
    });

    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const topGeo = new THREE.BoxGeometry(w, 0.1, d);
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.y = h - 0.05;
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    group.add(topMesh);

    const legGeo = new THREE.BoxGeometry(0.1, h - 0.1, 0.1);
    const lx = w / 2 - 0.12;
    const lz = d / 2 - 0.12;
    for (const [ox, oz] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(ox, (h - 0.1) / 2, oz);
      group.add(leg);
    }

    this.scene.add(group);

    const tableBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
      position: new CANNON.Vec3(x, h / 2, z)
    });
    tableBody.userData = { type: 'static', name: label, halfExtents: { x: w / 2, z: d / 2 } };
    this.world.addBody(tableBody);
  }

  /**
   * Builds 6 Industrial Spotlight Towers using pure THREE.SpotLight illumination
   * (NO geometric cone objects in the air!).
   */
  _buildSpotlightTowers() {
    const towerConfigs = [
      { pos: [-18, 0, -18], target: [-2, 0, -4], shadow: false, intensity: 440, color: 0xe2f1ff },
      { pos: [18, 0, -18], target: [2, 0, -4], shadow: false, intensity: 440, color: 0xfff4e0 },
      { pos: [-18, 0, 16], target: [-2, 0, 2], shadow: false, intensity: 360, color: 0xe2f1ff },
      { pos: [18, 0, 16], target: [2, 0, 2], shadow: false, intensity: 360, color: 0xfff4e0 },
      { pos: [0, 0, -22], target: [0, 0, -3], shadow: true, intensity: 560, color: 0xf8fafc },
      { pos: [0, 0, 22], target: [0, 0, 2], shadow: false, intensity: 340, color: 0xdbeafe }
    ];

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x222934,
      roughness: 0.45,
      metalness: 0.8
    });
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x11151c,
      roughness: 0.35,
      metalness: 0.85
    });

    towerConfigs.forEach((cfg, idx) => {
      const [tx, , tz] = cfg.pos;
      const towerHeight = 12.5;

      const poleGroup = new THREE.Group();
      poleGroup.position.set(tx, 0, tz);

      const basePedestal = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.1), poleMat);
      basePedestal.position.y = 0.35;
      poleGroup.add(basePedestal);

      const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, towerHeight, 10), poleMat);
      mainMast.position.y = towerHeight / 2;
      poleGroup.add(mainMast);

      const headPos = new THREE.Vector3(tx, towerHeight, tz);
      const targetPos = new THREE.Vector3(cfg.target[0], cfg.target[1], cfg.target[2]);

      const lampHead = new THREE.Group();
      lampHead.position.set(0, towerHeight, 0);
      lampHead.lookAt(targetPos.x - tx, targetPos.y, targetPos.z - tz);

      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.55, 0.5), housingMat);
      lampHead.add(hood);

      const lensMat = new THREE.MeshBasicMaterial({ color: cfg.color });
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.38), lensMat);
      lens.position.z = 0.26;
      lampHead.add(lens);

      poleGroup.add(lampHead);
      this.scene.add(poleGroup);

      const towerBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(0.55, 2.5, 0.55)),
        position: new CANNON.Vec3(tx, 2.5, tz)
      });
      towerBody.userData = { type: 'static', name: `Мачта прожектора #${idx + 1}` };
      this.world.addBody(towerBody);

      // Pure SpotLight illumination without any 3D cone object!
      const spot = new THREE.SpotLight(cfg.color, cfg.intensity);
      spot.position.copy(headPos);
      spot.angle = Math.PI / 3.1;
      spot.penumbra = 0.75;
      spot.decay = 1.6;
      spot.distance = 62;

      spot.target.position.copy(targetPos);
      this.scene.add(spot.target);

      if (cfg.shadow) {
        spot.castShadow = true;
        spot.shadow.mapSize.width = 1024;
        spot.shadow.mapSize.height = 1024;
        spot.shadow.camera.near = 3.0;
        spot.shadow.camera.far = 52;
        spot.shadow.bias = -0.0005;
      }

      this.scene.add(spot);
      this.spotlights.push({ spot, lensMat, baseColor: cfg.color, baseIntensity: cfg.intensity });
    });
  }

  _buildFloatingDust() {
    const count = 260;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 44;
      positions[i * 3 + 1] = 0.4 + Math.random() * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.055,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });

    this.dustSystem = new THREE.Points(geo, mat);
    this.scene.add(this.dustSystem);
  }

  cycleLightingMode() {
    this.lightingMode = (this.lightingMode + 1) % 3;
    const modes = [
      { name: 'Холодный прожекторный (Стандарт)', colors: [0xe2f1ff, 0xfff4e0], hemi: 0.72 },
      { name: 'Тёплый галоген (Промзона)', colors: [0xffd89b, 0xffb36b], hemi: 0.78 },
      { name: 'Тревожный Хоррор (Междугорный Ночь)', colors: [0xef4444, 0x38bdf8], hemi: 0.32 }
    ];
    const mode = modes[this.lightingMode];
    this.hemiLight.intensity = mode.hemi;

    this.spotlights.forEach((s, i) => {
      const col = mode.colors[i % mode.colors.length];
      s.spot.color.setHex(col);
      s.lensMat.color.setHex(col);
    });

    return mode.name;
  }

  update(dt) {
    if (!this.dustSystem) return;
    const pos = this.dustSystem.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * 0.18;
      if (y < 0.2) y = 10.2;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
}

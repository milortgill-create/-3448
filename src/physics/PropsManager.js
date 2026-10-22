import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class PropsManager {
  constructor(scene, world, textures, soundManager, onSoundEvent, onToast) {
    this.scene = scene;
    this.world = world;
    this.textures = textures;
    this.sound = soundManager;
    this.onSoundEvent = onSoundEvent;
    this.onToast = onToast;

    this.props = [];
    this.debris = [];
    this.decals = [];
    this.explosions = [];
    this._nextId = 1;

    this._initSharedMaterials();
  }

  _initSharedMaterials() {
    this.crateMat = new THREE.MeshStandardMaterial({
      map: this.textures.wood.map,
      bumpMap: this.textures.wood.bumpMap,
      bumpScale: 0.025,
      roughness: 0.78,
      metalness: 0.08
    });

    this.plankMat = new THREE.MeshStandardMaterial({
      map: this.textures.wood.map,
      roughness: 0.82,
      metalness: 0.05
    });

    this.cinderMat = new THREE.MeshStandardMaterial({
      map: this.textures.cinder,
      roughness: 0.9,
      metalness: 0.05
    });

    this.barrelRedMat = new THREE.MeshStandardMaterial({
      map: this.textures.barrelRed.map,
      bumpMap: this.textures.barrelRed.bumpMap,
      bumpScale: 0.02,
      roughness: 0.42,
      metalness: 0.65
    });

    this.barrelBlueMat = new THREE.MeshStandardMaterial({
      map: this.textures.barrelBlue.map,
      bumpMap: this.textures.barrelBlue.bumpMap,
      bumpScale: 0.02,
      roughness: 0.45,
      metalness: 0.65
    });

    this.shrapnelMat = new THREE.MeshStandardMaterial({
      color: 0x271717,
      roughness: 0.55,
      metalness: 0.78,
      side: THREE.DoubleSide
    });

    this.glassMaterials = {
      green: new THREE.MeshPhysicalMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.76,
        roughness: 0.1,
        metalness: 0.05,
        reflectivity: 0.9
      }),
      amber: new THREE.MeshPhysicalMaterial({
        color: 0xd97706,
        transparent: true,
        opacity: 0.78,
        roughness: 0.12,
        metalness: 0.05,
        reflectivity: 0.88
      }),
      clear: new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.68,
        roughness: 0.08,
        metalness: 0.05,
        reflectivity: 0.95
      })
    };
  }

  populateInitialProps() {
    // 1. Stacks of Breakable Wooden Supply Crates around the 50m platform
    const crateConfigs = [
      { pos: [-3.2, 0.42, -2.5], size: 0.82, heavy: false },
      { pos: [-2.3, 0.42, -2.6], size: 0.82, heavy: false },
      { pos: [-2.75, 1.26, -2.55], size: 0.76, heavy: false },
      { pos: [3.2, 0.48, -2.8], size: 0.92, heavy: true },
      { pos: [4.25, 0.42, -2.9], size: 0.8, heavy: false },
      { pos: [3.7, 1.32, -2.85], size: 0.75, heavy: false },
      { pos: [-6.5, 0.45, 1.2], size: 0.86, heavy: false },
      { pos: [-6.4, 1.32, 1.2], size: 0.78, heavy: true },
      { pos: [0.4, 0.4, -4.2], size: 0.76, heavy: false },
      { pos: [1.3, 0.4, -4.1], size: 0.76, heavy: false }
    ];
    for (const c of crateConfigs) {
      this.spawnCrate(new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]), c.size, c.heavy);
    }

    // 2. Breakable Glass Bottles on Workbench #1, Workbench #2, and Crates
    const flavors = ['green', 'amber', 'clear'];
    for (let i = 0; i < 8; i++) {
      const bx = -5.7 + i * 0.34;
      const bz = -5.5 + (i % 2 === 0 ? -0.15 : 0.15);
      this.spawnBottle(new THREE.Vector3(bx, 1.12, bz), flavors[i % 3]);
    }
    for (let i = 0; i < 6; i++) {
      const bx = 4.3 + i * 0.35;
      const bz = -4.8 + (i % 2 === 0 ? 0.14 : -0.14);
      this.spawnBottle(new THREE.Vector3(bx, 1.12, bz), flavors[(i + 1) % 3]);
    }
    this.spawnBottle(new THREE.Vector3(0.3, 0.98, -4.2), 'green');
    this.spawnBottle(new THREE.Vector3(0.52, 0.98, -4.15), 'amber');
    this.spawnBottle(new THREE.Vector3(1.3, 0.98, -4.1), 'clear');

    // 3. Carryable Cinderblocks & Explosive Red Propane Barrels
    this.spawnCinderBlock(new THREE.Vector3(-1.4, 0.25, -3.5));
    this.spawnCinderBlock(new THREE.Vector3(-1.0, 0.25, -3.3));
    this.spawnCinderBlock(new THREE.Vector3(2.1, 0.25, -3.6));

    // Explosive Red Barrels placed where player can easily test chain-reaction & blast!
    this.spawnBarrel(new THREE.Vector3(-5.5, 0.55, -2.2), true);
    this.spawnBarrel(new THREE.Vector3(-4.6, 0.55, -2.5), true); // Close for chain-reaction!
    this.spawnBarrel(new THREE.Vector3(6.0, 0.55, -1.8), true);
    this.spawnBarrel(new THREE.Vector3(-5.2, 0.55, 2.5), false);
    this.spawnBarrel(new THREE.Vector3(5.8, 0.55, 2.2), false);

    this.spawnPortableWorklight(new THREE.Vector3(-1.8, 0.45, -1.6));
    this.spawnSteelPipe(new THREE.Vector3(1.8, 0.2, -2.2));
    this.spawnPallet(new THREE.Vector3(2.4, 0.12, 1.8));
  }

  spawnCrate(pos, size = 0.8, isHeavy = false) {
    const id = this._nextId++;
    const group = new THREE.Group();

    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this.crateMat);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;
    group.add(boxMesh);

    const railThick = size * 0.07;
    const railGeo = new THREE.BoxGeometry(size * 1.03, railThick, size * 1.03);
    const topRail = new THREE.Mesh(railGeo, this.plankMat);
    topRail.position.y = size * 0.44;
    const botRail = new THREE.Mesh(railGeo, this.plankMat);
    botRail.position.y = -size * 0.44;
    group.add(topRail, botRail);

    group.position.copy(pos);
    this.scene.add(group);

    const mass = isHeavy ? 22 : 14;
    const maxHp = isHeavy ? 85 : 48;
    const half = size / 2;
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(new CANNON.Vec3(half, half, half)),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.08,
      angularDamping: 0.12
    });

    const prop = {
      id,
      name: isHeavy ? 'Тяжёлый армейский ящик' : 'Деревянный ящик снабжения',
      type: 'crate',
      size,
      halfExtents: { x: half, y: half, z: half },
      solidForPlayer: true,
      isHeavy,
      mesh: group,
      body,
      hp: maxHp,
      maxHp,
      mass,
      breakable: true,
      grabbable: true,
      broken: false
    };

    body.userData = { prop, type: 'prop' };
    boxMesh.userData = { prop };
    topRail.userData = { prop };
    botRail.userData = { prop };

    body.addEventListener('collide', (e) => {
      if (prop.broken) return;
      const relVel = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (relVel > 4.2) {
        this.sound.playImpact('wood', Math.min(1, relVel / 12));
      }
      if (relVel > 7.5) {
        const dmg = (relVel - 6.5) * 12;
        this.damageProp(prop, dmg, group.position);
      }
    });

    this.world.addBody(body);
    this.props.push(prop);
    return prop;
  }

  spawnBottle(pos, flavor = 'green') {
    const id = this._nextId++;
    const mat = this.glassMaterials[flavor] || this.glassMaterials.green;
    const group = new THREE.Group();

    const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.058, 0.21, 12), mat);
    bodyMesh.position.y = -0.04;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    const shoulderMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.055, 0.07, 12), mat);
    shoulderMesh.position.y = 0.1;
    group.add(shoulderMesh);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.08, 10), mat);
    neckMesh.position.y = 0.17;
    group.add(neckMesh);

    const capMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.7, roughness: 0.3 });
    const capMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.02, 10), capMat);
    capMesh.position.y = 0.215;
    group.add(capMesh);

    const labelMat = new THREE.MeshStandardMaterial({
      color: flavor === 'green' ? 0xfef3c7 : flavor === 'amber' ? 0xfde68a : 0xe0f2fe,
      roughness: 0.6
    });
    const labelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.059, 0.09, 12, 1, true), labelMat);
    labelMesh.position.y = -0.04;
    group.add(labelMesh);

    group.position.copy(pos);
    this.scene.add(group);

    const mass = 0.85;
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(new CANNON.Vec3(0.058, 0.18, 0.058)),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.05,
      angularDamping: 0.08
    });

    const names = {
      green: 'Зелёная стеклянная бутылка',
      amber: 'Тёмная бутылка (Янтарь)',
      clear: 'Бутылка «Междугорская»'
    };

    const prop = {
      id,
      name: names[flavor] || 'Стеклянная бутылка',
      type: 'bottle',
      flavor,
      halfExtents: { x: 0.06, y: 0.18, z: 0.06 },
      solidForPlayer: false,
      mesh: group,
      body,
      hp: 10,
      maxHp: 10,
      mass,
      breakable: true,
      grabbable: true,
      broken: false
    };

    body.userData = { prop, type: 'prop' };
    group.traverse((child) => {
      if (child.isMesh) child.userData = { prop };
    });

    body.addEventListener('collide', (e) => {
      if (prop.broken) return;
      const relVel = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (relVel > 4.0) {
        this.damageProp(prop, 100, group.position);
      }
    });

    this.world.addBody(body);
    this.props.push(prop);
    return prop;
  }

  spawnCinderBlock(pos) {
    const id = this._nextId++;
    const w = 0.42, h = 0.22, d = 0.24;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.cinderMat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const mass = 18;
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.1,
      angularDamping: 0.15
    });

    const prop = {
      id,
      name: 'Бетонный шлакоблок',
      type: 'cinderblock',
      halfExtents: { x: w / 2, y: h / 2, z: d / 2 },
      solidForPlayer: true,
      mesh,
      body,
      hp: 300,
      maxHp: 300,
      mass,
      breakable: false,
      grabbable: true,
      broken: false
    };

    body.userData = { prop, type: 'prop' };
    mesh.userData = { prop };

    body.addEventListener('collide', (e) => {
      const relVel = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (relVel > 3.5) {
        this.sound.playImpact('concrete', Math.min(1, relVel / 10));
      }
    });

    this.world.addBody(body);
    this.props.push(prop);
    return prop;
  }

  /**
   * Spawns a Metal Barrel (Explosive Red Propane Barrel or Heavy Blue Steel Drum)
   * with 3D rim rings and realistic ignition/detonation physics.
   */
  spawnBarrel(pos, isExplosive = false) {
    const id = this._nextId++;
    const r = 0.34, h = 1.04;
    const mat = isExplosive ? this.barrelRedMat : this.barrelBlueMat;

    const group = new THREE.Group();
    const cylMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat);
    cylMesh.castShadow = true;
    cylMesh.receiveShadow = true;
    group.add(cylMesh);

    // Top and bottom steel chine rims + rolling hoops
    const rimMat = new THREE.MeshStandardMaterial({
      color: isExplosive ? 0x7f1d1d : 0x1e3a8a,
      roughness: 0.38,
      metalness: 0.78
    });
    for (const ry of [-h * 0.48, -h * 0.16, h * 0.16, h * 0.48]) {
      const hoop = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.025, r * 1.025, 0.032, 20), rimMat);
      hoop.position.y = ry;
      group.add(hoop);
    }

    // Top cap valve bung
    const bung = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.25 })
    );
    bung.position.set(r * 0.45, h * 0.51, 0);
    group.add(bung);

    group.position.copy(pos);
    this.scene.add(group);

    const mass = isExplosive ? 24 : 34;
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(new CANNON.Vec3(r * 0.92, h / 2, r * 0.92)),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.1,
      angularDamping: 0.18
    });

    const prop = {
      id,
      name: isExplosive ? 'Бочка с пропаном (Взрывоопасно)' : 'Стальная бочка',
      type: isExplosive ? 'barrel_explosive' : 'barrel_steel',
      radius: r,
      halfExtents: { x: r * 0.95, y: h / 2, z: r * 0.95 },
      solidForPlayer: true,
      mesh: group,
      body,
      hp: isExplosive ? 32 : 400,
      maxHp: isExplosive ? 32 : 400,
      mass,
      breakable: isExplosive,
      grabbable: true,
      broken: false,
      burning: false,
      fuseTimer: 0,
      flameMesh: null
    };

    body.userData = { prop, type: 'prop' };
    group.traverse((c) => {
      if (c.isMesh) c.userData = { prop };
    });

    body.addEventListener('collide', (e) => {
      if (prop.broken) return;
      const relVel = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (relVel > 3.2) {
        this.sound.playImpact('metal', Math.min(1, relVel / 12));
      }
      if (isExplosive && relVel > 9.5) {
        this.damageProp(prop, 50, group.position);
      }
    });

    this.world.addBody(body);
    this.props.push(prop);
    return prop;
  }

  spawnPortableWorklight(pos) {
    const id = this._nextId++;
    const group = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4, metalness: 0.6 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.36), frameMat);
    base.position.y = -0.22;
    group.add(base);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), frameMat);
    group.add(stem);

    const headMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.14), headMat);
    head.position.y = 0.2;
    group.add(head);

    const bulb = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    bulb.position.set(0, 0.2, 0.075);
    group.add(bulb);

    const pointLight = new THREE.PointLight(0xfffbeb, 28, 14, 1.5);
    pointLight.position.set(0, 0.25, 0.15);
    group.add(pointLight);

    group.position.copy(pos);
    this.scene.add(group);

    const mass = 8.5;
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(new CANNON.Vec3(0.18, 0.28, 0.18)),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.12,
      angularDamping: 0.2
    });

    const prop = {
      id,
      name: 'Переносной прожектор (Светит)',
      type: 'worklight',
      halfExtents: { x: 0.18, y: 0.28, z: 0.18 },
      solidForPlayer: true,
      mesh: group,
      body,
      hp: 150,
      maxHp: 150,
      mass,
      breakable: false,
      grabbable: true,
      broken: false
    };

    body.userData = { prop, type: 'prop' };
    group.traverse((c) => {
      if (c.isMesh) c.userData = { prop };
    });

    this.world.addBody(body);
    this.props.push(prop);
    return prop;
  }

  spawnSteelPipe(pos) {
    const id = this._nextId++;
    const mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.88 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 10), mat);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.copy(pos);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass: 6.5,
      shape: new CANNON.Box(new CANNON.Vec3(0.47, 0.04, 0.04)),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.08,
      angularDamping: 0.12
    });

    const prop = {
      id,
      name: 'Стальная труба',
      type: 'pipe',
      halfExtents: { x: 0.45, y: 0.05, z: 0.05 },
      solidForPlayer: false,
      mesh,
      body,
      hp: 500,
      maxHp: 500,
      mass: 6.5,
      breakable: false,
      grabbable: true,
      broken: false
    };

    body.userData = { prop, type: 'prop' };
    mesh.userData = { prop };
    this.world.addBody(body);
    this.props.push(prop);
    return prop;
  }

  spawnPallet(pos) {
    const id = this._nextId++;
    const w = 1.2, h = 0.16, d = 1.0;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.plankMat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass: 15,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.12,
      angularDamping: 0.18
    });

    const prop = {
      id,
      name: 'Деревянный поддон',
      type: 'crate',
      size: 0.85,
      halfExtents: { x: w / 2, y: h / 2, z: d / 2 },
      solidForPlayer: true,
      mesh,
      body,
      hp: 80,
      maxHp: 80,
      mass: 15,
      breakable: true,
      grabbable: true,
      broken: false
    };

    body.userData = { prop, type: 'prop' };
    mesh.userData = { prop };
    this.world.addBody(body);
    this.props.push(prop);
    return prop;
  }

  /**
   * Ignites a propane barrel with a venting flame jet before it explodes (chain reaction or grazing hit).
   */
  _igniteBarrelFuse(prop, fuseSeconds = 1.1) {
    if (!prop || prop.broken || prop.burning) return;
    prop.burning = true;
    prop.fuseTimer = fuseSeconds;

    const flameGroup = new THREE.Group();
    const outerCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.52, 8),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.88 })
    );
    outerCone.position.y = 0.72;
    const innerCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.34, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    innerCone.position.y = 0.64;
    flameGroup.add(outerCone, innerCone);
    prop.mesh.add(flameGroup);
    prop.flameMesh = flameGroup;
  }

  damageProp(prop, amount, hitPoint = null) {
    if (!prop || prop.broken || !prop.breakable) return false;
    prop.hp -= amount;

    if (prop.type === 'barrel_explosive' && prop.hp > 0 && prop.hp < prop.maxHp) {
      this._igniteBarrelFuse(prop, 1.15);
    }

    if (prop.hp <= 0) {
      this._breakProp(prop, hitPoint || prop.mesh.position);
      return true;
    }
    return false;
  }

  _breakProp(prop, originPos) {
    if (prop.broken) return;
    prop.broken = true;

    const pos = new THREE.Vector3(prop.body.position.x, prop.body.position.y, prop.body.position.z);

    this.scene.remove(prop.mesh);
    this.world.removeBody(prop.body);
    const idx = this.props.indexOf(prop);
    if (idx !== -1) this.props.splice(idx, 1);

    if (prop.type === 'bottle') {
      this.sound.playGlassShatter();
      this._spawnGlassShards(pos, prop.flavor);
      this.addFloorDecal(pos.x, pos.z, 0.35 + Math.random() * 0.25, 'liquid');
      if (this.onSoundEvent) {
        this.onSoundEvent(pos, 18, 'glass_shatter', 'Звон разбитой бутылки');
      }
      if (this.onToast) {
        this.onToast('🍾 Стеклянная бутылка разбилась вдребезги!');
      }
    } else if (prop.type === 'crate') {
      this.sound.playWoodBreak();
      this._spawnWoodPlanks(pos, prop.size || 0.8);
      if (prop.isHeavy) {
        this.spawnBottle(new THREE.Vector3(pos.x, pos.y + 0.15, pos.z), 'green');
      }
      if (this.onSoundEvent) {
        this.onSoundEvent(pos, 22, 'crate_break', 'Треск сломанного ящика');
      }
      if (this.onToast) {
        this.onToast(`📦 ${prop.name} разлетелся на доски!`);
      }
    } else if (prop.type === 'barrel_explosive') {
      this._spawnBarrelShrapnel(pos);
      this.triggerExplosion(pos, 9.8, 48);
    }
  }

  /**
   * Spawns twisted, scorched metal barrel fragments that fly out from a detonated barrel!
   */
  _spawnBarrelShrapnel(pos) {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const w = 0.24 + Math.random() * 0.16;
      const h = 0.32 + Math.random() * 0.22;
      const thick = 0.025;

      // Curved / bent metal shard group
      const shardMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, thick),
        i % 2 === 0 ? this.shrapnelMat : this.barrelRedMat
      );
      shardMesh.castShadow = true;

      const sx = pos.x + Math.cos(ang) * 0.28;
      const sy = pos.y + (Math.random() - 0.3) * 0.35;
      const sz = pos.z + Math.sin(ang) * 0.28;
      shardMesh.position.set(sx, sy, sz);
      this.scene.add(shardMesh);

      const shardBody = new CANNON.Body({
        mass: 2.2,
        shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, thick)),
        position: new CANNON.Vec3(sx, sy, sz),
        linearDamping: 0.08,
        angularDamping: 0.12
      });

      const speed = 11 + Math.random() * 10;
      shardBody.velocity.set(
        Math.cos(ang) * speed,
        4.5 + Math.random() * 6.5,
        Math.sin(ang) * speed
      );
      shardBody.angularVelocity.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18
      );

      const shrapnelProp = {
        id: this._nextId++,
        name: 'Искорёженный осколок бочки',
        type: 'shrapnel',
        halfExtents: { x: w / 2, y: h / 2, z: 0.04 },
        solidForPlayer: false,
        mesh: shardMesh,
        body: shardBody,
        hp: 100,
        maxHp: 100,
        mass: 2.2,
        breakable: false,
        grabbable: true,
        broken: false,
        isDebris: true
      };
      shardBody.userData = { prop: shrapnelProp, type: 'prop' };
      shardMesh.userData = { prop: shrapnelProp };

      this.world.addBody(shardBody);
      this.props.push(shrapnelProp);
      this._registerDebris(shrapnelProp);
    }
  }

  _spawnGlassShards(pos, flavor) {
    const mat = this.glassMaterials[flavor] || this.glassMaterials.green;
    const shardCount = 8;

    for (let i = 0; i < shardCount; i++) {
      const sx = 0.04 + Math.random() * 0.05;
      const sy = 0.015;
      const sz = 0.05 + Math.random() * 0.06;
      const shardMesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);

      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.14,
        (Math.random() - 0.3) * 0.16,
        (Math.random() - 0.5) * 0.14
      );
      shardMesh.position.copy(pos).add(offset);
      this.scene.add(shardMesh);

      const shardBody = new CANNON.Body({
        mass: 0.08,
        shape: new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)),
        position: new CANNON.Vec3(shardMesh.position.x, shardMesh.position.y, shardMesh.position.z),
        linearDamping: 0.15,
        angularDamping: 0.2
      });

      shardBody.velocity.set(
        (Math.random() - 0.5) * 4.8,
        1.2 + Math.random() * 2.6,
        (Math.random() - 0.5) * 4.8
      );
      shardBody.angularVelocity.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );

      this.world.addBody(shardBody);
      this._registerDebris({ mesh: shardMesh, body: shardBody, born: performance.now() });
    }
  }

  _spawnWoodPlanks(pos, crateSize) {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const pw = crateSize * (0.75 + Math.random() * 0.2);
      const ph = 0.055;
      const pd = 0.16 + Math.random() * 0.06;

      const plankMesh = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), this.plankMat);
      plankMesh.castShadow = true;
      plankMesh.receiveShadow = true;

      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * crateSize * 0.6,
        (Math.random() - 0.3) * crateSize * 0.6,
        (Math.random() - 0.5) * crateSize * 0.6
      );
      plankMesh.position.copy(pos).add(offset);
      this.scene.add(plankMesh);

      const plankBody = new CANNON.Body({
        mass: 1.8,
        shape: new CANNON.Box(new CANNON.Vec3(pw / 2, ph / 2, pd / 2)),
        position: new CANNON.Vec3(plankMesh.position.x, plankMesh.position.y, plankMesh.position.z),
        linearDamping: 0.12,
        angularDamping: 0.18
      });

      plankBody.velocity.set(
        (Math.random() - 0.5) * 5.2,
        1.5 + Math.random() * 3.2,
        (Math.random() - 0.5) * 5.2
      );
      plankBody.angularVelocity.set(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9
      );

      const plankProp = {
        id: this._nextId++,
        name: 'Деревянная доска (Обломок)',
        type: 'plank',
        halfExtents: { x: pw / 2, y: ph / 2, z: pd / 2 },
        solidForPlayer: false,
        mesh: plankMesh,
        body: plankBody,
        hp: 30,
        maxHp: 30,
        mass: 1.8,
        breakable: false,
        grabbable: true,
        broken: false,
        isDebris: true
      };
      plankBody.userData = { prop: plankProp, type: 'prop' };
      plankMesh.userData = { prop: plankProp };

      this.world.addBody(plankBody);
      this.props.push(plankProp);
      this._registerDebris(plankProp);
    }
  }

  _registerDebris(item) {
    this.debris.push(item);
    if (this.debris.length > 75) {
      const oldest = this.debris.shift();
      this._removeDebrisItem(oldest);
    }
  }

  _removeDebrisItem(item) {
    if (!item) return;
    if (item.mesh) this.scene.remove(item.mesh);
    if (item.body) this.world.removeBody(item.body);
    const pIdx = this.props.indexOf(item);
    if (pIdx !== -1) this.props.splice(pIdx, 1);
  }

  clearAllDebris() {
    while (this.debris.length > 0) {
      const d = this.debris.pop();
      this._removeDebrisItem(d);
    }
    while (this.decals.length > 0) {
      const dec = this.decals.pop();
      this.scene.remove(dec);
    }
  }

  /**
   * Triggers a realistic multi-layered fuel explosion with:
   * - White-hot flash core + dynamic high-intensity PointLight
   * - Ground shockwave pressure ring
   * - 14 volumetric billowing fire & black smoke clouds rising with buoyancy
   * - 28 ballistic burning spark embers
   * - Scorch crater decal + chain-reaction ignition of nearby explosive barrels
   */
  triggerExplosion(centerPos, radius = 9.5, force = 48) {
    this.sound.playExplosion();
    this.addFloorDecal(centerPos.x, centerPos.z, 2.6, 'scorch');

    if (this.onSoundEvent) {
      this.onSoundEvent(centerPos, 42, 'explosion', 'Мощный взрыв бочки!');
    }
    if (this.onToast) {
      this.onToast('💥 ДЕТОНАЦИЯ! Осколки и ударная волна!');
    }

    const expGroup = new THREE.Group();
    this.scene.add(expGroup);

    // 1. White-hot inner detonation core
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0
    });
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 16), coreMat);
    coreMesh.position.copy(centerPos);
    expGroup.add(coreMesh);

    // 2. Ground supersonic shockwave ring
    const ringGeo = new THREE.RingGeometry(0.4, 0.85, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const shockRing = new THREE.Mesh(ringGeo, ringMat);
    shockRing.rotation.x = -Math.PI / 2;
    shockRing.position.set(centerPos.x, 0.08, centerPos.z);
    expGroup.add(shockRing);

    // 3. Multi-layered volumetric fireball & rising black smoke plumes
    const puffs = [];
    const puffGeo = new THREE.DodecahedronGeometry(0.65, 1);
    for (let i = 0; i < 14; i++) {
      const isSmoke = i >= 7;
      const mat = new THREE.MeshStandardMaterial({
        color: isSmoke ? 0x1f2937 : 0xf97316,
        emissive: isSmoke ? 0x451a03 : 0xea580c,
        emissiveIntensity: isSmoke ? 0.5 : 2.2,
        roughness: 0.9,
        transparent: true,
        opacity: isSmoke ? 0.82 : 0.94
      });
      const mesh = new THREE.Mesh(puffGeo, mat);
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 0.85;
      mesh.position.set(
        centerPos.x + Math.cos(ang) * dist,
        centerPos.y + (Math.random() - 0.2) * 0.5,
        centerPos.z + Math.sin(ang) * dist
      );
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      const baseScale = 0.6 + Math.random() * 0.7;
      mesh.scale.setScalar(baseScale);
      expGroup.add(mesh);

      puffs.push({
        mesh,
        mat,
        isSmoke,
        baseScale,
        vel: new THREE.Vector3(
          Math.cos(ang) * (2.2 + Math.random() * 4.5),
          (isSmoke ? 3.8 : 2.0) + Math.random() * 3.5,
          Math.sin(ang) * (2.2 + Math.random() * 4.5)
        ),
        rotSpeed: (Math.random() - 0.5) * 4
      });
    }

    // 4. Flying incandescent spark/ember particles
    const sparks = [];
    const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.18);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    for (let i = 0; i < 26; i++) {
      const sm = new THREE.Mesh(sparkGeo, sparkMat);
      sm.position.copy(centerPos);
      expGroup.add(sm);
      const a = Math.random() * Math.PI * 2;
      const spd = 8 + Math.random() * 14;
      sparks.push({
        mesh: sm,
        vel: new THREE.Vector3(
          Math.cos(a) * spd,
          4 + Math.random() * 10,
          Math.sin(a) * spd
        )
      });
    }

    // 5. Intense dynamic flash light
    const flash = new THREE.PointLight(0xffedd5, 380, 32, 1.4);
    flash.position.copy(centerPos).add(new THREE.Vector3(0, 1.0, 0));
    this.scene.add(flash);

    this.explosions.push({
      group: expGroup,
      coreMesh,
      shockRing,
      puffs,
      sparks,
      light: flash,
      age: 0,
      maxAge: 2.2
    });

    // Apply physical shockwave blast impulse & chain reaction to nearby props
    const toDamage = [];
    for (const p of this.props) {
      if (p.broken) continue;
      const bPos = new THREE.Vector3(p.body.position.x, p.body.position.y, p.body.position.z);
      const dist = bPos.distanceTo(centerPos);
      if (dist < radius && dist > 0.01) {
        const factor = Math.pow(1 - dist / radius, 1.15);
        const dir = bPos.clone().sub(centerPos).normalize();
        dir.y = Math.max(0.4, dir.y + 0.5);
        dir.normalize();
        const imp = force * factor;
        p.body.wakeUp();
        p.body.velocity.x += dir.x * imp;
        p.body.velocity.y += dir.y * imp;
        p.body.velocity.z += dir.z * imp;
        p.body.angularVelocity.set(
          (Math.random() - 0.5) * 12 * factor,
          (Math.random() - 0.5) * 12 * factor,
          (Math.random() - 0.5) * 12 * factor
        );

        if (p.type === 'barrel_explosive' && dist < radius * 0.85) {
          // Chain reaction with realistic short fuse!
          this._igniteBarrelFuse(p, 0.25 + dist * 0.05);
        } else if (p.breakable && dist < radius * 0.72) {
          toDamage.push({ prop: p, dmg: 140 * factor });
        }
      }
    }
    for (const item of toDamage) {
      this.damageProp(item.prop, item.dmg, centerPos);
    }

    if (this.onExplosionBlast) {
      this.onExplosionBlast(centerPos, radius, force);
    }
  }

  /**
   * Adds a persistent GoreBox-style decal (textured blood puddle, liquid spill, or blast crater scorch) on the concrete floor.
   */
  addFloorDecal(x, z, radius = 0.45, kind = 'blood') {
    if (Math.abs(x) > 24.5 || Math.abs(z) > 24.5) return;

    let mat;
    if (kind === 'blood' && this.textures.gore && this.textures.gore.bloodPool) {
      mat = new THREE.MeshBasicMaterial({
        map: this.textures.gore.bloodPool,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      });
    } else if (kind === 'scorch' && this.textures.gore && this.textures.gore.scorch) {
      mat = new THREE.MeshBasicMaterial({
        map: this.textures.gore.scorch,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      });
    } else {
      const colors = { blood: 0x7f1d1d, liquid: 0x0f766e, scorch: 0x111827 };
      mat = new THREE.MeshBasicMaterial({
        color: colors[kind] || 0x7f1d1d,
        transparent: true,
        opacity: kind === 'blood' ? 0.85 : 0.52,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      });
    }

    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(x, 0.015 + this.decals.length * 0.0002, z);
    this.scene.add(mesh);

    this.decals.push(mesh);
    if (this.decals.length > 95) {
      const old = this.decals.shift();
      this.scene.remove(old);
    }
  }

  update(dt) {
    const toDetonate = [];

    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      if (p.body.position.y < -35) {
        this.scene.remove(p.mesh);
        this.world.removeBody(p.body);
        this.props.splice(i, 1);
        continue;
      }
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);

      if (p.burning && !p.broken) {
        p.fuseTimer -= dt;
        if (p.flameMesh) {
          const flicker = 0.85 + Math.random() * 0.35;
          p.flameMesh.scale.set(flicker, 0.8 + Math.random() * 0.5, flicker);
        }
        if (p.fuseTimer <= 0) {
          toDetonate.push(p);
        }
      }
    }

    for (const p of toDetonate) {
      this._breakProp(p, p.mesh.position);
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      if (d.isDebris) continue;
      if (d.body.position.y < -35) {
        this._removeDebrisItem(d);
        this.debris.splice(i, 1);
        continue;
      }
      d.mesh.position.copy(d.body.position);
      d.mesh.quaternion.copy(d.body.quaternion);
    }

    // Animate multi-stage realistic explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += dt;
      const t = ex.age / ex.maxAge;
      if (t >= 1) {
        this.scene.remove(ex.group);
        this.scene.remove(ex.light);
        this.explosions.splice(i, 1);
        continue;
      }

      // Flash core & light decay rapidly in the first 0.35s
      const flashT = Math.min(1, ex.age / 0.32);
      ex.coreMesh.scale.setScalar(1 + flashT * 4.2);
      ex.coreMesh.material.opacity = Math.max(0, 1 - flashT * 1.1);
      ex.light.intensity = Math.max(0, 380 * Math.pow(1 - Math.min(1, ex.age / 0.55), 2));

      // Ground shockwave ring expands quickly across 9m
      const ringT = Math.min(1, ex.age / 0.45);
      ex.shockRing.scale.setScalar(1 + ringT * 11.5);
      ex.shockRing.material.opacity = Math.max(0, (1 - ringT) * 0.85);

      // Billowing fire & smoke puffs
      for (const puff of ex.puffs) {
        puff.mesh.position.addScaledVector(puff.vel, dt);
        puff.vel.multiplyScalar(Math.max(0, 1 - dt * 2.4));
        puff.vel.y += (puff.isSmoke ? 1.8 : 0.6) * dt;
        puff.mesh.rotation.x += puff.rotSpeed * dt;
        puff.mesh.rotation.z += puff.rotSpeed * dt;

        const expand = puff.baseScale * (1 + t * (puff.isSmoke ? 4.2 : 2.8));
        puff.mesh.scale.setScalar(expand);

        if (!puff.isSmoke) {
          // Fire cools into dark smoke after 0.55s
          const fireFade = Math.min(1, ex.age / 0.65);
          puff.mat.emissiveIntensity = Math.max(0, 2.2 * (1 - fireFade));
          if (ex.age > 0.4) {
            puff.mat.color.lerp(new THREE.Color(0x1f2937), dt * 4);
          }
          puff.mat.opacity = Math.max(0, (1 - t) * 0.9);
        } else {
          puff.mat.opacity = Math.max(0, (1 - Math.pow(t, 1.4)) * 0.78);
        }
      }

      // Ballistic spark embers
      for (const sp of ex.sparks) {
        sp.mesh.position.addScaledVector(sp.vel, dt);
        sp.vel.y -= 18.0 * dt;
        if (sp.mesh.position.y < 0.04) {
          sp.mesh.position.y = 0.04;
          sp.vel.y = Math.abs(sp.vel.y) * 0.35;
          sp.vel.x *= 0.6;
          sp.vel.z *= 0.6;
        }
        sp.mesh.lookAt(sp.mesh.position.clone().add(sp.vel));
        sp.mesh.visible = ex.age < 1.1;
      }
    }
  }
}

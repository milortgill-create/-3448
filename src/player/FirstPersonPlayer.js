import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * FirstPersonPlayer:
 * - Детализированная 3D-модель рук от первого лица (манжеты серой кофты, предплечья,
 *   беспалые перчатки с защитой костяшек, ремешком на запястье и сгибающимися фалангами пальцев).
 * - Полноценные анимации: idle (дыхание в покое), ходьба/бег, удар рукой (сжатие кулака и выпад),
 *   стрельба с отдачей затвора и полноценная анимация перезарядки магазина пистолета.
 * - Защита от залипания рук в предметах (динамический отвод rigRoot при сближении с объектами).
 * - Передача точного типа урона ('blunt', 'slash', 'bullet', 'blast') для системы 56 видов ран GoreBox.
 * - Полное отсутствие смайликов в интерфейсе и уведомлениях.
 */
export class FirstPersonPlayer {
  constructor(camera, scene, world, propsManager, soundManager, onToast, onHitmarker, onPlayerAttackedNPC) {
    this.camera = camera;
    this.scene = scene;
    this.world = world;
    this.propsManager = propsManager;
    this.sound = soundManager;
    this.onToast = onToast;
    this.onHitmarker = onHitmarker;
    this.onPlayerAttackedNPC = onPlayerAttackedNPC;

    this.hp = 100;
    this.maxHp = 100;
    this.armor = 0;
    this.adrenalineTimer = 0;

    // 2D Кукла состояния частей тела игрока (с поддержкой ран из атласа 56 видов)
    this.playerLimbs = {
      head: { label: 'Голова', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      upperTorso: { label: 'Грудь', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      abdomen: { label: 'Живот', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      upperArmL: { label: 'Л. Плечо', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      forearmL: { label: 'Л. Предплечье', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      upperArmR: { label: 'П. Плечо', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      forearmR: { label: 'П. Предплечье', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      thighL: { label: 'Л. Бедро', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      calfL: { label: 'Л. Голень', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      thighR: { label: 'П. Бедро', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] },
      calfR: { label: 'П. Голень', hp: 100, maxHp: 100, bleeding: false, severed: false, wounds: [] }
    };
    this.activeWounds = [];

    this.backpack = [
      { kind: 'bottle', name: 'Стеклянная бутылка (Зелёная)' },
      { kind: 'crate_std', name: 'Деревянный ящик снабжения' },
      { kind: 'barrel_red', name: 'Бочка с пропаном (Взрывная)' }
    ];

    this.yaw = 0;
    this.pitch = -0.06;
    this.isLocked = false;

    this.playerPos = new THREE.Vector3(0, 0, 4.8);
    this.playerRadius = 0.38;
    this.velX = 0;
    this.velZ = 0;
    this.verticalVel = 0;
    this.eyeHeight = 1.66;
    this.crouchFactor = 0;
    this.canJump = true;
    this.walkBobTimer = 0;
    this.stepSoundTimer = 0;
    this.cameraShake = 0;
    this.bleedTickTimer = 0;

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      crouch: false
    };
    this.mouseDownLeft = false;
    this.mouseDownRight = false;

    // Active Tool Slot: 1=Hands, 2=RCV2, 3=Crowbar, 4=Pistol
    this.activeSlot = 1;
    this.rcv2Mode = 0;
    this.pistolAuto = true;
    this.pistolAmmo = 12;
    this.pistolMaxAmmo = 12;
    this.reloadTimer = 0;
    this.reloadDuration = 1.05;
    this.punchHandAlt = 0;
    this.swingTimer = 0;
    this.shootCooldown = 0;
    this.recoilPitch = 0;
    this.wallRetractZ = 0;

    this.heldTarget = null;
    this.hoveredTarget = null;
    this.lastInspectedNpc = null;
    this.holdDistance = 2.4;

    this.staticBoxes = [
      { x: -4.5, z: -5.5, hx: 1.62, hz: 0.58, minY: 0, maxY: 0.92 },
      { x: 5.2, z: -4.8, hx: 1.32, hz: 0.52, minY: 0, maxY: 0.92 },
      { x: -18, z: -18, hx: 0.6, hz: 0.6, minY: 0, maxY: 6.0 },
      { x: 18, z: -18, hx: 0.6, hz: 0.6, minY: 0, maxY: 6.0 },
      { x: -18, z: 16, hx: 0.6, hz: 0.6, minY: 0, maxY: 6.0 },
      { x: 18, z: 16, hx: 0.6, hz: 0.6, minY: 0, maxY: 6.0 },
      { x: 0, z: -22, hx: 0.6, hz: 0.6, minY: 0, maxY: 6.0 },
      { x: 0, z: 22, hx: 0.6, hz: 0.6, minY: 0, maxY: 6.0 },
      { x: -24.2, z: -24.2, hx: 0.28, hz: 0.28, minY: 0, maxY: 1.15 },
      { x: 24.2, z: -24.2, hx: 0.28, hz: 0.28, minY: 0, maxY: 1.15 },
      { x: -24.2, z: 24.2, hx: 0.28, hz: 0.28, minY: 0, maxY: 1.15 },
      { x: 24.2, z: 24.2, hx: 0.28, hz: 0.28, minY: 0, maxY: 1.15 }
    ];

    this._initPhysicsBody();
    this._initFlashlight();
    this._initFirstPersonViewmodel();
    this._initGravityBeamMesh();
    this._bindControls();
  }

  _initPhysicsBody() {
    this.body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Sphere(0.42),
      position: new CANNON.Vec3(this.playerPos.x, 0.9, this.playerPos.z),
      collisionFilterGroup: 4,
      collisionFilterMask: 1
    });
    this.body.userData = { type: 'player' };
    this.world.addBody(this.body);
  }

  _initFlashlight() {
    this.flashlight = new THREE.SpotLight(0xfffbeb, 0, 28, Math.PI / 4.2, 0.55, 1.4);
    this.flashlight.position.set(0, 0, 0);
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0, -5);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
    this.flashlightOn = false;
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 95 : 0;
    if (this.onToast) {
      this.onToast(this.flashlightOn ? 'Фонарь включён' : 'Фонарь выключен');
    }
  }

  addCameraShake(amount = 0.35) {
    this.cameraShake = Math.min(1.0, this.cameraShake + amount);
  }

  _initFirstPersonViewmodel() {
    this.viewmodelScene = new THREE.Scene();
    this.viewmodelCamera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.04,
      10
    );

    const amb = new THREE.AmbientLight(0xe2e8f0, 1.4);
    const dir = new THREE.DirectionalLight(0xfffbeb, 2.0);
    dir.position.set(1.2, 2.2, 1.6);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.75);
    fill.position.set(-1.2, -0.5, 1.0);
    this.viewmodelScene.add(amb, dir, fill);

    this.rigRoot = new THREE.Group();
    this.viewmodelScene.add(this.rigRoot);

    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.76, metalness: 0.04, flatShading: true });
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0x83898f, roughness: 0.82, metalness: 0.04, flatShading: true });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf3d4b5, roughness: 0.58, metalness: 0.03, flatShading: true });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x493325, roughness: 0.66, metalness: 0.06, flatShading: true });
    const knuckleMat = new THREE.MeshStandardMaterial({ color: 0x2b1c12, roughness: 0.48, metalness: 0.16, flatShading: true });

    const buildDetailedArm = (isLeft) => {
      const armGroup = new THREE.Group();
      const s = isLeft ? -1 : 1;

      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.112, 0.22), sleeveMat);
      sleeve.position.set(0, -0.014, 0.17);
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.116, 0.116, 0.028), cuffMat);
      cuff.position.set(0, -0.014, 0.055);
      armGroup.add(sleeve, cuff);

      const forearmUpper = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.096, 0.16), skinMat);
      forearmUpper.position.set(0, -0.011, -0.02);
      const forearmWrist = new THREE.Mesh(new THREE.BoxGeometry(0.090, 0.084, 0.13), skinMat);
      forearmWrist.position.set(0, -0.009, -0.14);
      armGroup.add(forearmUpper, forearmWrist);

      const wristStrap = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.090, 0.032), knuckleMat);
      wristStrap.position.set(0, -0.008, -0.195);
      const gloveBody = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.088, 0.108), gloveMat);
      gloveBody.position.set(0, -0.008, -0.25);

      const knuckleGuard = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.022, 0.036), knuckleMat);
      knuckleGuard.position.set(0, 0.034, -0.285);
      armGroup.add(wristStrap, gloveBody, knuckleGuard);

      const fingerGroup = new THREE.Group();
      fingerGroup.position.set(0, -0.004, -0.304);
      const fingerPivots = [];

      for (let f = 0; f < 4; f++) {
        const fx = (f - 1.5) * 0.0235;
        const fLen = f === 1 || f === 2 ? 0.062 : 0.054;
        const fPivot = new THREE.Group();
        fPivot.position.set(fx, 0, 0);

        const phalanx1 = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.026, fLen * 0.55), skinMat);
        phalanx1.position.set(0, -0.004, -fLen * 0.27);
        const phalanx2 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.023, fLen * 0.48), skinMat);
        phalanx2.position.set(0, -0.006, -fLen * 0.76);

        fPivot.add(phalanx1, phalanx2);
        fingerGroup.add(fPivot);
        fingerPivots.push(fPivot);
      }

      const thumbPivot = new THREE.Group();
      thumbPivot.position.set(-s * 0.054, -0.002, 0.042);
      thumbPivot.rotation.y = s * 0.46;

      const thumbGlove = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.046), gloveMat);
      thumbGlove.position.set(0, 0, -0.015);
      const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.040), skinMat);
      thumbTip.position.set(0, -0.002, -0.052);
      thumbPivot.add(thumbGlove, thumbTip);
      fingerGroup.add(thumbPivot);

      armGroup.add(fingerGroup);
      armGroup.userData = { fingerGroup, fingerPivots, thumbPivot };
      return armGroup;
    };

    this.leftArm = buildDetailedArm(true);
    this.leftArm.position.set(-0.24, -0.22, -0.32);
    this.leftArm.rotation.set(0.12, -0.18, 0.08);

    this.rightArm = buildDetailedArm(false);
    this.rightArm.position.set(0.24, -0.22, -0.32);
    this.rightArm.rotation.set(0.12, 0.18, -0.08);

    this.rigRoot.add(this.leftArm, this.rightArm);
    this._buildViewmodelWeapons();
  }

  _setArmFingerCurl(arm, curlAngle = 0) {
    if (!arm || !arm.userData || !arm.userData.fingerPivots) return;
    for (const fp of arm.userData.fingerPivots) {
      fp.rotation.x = -curlAngle;
    }
    if (arm.userData.thumbPivot) {
      arm.userData.thumbPivot.rotation.x = -curlAngle * 0.6;
    }
  }

  _buildViewmodelWeapons() {
    // 1. RCV2 REALITY CRUSHER
    this.rcv2Mesh = new THREE.Group();
    const gunmetalDark = new THREE.MeshStandardMaterial({ color: 0x161f2c, metalness: 0.85, roughness: 0.26 });
    const gunmetalLight = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.88, roughness: 0.22 });
    const copperCoilMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 });
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.3 });
    this.rcv2CoreMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    const rcvReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.115, 0.20), gunmetalDark);
    rcvReceiver.position.set(0, 0.055, -0.22);
    const rcvGrip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.13, 0.065), gunmetalDark);
    rcvGrip.position.set(0, -0.03, -0.19);
    rcvGrip.rotation.x = 0.22;

    this.rcv2ScreenMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.045, 0.025), gunmetalLight);
    screenFrame.position.set(0, 0.125, -0.16);
    screenFrame.rotation.x = -0.45;
    const screenPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.032), this.rcv2ScreenMat);
    screenPanel.position.set(0, 0, 0.014);
    screenFrame.add(screenPanel);

    const sideStripL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.022, 0.16), hazardMat);
    sideStripL.position.set(-0.048, 0.055, -0.22);
    const sideStripR = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.022, 0.16), hazardMat);
    sideStripR.position.set(0.048, 0.055, -0.22);

    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.28), gunmetalLight);
    topRail.position.set(0, 0.115, -0.38);
    const botRail = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.022, 0.28), gunmetalDark);
    botRail.position.set(0, 0.0, -0.38);

    for (const cz of [-0.34, -0.41, -0.48]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.009, 8, 18), copperCoilMat);
      coil.position.set(0, 0.058, cz);
      this.rcv2Mesh.add(coil);
    }

    this.rcv2Rotor = new THREE.Group();
    this.rcv2Rotor.position.set(0, 0.058, -0.40);
    const centralBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 12), this.rcv2CoreMat);
    centralBeam.rotation.x = Math.PI / 2;
    this.rcv2Rotor.add(centralBeam);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), this.rcv2CoreMat);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(Math.cos(a) * 0.028, Math.sin(a) * 0.028, 0);
      this.rcv2Rotor.add(rod);
    }

    const muzzleCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.04, 16), gunmetalLight);
    muzzleCollar.rotation.x = Math.PI / 2;
    muzzleCollar.position.set(0, 0.058, -0.53);

    this.rcv2Claws = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const clawPivot = new THREE.Group();
      clawPivot.position.set(Math.cos(angle) * 0.042, 0.058 + Math.sin(angle) * 0.042, -0.54);
      clawPivot.rotation.z = angle;

      const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.024, 0.09), gunmetalLight);
      arm1.position.set(0, 0.01, -0.04);
      arm1.rotation.x = -0.25;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.055), copperCoilMat);
      tip.position.set(0, 0.005, -0.095);
      tip.rotation.x = 0.45;
      clawPivot.add(arm1, tip);
      this.rcv2Mesh.add(clawPivot);
      this.rcv2Claws.push({ pivot: clawPivot, baseAngle: angle });
    }

    this.rcv2MuzzleOrb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 14), this.rcv2CoreMat);
    this.rcv2MuzzleOrb.position.set(0, 0.058, -0.59);

    this.rcv2Mesh.add(
      rcvReceiver,
      rcvGrip,
      screenFrame,
      sideStripL,
      sideStripR,
      topRail,
      botRail,
      this.rcv2Rotor,
      muzzleCollar,
      this.rcv2MuzzleOrb
    );
    this.rcv2Mesh.visible = false;
    this.rightArm.add(this.rcv2Mesh);

    // 2. FORGED STEEL CROWBAR
    this.crowbarMesh = new THREE.Group();
    const crowbarRed = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.68, roughness: 0.34 });
    const bareSteel = new THREE.MeshStandardMaterial({ color: 0xdbeafe, metalness: 0.92, roughness: 0.18 });
    const gripRubber = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85, metalness: 0.1 });

    const cbGroup = new THREE.Group();
    cbGroup.position.set(0, 0.10, -0.28);
    cbGroup.rotation.x = -0.32;

    const hexShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.52, 6), crowbarRed);
    cbGroup.add(hexShaft);

    const gripCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0175, 0.17, 8), gripRubber);
    gripCyl.position.y = -0.10;
    cbGroup.add(gripCyl);

    const neck1 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.075, 6), crowbarRed);
    neck1.position.set(0, 0.285, -0.015);
    neck1.rotation.x = 0.45;

    const neck2 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.075, 6), crowbarRed);
    neck2.position.set(0, 0.325, -0.058);
    neck2.rotation.x = 1.25;

    const neck3 = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.014, 0.075), bareSteel);
    neck3.position.set(0, 0.32, -0.115);
    neck3.rotation.x = 0.35;

    const prongL = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.009, 0.065), bareSteel);
    prongL.position.set(-0.011, 0.295, -0.16);
    prongL.rotation.set(0.52, 0.08, 0);

    const prongR = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.009, 0.065), bareSteel);
    prongR.position.set(0.011, 0.295, -0.16);
    prongR.rotation.set(0.52, -0.08, 0);

    const bottomChisel = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.010), bareSteel);
    bottomChisel.position.set(0, -0.285, -0.01);
    bottomChisel.rotation.x = -0.22;

    cbGroup.add(neck1, neck2, neck3, prongL, prongR, bottomChisel);
    this.crowbarMesh.add(cbGroup);
    this.crowbarMesh.visible = false;
    this.rightArm.add(this.crowbarMesh);

    // 3. 9MM TACTICAL PM PISTOL WITH ANIMATED SLIDE & REMOVABLE MAGAZINE FOR RELOAD
    this.pistolMesh = new THREE.Group();
    const slideSteel = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.88, roughness: 0.24 });
    const frameSteel = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.75, roughness: 0.36 });
    const bakeliteGrip = new THREE.MeshStandardMaterial({ color: 0x5c2415, roughness: 0.55, metalness: 0.08 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 });
    const boreBlack = new THREE.MeshBasicMaterial({ color: 0x020617 });
    const sightGlow = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

    const lowerFrame = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.032, 0.23), frameSteel);
    lowerFrame.position.set(0, 0.042, -0.30);
    this.pistolMesh.add(lowerFrame);

    const guardBottom = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.075), frameSteel);
    guardBottom.position.set(0, 0.002, -0.265);
    const guardFront = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.032, 0.009), frameSteel);
    guardFront.position.set(0, 0.016, -0.30);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.026, 0.012), slideSteel);
    trigger.position.set(0, 0.018, -0.255);
    trigger.rotation.x = 0.35;
    this.pistolMesh.add(guardBottom, guardFront, trigger);

    const gripCore = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.125, 0.062), frameSteel);
    gripCore.position.set(0, -0.012, -0.205);
    gripCore.rotation.x = 0.24;

    const panelL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.105, 0.052), bakeliteGrip);
    panelL.position.set(-0.019, 0, 0);
    const panelR = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.105, 0.052), bakeliteGrip);
    panelR.position.set(0.019, 0, 0);
    gripCore.add(panelL, panelR);
    this.pistolMesh.add(gripCore);

    this.pistolMagMesh = new THREE.Group();
    this.pistolMagMesh.position.set(0, -0.012, -0.205);
    this.pistolMagMesh.rotation.x = 0.24;
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.115, 0.050), slideSteel);
    const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.012, 0.068), slideSteel);
    magPlate.position.set(0, -0.066, 0.002);
    const topBullet = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.036, 8), brassMat);
    topBullet.rotation.x = Math.PI / 2;
    topBullet.position.set(0, 0.06, 0);
    this.pistolMagMesh.add(magBody, magPlate, topBullet);
    this.pistolMesh.add(this.pistolMagMesh);

    const innerBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.24, 12), slideSteel);
    innerBarrel.rotation.x = Math.PI / 2;
    innerBarrel.position.set(0, 0.068, -0.325);
    const muzzleBore = new THREE.Mesh(new THREE.CircleGeometry(0.008, 10), boreBlack);
    muzzleBore.rotation.y = Math.PI;
    muzzleBore.position.set(0, 0.068, -0.446);
    const brassChamber = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 0.048), brassMat);
    brassChamber.position.set(0.006, 0.072, -0.265);
    this.pistolMesh.add(innerBarrel, muzzleBore, brassChamber);

    this.pistolHammer = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.026, 0.018), slideSteel);
    this.pistolHammer.position.set(0, 0.065, -0.182);
    this.pistolHammer.rotation.x = -0.35;
    this.pistolMesh.add(this.pistolHammer);

    this.pistolSlide = new THREE.Group();
    this.pistolSlide.position.set(0, 0.072, -0.305);

    const slideMain = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.038, 0.26), slideSteel);
    this.pistolSlide.add(slideMain);

    for (let s = 0; s < 5; s++) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.026, 0.004), frameSteel);
      groove.position.set(0, -0.002, 0.075 + s * 0.009);
      this.pistolSlide.add(groove);
    }

    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.016), slideSteel);
    frontSight.position.set(0, 0.024, -0.115);
    const frontDot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.002), sightGlow);
    frontDot.position.set(0, 0.024, -0.106);

    const rearSightL = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.012, 0.016), slideSteel);
    rearSightL.position.set(-0.011, 0.024, 0.112);
    const rearSightR = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.012, 0.016), slideSteel);
    rearSightR.position.set(0.011, 0.024, 0.112);
    const rearDotL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.002), sightGlow);
    rearDotL.position.set(-0.011, 0.024, 0.121);
    const rearDotR = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.002), sightGlow);
    rearDotR.position.set(0.011, 0.024, 0.121);

    this.pistolSlide.add(frontSight, frontDot, rearSightL, rearSightR, rearDotL, rearDotR);
    this.pistolMesh.add(this.pistolSlide);

    this.muzzleFlash = new THREE.Group();
    this.muzzleFlash.position.set(0, 0.068, -0.48);
    const flashCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    const flashCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.18, 6),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.88 })
    );
    flashCone.rotation.x = -Math.PI / 2;
    flashCone.position.z = -0.06;
    this.muzzleFlash.add(flashCore, flashCone);
    this.muzzleFlash.visible = false;
    this.pistolMesh.add(this.muzzleFlash);

    this.pistolMesh.visible = false;
    this.rightArm.add(this.pistolMesh);
  }

  _initGravityBeamMesh() {
    this.beamMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.88 });
    const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.beamLine = new THREE.Line(geo, this.beamMat);
    this.beamLine.visible = false;
    this.beamLine.frustumCulled = false;
    this.scene.add(this.beamLine);
  }

  _bindControls() {
    const container = document.getElementById('canvas-container');
    const isTouchDevice =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (container && !isTouchDevice) {
      container.addEventListener('click', () => {
        const spawnMenu = document.getElementById('spawn-menu');
        const invModal = document.getElementById('inventory-modal');
        if (spawnMenu && !spawnMenu.classList.contains('hidden')) return;
        if (invModal && !invModal.classList.contains('hidden')) return;
        if (!this.isLocked && document.body.requestPointerLock) {
          document.body.requestPointerLock();
        }
      });
    }

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = Boolean(document.pointerLockElement);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const sens = 0.0021;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch));
    });

    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = true; break;
        case 'KeyS': this.keys.backward = true; break;
        case 'KeyA': this.keys.left = true; break;
        case 'KeyD': this.keys.right = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.keys.sprint = true; break;
        case 'ControlLeft':
        case 'KeyC': this.keys.crouch = true; break;
        case 'Space': this.jump(); break;
        case 'Digit1': this.setSlot(1); break;
        case 'Digit2': this.setSlot(2); break;
        case 'Digit3': this.setSlot(3); break;
        case 'Digit4': this.setSlot(4); break;
        case 'KeyE': this.tryGrabTarget(); break;
        case 'KeyF': this._kickForward(); break;
        case 'KeyR':
          if (this.activeSlot === 4) {
            this.startReload();
          } else {
            this.cycleRcv2Mode();
          }
          break;
        case 'KeyL': this.toggleFlashlight(); break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = false; break;
        case 'KeyS': this.keys.backward = false; break;
        case 'KeyA': this.keys.left = false; break;
        case 'KeyD': this.keys.right = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.keys.sprint = false; break;
        case 'ControlLeft':
        case 'KeyC': this.keys.crouch = false; break;
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;
      if (e.button === 0) {
        this.mouseDownLeft = true;
        this.performPrimaryAction();
      } else if (e.button === 2) {
        this.mouseDownRight = true;
        this.toggleFreezeHeldObject();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDownLeft = false;
      } else if (e.button === 2) {
        this.mouseDownRight = false;
      }
    });

    window.addEventListener('wheel', (e) => {
      if (!this.isLocked) return;
      if (this.heldTarget) {
        this.holdDistance = Math.max(1.2, Math.min(8.5, this.holdDistance - Math.sign(e.deltaY) * 0.45));
      } else {
        const next = ((this.activeSlot - 1 + Math.sign(e.deltaY) + 4) % 4) + 1;
        this.setSlot(next);
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setSlot(slotNum) {
    if (this.heldTarget && this.heldTarget.mode === 'rcv2' && slotNum !== 2) {
      this.releaseHeldObject(false);
    }
    this.activeSlot = slotNum;
    this.reloadTimer = 0;

    this.rcv2Mesh.visible = slotNum === 2;
    this.crowbarMesh.visible = slotNum === 3;
    this.pistolMesh.visible = slotNum === 4;

    document.querySelectorAll('.hotbar-slot').forEach((el) => {
      el.classList.toggle('active', Number(el.dataset.slot) === slotNum);
    });
  }

  startReload() {
    if (this.reloadTimer > 0) return;
    this.reloadTimer = this.reloadDuration;
    this.pistolAmmo = this.pistolMaxAmmo;
    this.sound.playReload();
    if (this.onToast) {
      this.onToast('Перезарядка ПМ (12/12)');
    }
  }

  cycleRcv2Mode() {
    this.rcv2Mode = (this.rcv2Mode + 1) % 3;
    const colors = [0x38bdf8, 0xef4444, 0xa855f7];
    const names = [
      'RCV2: Грави-Захват',
      'RCV2: Отсоединение сустава',
      'RCV2: Телекинез-Импульс'
    ];
    const col = colors[this.rcv2Mode];
    this.rcv2CoreMat.color.setHex(col);
    this.rcv2ScreenMat.color.setHex(col);
    this.beamMat.color.setHex(col);
    if (this.onToast) this.onToast(names[this.rcv2Mode]);
    return names[this.rcv2Mode];
  }

  jump() {
    this._tryJump();
  }

  _tryJump() {
    if (this.canJump) {
      this.verticalVel = this.adrenalineTimer > 0 ? 6.6 : 5.6;
      this.canJump = false;
      this.sound.playFootstep(true);
    }
  }

  performPrimaryAction() {
    if (this.heldTarget) {
      this.releaseHeldObject(true);
      return;
    }

    const dmgBoost = this.adrenalineTimer > 0 ? 1.5 : 1.0;

    if (this.activeSlot === 1) {
      this.punchHandAlt = (this.punchHandAlt + 1) % 2;
      this._meleeAttack(18 * dmgBoost, 2.85, 9.5, 'blunt');
    } else if (this.activeSlot === 2) {
      if (this.rcv2Mode === 0) {
        this.tryGrabTarget();
      } else if (this.rcv2Mode === 1) {
        const hit = this._raycastCenter(15.0);
        this.swingTimer = 0.26;
        this.sound.playGoreSever();
        if (hit && hit.npc && hit.limb) {
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
          if (hit.limb.severable && !hit.limb.severed) {
            hit.npc.severLimb(hit.limb, dir.clone().multiplyScalar(22));
            if (this.onToast) this.onToast(`Отсоединён сегмент: ${hit.limb.label}`);
          } else {
            hit.npc.damageLimb(hit.limb, 45, hit.point, dir.clone().multiplyScalar(25), 'blast', true);
          }
          if (this.onHitmarker) this.onHitmarker();
          if (this.onPlayerAttackedNPC) this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
        } else if (hit && hit.prop) {
          this.propsManager.damageProp(hit.prop, 120, hit.point);
          if (this.onHitmarker) this.onHitmarker();
        }
      } else {
        this.swingTimer = 0.25;
        this.sound.playImpact('metal', 0.9);
        const hit = this._raycastCenter(15.0);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
        if (hit && hit.prop) {
          const b = hit.prop.body;
          if (b.type === CANNON.Body.STATIC) {
            b.type = CANNON.Body.DYNAMIC;
            b.updateMassProperties();
          }
          b.wakeUp();
          b.velocity.set(dir.x * 26, dir.y * 26 + 3.5, dir.z * 26);
          if (this.onHitmarker) this.onHitmarker();
        } else if (hit && hit.npc && hit.limb) {
          hit.npc.damageLimb(hit.limb, 32, hit.point, dir.clone().multiplyScalar(24), 'blast', true);
          hit.npc.enterRagdoll(3.2, dir.multiplyScalar(14));
          if (this.onHitmarker) this.onHitmarker();
          if (this.onPlayerAttackedNPC) this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
        }
      }
    } else if (this.activeSlot === 3) {
      this._meleeAttack(36 * dmgBoost, 3.2, 16.0, 'slash');
    } else if (this.activeSlot === 4) {
      this._firePistol();
    }
  }

  tryGrabTarget() {
    if (this.heldTarget) {
      this.releaseHeldObject(false);
      return true;
    }

    const maxRange = this.activeSlot === 2 ? 14.0 : 3.8;
    const mode = this.activeSlot === 2 ? 'rcv2' : 'hands';
    const hit = this._raycastCenter(maxRange);
    if (!hit) return false;

    if (hit.prop && hit.prop.grabbable) {
      if (hit.prop.body.type === CANNON.Body.STATIC) {
        hit.prop.body.type = CANNON.Body.DYNAMIC;
        hit.prop.body.updateMassProperties();
      }
      this.heldTarget = {
        type: 'prop',
        prop: hit.prop,
        body: hit.prop.body,
        mode
      };
      this.holdDistance = mode === 'rcv2' ? Math.max(1.8, Math.min(8.5, hit.distance)) : 1.7;
      hit.prop.body.wakeUp();
      if (this.onToast) {
        this.onToast(`Захвачено: ${hit.prop.name}`);
      }
      return true;
    } else if (hit.npc && hit.limb) {
      this.lastInspectedNpc = hit.npc;
      if (!hit.limb.severed) {
        hit.npc.enterRagdoll(3.2);
      }
      this.heldTarget = {
        type: 'npc_limb',
        npc: hit.npc,
        limb: hit.limb,
        body: hit.limb.body,
        mode
      };
      this.holdDistance = mode === 'rcv2' ? Math.max(1.8, Math.min(8.0, hit.distance)) : 1.75;
      if (this.onToast) {
        this.onToast(`Схвачен: ${hit.npc.name} (${hit.limb.label})`);
      }
      return true;
    }
    return false;
  }

  toggleFreezeHeldObject() {
    if (this.heldTarget) {
      const b = this.heldTarget.body;
      if (b.type === CANNON.Body.STATIC) {
        b.type = CANNON.Body.DYNAMIC;
        b.updateMassProperties();
        if (this.onToast) this.onToast('Объект разморожен');
      } else {
        b.type = CANNON.Body.STATIC;
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
        if (this.onToast) this.onToast('Объект зафиксирован в воздухе');
      }
      this.heldTarget = null;
      this.beamLine.visible = false;
      return;
    }

    if (this.activeSlot === 2) {
      this.cycleRcv2Mode();
    } else if (this.activeSlot === 4) {
      this.startReload();
    } else {
      this.tryGrabTarget();
    }
  }

  releaseHeldObject(throwForward = false) {
    if (!this.heldTarget) return;
    const body = this.heldTarget.body;
    if (body.type === CANNON.Body.STATIC) {
      body.type = CANNON.Body.DYNAMIC;
      body.updateMassProperties();
    }
    body.wakeUp();

    if (throwForward) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
      const throwPower = this.heldTarget.mode === 'rcv2' ? 23.5 : 15.0;

      if (this.heldTarget.type === 'npc_limb' && this.heldTarget.limb && !this.heldTarget.limb.severed) {
        const limb = this.heldTarget.limb;
        const npc = this.heldTarget.npc;
        if (this.heldTarget.mode === 'rcv2') {
          npc.damageLimb(limb, 30, limb.mesh.position, dir.clone().multiplyScalar(20), 'blunt', true);
          if (this.onPlayerAttackedNPC) {
            this.onPlayerAttackedNPC(this.getPosition(), npc);
          }
        }
      }

      body.velocity.set(dir.x * throwPower, dir.y * throwPower + 1.8, dir.z * throwPower);
      this.swingTimer = 0.28;
      this.sound.playFootstep(true);
    }

    this.heldTarget = null;
    this.beamLine.visible = false;
  }

  _kickForward() {
    this.swingTimer = 0.3;
    const hit = this._raycastCenter(2.9);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    if (hit && hit.prop) {
      if (hit.prop.body.type === CANNON.Body.STATIC) {
        hit.prop.body.type = CANNON.Body.DYNAMIC;
        hit.prop.body.updateMassProperties();
      }
      hit.prop.body.wakeUp();
      hit.prop.body.velocity.set(dir.x * 13, 3.2, dir.z * 13);
      this.propsManager.damageProp(hit.prop, 22, hit.point);
      this.sound.playImpact('wood', 0.8);
    } else if (hit && hit.npc && hit.limb) {
      this.lastInspectedNpc = hit.npc;
      hit.npc.damageLimb(hit.limb, 18, hit.point, dir.clone().multiplyScalar(18), 'blunt', true);
      hit.npc.enterRagdoll(2.6, dir.clone().multiplyScalar(8.5));
      if (this.onHitmarker) this.onHitmarker();
      if (this.onPlayerAttackedNPC) {
        this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
      }
    }
  }

  _meleeAttack(damage, range, force, damageType = 'blunt') {
    if (this.swingTimer > 0.08) return;
    this.swingTimer = 0.32;
    this.sound.playFootstep(false);

    const hit = this._raycastCenter(range, true);
    if (!hit) return;

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    if (hit.prop) {
      if (hit.prop.body.type === CANNON.Body.STATIC) {
        hit.prop.body.type = CANNON.Body.DYNAMIC;
        hit.prop.body.updateMassProperties();
      }
      hit.prop.body.wakeUp();
      hit.prop.body.velocity.x += dir.x * (force / Math.max(1, hit.prop.mass * 0.35));
      hit.prop.body.velocity.y += 1.6;
      hit.prop.body.velocity.z += dir.z * (force / Math.max(1, hit.prop.mass * 0.35));
      this.propsManager.damageProp(hit.prop, damage, hit.point);
      this.sound.playImpact(hit.prop.type === 'crate' ? 'wood' : 'metal', 0.85);
      if (this.onHitmarker) this.onHitmarker();
    } else if (hit.npc && hit.limb) {
      this.lastInspectedNpc = hit.npc;
      hit.npc.damageLimb(hit.limb, damage, hit.point, dir.clone().multiplyScalar(force), damageType, true);
      if (this.onHitmarker) this.onHitmarker();
      if (this.onPlayerAttackedNPC) {
        this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
      }
    } else if (hit.isWorldSurface) {
      this.sound.playImpact('concrete', 0.75);
    }
  }

  _firePistol() {
    if (this.shootCooldown > 0 || this.reloadTimer > 0) return;

    if (this.pistolAmmo <= 0) {
      this.startReload();
      return;
    }

    this.pistolAmmo--;
    this.shootCooldown = 0.16;
    this.swingTimer = 0.18;
    this.recoilPitch = 0.04;
    this.sound.playGunshot();

    this.muzzleFlash.visible = true;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    setTimeout(() => {
      if (this.muzzleFlash) this.muzzleFlash.visible = false;
    }, 55);

    if (this.propsManager.onSoundEvent) {
      this.propsManager.onSoundEvent(this.getPosition(), 34, 'gunshot', 'Выстрел из пистолета');
    }

    const hit = this._raycastCenter(55.0, true);
    if (!hit) {
      if (this.pistolAmmo === 0) setTimeout(() => this.startReload(), 180);
      return;
    }

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    if (hit.prop) {
      if (hit.prop.body.type === CANNON.Body.STATIC) {
        hit.prop.body.type = CANNON.Body.DYNAMIC;
        hit.prop.body.updateMassProperties();
      }
      hit.prop.body.wakeUp();
      hit.prop.body.applyImpulse(
        new CANNON.Vec3(dir.x * 11, dir.y * 11 + 1.5, dir.z * 11),
        new CANNON.Vec3(hit.point.x, hit.point.y, hit.point.z)
      );
      this.propsManager.damageProp(hit.prop, 34, hit.point);
      if (this.onHitmarker) this.onHitmarker();
    } else if (hit.npc && hit.limb) {
      this.lastInspectedNpc = hit.npc;
      hit.npc.damageLimb(hit.limb, 26, hit.point, dir.clone().multiplyScalar(18), 'bullet', true);
      if (this.onHitmarker) this.onHitmarker();
      if (this.onPlayerAttackedNPC) {
        this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
      }
    } else if (hit.isWorldSurface) {
      this.sound.playImpact('concrete', 0.55);
    }

    if (this.pistolAmmo === 0) {
      setTimeout(() => this.startReload(), 180);
    }
  }

  takeDamage(amount, knockback = null, targetLimbKey = null) {
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.55);
      this.armor = Math.max(0, this.armor - absorbed);
      dmg -= absorbed;
    }

    this.hp = Math.max(0, this.hp - dmg);
    this.addCameraShake(0.28);

    const vig = document.getElementById('damage-vignette');
    if (vig) {
      vig.classList.add('active');
      clearTimeout(this._vigTimer);
      this._vigTimer = setTimeout(() => vig.classList.remove('active'), 260);
    }

    const keys = Object.keys(this.playerLimbs);
    const chosenKey = targetLimbKey || keys[Math.floor(Math.random() * keys.length)];
    const limb = this.playerLimbs[chosenKey];
    if (limb) {
      limb.hp = Math.max(5, limb.hp - dmg * 2.1);
      if (limb.hp < 55) {
        limb.bleeding = true;
      }
      const atlas =
        this.propsManager &&
        this.propsManager.textures &&
        this.propsManager.textures.gore &&
        this.propsManager.textures.gore.woundAtlas56
          ? this.propsManager.textures.gore.woundAtlas56
          : [];
      if (atlas.length > 0) {
        const wDef = atlas[Math.floor(Math.random() * atlas.length)];
        const entry = {
          id: wDef.id,
          name: wDef.name,
          category: wDef.category,
          limbKey: chosenKey,
          limbLabel: limb.label,
          bleedRate: wDef.bleedRate,
          arterial: wDef.arterial,
          previewUrl: wDef.previewUrl
        };
        limb.wounds.push(entry);
        this.activeWounds.unshift(entry);
      }
    }

    if (knockback) {
      this.velX += knockback.x * 0.45;
      this.velZ += knockback.z * 0.45;
    }

    if (this.hp <= 0) {
      this.useMedkit(true);
      this.playerPos.set(0, 0, 4.8);
      this.velX = 0;
      this.velZ = 0;
      this.verticalVel = 0;
      if (this.onToast) {
        this.onToast('Персонаж восстановлен на стартовой точке');
      }
    }
  }

  useMedkit(silent = false) {
    this.hp = this.maxHp;
    this.activeWounds = [];
    for (const k of Object.keys(this.playerLimbs)) {
      this.playerLimbs[k].hp = this.playerLimbs[k].maxHp;
      this.playerLimbs[k].bleeding = false;
      this.playerLimbs[k].severed = false;
      this.playerLimbs[k].wounds = [];
    }
    if (!silent && this.onToast) {
      this.onToast('Аптечка использована: 100 HP, все раны вылечены');
    }
  }

  useBandage() {
    this.hp = Math.min(this.maxHp, this.hp + 25);
    this.activeWounds = [];
    for (const k of Object.keys(this.playerLimbs)) {
      this.playerLimbs[k].bleeding = false;
      this.playerLimbs[k].wounds = [];
      this.playerLimbs[k].hp = Math.min(this.playerLimbs[k].maxHp, this.playerLimbs[k].hp + 35);
    }
    if (this.onToast) {
      this.onToast('Наложены повязки: кровотечение остановлено (+25 HP)');
    }
  }

  equipArmor() {
    this.armor = 100;
    if (this.onToast) {
      this.onToast('Бронежилет надет (100 Брони)');
    }
  }

  useAdrenaline() {
    this.adrenalineTimer = 20.0;
    this.hp = Math.min(this.maxHp, this.hp + 30);
    if (this.onToast) {
      this.onToast('Адреналин введён: скорость и сила удара увеличены на 20 сек');
    }
  }

  storeHeldInBackpack() {
    if (!this.heldTarget || !this.heldTarget.prop) {
      if (this.onToast) this.onToast('Сначала возьмите предмет в руки (ЗАХВАТ), чтобы убрать в рюкзак');
      return false;
    }
    const prop = this.heldTarget.prop;
    this.releaseHeldObject(false);

    let kind = 'crate_std';
    if (prop.type === 'bottle') kind = 'bottle';
    else if (prop.type === 'barrel_explosive') kind = 'barrel_red';
    else if (prop.type === 'barrel_steel') kind = 'barrel_steel';
    else if (prop.type === 'cinderblock') kind = 'cinderblock';
    else if (prop.type === 'worklight') kind = 'worklight';

    this.backpack.push({ kind, name: prop.name });

    this.scene.remove(prop.mesh);
    this.world.removeBody(prop.body);
    const idx = this.propsManager.props.indexOf(prop);
    if (idx !== -1) this.propsManager.props.splice(idx, 1);

    if (this.onToast) this.onToast(`Убрано в инвентарь: ${prop.name}`);
    return true;
  }

  _raycastCenter(maxDist = 6.0, includeWorldSurfaces = false) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    raycaster.far = maxDist;

    const candidates = [];
    for (const p of this.propsManager.props) {
      if (!p.broken && p.mesh) candidates.push(p.mesh);
    }
    if (this._currentNpcs) {
      for (const npc of this._currentNpcs) {
        for (const l of npc.limbList) {
          if (l.mesh) candidates.push(l.mesh);
        }
      }
    }

    const intersects = raycaster.intersectObjects(candidates, true);
    if (intersects.length > 0) {
      const first = intersects[0];
      let obj = first.object;
      while (obj && (!obj.userData || (!obj.userData.prop && !obj.userData.npc))) {
        obj = obj.parent;
      }
      if (obj && obj.userData) {
        const worldNormal = first.face
          ? first.face.normal.clone().transformDirection(first.object.matrixWorld).normalize()
          : new THREE.Vector3(0, 1, 0);
        return {
          point: first.point,
          normal: worldNormal,
          distance: first.distance,
          prop: obj.userData.prop || null,
          npc: obj.userData.npc || null,
          limb: obj.userData.limb || null
        };
      }
    }

    if (includeWorldSurfaces) {
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hitPt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floorPlane, hitPt)) {
        const dist = hitPt.distanceTo(this.camera.position);
        if (dist <= maxDist && Math.abs(hitPt.x) <= 24.5 && Math.abs(hitPt.z) <= 24.5) {
          return {
            point: hitPt,
            normal: new THREE.Vector3(0, 1, 0),
            distance: dist,
            isWorldSurface: true
          };
        }
      }
    }

    return null;
  }

  getPosition() {
    return new THREE.Vector3(this.playerPos.x, this.playerPos.y + 0.9, this.playerPos.z);
  }

  onResize(width, height) {
    this.viewmodelCamera.aspect = width / height;
    this.viewmodelCamera.updateProjectionMatrix();
  }

  update(dt, allNpcs, touchControls = null) {
    this._currentNpcs = allNpcs;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.swingTimer > 0) this.swingTimer = Math.max(0, this.swingTimer - dt);
    if (this.reloadTimer > 0) this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    if (this.recoilPitch > 0) this.recoilPitch = Math.max(0, this.recoilPitch - dt * 0.22);
    if (this.cameraShake > 0) this.cameraShake = Math.max(0, this.cameraShake - dt * 2.2);
    if (this.adrenalineTimer > 0) this.adrenalineTimer = Math.max(0, this.adrenalineTimer - dt);

    let bleedingCount = 0;
    for (const k of Object.keys(this.playerLimbs)) {
      if (this.playerLimbs[k].bleeding) bleedingCount++;
    }
    if (bleedingCount > 0) {
      this.bleedTickTimer += dt;
      if (this.bleedTickTimer >= 1.5) {
        this.bleedTickTimer = 0;
        this.hp = Math.max(5, this.hp - bleedingCount);
      }
    }

    if (this.mouseDownLeft && this.activeSlot === 4 && this.pistolAuto && this.shootCooldown <= 0 && this.reloadTimer <= 0) {
      this._firePistol();
    }

    this._updateMovement(dt, allNpcs, touchControls);
    this._updateHeldObject(dt);
    this._updateViewmodelAnimation(dt);
    this._updateTargetPrompt();
  }

  _updateMovement(dt, allNpcs, touchControls = null) {
    let moveForward = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0);
    let moveRight = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    let joySprint = false;

    if (touchControls && (Math.abs(touchControls.moveX) > 0.01 || Math.abs(touchControls.moveY) > 0.01)) {
      moveRight += touchControls.moveX;
      moveForward += touchControls.moveY;
      if (Math.hypot(touchControls.moveX, touchControls.moveY) > 0.82) {
        joySprint = true;
      }
    }

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const wishDir = new THREE.Vector3();
    wishDir.addScaledVector(forward, moveForward);
    wishDir.addScaledVector(right, moveRight);

    const inputMag = Math.min(1.0, wishDir.length());
    if (inputMag > 0.001) {
      wishDir.normalize();
    }

    const legMinHp = Math.min(
      this.playerLimbs.thighL.hp,
      this.playerLimbs.calfL.hp,
      this.playerLimbs.thighR.hp,
      this.playerLimbs.calfR.hp
    );
    const legMult = this.adrenalineTimer > 0 ? 1.25 : legMinHp < 40 ? 0.68 : 1.0;

    const isSprinting = (this.keys.sprint || joySprint) && !this.keys.crouch;
    const maxSpeed = (this.keys.crouch ? 3.2 : isSprinting ? 7.4 : 5.0) * legMult;

    const targetVx = wishDir.x * maxSpeed * inputMag;
    const targetVz = wishDir.z * maxSpeed * inputMag;

    const accel = this.canJump ? 18.0 : 8.5;
    this.velX += (targetVx - this.velX) * Math.min(1, dt * accel);
    this.velZ += (targetVz - this.velZ) * Math.min(1, dt * accel);

    this.playerPos.x += this.velX * dt;
    this.playerPos.z += this.velZ * dt;

    const supportY = this._resolveSolidCollisions(allNpcs);

    if (!this.canJump || this.playerPos.y > supportY + 0.01 || this.verticalVel > 0) {
      this.verticalVel -= 15.8 * dt;
      this.playerPos.y += this.verticalVel * dt;
      if (this.playerPos.y <= supportY) {
        this.playerPos.y = supportY;
        this.verticalVel = 0;
        this.canJump = true;
      }
    } else {
      this.playerPos.y = supportY;
      this.verticalVel = 0;
      this.canJump = true;
    }

    if (Math.abs(this.playerPos.x) > 25.4 || Math.abs(this.playerPos.z) > 25.4) {
      this.playerPos.y -= 14.0 * dt;
      if (this.playerPos.y < -18) {
        this.takeDamage(100);
      }
    }

    this.body.position.set(this.playerPos.x, this.playerPos.y + 0.9, this.playerPos.z);
    this.body.velocity.set(this.velX, this.verticalVel, this.velZ);

    const targetCrouch = this.keys.crouch ? 0.58 : 0;
    this.crouchFactor += (targetCrouch - this.crouchFactor) * Math.min(1, dt * 12);

    const horizSpeed = Math.hypot(this.velX, this.velZ);
    let bobY = 0;
    let bobX = 0;
    if (horizSpeed > 0.45 && this.canJump) {
      const freq = isSprinting ? 12.0 : 8.5;
      this.walkBobTimer += dt * freq;
      bobY = Math.sin(this.walkBobTimer) * 0.035;
      bobX = Math.cos(this.walkBobTimer * 0.5) * 0.02;

      this.stepSoundTimer += dt;
      const stepInterval = isSprinting ? 0.34 : 0.48;
      if (this.stepSoundTimer >= stepInterval) {
        this.stepSoundTimer = 0;
        this.sound.playFootstep(isSprinting);
      }
    }

    const shakeX = this.cameraShake > 0 ? (Math.random() - 0.5) * 0.14 * this.cameraShake : 0;
    const shakeY = this.cameraShake > 0 ? (Math.random() - 0.5) * 0.14 * this.cameraShake : 0;

    this.camera.position.set(
      this.playerPos.x + bobX + shakeX,
      this.playerPos.y + this.eyeHeight - this.crouchFactor + bobY + shakeY,
      this.playerPos.z
    );

    const euler = new THREE.Euler(this.pitch + this.recoilPitch + shakeY * 0.5, this.yaw + shakeX * 0.5, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  _resolveSolidCollisions(allNpcs) {
    let supportY = 0;
    const r = this.playerRadius;
    const pFootY = this.playerPos.y;
    const pHeadY = this.playerPos.y + 1.68;

    const resolveBox = (bx, bz, hx, hz, minY, maxY, dynBody = null) => {
      const insideXZ =
        this.playerPos.x > bx - hx - r * 0.75 &&
        this.playerPos.x < bx + hx + r * 0.75 &&
        this.playerPos.z > bz - hz - r * 0.75 &&
        this.playerPos.z < bz + hz + r * 0.75;

      if (insideXZ) {
        if (pFootY >= maxY - 0.24 && this.verticalVel <= 0.1) {
          if (maxY > supportY) supportY = maxY;
          return;
        }
        if (maxY - pFootY > 0 && maxY - pFootY <= 0.28 && this.canJump) {
          if (maxY > supportY) supportY = maxY;
          return;
        }
      }

      if (pHeadY <= minY + 0.05 || pFootY >= maxY - 0.08) {
        return;
      }

      const closestX = Math.max(bx - hx, Math.min(bx + hx, this.playerPos.x));
      const closestZ = Math.max(bz - hz, Math.min(bz + hz, this.playerPos.z));

      let dx = this.playerPos.x - closestX;
      let dz = this.playerPos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < r * r) {
        if (distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const overlap = r - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          this.playerPos.x += nx * overlap;
          this.playerPos.z += nz * overlap;

          const vn = this.velX * nx + this.velZ * nz;
          if (vn < 0) {
            this.velX -= vn * nx;
            this.velZ -= vn * nz;
          }

          if (dynBody && dynBody.type === CANNON.Body.DYNAMIC) {
            dynBody.wakeUp();
            const push = Math.min(2.8, 18 / Math.max(4, dynBody.mass));
            dynBody.velocity.x -= nx * push;
            dynBody.velocity.z -= nz * push;
          }
        } else {
          const penLeft = (this.playerPos.x - (bx - hx)) + r;
          const penRight = ((bx + hx) - this.playerPos.x) + r;
          const penFront = (this.playerPos.z - (bz - hz)) + r;
          const penBack = ((bz + hz) - this.playerPos.z) + r;
          const minPen = Math.min(penLeft, penRight, penFront, penBack);

          if (minPen === penLeft) this.playerPos.x = bx - hx - r;
          else if (minPen === penRight) this.playerPos.x = bx + hx + r;
          else if (minPen === penFront) this.playerPos.z = bz - hz - r;
          else this.playerPos.z = bz + hz + r;
        }
      }
    };

    for (const sb of this.staticBoxes) {
      resolveBox(sb.x, sb.z, sb.hx, sb.hz, sb.minY, sb.maxY, null);
    }

    for (const p of this.propsManager.props) {
      if (p.broken || !p.solidForPlayer) continue;
      if (this.heldTarget && this.heldTarget.prop === p) continue;

      const bx = p.body.position.x;
      const by = p.body.position.y;
      const bz = p.body.position.z;
      const hx = p.halfExtents ? p.halfExtents.x : 0.4;
      const hy = p.halfExtents ? p.halfExtents.y : 0.4;
      const hz = p.halfExtents ? p.halfExtents.z : 0.4;

      resolveBox(bx, bz, hx, hz, by - hy, by + hy, p.body);
    }

    if (allNpcs) {
      for (const npc of allNpcs) {
        if (npc.dead || npc.isRagdoll) continue;
        const nPos = npc.getPosition();
        if (pFootY > 1.75) continue;

        const dx = this.playerPos.x - nPos.x;
        const dz = this.playerPos.z - nPos.z;
        const minR = r + 0.34;
        const dSq = dx * dx + dz * dz;
        if (dSq < minR * minR && dSq > 0.0001) {
          const d = Math.sqrt(dSq);
          const overlap = minR - d;
          this.playerPos.x += (dx / d) * overlap;
          this.playerPos.z += (dz / d) * overlap;
        }
      }
    }

    return supportY;
  }

  _updateHeldObject(dt) {
    if (!this.heldTarget) {
      this.beamLine.visible = false;
      return;
    }

    const body = this.heldTarget.body;
    if (!body || (this.heldTarget.prop && this.heldTarget.prop.broken)) {
      this.heldTarget = null;
      this.beamLine.visible = false;
      return;
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const desiredPos = this.camera.position.clone().addScaledVector(forward, this.holdDistance);
    desiredPos.y = Math.max(0.35, desiredPos.y);

    const curPos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
    const diff = desiredPos.clone().sub(curPos);

    if (diff.length() > 9.5) {
      this.releaseHeldObject(false);
      return;
    }

    body.wakeUp();
    const springStrength = this.heldTarget.mode === 'rcv2' ? 17.5 : 14.0;
    body.velocity.set(
      diff.x * springStrength,
      diff.y * springStrength,
      diff.z * springStrength
    );
    body.angularVelocity.scale(0.75, body.angularVelocity);

    if (this.heldTarget.mode === 'rcv2') {
      this.beamLine.visible = true;
      const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const startPt = this.camera.position
        .clone()
        .addScaledVector(forward, 0.55)
        .addScaledVector(rightVec, 0.24)
        .addScaledVector(upVec, -0.14);

      const midPt = startPt.clone().lerp(curPos, 0.5);
      midPt.y += Math.sin(performance.now() * 0.015) * 0.08;

      const posAttr = this.beamLine.geometry.attributes.position;
      posAttr.setXYZ(0, startPt.x, startPt.y, startPt.z);
      posAttr.setXYZ(1, midPt.x, midPt.y, midPt.z);
      posAttr.setXYZ(2, curPos.x, curPos.y, curPos.z);
      posAttr.needsUpdate = true;
    } else {
      this.beamLine.visible = false;
    }
  }

  _updateViewmodelAnimation(dt) {
    const t = performance.now() * 0.001;
    const speed = Math.hypot(this.velX, this.velZ);
    const walkAmp = Math.min(1, speed / 5.5);

    let targetRetract = 0;
    if (this.hoveredTarget && this.hoveredTarget.distance < 0.92 && !this.heldTarget) {
      targetRetract = (0.92 - this.hoveredTarget.distance) * 0.24;
    }
    this.wallRetractZ += (targetRetract - this.wallRetractZ) * Math.min(1, dt * 14);
    this.rigRoot.position.z = this.wallRetractZ;

    const idleBreathY = Math.sin(t * 2.2) * 0.007;
    const idleBreathX = Math.cos(t * 1.1) * 0.005;
    const walkSwayX = Math.cos(this.walkBobTimer * 0.5) * 0.026 * walkAmp;
    const walkSwayY = Math.sin(this.walkBobTimer) * 0.028 * walkAmp;

    const swayX = idleBreathX + walkSwayX;
    const swayY = idleBreathY + walkSwayY;

    const swingPhase = this.swingTimer > 0 ? Math.sin((this.swingTimer / 0.32) * Math.PI) : 0;
    const isHoldingHands = Boolean(this.heldTarget && this.heldTarget.mode === 'hands');

    if (isHoldingHands) {
      this.leftArm.position.set(-0.21 + swayX, -0.18 + swayY, -0.34);
      this.leftArm.rotation.set(0.28, -0.26, 0.14);
      this.rightArm.position.set(0.21 + swayX, -0.18 + swayY, -0.34);
      this.rightArm.rotation.set(0.28, 0.26, -0.14);
      this._setArmFingerCurl(this.leftArm, 0.55);
      this._setArmFingerCurl(this.rightArm, 0.55);
    } else if (this.activeSlot === 1) {
      const hitLeft = this.punchHandAlt === 1 ? swingPhase : 0;
      const hitRight = this.punchHandAlt === 0 ? swingPhase : 0;

      this.leftArm.position.set(
        -0.23 + swayX + hitLeft * 0.09,
        -0.21 + swayY + hitLeft * 0.07,
        -0.31 - hitLeft * 0.25
      );
      this.leftArm.rotation.set(0.18 + hitLeft * 0.42, -0.22 - hitLeft * 0.25, 0.08);

      this.rightArm.position.set(
        0.23 + swayX - hitRight * 0.09,
        -0.20 + swayY + hitRight * 0.07,
        -0.31 - hitRight * 0.25
      );
      this.rightArm.rotation.set(0.18 + hitRight * 0.42, 0.22 + hitRight * 0.25, -0.08);

      this._setArmFingerCurl(this.leftArm, 0.25 + hitLeft * 1.15);
      this._setArmFingerCurl(this.rightArm, 0.25 + hitRight * 1.15);
    } else if (this.activeSlot === 2) {
      this.leftArm.position.set(-0.18 + swayX, -0.23 + swayY, -0.34);
      this.leftArm.rotation.set(0.18, -0.38, 0.12);
      this.rightArm.position.set(0.20 + swayX, -0.20 + swayY, -0.27 - swingPhase * 0.08);
      this.rightArm.rotation.set(0.06, 0.08, -0.04);
      this._setArmFingerCurl(this.leftArm, 0.85);
      this._setArmFingerCurl(this.rightArm, 1.05);

      if (this.rcv2Rotor) {
        this.rcv2Rotor.rotation.z += dt * (this.heldTarget ? 14.0 : 4.5);
      }
      if (this.rcv2Claws) {
        const spread = this.heldTarget || this.swingTimer > 0 ? 0.38 : 0.05;
        for (const cl of this.rcv2Claws) {
          cl.pivot.children[0].rotation.x = -0.22 - spread;
        }
      }
      this.rcv2MuzzleOrb.scale.setScalar(this.heldTarget ? 1.45 + Math.sin(t * 18) * 0.25 : 1.0);
    } else if (this.activeSlot === 3) {
      this.leftArm.position.set(-0.26 + swayX, -0.26 + swayY, -0.26);
      this.leftArm.rotation.set(0.12, -0.18, 0.08);
      this.rightArm.position.set(0.24 + swayX - swingPhase * 0.12, -0.22 + swayY + swingPhase * 0.1, -0.30 - swingPhase * 0.22);
      this.rightArm.rotation.set(0.12 - swingPhase * 0.75, 0.14 + swingPhase * 0.3, -0.08 - swingPhase * 0.35);
      this._setArmFingerCurl(this.leftArm, 0.35);
      this._setArmFingerCurl(this.rightArm, 1.25);
    } else if (this.activeSlot === 4) {
      this._setArmFingerCurl(this.leftArm, 0.75);
      this._setArmFingerCurl(this.rightArm, 1.15);

      if (this.reloadTimer > 0) {
        const p = 1.0 - this.reloadTimer / this.reloadDuration;
        const tilt = Math.sin(p * Math.PI);
        this.rightArm.position.set(0.14 + swayX, -0.18 + swayY + tilt * 0.04, -0.28);
        this.rightArm.rotation.set(0.24 + tilt * 0.25, 0.28 * tilt, 0.38 * tilt);

        if (p < 0.38) {
          const f1 = p / 0.38;
          if (this.pistolMagMesh) this.pistolMagMesh.position.y = -0.012 - f1 * 0.14;
          this.leftArm.position.set(-0.08 + f1 * 0.16, -0.26 - f1 * 0.06, -0.30);
          this.leftArm.rotation.set(0.35, -0.45, 0.22);
        } else if (p < 0.72) {
          const f2 = (p - 0.38) / 0.34;
          if (this.pistolMagMesh) this.pistolMagMesh.position.y = -0.152 + f2 * 0.14;
          this.leftArm.position.set(0.08, -0.32 + f2 * 0.11, -0.30);
          this.leftArm.rotation.set(0.42, -0.52, 0.25);
        } else {
          const f3 = (p - 0.72) / 0.28;
          if (this.pistolMagMesh) this.pistolMagMesh.position.y = -0.012;
          const rackPull = Math.sin(f3 * Math.PI);
          if (this.pistolSlide) this.pistolSlide.position.z = -0.305 + rackPull * 0.06;
          this.leftArm.position.set(0.06, -0.13 + (1 - rackPull) * -0.08, -0.33 + rackPull * 0.04);
          this.leftArm.rotation.set(0.55, -0.62, 0.32);
        }
      } else {
        const recoil = this.shootCooldown > 0 ? (this.shootCooldown / 0.16) : 0;
        if (this.pistolMagMesh) this.pistolMagMesh.position.y = -0.012;
        this.leftArm.position.set(0.06 + swayX, -0.23 + swayY, -0.32);
        this.leftArm.rotation.set(0.22, -0.58, 0.18);
        this.rightArm.position.set(0.16 + swayX, -0.20 + swayY + recoil * 0.04, -0.29 + recoil * 0.07);
        this.rightArm.rotation.set(0.08 + recoil * 0.28, 0.06, -0.02);

        if (this.pistolSlide) {
          this.pistolSlide.position.z = -0.305 + recoil * 0.055;
        }
        if (this.pistolHammer) {
          this.pistolHammer.rotation.x = -0.35 - recoil * 0.85;
        }
      }
    }
  }

  _updateTargetPrompt() {
    const promptEl = document.getElementById('target-prompt');
    const crosshair = document.getElementById('crosshair');

    if (this.heldTarget) {
      this.hoveredTarget = this.heldTarget;
      if (promptEl) {
        promptEl.classList.remove('hidden');
        if (this.heldTarget.prop) {
          promptEl.textContent = `В руках: ${this.heldTarget.prop.name} (УДАР — Бросить | РЕЖИМ — Фиксация)`;
        } else if (this.heldTarget.npc) {
          promptEl.textContent = `Захват: ${this.heldTarget.npc.name} (${this.heldTarget.limb.label})`;
        }
      }
      if (crosshair) crosshair.classList.add('active-target');
      return;
    }

    const hit = this._raycastCenter(5.2);
    this.hoveredTarget = hit;

    if (!promptEl) return;
    if (hit && hit.prop) {
      promptEl.classList.remove('hidden');
      const hpStr = hit.prop.breakable ? ` [${Math.ceil(hit.prop.hp)} HP]` : '';
      promptEl.textContent = `${hit.prop.name}${hpStr}`;
      if (crosshair) crosshair.classList.add('active-target');
    } else if (hit && hit.npc && hit.limb) {
      this.lastInspectedNpc = hit.npc;
      promptEl.classList.remove('hidden');
      const limbHp = Math.ceil(hit.limb.hp);
      const woundCount = hit.limb.wounds ? hit.limb.wounds.length : 0;
      const woundStr = woundCount > 0 ? ` | Ран: ${woundCount}` : '';
      const sevStr = hit.limb.severed ? ' [ОТСОЕДИНЕНА]' : ` [${limbHp} HP${woundStr}]`;
      promptEl.textContent = `${hit.npc.name} — ${hit.limb.label}${sevStr}`;
      if (crosshair) crosshair.classList.add('active-target');
    } else {
      promptEl.classList.add('hidden');
      if (crosshair) crosshair.classList.remove('active-target');
    }
  }
}

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * FirstPersonPlayer with:
 * - Public methods for Android TouchControls (`performPrimaryAction`, `tryGrabTarget`, `toggleFreezeHeldObject`, `jump`)
 * - Detailed 3D Viewmodel Weapons:
 *   1) RCV2 Reality Crusher (spinning plasma core, copper coils, LCD mode screen, articulated claws, 3 modes)
 *   2) Forged Steel Crowbar (hexagonal crimson shaft, ribbed grip, curved gooseneck, split V-claw & chisel tip)
 *   3) 9mm Tactical/PM Pistol (reciprocating blowback slide, brass chamber port, tritium sights, trigger guard, hammer, barrel bore)
 * - GoreBox 2D Body Trauma Doll state for the Player (10 body parts with HP, bleeding & fractures) + Inventory/Backpack
 * - Solid 3D Collision Resolution against all static & dynamic objects
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

    // Player's 10 anatomical body parts for the 2D GoreBox Trauma Doll
    this.playerLimbs = {
      head: { label: 'Голова', hp: 100, maxHp: 100, bleeding: false, severed: false },
      upperTorso: { label: 'Грудь', hp: 100, maxHp: 100, bleeding: false, severed: false },
      abdomen: { label: 'Живот', hp: 100, maxHp: 100, bleeding: false, severed: false },
      upperArmL: { label: 'Л. Плечо', hp: 100, maxHp: 100, bleeding: false, severed: false },
      forearmL: { label: 'Л. Предплечье', hp: 100, maxHp: 100, bleeding: false, severed: false },
      upperArmR: { label: 'П. Плечо', hp: 100, maxHp: 100, bleeding: false, severed: false },
      forearmR: { label: 'П. Предплечье', hp: 100, maxHp: 100, bleeding: false, severed: false },
      thighL: { label: 'Л. Бедро', hp: 100, maxHp: 100, bleeding: false, severed: false },
      calfL: { label: 'Л. Голень', hp: 100, maxHp: 100, bleeding: false, severed: false },
      thighR: { label: 'П. Бедро', hp: 100, maxHp: 100, bleeding: false, severed: false },
      calfR: { label: 'П. Голень', hp: 100, maxHp: 100, bleeding: false, severed: false }
    };

    // Player Backpack Inventory items
    this.backpack = [
      { kind: 'bottle', name: '🍾 Стеклянная бутылка (Зелёная)' },
      { kind: 'crate_std', name: '📦 Деревянный ящик снабжения' },
      { kind: 'barrel_red', name: '🛢️ Бочка с пропаном (Взрывная)' }
    ];

    // Look angles
    this.yaw = 0;
    this.pitch = -0.06;
    this.isLocked = false;

    // Kinematic position & velocity
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

    // Input state
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
    // RCV2 Modes: 0 = Gravity Grab, 1 = Gore Ripper (Разрыв конечностей), 2 = Telekinesis Blast (Импульс)
    this.rcv2Mode = 0;
    this.pistolAuto = true;
    this.swingTimer = 0;
    this.shootCooldown = 0;
    this.recoilPitch = 0;

    // Held object or NPC limb + hovered target for HUD & 2D Doll
    this.heldTarget = null;
    this.hoveredTarget = null;
    this.lastInspectedNpc = null;
    this.holdDistance = 2.4;

    // Static map colliders
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
      position: new CANNON.Vec3(this.playerPos.x, 0.9, this.playerPos.z)
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
      this.onToast(this.flashlightOn ? '🔦 Фонарик включён' : '🔦 Фонарик выключен');
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

    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x989ea5, roughness: 0.76, metalness: 0.04 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2d2b6, roughness: 0.58, metalness: 0.03 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x3f2b21, roughness: 0.68, metalness: 0.06 });

    const buildArm = (isLeft) => {
      const armGroup = new THREE.Group();
      const s = isLeft ? -1 : 1;

      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.105, 0.22), sleeveMat);
      sleeve.position.set(0, -0.015, 0.16);
      armGroup.add(sleeve);

      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.092, 0.28), skinMat);
      forearm.position.set(0, -0.01, -0.05);
      armGroup.add(forearm);

      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.088, 0.115), gloveMat);
      glove.position.set(0, -0.008, -0.23);
      armGroup.add(glove);

      const fingerGroup = new THREE.Group();
      fingerGroup.position.set(0, -0.008, -0.30);
      for (let f = 0; f < 4; f++) {
        const fx = (f - 1.5) * 0.023;
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.058), skinMat);
        finger.position.set(fx, -0.006, -0.015);
        fingerGroup.add(finger);
      }

      const thumbGlove = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.048), gloveMat);
      thumbGlove.position.set(-s * 0.058, 0.006, 0.032);
      thumbGlove.rotation.y = s * 0.42;
      const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.038), skinMat);
      thumbTip.position.set(-s * 0.068, 0.006, 0.004);
      thumbTip.rotation.y = s * 0.42;
      fingerGroup.add(thumbGlove, thumbTip);

      armGroup.add(fingerGroup);
      armGroup.userData = { fingerGroup };
      return armGroup;
    };

    this.leftArm = buildArm(true);
    this.leftArm.position.set(-0.24, -0.22, -0.32);
    this.leftArm.rotation.set(0.12, -0.18, 0.08);

    this.rightArm = buildArm(false);
    this.rightArm.position.set(0.24, -0.22, -0.32);
    this.rightArm.rotation.set(0.12, 0.18, -0.08);

    this.rigRoot.add(this.leftArm, this.rightArm);
    this._buildViewmodelWeapons();
  }

  /**
   * Builds detailed, multi-part 3D models for:
   * 1) RCV2 Reality Crusher (spinning plasma helix, copper coils, LCD screen, articulated 3-prong emitter claws)
   * 2) Forged Steel Crowbar (hexagonal red shaft, ribbed grip, curved gooseneck, split V-claw & chisel tip)
   * 3) 9mm Tactical PM Pistol (reciprocating slide, ejection port with brass chamber, tritium sights, trigger & guard, muzzle bore)
   */
  _buildViewmodelWeapons() {
    // =========================================================================
    // 1. NEW RCV2 REALITY CRUSHER MODEL
    // =========================================================================
    this.rcv2Mesh = new THREE.Group();
    const gunmetalDark = new THREE.MeshStandardMaterial({ color: 0x161f2c, metalness: 0.85, roughness: 0.26 });
    const gunmetalLight = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.88, roughness: 0.22 });
    const copperCoilMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 });
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.3 });
    this.rcv2CoreMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // Rear receiver housing + ergonomic grip
    const rcvReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.115, 0.20), gunmetalDark);
    rcvReceiver.position.set(0, 0.055, -0.22);
    const rcvGrip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.13, 0.065), gunmetalDark);
    rcvGrip.position.set(0, -0.03, -0.19);
    rcvGrip.rotation.x = 0.22;

    // Top LCD Mode Display Screen
    this.rcv2ScreenMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.045, 0.025), gunmetalLight);
    screenFrame.position.set(0, 0.125, -0.16);
    screenFrame.rotation.x = -0.45;
    const screenPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.032), this.rcv2ScreenMat);
    screenPanel.position.set(0, 0, 0.014);
    screenFrame.add(screenPanel);

    // Side hazard strips & upper/lower containment rails
    const sideStripL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.022, 0.16), hazardMat);
    sideStripL.position.set(-0.048, 0.055, -0.22);
    const sideStripR = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.022, 0.16), hazardMat);
    sideStripR.position.set(0.048, 0.055, -0.22);

    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.28), gunmetalLight);
    topRail.position.set(0, 0.115, -0.38);
    const botRail = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.022, 0.28), gunmetalDark);
    botRail.position.set(0, 0.0, -0.38);

    // 3 Copper Electromagnetic Accelerator Coils around barrel
    for (const cz of [-0.34, -0.41, -0.48]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.009, 8, 18), copperCoilMat);
      coil.position.set(0, 0.058, cz);
      this.rcv2Mesh.add(coil);
    }

    // Spinning Plasma Core Assembly inside the cage
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

    // Front Muzzle Emitter Ring + 3 Articulated Claws
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

    // =========================================================================
    // 2. NEW FORGED STEEL CROWBAR MODEL (Монтировка-Гвоздодёр)
    // =========================================================================
    this.crowbarMesh = new THREE.Group();
    const crowbarRed = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.68, roughness: 0.34 });
    const bareSteel = new THREE.MeshStandardMaterial({ color: 0xdbeafe, metalness: 0.92, roughness: 0.18 });
    const gripRubber = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85, metalness: 0.1 });

    const cbGroup = new THREE.Group();
    cbGroup.position.set(0, 0.10, -0.28);
    cbGroup.rotation.x = -0.32;

    // Hexagonal crimson main shaft
    const hexShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.52, 6), crowbarRed);
    cbGroup.add(hexShaft);

    // Ribbed black grip section where hand holds it
    const gripCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0175, 0.17, 8), gripRubber);
    gripCyl.position.y = -0.10;
    cbGroup.add(gripCyl);

    // Curved Gooseneck Top Hook (3 angled segments)
    const neck1 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.075, 6), crowbarRed);
    neck1.position.set(0, 0.285, -0.015);
    neck1.rotation.x = 0.45;

    const neck2 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.075, 6), crowbarRed);
    neck2.position.set(0, 0.325, -0.058);
    neck2.rotation.x = 1.25;

    const neck3 = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.014, 0.075), bareSteel);
    neck3.position.set(0, 0.32, -0.115);
    neck3.rotation.x = 0.35;

    // Forked V-Notch Nail Puller Prongs (Polished Steel)
    const prongL = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.009, 0.065), bareSteel);
    prongL.position.set(-0.011, 0.295, -0.16);
    prongL.rotation.set(0.52, 0.08, 0);

    const prongR = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.009, 0.065), bareSteel);
    prongR.position.set(0.011, 0.295, -0.16);
    prongR.rotation.set(0.52, -0.08, 0);

    // Bottom Chisel Pry-Tip (Polished Steel)
    const bottomChisel = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.010), bareSteel);
    bottomChisel.position.set(0, -0.285, -0.01);
    bottomChisel.rotation.x = -0.22;

    cbGroup.add(neck1, neck2, neck3, prongL, prongR, bottomChisel);
    this.crowbarMesh.add(cbGroup);
    this.crowbarMesh.visible = false;
    this.rightArm.add(this.crowbarMesh);

    // =========================================================================
    // 3. NEW 9MM TACTICAL / PM PISTOL MODEL (With Blowback Slide & Details)
    // =========================================================================
    this.pistolMesh = new THREE.Group();
    const slideSteel = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.88, roughness: 0.24 });
    const frameSteel = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.75, roughness: 0.36 });
    const bakeliteGrip = new THREE.MeshStandardMaterial({ color: 0x5c2415, roughness: 0.55, metalness: 0.08 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 });
    const boreBlack = new THREE.MeshBasicMaterial({ color: 0x020617 });
    const sightGlow = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

    // Lower Receiver Frame + Under-Barrel Accessory Rail
    const lowerFrame = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.032, 0.23), frameSteel);
    lowerFrame.position.set(0, 0.042, -0.30);
    this.pistolMesh.add(lowerFrame);

    // Trigger Guard + Curved Trigger
    const guardBottom = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.075), frameSteel);
    guardBottom.position.set(0, 0.002, -0.265);
    const guardFront = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.032, 0.009), frameSteel);
    guardFront.position.set(0, 0.016, -0.30);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.026, 0.012), slideSteel);
    trigger.position.set(0, 0.018, -0.255);
    trigger.rotation.x = 0.35;
    this.pistolMesh.add(guardBottom, guardFront, trigger);

    // Contoured Grip + Bakelite Side Panels + Magazine Floorplate
    const gripCore = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.125, 0.062), frameSteel);
    gripCore.position.set(0, -0.012, -0.205);
    gripCore.rotation.x = 0.24;

    const panelL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.105, 0.052), bakeliteGrip);
    panelL.position.set(-0.019, 0, 0);
    const panelR = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.105, 0.052), bakeliteGrip);
    panelR.position.set(0.019, 0, 0);
    const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.012, 0.068), slideSteel);
    magPlate.position.set(0, -0.066, 0.002);
    gripCore.add(panelL, panelR, magPlate);
    this.pistolMesh.add(gripCore);

    // Fixed Rifled Inner Barrel + Dark Muzzle Bore + Brass Chamber Hood
    const innerBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.24, 12), slideSteel);
    innerBarrel.rotation.x = Math.PI / 2;
    innerBarrel.position.set(0, 0.068, -0.325);
    const muzzleBore = new THREE.Mesh(new THREE.CircleGeometry(0.008, 10), boreBlack);
    muzzleBore.rotation.y = Math.PI;
    muzzleBore.position.set(0, 0.068, -0.446);
    const brassChamber = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 0.048), brassMat);
    brassChamber.position.set(0.006, 0.072, -0.265);
    this.pistolMesh.add(innerBarrel, muzzleBore, brassChamber);

    // Rear Hammer
    this.pistolHammer = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.026, 0.018), slideSteel);
    this.pistolHammer.position.set(0, 0.065, -0.182);
    this.pistolHammer.rotation.x = -0.35;
    this.pistolMesh.add(this.pistolHammer);

    // Reciprocating Top Slide Group (Moves backward on gunshot recoil!)
    this.pistolSlide = new THREE.Group();
    this.pistolSlide.position.set(0, 0.072, -0.305);

    const slideMain = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.038, 0.26), slideSteel);
    this.pistolSlide.add(slideMain);

    // Rear slide serration grooves
    for (let s = 0; s < 5; s++) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.026, 0.004), frameSteel);
      groove.position.set(0, -0.002, 0.075 + s * 0.009);
      this.pistolSlide.add(groove);
    }

    // Front & Rear Iron Sights with Glowing Green Tritium Dots
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

    // Muzzle Flash Starburst
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
        case 'KeyR': this.cycleRcv2Mode(); break;
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

    this.rcv2Mesh.visible = slotNum === 2;
    this.crowbarMesh.visible = slotNum === 3;
    this.pistolMesh.visible = slotNum === 4;

    document.querySelectorAll('.hotbar-slot').forEach((el) => {
      el.classList.toggle('active', Number(el.dataset.slot) === slotNum);
    });
  }

  cycleRcv2Mode() {
    this.rcv2Mode = (this.rcv2Mode + 1) % 3;
    const colors = [0x38bdf8, 0xef4444, 0xa855f7];
    const names = [
      '⚡ RCV2: Грави-Захват',
      '🩸 RCV2: Разрыв конечностей (Gore Ripper)',
      '💥 RCV2: Телекинез-Импульс'
    ];
    const col = colors[this.rcv2Mode];
    this.rcv2CoreMat.color.setHex(col);
    this.rcv2ScreenMat.color.setHex(col);
    this.beamMat.color.setHex(col);
    if (this.onToast) this.onToast(names[this.rcv2Mode]);
    return names[this.rcv2Mode];
  }

  // ===========================================================================
  // PUBLIC ACTION METHODS FOR ANDROID TOUCH BUTTONS & DESKTOP
  // ===========================================================================

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

  /**
   * Called by the 🔥 Attack / Shoot / Launch button on Android and Left-Click on PC.
   */
  performPrimaryAction() {
    // If holding an object in Hands or RCV2, pressing 🔥 launches/throws it with high force!
    if (this.heldTarget) {
      this.releaseHeldObject(true);
      return;
    }

    const dmgBoost = this.adrenalineTimer > 0 ? 1.5 : 1.0;

    if (this.activeSlot === 1) {
      this._meleeAttack(20 * dmgBoost, 2.85, 12.5, 'Кулак');
    } else if (this.activeSlot === 2) {
      if (this.rcv2Mode === 0) {
        // Mode 0: Gravity Grab
        this.tryGrabTarget();
      } else if (this.rcv2Mode === 1) {
        // Mode 1: Gore Ripper (Instantly rips off targeted NPC limb or shatters prop!)
        const hit = this._raycastCenter(15.0);
        this.swingTimer = 0.26;
        this.sound.playGoreSever();
        if (hit && hit.npc && hit.limb) {
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
          if (hit.limb.severable && !hit.limb.severed) {
            hit.npc.severLimb(hit.limb, dir.clone().multiplyScalar(22));
            if (this.onToast) this.onToast(`🩸 Оторвана конечность: ${hit.limb.label}!`);
          } else {
            hit.npc.damageLimb(hit.limb, 45, hit.point, dir.clone().multiplyScalar(25), 'slash', true);
          }
          if (this.onHitmarker) this.onHitmarker();
          if (this.onPlayerAttackedNPC) this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
        } else if (hit && hit.prop) {
          this.propsManager.damageProp(hit.prop, 120, hit.point);
          if (this.onHitmarker) this.onHitmarker();
        }
      } else {
        // Mode 2: Telekinesis Impulse Wave
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
          hit.npc.damageLimb(hit.limb, 32, hit.point, dir.clone().multiplyScalar(28), 'slash', true);
          hit.npc.enterRagdoll(3.8, dir.multiplyScalar(16));
          if (this.onHitmarker) this.onHitmarker();
          if (this.onPlayerAttackedNPC) this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
        }
      }
    } else if (this.activeSlot === 3) {
      this._meleeAttack(38 * dmgBoost, 3.2, 19.0, 'Монтировка');
    } else if (this.activeSlot === 4) {
      this._firePistol();
    }
  }

  /**
   * Called by the ✋ Grab button on Android and [E] on PC.
   */
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
        this.onToast(`✋ Захвачено: ${hit.prop.name}`);
      }
      return true;
    } else if (hit.npc && hit.limb) {
      this.lastInspectedNpc = hit.npc;
      if (!hit.limb.severed) {
        hit.npc.enterRagdoll(3.8);
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
        this.onToast(`✋ Схвачен: ${hit.npc.name} (${hit.limb.label})`);
      }
      return true;
    }
    return false;
  }

  /**
   * Called by the ❄️ Freeze / Mode button on Android and Right-Click on PC.
   */
  toggleFreezeHeldObject() {
    if (this.heldTarget) {
      const b = this.heldTarget.body;
      if (b.type === CANNON.Body.STATIC) {
        b.type = CANNON.Body.DYNAMIC;
        b.updateMassProperties();
        if (this.onToast) this.onToast('🔓 Объект разморожен');
      } else {
        b.type = CANNON.Body.STATIC;
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
        if (this.onToast) this.onToast('❄️ Объект заморожен в воздухе');
      }
      this.heldTarget = null;
      this.beamLine.visible = false;
      return;
    }

    if (this.activeSlot === 2) {
      this.cycleRcv2Mode();
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
          npc.damageLimb(limb, 30, limb.mesh.position, dir.clone().multiplyScalar(20), 'slash', true);
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
      hit.npc.damageLimb(hit.limb, 18, hit.point, dir.clone().multiplyScalar(22), 'slash', true);
      hit.npc.enterRagdoll(3.2, dir.clone().multiplyScalar(9.5));
      if (this.onHitmarker) this.onHitmarker();
      if (this.onPlayerAttackedNPC) {
        this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
      }
    }
  }

  _meleeAttack(damage, range, force, weaponLabel) {
    if (this.swingTimer > 0.08) return;
    this.swingTimer = 0.32;
    this.sound.playFootstep(false);

    const hit = this._raycastCenter(range);
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
      hit.npc.damageLimb(hit.limb, damage, hit.point, dir.clone().multiplyScalar(force * 1.4), 'slash', true);
      if (this.onHitmarker) this.onHitmarker();
      if (this.onPlayerAttackedNPC) {
        this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
      }
    }
  }

  _firePistol() {
    if (this.shootCooldown > 0) return;
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

    const hit = this._raycastCenter(55.0);
    if (!hit) return;

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
      hit.npc.damageLimb(hit.limb, 25, hit.point, dir.clone().multiplyScalar(22), 'bullet', true);
      if (this.onHitmarker) this.onHitmarker();
      if (this.onPlayerAttackedNPC) {
        this.onPlayerAttackedNPC(this.getPosition(), hit.npc);
      }
    }
  }

  // ===========================================================================
  // INVENTORY, MEDICAL & 2D BODY TRAUMA DOLL METHODS
  // ===========================================================================

  takeDamage(amount, knockback = null, targetLimbKey = null) {
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.55);
      this.armor = Math.max(0, this.armor - absorbed);
      dmg -= absorbed;
    }

    this.hp = Math.max(0, this.hp - dmg);
    this.addCameraShake(0.28);

    // Flash red damage vignette
    const vig = document.getElementById('damage-vignette');
    if (vig) {
      vig.classList.add('active');
      clearTimeout(this._vigTimer);
      this._vigTimer = setTimeout(() => vig.classList.remove('active'), 260);
    }

    // Apply localized injury to one of the player's limbs on the 2D GoreBox Body Doll!
    const keys = Object.keys(this.playerLimbs);
    const chosenKey = targetLimbKey || keys[Math.floor(Math.random() * keys.length)];
    const limb = this.playerLimbs[chosenKey];
    if (limb) {
      limb.hp = Math.max(5, limb.hp - dmg * 2.1);
      if (limb.hp < 55) {
        limb.bleeding = true;
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
        this.onToast('💀 Вы погибли и возродились на платформе!');
      }
    }
  }

  useMedkit(silent = false) {
    this.hp = this.maxHp;
    for (const k of Object.keys(this.playerLimbs)) {
      this.playerLimbs[k].hp = this.playerLimbs[k].maxHp;
      this.playerLimbs[k].bleeding = false;
      this.playerLimbs[k].severed = false;
    }
    if (!silent && this.onToast) {
      this.onToast('💉 Аптечка использована: 100 HP, все травмы тела вылечены!');
    }
  }

  useBandage() {
    this.hp = Math.min(this.maxHp, this.hp + 25);
    for (const k of Object.keys(this.playerLimbs)) {
      this.playerLimbs[k].bleeding = false;
      this.playerLimbs[k].hp = Math.min(this.playerLimbs[k].maxHp, this.playerLimbs[k].hp + 35);
    }
    if (this.onToast) {
      this.onToast('🩹 Кровотечение остановлено, наложены повязки (+25 HP)');
    }
  }

  equipArmor() {
    this.armor = 100;
    if (this.onToast) {
      this.onToast('🛡️ Бронежилет «Междугорный» надет (100 Брони)');
    }
  }

  useAdrenaline() {
    this.adrenalineTimer = 20.0;
    this.hp = Math.min(this.maxHp, this.hp + 30);
    if (this.onToast) {
      this.onToast('💊 Адреналин вколот! Скорость и сила удара увеличены на 20 сек!');
    }
  }

  storeHeldInBackpack() {
    if (!this.heldTarget || !this.heldTarget.prop) {
      if (this.onToast) this.onToast('Сначала возьмите предмет в руки (✋), чтобы убрать в рюкзак');
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

    this.backpack.push({ kind, name: `📦 ${prop.name}` });

    // Remove prop from world
    this.scene.remove(prop.mesh);
    this.world.removeBody(prop.body);
    const idx = this.propsManager.props.indexOf(prop);
    if (idx !== -1) this.propsManager.props.splice(idx, 1);

    if (this.onToast) this.onToast(`🎒 Убрано в инвентарь: ${prop.name}`);
    return true;
  }

  _raycastCenter(maxDist = 6.0) {
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
    if (intersects.length === 0) return null;

    const first = intersects[0];
    let obj = first.object;
    while (obj && (!obj.userData || (!obj.userData.prop && !obj.userData.npc))) {
      obj = obj.parent;
    }
    if (!obj || !obj.userData) return null;

    return {
      point: first.point,
      distance: first.distance,
      prop: obj.userData.prop || null,
      npc: obj.userData.npc || null,
      limb: obj.userData.limb || null
    };
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
    if (this.recoilPitch > 0) this.recoilPitch = Math.max(0, this.recoilPitch - dt * 0.22);
    if (this.cameraShake > 0) this.cameraShake = Math.max(0, this.cameraShake - dt * 2.2);
    if (this.adrenalineTimer > 0) this.adrenalineTimer = Math.max(0, this.adrenalineTimer - dt);

    // Slow bleed tick if player has untreated bleeding wounds
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

    if (this.mouseDownLeft && this.activeSlot === 4 && this.pistolAuto && this.shootCooldown <= 0) {
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

    // Leg injury penalty (unless adrenaline active)
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
        const minR = r + 0.32;
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

    const swayX = Math.sin(t * 2.1) * 0.008 + Math.cos(this.walkBobTimer * 0.5) * 0.022 * walkAmp;
    const swayY = Math.cos(t * 1.8) * 0.008 + Math.sin(this.walkBobTimer) * 0.025 * walkAmp;

    const swingPhase = this.swingTimer > 0 ? Math.sin((this.swingTimer / 0.32) * Math.PI) : 0;
    const isHoldingHands = Boolean(this.heldTarget && this.heldTarget.mode === 'hands');

    if (isHoldingHands) {
      this.leftArm.position.set(-0.16 + swayX, -0.16 + swayY, -0.38);
      this.leftArm.rotation.set(0.32, -0.35, 0.15);
      this.rightArm.position.set(0.16 + swayX, -0.16 + swayY, -0.38);
      this.rightArm.rotation.set(0.32, 0.35, -0.15);
    } else if (this.activeSlot === 1) {
      this.leftArm.position.set(-0.23 + swayX, -0.21 + swayY, -0.31 - swingPhase * 0.08);
      this.leftArm.rotation.set(0.18, -0.22, 0.08);
      this.rightArm.position.set(0.23 + swayX - swingPhase * 0.08, -0.20 + swayY + swingPhase * 0.07, -0.31 - swingPhase * 0.24);
      this.rightArm.rotation.set(0.18 + swingPhase * 0.45, 0.22 + swingPhase * 0.25, -0.08);
    } else if (this.activeSlot === 2) {
      this.leftArm.position.set(-0.18 + swayX, -0.23 + swayY, -0.34);
      this.leftArm.rotation.set(0.18, -0.38, 0.12);
      this.rightArm.position.set(0.20 + swayX, -0.20 + swayY, -0.27 - swingPhase * 0.08);
      this.rightArm.rotation.set(0.06, 0.08, -0.04);

      // Spin RCV2 plasma rotor & flare emitter claws when active!
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
      this.rightArm.position.set(0.24 + swayX - swingPhase * 0.12, -0.22 + swayY + swingPhase * 0.1, -0.30 - swingPhase * 0.22);
      this.rightArm.rotation.set(0.12 - swingPhase * 0.75, 0.14 + swingPhase * 0.3, -0.08 - swingPhase * 0.35);
    } else if (this.activeSlot === 4) {
      const recoil = this.shootCooldown > 0 ? (this.shootCooldown / 0.16) : 0;
      this.leftArm.position.set(0.06 + swayX, -0.23 + swayY, -0.32);
      this.leftArm.rotation.set(0.22, -0.58, 0.18);
      this.rightArm.position.set(0.16 + swayX, -0.20 + swayY + recoil * 0.04, -0.29 + recoil * 0.07);
      this.rightArm.rotation.set(0.08 + recoil * 0.28, 0.06, -0.02);

      // Animate reciprocating blowback slide & hammer on the 9mm Pistol!
      if (this.pistolSlide) {
        this.pistolSlide.position.z = -0.305 + recoil * 0.055;
      }
      if (this.pistolHammer) {
        this.pistolHammer.rotation.x = -0.35 - recoil * 0.85;
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
          promptEl.textContent = `В руках: ${this.heldTarget.prop.name} (🔥 Бросить | ❄️ Заморозить)`;
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
      const sevStr = hit.limb.severed ? ' [ОТОРВАНА]' : ` [${limbHp} HP]`;
      promptEl.textContent = `${hit.npc.name} — ${hit.limb.label}${sevStr}`;
      if (crosshair) crosshair.classList.add('active-target');
    } else {
      promptEl.classList.add('hidden');
      if (crosshair) crosshair.classList.remove('active-target');
    }
  }
}

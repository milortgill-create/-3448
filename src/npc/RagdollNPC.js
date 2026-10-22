import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * GoreBox Goredoll Active-Ragdoll NPC with:
 * - Authentic Goredoll 3D blocky proportions matching reference photo
 * - Dynamic Animated Canvas Face with 6 Emotions (CALM, CURIOUS, FEAR, ANGRY, PAIN, DEAD), eye blinking & pupil tracking
 * - True Bipedal Kinematic Stride Animation (real lifting feet & swinging knees/hips — zero magical dragging)
 * - GoreBox 3D Textured Wounds (bullet holes, slashes, recessed flesh cavities)
 * - Full Limb Dismemberment & Severing with protruding white Bone (Костная ткань), Viscera (Внутренности), and Arterial Blood Flow
 * - Tactical AI: Walk -> Stop & Look Around -> Fear/Shock when player shoots an NPC -> Retaliate (Armed Counter-Attack!)
 */
export class RagdollNPC {
  constructor(id, config, scene, world, propsManager, soundManager) {
    this.id = id;
    this.name = config.name || `НПС-${id}`;
    this.role = config.role || 'Выживший';
    this.personality = config.personality || 'tactical';
    this.hasPistol = config.hasPistol !== undefined ? config.hasPistol : id % 2 === 1;

    this.scene = scene;
    this.world = world;
    this.propsManager = propsManager;
    this.sound = soundManager;
    this.goreTextures = propsManager.textures.gore;

    this.maxHp = 100;
    this.hp = 100;
    this.dead = false;

    // Ragdoll & posture state
    this.isRagdoll = false;
    this.ragdollTimer = 0;
    this.recovering = false;
    this.recoverProgress = 0;

    // Ground position & orientation for true bipedal walking
    this.groundPos = (config.position || new THREE.Vector3(0, 0, 0)).clone();
    this.groundPos.y = 0;
    this.facingYaw = config.yaw || 0;
    this.walkPhase = 0;
    this.currentSpeed = 0;
    this.headYawOffset = 0;
    this.headPitchOffset = 0;
    this.targetHeadYaw = 0;
    this.targetHeadPitch = 0;

    // AI State Machine:
    // 'WALK_PATROL' | 'STOP_LOOK' | 'INSPECT_PROP' | 'FEAR_SHOCK' | 'RETALIATE' | 'CRAWL_AGONY' | 'IDLE_DUMMY'
    this.aiState = this.personality === 'dummy' ? 'IDLE_DUMMY' : 'STOP_LOOK';
    this.stateTimer = 2.0 + Math.random() * 2.0;
    this.lookSubTimer = 0;
    this.targetPoint = this.groundPos.clone();
    this.dangerSourcePos = null;
    this.hostileToPlayer = this.personality === 'hostile';
    this.attackCooldown = 0;
    this.meleeSwingTimer = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 1.5;

    // Face Emotion & Animation State
    this.emotion = 'CALM'; // 'CALM' | 'CURIOUS' | 'FEAR' | 'ANGRY' | 'PAIN' | 'DEAD'
    this.emotionLockTimer = 0;
    this.blinkTimer = 2.2 + Math.random() * 2.5;
    this.isBlinking = false;
    this.eyeLookX = 0;
    this.eyeLookY = 0;
    this.faceBloodSplats = [];

    // Physics & Gore collections
    this.limbs = {};
    this.limbList = [];
    this.constraints = [];
    this.bloodParticles = [];
    this.stumpEmitters = []; // Continuous arterial blood fountains from severed limbs/wounds
    this.muzzleFlashTimer = 0;

    this._initMaterials();
    this._initFaceCanvas();
    this._buildArticulatedBody(this.groundPos);
    this._createDOMLabel();
  }

  _initMaterials() {
    this.skinMat = new THREE.MeshStandardMaterial({
      color: 0xf2d2b6,
      roughness: 0.58,
      metalness: 0.03
    });

    this.hairMat = new THREE.MeshStandardMaterial({
      color: 0x483126,
      roughness: 0.85,
      metalness: 0.02
    });

    this.shirtChestMat = new THREE.MeshStandardMaterial({
      color: 0x989ea5,
      roughness: 0.76,
      metalness: 0.04
    });

    this.shirtShoulderMat = new THREE.MeshStandardMaterial({
      color: 0xa1a7ae,
      roughness: 0.74,
      metalness: 0.04
    });

    this.shirtMidMat = new THREE.MeshStandardMaterial({
      color: 0x90969d,
      roughness: 0.78,
      metalness: 0.04
    });

    this.shirtWaistMat = new THREE.MeshStandardMaterial({
      color: 0x888e95,
      roughness: 0.8,
      metalness: 0.04
    });

    this.gloveMat = new THREE.MeshStandardMaterial({
      color: 0x3f2b21,
      roughness: 0.68,
      metalness: 0.06
    });

    this.pantsMat = new THREE.MeshStandardMaterial({
      color: 0x44494f,
      roughness: 0.82,
      metalness: 0.05
    });

    this.bootMat = new THREE.MeshStandardMaterial({
      color: 0x583e31,
      roughness: 0.65,
      metalness: 0.08
    });

    this.bootSoleMat = new THREE.MeshStandardMaterial({
      color: 0x261a14,
      roughness: 0.88,
      metalness: 0.05
    });

    // Gore materials (Bone, Viscera, Muscle Cross-Section)
    this.goreCrossMat = new THREE.MeshStandardMaterial({
      map: this.goreTextures ? this.goreTextures.goreCrossSection : null,
      color: 0xdc2626,
      roughness: 0.35,
      metalness: 0.08
    });

    this.boneMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.42,
      metalness: 0.05
    });

    this.marrowMat = new THREE.MeshBasicMaterial({
      color: 0x881337
    });

    this.visceraMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0x2a0408,
      emissiveIntensity: 0.35,
      roughness: 0.22,
      metalness: 0.12
    });
  }

  /**
   * Creates a live 256x256 CanvasTexture for the Goredoll's animated face.
   */
  _initFaceCanvas() {
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256;
    this.faceCanvas.height = 256;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceMat = new THREE.MeshStandardMaterial({
      map: this.faceTexture,
      roughness: 0.55,
      metalness: 0.03
    });
    this._redrawFace();
  }

  setEmotion(newEmotion, lockDuration = 0) {
    if (this.dead) {
      newEmotion = 'DEAD';
    }
    if (this.emotionLockTimer > 0 && newEmotion !== 'DEAD' && newEmotion !== 'PAIN' && newEmotion !== 'FEAR') {
      return;
    }
    const changed = this.emotion !== newEmotion;
    this.emotion = newEmotion;
    if (lockDuration > 0) {
      this.emotionLockTimer = Math.max(this.emotionLockTimer, lockDuration);
    }
    if (changed) {
      this._redrawFace();
    }
  }

  _redrawFace() {
    const ctx = this.faceCtx;
    if (!ctx) return;

    // 1. Base Goredoll peach skin
    ctx.fillStyle = '#f2d2b6';
    ctx.fillRect(0, 0, 256, 256);

    // Subtle blocky nose bridge shadow in the center
    ctx.fillStyle = 'rgba(186, 138, 104, 0.42)';
    ctx.fillRect(118, 110, 20, 38);
    ctx.fillStyle = 'rgba(156, 108, 78, 0.45)';
    ctx.fillRect(116, 142, 8, 6);
    ctx.fillRect(132, 142, 8, 6);

    const em = this.dead ? 'DEAD' : this.emotion;
    const lx = Math.max(-10, Math.min(10, this.eyeLookX * 10));
    const ly = Math.max(-6, Math.min(6, this.eyeLookY * 6));

    // 2. Draw Left & Right Eyes (x = 76, 180; y = 104)
    const drawEye = (cx, cy, isLeft) => {
      if (em === 'DEAD') {
        // X-shaped dead eyes
        ctx.strokeStyle = '#291811';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy - 12);
        ctx.lineTo(cx + 16, cy + 12);
        ctx.moveTo(cx + 16, cy - 12);
        ctx.lineTo(cx - 16, cy + 12);
        ctx.stroke();
        return;
      }

      if (this.isBlinking || (em === 'PAIN' && isLeft)) {
        // Closed wincing/blinking eyelid line
        ctx.strokeStyle = '#2b1911';
        ctx.lineWidth = 7;
        ctx.beginPath();
        if (em === 'PAIN') {
          ctx.moveTo(cx - 18, cy - 8);
          ctx.lineTo(cx + 12, cy + 2);
          ctx.lineTo(cx - 18, cy + 10);
        } else {
          ctx.moveTo(cx - 18, cy);
          ctx.lineTo(cx + 18, cy);
        }
        ctx.stroke();
        return;
      }

      // Eye sclera (white)
      const eyeH = em === 'FEAR' ? 34 : em === 'ANGRY' ? 20 : 24;
      const eyeW = em === 'FEAR' ? 38 : 34;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cx - eyeW / 2, cy - eyeH / 2, eyeW, eyeH);
      ctx.strokeStyle = '#3b2419';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - eyeW / 2, cy - eyeH / 2, eyeW, eyeH);

      // Pupil (constricted when terrified, sharp when angry)
      const pSize = em === 'FEAR' ? 9 : 13;
      ctx.fillStyle = em === 'ANGRY' ? '#1e1b18' : '#1f2937';
      ctx.fillRect(cx + lx - pSize / 2, cy + ly - pSize / 2, pSize, pSize);

      // Tiny eye glint
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + lx - pSize / 2 + 2, cy + ly - pSize / 2 + 2, 4, 4);
    };

    drawEye(76, 104, true);
    drawEye(180, 104, false);

    // 3. Draw Eyebrows based on Emotion
    ctx.strokeStyle = '#3a241a';
    ctx.lineWidth = 9;
    ctx.lineCap = 'square';

    if (em === 'ANGRY') {
      // Deep V-slanted furious brows
      ctx.beginPath();
      ctx.moveTo(52, 74);
      ctx.lineTo(100, 88);
      ctx.moveTo(204, 74);
      ctx.lineTo(156, 88);
      ctx.stroke();
    } else if (em === 'FEAR') {
      // High arched worried/shocked brows
      ctx.beginPath();
      ctx.moveTo(52, 82);
      ctx.lineTo(98, 66);
      ctx.moveTo(204, 82);
      ctx.lineTo(158, 66);
      ctx.stroke();

      // Cold sweat droplet on temple
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(214, 92, 8, 16);
    } else if (em === 'CURIOUS') {
      // One eyebrow raised inquisitive look
      ctx.beginPath();
      ctx.moveTo(54, 82);
      ctx.lineTo(98, 82);
      ctx.moveTo(158, 72);
      ctx.lineTo(202, 68);
      ctx.stroke();
    } else if (em === 'PAIN') {
      ctx.beginPath();
      ctx.moveTo(54, 86);
      ctx.lineTo(98, 74);
      ctx.moveTo(202, 86);
      ctx.lineTo(158, 74);
      ctx.stroke();
    } else {
      // Calm neutral brows
      ctx.beginPath();
      ctx.moveTo(54, 80);
      ctx.lineTo(98, 80);
      ctx.moveTo(158, 80);
      ctx.lineTo(202, 80);
      ctx.stroke();
    }

    // 4. Draw Mouth based on Emotion
    if (em === 'FEAR') {
      // Wide open screaming/gasping blocky mouth
      ctx.fillStyle = '#2a080c';
      ctx.fillRect(92, 168, 72, 36);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(96, 170, 64, 8); // Upper teeth
      ctx.fillStyle = '#be123c';
      ctx.fillRect(108, 190, 40, 12); // Tongue
    } else if (em === 'ANGRY') {
      // Clenched gritted teeth snarl
      ctx.fillStyle = '#2a080c';
      ctx.fillRect(88, 172, 80, 22);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(92, 175, 72, 16);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(92, 183);
      ctx.lineTo(164, 183);
      for (let tx = 106; tx <= 150; tx += 14) {
        ctx.moveTo(tx, 175);
        ctx.lineTo(tx, 191);
      }
      ctx.stroke();
    } else if (em === 'PAIN') {
      // Jagged grimace/groan
      ctx.fillStyle = '#3b070b';
      ctx.fillRect(86, 168, 84, 30);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(92, 171, 72, 9);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(145, 198, 10, 26); // Blood drip from corner of mouth
    } else if (em === 'DEAD') {
      // Slack open mouth with blood trickle
      ctx.fillStyle = '#271214';
      ctx.fillRect(100, 174, 56, 20);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(136, 188, 12, 42);
    } else if (em === 'CURIOUS') {
      ctx.fillStyle = '#4a2c20';
      ctx.fillRect(110, 176, 36, 10);
    } else {
      // Calm neutral mouth line
      ctx.fillStyle = '#4a2c20';
      ctx.fillRect(98, 178, 60, 7);
    }

    // 5. Persistent facial blood splatters from wounds/impacts
    for (const sp of this.faceBloodSplats) {
      ctx.fillStyle = sp.dark ? 'rgba(105, 14, 18, 0.9)' : 'rgba(185, 28, 28, 0.85)';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      ctx.fill();
    }

    this.faceTexture.needsUpdate = true;
  }

  _buildArticulatedBody(origin) {
    const createLimb = (key, label, w, h, d, x, y, z, mass, mat, maxLimbHp = 45, severable = true) => {
      const group = new THREE.Group();
      const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      boxMesh.castShadow = true;
      boxMesh.receiveShadow = true;
      group.add(boxMesh);
      group.position.set(x, y, z);
      this.scene.add(group);

      const body = new CANNON.Body({
        mass,
        shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
        position: new CANNON.Vec3(x, y, z),
        linearDamping: 0.25,
        angularDamping: 0.45
      });

      const limb = {
        key,
        label,
        dims: { w, h, d },
        mesh: group,
        coreMesh: boxMesh,
        body,
        npc: this,
        hp: maxLimbHp,
        maxHp: maxLimbHp,
        severable,
        severed: false,
        jointConstraint: null,
        parentLimb: null,
        childLimb: null,
        jointLocalOnParent: null,
        jointLocalOnSelf: null,
        wounds: []
      };

      body.userData = { type: 'npc_limb', npc: this, limb };
      boxMesh.userData = { npc: this, limb };

      body.addEventListener('collide', (e) => {
        if (this.dead && !limb.severed && Math.abs(e.contact.getImpactVelocityAlongNormal()) < 7) return;
        const relVel = Math.abs(e.contact.getImpactVelocityAlongNormal());
        const otherBody = e.body;
        if (otherBody && otherBody.userData && otherBody.userData.type === 'prop') {
          if (relVel > 5.2) {
            const propMass = otherBody.mass || 5;
            const dmg = (relVel - 4.2) * Math.min(4.2, propMass * 0.28);
            this.damageLimb(limb, dmg, group.position, null, 'slash');
            if (relVel > 7.5 && !limb.severed) {
              this.enterRagdoll(2.4);
            }
          }
        } else if (this.isRagdoll && relVel > 10.5) {
          this.damageLimb(limb, (relVel - 9.5) * 3.8, group.position, null, 'slash');
        }
      });

      this.world.addBody(body);
      this.limbs[key] = limb;
      this.limbList.push(limb);
      return limb;
    };

    const ox = origin.x;
    const oz = origin.z;

    // 1. Pelvis / Waist
    const pelvis = createLimb('pelvis', 'Таз', 0.28, 0.16, 0.19, ox, 0.90, oz, 8, this.shirtWaistMat, 120, false);

    // 2. Abdomen
    const abdomen = createLimb('abdomen', 'Живот', 0.30, 0.18, 0.20, ox, 1.07, oz, 8, this.shirtMidMat, 90, false);
    const seamBelt = new THREE.Mesh(
      new THREE.BoxGeometry(0.306, 0.015, 0.206),
      new THREE.MeshStandardMaterial({ color: 0x6f757c, roughness: 0.9 })
    );
    seamBelt.position.y = -0.08;
    abdomen.mesh.add(seamBelt);

    // 3. Upper Torso / Chest
    const upperTorso = createLimb('upperTorso', 'Грудная клетка', 0.36, 0.28, 0.22, ox, 1.30, oz, 11, this.shirtChestMat, 110, false);
    const shCapL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.21), this.shirtShoulderMat);
    shCapL.position.set(-0.20, 0.07, 0);
    const shCapR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.21), this.shirtShoulderMat);
    shCapR.position.set(0.20, 0.07, 0);
    const collarSkin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.226), this.skinMat);
    collarSkin.position.set(0, 0.125, 0);
    upperTorso.mesh.add(shCapL, shCapR, collarSkin);

    // 4. Neck & Head (with dynamic emotion face plane on +Z!)
    const neck = createLimb('neck', 'Шея', 0.12, 0.08, 0.12, ox, 1.47, oz, 2, this.skinMat, 40, false);
    const head = createLimb('head', 'Голова', 0.22, 0.24, 0.22, ox, 1.62, oz, 4.5, this.skinMat, 35, true);

    const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.232, 0.068, 0.232), this.hairMat);
    hairCap.position.set(0, 0.095, 0);
    head.mesh.add(hairCap);

    // Front animated face plane (+Z local face of head)
    const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.218, 0.218), this.faceMat);
    facePlane.position.set(0, -0.01, 0.111);
    head.mesh.add(facePlane);

    // 5. Left & Right Upper Arms (Short grey sleeves) & Forearms (Bare skin + fingerless gloves + weapon mount)
    const upperArmL = createLimb('upperArmL', 'Левое плечо', 0.12, 0.25, 0.12, ox - 0.26, 1.26, oz, 2.6, this.shirtChestMat, 38, true);
    const forearmL = createLimb('forearmL', 'Левое предплечье', 0.105, 0.25, 0.105, ox - 0.26, 0.99, oz, 2.0, this.skinMat, 34, true);
    this._addGoredollHandDetails(forearmL.mesh, true);

    const upperArmR = createLimb('upperArmR', 'Правое плечо', 0.12, 0.25, 0.12, ox + 0.26, 1.26, oz, 2.6, this.shirtChestMat, 38, true);
    const forearmR = createLimb('forearmR', 'Правое предплечье', 0.105, 0.25, 0.105, ox + 0.26, 0.99, oz, 2.0, this.skinMat, 34, true);
    this._addGoredollHandDetails(forearmR.mesh, false);

    // Equippable 3D Weapon Mesh on Right Hand (hidden while peaceful, shown when retaliating!)
    this.weaponMeshGroup = this._createEquippedWeaponMesh();
    this.weaponMeshGroup.visible = this.hostileToPlayer;
    forearmR.mesh.add(this.weaponMeshGroup);

    // 6. Left & Right Thighs & Calves
    const thighL = createLimb('thighL', 'Левое бедро', 0.135, 0.36, 0.145, ox - 0.085, 0.63, oz, 4.5, this.pantsMat, 44, true);
    const calfL = createLimb('calfL', 'Левая голень', 0.125, 0.38, 0.135, ox - 0.085, 0.24, oz, 3.8, this.pantsMat, 38, true);
    this._addGoredollBootDetails(calfL.mesh);

    const thighR = createLimb('thighR', 'Правое бедро', 0.135, 0.36, 0.145, ox + 0.085, 0.63, oz, 4.5, this.pantsMat, 44, true);
    const calfR = createLimb('calfR', 'Правая голень', 0.125, 0.38, 0.135, ox + 0.085, 0.24, oz, 3.8, this.pantsMat, 38, true);
    this._addGoredollBootDetails(calfR.mesh);

    // Connect all joints with PointToPointConstraints and store references for dismemberment!
    const connect = (parentLimb, childLimb, pivotParent, pivotChild) => {
      const c = new CANNON.PointToPointConstraint(
        parentLimb.body,
        new CANNON.Vec3(pivotParent[0], pivotParent[1], pivotParent[2]),
        childLimb.body,
        new CANNON.Vec3(pivotChild[0], pivotChild[1], pivotChild[2])
      );
      c.collideConnected = false;
      this.world.addConstraint(c);
      this.constraints.push(c);

      childLimb.jointConstraint = c;
      childLimb.parentLimb = parentLimb;
      childLimb.jointLocalOnParent = new THREE.Vector3(pivotParent[0], pivotParent[1], pivotParent[2]);
      childLimb.jointLocalOnSelf = new THREE.Vector3(pivotChild[0], pivotChild[1], pivotChild[2]);
      parentLimb.childLimb = childLimb;
    };

    connect(pelvis, abdomen, [0, 0.08, 0], [0, -0.09, 0]);
    connect(abdomen, upperTorso, [0, 0.09, 0], [0, -0.14, 0]);
    connect(upperTorso, neck, [0, 0.14, 0], [0, -0.04, 0]);
    connect(neck, head, [0, 0.04, 0], [0, -0.12, 0]);

    connect(upperTorso, upperArmL, [-0.24, 0.10, 0], [0, 0.12, 0]);
    connect(upperArmL, forearmL, [0, -0.13, 0], [0, 0.12, 0]);

    connect(upperTorso, upperArmR, [0.24, 0.10, 0], [0, 0.12, 0]);
    connect(upperArmR, forearmR, [0, -0.13, 0], [0, 0.12, 0]);

    connect(pelvis, thighL, [-0.085, -0.08, 0], [0, 0.18, 0]);
    connect(thighL, calfL, [0, -0.18, 0], [0, 0.19, 0]);

    connect(pelvis, thighR, [0.085, -0.08, 0], [0, 0.18, 0]);
    connect(thighR, calfR, [0, -0.18, 0], [0, 0.19, 0]);

    for (const l of this.limbList) {
      l.mesh.traverse((child) => {
        if (child.isMesh) {
          child.userData = { npc: this, limb: l };
        }
      });
    }
  }

  _addGoredollHandDetails(forearmMesh, isLeft) {
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.114, 0.09, 0.114), this.gloveMat);
    glove.position.set(0, -0.10, 0);
    forearmMesh.add(glove);

    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.048, 0.102), this.skinMat);
    fingers.position.set(0, -0.165, 0);
    forearmMesh.add(fingers);

    const side = isLeft ? 1 : -1;
    const thumbGlove = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.045, 0.042), this.gloveMat);
    thumbGlove.position.set(side * 0.065, -0.095, 0.025);
    const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.036), this.skinMat);
    thumbTip.position.set(side * 0.065, -0.13, 0.025);
    forearmMesh.add(thumbGlove, thumbTip);
  }

  _addGoredollBootDetails(calfMesh) {
    const ankleBoot = new THREE.Mesh(new THREE.BoxGeometry(0.136, 0.12, 0.146), this.bootMat);
    ankleBoot.position.set(0, -0.11, 0);
    calfMesh.add(ankleBoot);

    const footBoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.085, 0.22), this.bootMat);
    footBoot.position.set(0, -0.175, 0.038);
    calfMesh.add(footBoot);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.144, 0.026, 0.226), this.bootSoleMat);
    sole.position.set(0, -0.225, 0.038);
    calfMesh.add(sole);
  }

  _createEquippedWeaponMesh() {
    const g = new THREE.Group();
    g.position.set(0, -0.16, 0.06);
    if (this.hasPistol) {
      const slideMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.88, roughness: 0.25 });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.75, roughness: 0.35 });
      const gripMat = new THREE.MeshStandardMaterial({ color: 0x5c2415, roughness: 0.55 });
      const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 });

      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.028, 0.19), frameMat);
      frame.position.set(0, -0.025, 0.06);
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.034, 0.21), slideMat);
      slide.position.set(0, -0.048, 0.065);
      const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, 0.04), brassMat);
      chamber.position.set(0.006, -0.048, 0.04);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.21, 10), slideMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, -0.046, 0.08);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.105, 0.052), gripMat);
      grip.position.set(0, 0.01, -0.01);
      grip.rotation.x = -0.2;
      g.add(frame, slide, chamber, barrel, grip);

      this.muzzleFlashMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      this.muzzleFlashMesh.position.set(0, -0.046, 0.21);
      this.muzzleFlashMesh.visible = false;
      g.add(this.muzzleFlashMesh);
    } else {
      // Upgraded Forged Steel Crowbar with curved gooseneck & split claw
      const barRed = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.72, roughness: 0.34 });
      const steelTip = new THREE.MeshStandardMaterial({ color: 0xdbeafe, metalness: 0.9, roughness: 0.2 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.50, 6), barRed);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(0, -0.03, 0.18);
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.065, 0.075), steelTip);
      hook.position.set(0, -0.06, 0.43);
      hook.rotation.x = 0.45;
      g.add(shaft, hook);
    }
    return g;
  }

  _createDOMLabel() {
    const container = document.getElementById('npc-labels');
    if (!container) return;
    this.labelEl = document.createElement('div');
    this.labelEl.className = 'npc-world-label';
    this.labelEl.innerHTML = `
      <span class="npc-name">${this.name} (${this.role})</span>
      <span class="npc-state" id="npc-state-${this.id}">Осматривается</span>
      <div class="npc-hp-mini"><div class="npc-hp-mini-fill" id="npc-hp-${this.id}" style="width:100%"></div></div>
    `;
    container.appendChild(this.labelEl);
  }

  /**
   * Applies realistic GoreBox localized wounds (textured decal + recessed flesh cavity)
   * and triggers full limb dismemberment with bone, viscera & flowing blood when limb HP <= 0!
   */
  damageLimb(limb, amount, hitPoint, impulse = null, woundType = 'bullet', byPlayer = false) {
    if (!limb) return;

    const mult = limb.key === 'head' ? 2.1 : limb.key === 'upperTorso' ? 1.15 : 0.85;
    const actualDamage = amount * mult;

    limb.hp = Math.max(0, limb.hp - actualDamage);
    if (!this.dead) {
      this.hp = Math.max(0, this.hp - actualDamage * 0.72);
    }

    const worldHit = hitPoint ? hitPoint.clone() : limb.mesh.position.clone();

    // 1. Attach a localized 3D GoreBox Wound Decal & Recessed Flesh Cavity on the limb mesh (NOT turning the whole limb red!)
    this._attachLocalizedWound(limb, worldHit, woundType);

    // 2. If head was hit or nearby, add blood splatter to face canvas & set PAIN emotion
    if (limb.key === 'head' || limb.key === 'upperTorso' || Math.random() < 0.45) {
      this.faceBloodSplats.push({
        x: 45 + Math.random() * 165,
        y: 55 + Math.random() * 155,
        r: 6 + Math.random() * 16,
        dark: Math.random() > 0.45
      });
      if (this.faceBloodSplats.length > 14) this.faceBloodSplats.shift();
    }

    if (!this.dead) {
      this.setEmotion('PAIN', 0.9);
      this.sound.playNpcVocal('pain');
    }

    // 3. Spawn instant blood spray + floor splatter
    this._spawnBloodSpray(worldHit, Math.min(18, Math.ceil(actualDamage * 0.42)), impulse);
    this.propsManager.addFloorDecal(
      worldHit.x + (Math.random() - 0.5) * 0.4,
      worldHit.z + (Math.random() - 0.5) * 0.4,
      0.24 + Math.random() * 0.25,
      'blood'
    );
    this.sound.playImpact('flesh', Math.min(1, actualDamage / 25));

    // 4. Check for Limb Severing / Dismemberment (Отрыв конечности с внутренностями, костью и потоком крови!)
    if (limb.severable && !limb.severed && limb.hp <= 0) {
      this.severLimb(limb, impulse);
    }

    // 5. Apply physical impulse if ragdolled or knocked down
    if (impulse) {
      limb.body.wakeUp();
      limb.body.applyImpulse(
        new CANNON.Vec3(impulse.x, impulse.y, impulse.z),
        new CANNON.Vec3(worldHit.x, worldHit.y, worldHit.z)
      );
    }

    // 6. Check death or knockdown
    if (this.hp <= 0 && !this.dead) {
      this.kill(impulse);
    } else if (!this.dead) {
      const legMissing =
        this.limbs.thighL.severed ||
        this.limbs.calfL.severed ||
        this.limbs.thighR.severed ||
        this.limbs.calfR.severed;

      if (legMissing) {
        this.aiState = 'CRAWL_AGONY';
        this.enterRagdoll(999);
      } else if (actualDamage > 22 || limb.key === 'thighL' || limb.key === 'thighR' || limb.key === 'calfL' || limb.key === 'calfR') {
        this.enterRagdoll(1.8 + Math.min(2.2, actualDamage * 0.04));
      }

      if (byPlayer && this.personality !== 'dummy') {
        this.onWitnessPlayerViolence(null, true);
      }
    }
  }

  /**
   * Attaches a textured 3D wound decal + recessed muscle/bone cavity directly onto the hit surface of `limb.mesh`.
   */
  _attachLocalizedWound(limb, worldHitPoint, woundType = 'bullet') {
    if (limb.wounds.length >= 8) return; // Cap per limb for mobile 60 FPS

    const localPt = limb.mesh.worldToLocal(worldHitPoint.clone());
    const hw = limb.dims.w / 2;
    const hh = limb.dims.h / 2;
    const hd = limb.dims.d / 2;

    // Clamp onto the nearest face of the limb box and orient normal outward
    localPt.x = Math.max(-hw, Math.min(hw, localPt.x));
    localPt.y = Math.max(-hh, Math.min(hh, localPt.y));
    localPt.z = Math.max(-hd, Math.min(hd, localPt.z));

    const dx = Math.abs(hw - Math.abs(localPt.x));
    const dy = Math.abs(hh - Math.abs(localPt.y));
    const dz = Math.abs(hd - Math.abs(localPt.z));

    const normal = new THREE.Vector3(0, 0, 1);
    if (dx <= dy && dx <= dz) {
      const s = localPt.x >= 0 ? 1 : -1;
      localPt.x = s * (hw + 0.002);
      normal.set(s, 0, 0);
    } else if (dz <= dx && dz <= dy) {
      const s = localPt.z >= 0 ? 1 : -1;
      localPt.z = s * (hd + 0.002);
      normal.set(0, 0, s);
    } else {
      const s = localPt.y >= 0 ? 1 : -1;
      localPt.y = s * (hh + 0.002);
      normal.set(0, s, 0);
    }

    const woundGroup = new THREE.Group();
    woundGroup.position.copy(localPt);

    const lookTarget = localPt.clone().add(normal);
    woundGroup.lookAt(lookTarget);

    const wSize = woundType === 'slash' ? 0.11 : 0.085;
    const tex =
      woundType === 'slash'
        ? this.goreTextures?.slashWound
        : this.goreTextures?.bulletWound;

    // 1. Textured GoreBox wound decal plane flush with skin/shirt
    const decalMat = new THREE.MeshBasicMaterial({
      map: tex || null,
      color: tex ? 0xffffff : 0x7f1d1d,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const decalMesh = new THREE.Mesh(new THREE.PlaneGeometry(wSize, wSize), decalMat);
    decalMesh.rotation.z = Math.random() * Math.PI * 2;
    woundGroup.add(decalMesh);

    // 2. 3D protruding torn flesh / deep wound cavity with exposed white bone chip on severe hits
    if (limb.hp < limb.maxHp * 0.65) {
      const fleshChunk = new THREE.Mesh(
        new THREE.CylinderGeometry(wSize * 0.24, wSize * 0.30, 0.014, 8),
        this.visceraMat
      );
      fleshChunk.rotation.x = Math.PI / 2;
      woundGroup.add(fleshChunk);

      if (limb.hp < limb.maxHp * 0.35) {
        const boneChip = new THREE.Mesh(
          new THREE.BoxGeometry(wSize * 0.16, wSize * 0.12, 0.018),
          this.boneMat
        );
        woundGroup.add(boneChip);
      }
    }

    limb.mesh.add(woundGroup);
    limb.wounds.push(woundGroup);

    // Add a slow bleeding drip emitter from this open wound for 4.5s
    this.stumpEmitters.push({
      limb,
      localOffset: localPt.clone(),
      localNormal: normal.clone(),
      timer: 4.5,
      interval: 0.22,
      accum: 0,
      speed: 1.4
    });
  }

  /**
   * Completely severs `limb` from its parent joint, exposing:
   * - Cross-section muscle/flesh cap (`goreCrossMat`)
   * - Protruding white bone shaft (`Костная ткань`) with red marrow core
   * - Hanging visceral organs / tendons (`Внутренности`)
   * - Pulsing arterial blood fountain (`Течёт и хлещет кровь`)
   */
  severLimb(limb, impulse = null) {
    if (!limb || limb.severed || !limb.jointConstraint) return;
    limb.severed = true;

    // 1. Remove physical Cannon constraint connecting this limb to its parent
    this.world.removeConstraint(limb.jointConstraint);
    const cIdx = this.constraints.indexOf(limb.jointConstraint);
    if (cIdx !== -1) this.constraints.splice(cIdx, 1);
    limb.jointConstraint = null;

    this.sound.playGoreSever();

    // 2. Attach 3D Gore Stump (Bone + Viscera + Cross-Section Flesh) on the parent's socket!
    const parent = limb.parentLimb;
    if (parent && limb.jointLocalOnParent) {
      const outDirParent = limb.jointLocalOnParent.clone().normalize();
      if (outDirParent.lengthSq() < 0.01) outDirParent.set(0, -1, 0);
      this._attachGoreStump(parent, limb.jointLocalOnParent, outDirParent, limb.dims.w * 0.48, true);

      // Continuous arterial blood fountain spurting from parent stump!
      this.stumpEmitters.push({
        limb: parent,
        localOffset: limb.jointLocalOnParent.clone(),
        localNormal: outDirParent.clone(),
        timer: 9.5,
        interval: 0.065,
        accum: 0,
        speed: 4.2
      });
    }

    // 3. Attach 3D Gore Stump (Bone + Viscera) on the severed limb's torn joint end!
    if (limb.jointLocalOnSelf) {
      const outDirSelf = limb.jointLocalOnSelf.clone().normalize();
      if (outDirSelf.lengthSq() < 0.01) outDirSelf.set(0, 1, 0);
      this._attachGoreStump(limb, limb.jointLocalOnSelf, outDirSelf, limb.dims.w * 0.46, false);

      this.stumpEmitters.push({
        limb,
        localOffset: limb.jointLocalOnSelf.clone(),
        localNormal: outDirSelf.clone(),
        timer: 5.5,
        interval: 0.12,
        accum: 0,
        speed: 2.2
      });
    }

    // 4. Make the severed limb kick away physically
    limb.body.wakeUp();
    const kick = impulse
      ? impulse.clone().multiplyScalar(0.35)
      : new THREE.Vector3((Math.random() - 0.5) * 4, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 4);
    limb.body.velocity.set(kick.x, kick.y, kick.z);
    limb.body.angularVelocity.set(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    );

    // Big burst of blood droplets & puddle at sever point
    this._spawnBloodSpray(limb.mesh.position, 24, impulse);
    this.propsManager.addFloorDecal(limb.mesh.position.x, limb.mesh.position.z, 0.55, 'blood');

    // 5. Decapitation = instant death; Leg sever = collapse & crawl; Arm sever = shock/pain
    if (limb.key === 'head') {
      this.kill(impulse);
    } else if (
      limb.key === 'thighL' ||
      limb.key === 'calfL' ||
      limb.key === 'thighR' ||
      limb.key === 'calfR'
    ) {
      this.aiState = 'CRAWL_AGONY';
      this.enterRagdoll(999);
    } else {
      this.enterRagdoll(2.6);
    }
  }

  /**
   * Builds a 3D anatomical Gore Stump mesh with:
   * - Cross-section muscle ring
   * - Protruding white Bone cylinder + red Bone Marrow center
   * - Hanging glistening Viscera / Tendons / Internal tissue strands
   */
  _attachGoreStump(targetLimb, localPos, outDir, radius = 0.055, isParentSide = true) {
    const stumpGroup = new THREE.Group();
    stumpGroup.position.copy(localPos);

    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      outDir.clone().normalize()
    );
    stumpGroup.quaternion.copy(quat);

    // 1. Cross-section muscle & torn skin cap
    const fleshCap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.96, radius * 1.04, 0.028, 12),
      this.goreCrossMat
    );
    stumpGroup.add(fleshCap);

    // 2. Protruding White Bone Stump (Костная ткань)
    const boneRadius = radius * 0.42;
    const boneLen = isParentSide ? 0.065 : 0.048;
    const boneShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(boneRadius * 0.9, boneRadius, boneLen, 10),
      this.boneMat
    );
    boneShaft.position.y = boneLen * 0.5;
    stumpGroup.add(boneShaft);

    // Red spongy bone marrow cap at tip of broken bone
    const marrowCap = new THREE.Mesh(
      new THREE.CircleGeometry(boneRadius * 0.58, 8),
      this.marrowMat
    );
    marrowCap.rotation.x = -Math.PI / 2;
    marrowCap.position.y = boneLen + 0.002;
    stumpGroup.add(marrowCap);

    // 3. Hanging Viscera / Tendons / Internal Organs (Внутренности)
    const visceraCount = targetLimb.key === 'neck' || targetLimb.key === 'upperTorso' || targetLimb.key === 'pelvis' ? 5 : 3;
    for (let i = 0; i < visceraCount; i++) {
      const a = (i / visceraCount) * Math.PI * 2 + Math.random() * 0.5;
      const dist = radius * (0.45 + Math.random() * 0.35);
      const strandLen = 0.045 + Math.random() * 0.065;

      const strand = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius * 0.16, strandLen, 4, 6),
        this.visceraMat
      );
      strand.position.set(
        Math.cos(a) * dist,
        strandLen * 0.45,
        Math.sin(a) * dist
      );
      strand.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      stumpGroup.add(strand);
    }

    targetLimb.mesh.add(stumpGroup);
  }

  _spawnBloodSpray(origin, count = 10, impulse = null) {
    const geo = new THREE.BoxGeometry(0.036, 0.036, 0.036);
    const mat = new THREE.MeshBasicMaterial({ color: 0x991b1b });

    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(origin);
      this.scene.add(m);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.2,
        1.2 + Math.random() * 2.8,
        (Math.random() - 0.5) * 4.2
      );
      if (impulse) {
        vel.addScaledVector(impulse, 0.09);
      }

      this.bloodParticles.push({
        mesh: m,
        vel,
        age: 0,
        maxAge: 0.55 + Math.random() * 0.45,
        drippedDecal: false
      });
    }
  }

  enterRagdoll(duration = 2.8, extraImpulse = null) {
    this.isRagdoll = true;
    this.ragdollTimer = Math.max(this.ragdollTimer, duration);
    this.recovering = false;

    for (const l of this.limbList) {
      l.body.wakeUp();
      l.body.angularDamping = 0.22;
      if (extraImpulse && !l.severed) {
        l.body.velocity.x += extraImpulse.x * (0.6 + Math.random() * 0.4);
        l.body.velocity.y += extraImpulse.y * (0.6 + Math.random() * 0.4);
        l.body.velocity.z += extraImpulse.z * (0.6 + Math.random() * 0.4);
      }
    }
  }

  kill(impulse = null) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.isRagdoll = true;
    this.ragdollTimer = 999999;
    this.setEmotion('DEAD', 999999);
    if (this.weaponMeshGroup) this.weaponMeshGroup.visible = false;

    for (const l of this.limbList) {
      l.body.wakeUp();
      l.body.angularDamping = 0.12;
      if (impulse && !l.severed) {
        l.body.velocity.x += impulse.x * 0.45;
        l.body.velocity.y += impulse.y * 0.45;
        l.body.velocity.z += impulse.z * 0.45;
      }
    }

    const pos = this.getPosition();
    this.propsManager.addFloorDecal(pos.x, pos.z, 0.68, 'blood');
  }

  revive() {
    this.dead = false;
    this.hp = this.maxHp;
    this.isRagdoll = false;
    this.ragdollTimer = 0;
    this.hostileToPlayer = this.personality === 'hostile';
    this.aiState = this.personality === 'dummy' ? 'IDLE_DUMMY' : 'STOP_LOOK';
    this.faceBloodSplats = [];
    this.setEmotion('CALM');

    const p = this.limbs.pelvis.body.position;
    this.groundPos.set(p.x, 0, p.z);

    for (const l of this.limbList) {
      l.hp = l.maxHp;
      l.body.velocity.set(0, 0, 0);
      l.body.angularVelocity.set(0, 0, 0);
    }
  }

  /**
   * Called when the player shoots a weapon or attacks ANY NPC!
   * Implements:
   * 1) Immediate Fear/Shock reaction (backing away, hands up, terrified face, looking at player)
   * 2) Followed by armed Retaliation / Fighting Back!
   */
  onWitnessPlayerViolence(playerPos, wasHitDirectly = false) {
    if (this.dead || this.personality === 'dummy') return;
    if (playerPos) {
      this.dangerSourcePos = playerPos.clone();
    }

    if (this.aiState === 'CRAWL_AGONY') {
      this.setEmotion('FEAR', 4.0);
      return;
    }

    // If already retaliating or hit directly a second time, switch straight into armed retaliation!
    if (this.hostileToPlayer || (wasHitDirectly && this.aiState === 'FEAR_SHOCK')) {
      this._enterRetaliationMode();
      return;
    }

    // First reaction: Shock & Fear ("испугались тебя, если ты стрелял в одного из НПС")
    this.aiState = 'FEAR_SHOCK';
    this.stateTimer = wasHitDirectly ? 1.05 : 1.65;
    this.setEmotion('FEAR', 1.8);
    this.sound.playNpcVocal('shock');
  }

  _enterRetaliationMode() {
    if (this.dead || this.aiState === 'CRAWL_AGONY') return;
    this.hostileToPlayer = true;
    this.aiState = 'RETALIATE';
    this.stateTimer = 25.0;
    this.setEmotion('ANGRY', 5.0);
    this.sound.playNpcVocal('angry');
    if (this.weaponMeshGroup && !this.limbs.forearmR.severed && !this.limbs.upperArmR.severed) {
      this.weaponMeshGroup.visible = true;
    }
  }

  onHearSound(soundPos, radius, type, label) {
    if (this.dead || this.personality === 'dummy') return;
    const myPos = this.getPosition();
    const dist = myPos.distanceTo(soundPos);
    if (dist > radius) return;

    this.dangerSourcePos = soundPos.clone();

    if (type === 'gunshot' || type === 'explosion') {
      // Gunshots and explosions trigger Fear -> Retaliation!
      this.onWitnessPlayerViolence(soundPos, false);
    } else if (this.aiState === 'WALK_PATROL' || this.aiState === 'STOP_LOOK') {
      // Glass shatter / crate break makes NPC stop, look toward the sound, and investigate!
      this.aiState = 'INSPECT_PROP';
      this.targetPoint.copy(soundPos);
      this.targetPoint.y = 0;
      this.stateTimer = 5.0;
      this.setEmotion('CURIOUS', 2.5);
    }
  }

  getPosition() {
    const p = this.limbs.pelvis.body.position;
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  hasBothLegsIntact() {
    return (
      !this.limbs.thighL.severed &&
      !this.limbs.calfL.severed &&
      !this.limbs.thighR.severed &&
      !this.limbs.calfR.severed
    );
  }

  /**
   * Main per-frame update:
   * - Updates facial emotion blinking & eye tracking
   * - Updates AI decisions (Walk -> Stop & Look Around -> Fear -> Retaliate)
   * - Solves true articulated bipedal leg stride & arm pose (or Ragdoll if knocked down)
   * - Updates arterial blood fountains from severed limbs & open wounds
   */
  update(dt, player, allNpcs, allProps) {
    this._updateBloodAndStumpEmitters(dt);
    this._updateFaceAnimation(dt, player);

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0 && this.muzzleFlashMesh) {
        this.muzzleFlashMesh.visible = false;
      }
    }

    if (this.dead) {
      this._syncMeshesFromPhysics();
      return;
    }

    // Handle active ragdoll knockdown or legless crawling
    if (this.isRagdoll) {
      if (this.hasBothLegsIntact()) {
        this.ragdollTimer -= dt;
        if (this.ragdollTimer <= 0) {
          this.isRagdoll = false;
          const p = this.limbs.pelvis.body.position;
          this.groundPos.set(
            Math.max(-22.5, Math.min(22.5, p.x)),
            0,
            Math.max(-22.5, Math.min(22.5, p.z))
          );
          if (this.hostileToPlayer) {
            this.aiState = 'RETALIATE';
          }
        }
      } else {
        // Crawling in agony when a leg is severed!
        this._updateCrawlingAgony(dt, player);
      }
      this._syncMeshesFromPhysics();
      return;
    }

    // Standing / Walking AI & True Articulated Stride Animation
    this._updateAI(dt, player, allNpcs, allProps);
    this._solveArticulatedStandingAndWalkPose(dt, player);
  }

  _updateFaceAnimation(dt, player) {
    if (this.dead) return;

    if (this.emotionLockTimer > 0) {
      this.emotionLockTimer -= dt;
    }

    // Natural eye blinking every 2.5 - 4.8 seconds
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      if (!this.isBlinking) {
        this.isBlinking = true;
        this.blinkTimer = 0.11;
        this._redrawFace();
      } else {
        this.isBlinking = false;
        this.blinkTimer = 2.4 + Math.random() * 2.6;
        this._redrawFace();
      }
    }

    // Eye pupil tracking toward head look direction or player
    const targetEyeX = Math.max(-1, Math.min(1, -this.headYawOffset * 1.4));
    const prevEyeX = this.eyeLookX;
    this.eyeLookX += (targetEyeX - this.eyeLookX) * Math.min(1, dt * 8);
    if (Math.abs(this.eyeLookX - prevEyeX) > 0.08) {
      this._redrawFace();
    }
  }

  _updateCrawlingAgony(dt, player) {
    this.setEmotion('PAIN', 0.5);
    const pelvis = this.limbs.pelvis.body;
    const pPos = player.getPosition();
    const away = new THREE.Vector3(pelvis.position.x - pPos.x, 0, pelvis.position.z - pPos.z);
    if (away.lengthSq() > 0.01) {
      away.normalize();
      pelvis.wakeUp();
      pelvis.velocity.x = away.x * 0.65;
      pelvis.velocity.z = away.z * 0.65;
    }
  }

  /**
   * Smart AI State Machine:
   * - Natural patrol: walks to a point, stops, looks left/right, inspects props/other NPCs
   * - Avoids obstacles (crates, barrels, workbenches) and platform edges
   * - Reacts with Fear/Shock when player shoots or attacks any NPC
   * - Transitions from Fear into active Armed Retaliation (shooting / melee counter-attack!)
   */
  _updateAI(dt, player, allNpcs, allProps) {
    this.stateTimer -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.meleeSwingTimer > 0) this.meleeSwingTimer -= dt;

    const myPos = this.groundPos;
    const playerPos = player.getPosition();
    const distToPlayer = myPos.distanceTo(playerPos);

    if (this.personality === 'dummy' || this.aiState === 'IDLE_DUMMY') {
      this.currentSpeed = 0;
      this.targetHeadYaw = 0;
      this.setEmotion('CALM');
      return;
    }

    let moveDir = new THREE.Vector3(0, 0, 0);
    let desiredSpeed = 0;
    let desiredYaw = this.facingYaw;

    // 1. STATE: FEAR_SHOCK (Initial terror when player shoots or attacks an NPC)
    if (this.aiState === 'FEAR_SHOCK') {
      this.setEmotion('FEAR');
      const threat = this.dangerSourcePos || playerPos;
      const toThreat = new THREE.Vector3(threat.x - myPos.x, 0, threat.z - myPos.z);
      if (toThreat.lengthSq() > 0.001) {
        desiredYaw = Math.atan2(toThreat.x, toThreat.z);
        // Backpedal away from the shooter while facing them with hands raised!
        moveDir.copy(toThreat).normalize().multiplyScalar(-1);
        desiredSpeed = 2.1;
      }
      this.targetHeadYaw = Math.sin(performance.now() * 0.018) * 0.18;

      if (this.stateTimer <= 0) {
        // After initial shock, NPC gathers courage and fights back!
        this._enterRetaliationMode();
      }
    }

    // 2. STATE: RETALIATE (Armed Counter-Attack — giving fight back!)
    else if (this.aiState === 'RETALIATE') {
      this.setEmotion('ANGRY');
      if (this.weaponMeshGroup && !this.limbs.forearmR.severed && !this.limbs.upperArmR.severed) {
        this.weaponMeshGroup.visible = true;
      }

      const toPlayer = new THREE.Vector3(playerPos.x - myPos.x, 0, playerPos.z - myPos.z);
      const flatDist = Math.max(0.01, toPlayer.length());
      toPlayer.normalize();
      desiredYaw = Math.atan2(toPlayer.x, toPlayer.z);
      this.targetHeadYaw = 0;

      // Tactical strafing timer
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir = Math.random() > 0.5 ? 1 : -1;
        this.strafeTimer = 1.2 + Math.random() * 1.4;
      }
      const rightVec = new THREE.Vector3(toPlayer.z * this.strafeDir, 0, -toPlayer.x * this.strafeDir);

      const rightArmIntact = !this.limbs.upperArmR.severed && !this.limbs.forearmR.severed;

      if (this.hasPistol && rightArmIntact) {
        // Ranged tactical combat: keep 4.5m - 10m distance, strafe laterally, and fire pistol!
        if (flatDist > 9.5) {
          moveDir.copy(toPlayer).addScaledVector(rightVec, 0.45).normalize();
          desiredSpeed = 2.75;
        } else if (flatDist < 3.8) {
          moveDir.copy(toPlayer).multiplyScalar(-0.8).addScaledVector(rightVec, 0.6).normalize();
          desiredSpeed = 2.4;
        } else {
          moveDir.copy(rightVec);
          desiredSpeed = 1.85;
        }

        // Fire pistol at player when aimed
        if (this.attackCooldown <= 0 && flatDist < 18.0) {
          this.attackCooldown = 1.15 + Math.random() * 0.55;
          this._firePistolAtPlayer(player, flatDist);
        }
      } else {
        // Melee counter-attack: close distance with weaving and strike!
        if (flatDist > 1.45) {
          moveDir.copy(toPlayer).addScaledVector(rightVec, 0.28).normalize();
          desiredSpeed = 3.15;
        } else {
          desiredSpeed = 0.4;
          if (this.attackCooldown <= 0) {
            this.attackCooldown = 0.95;
            this.meleeSwingTimer = 0.35;
            this.sound.playImpact('flesh', 0.7);
            player.takeDamage(12, toPlayer.clone().multiplyScalar(5.5));
          }
        }
      }
    }

    // 3. STATE: INSPECT_PROP (Heard a sound or checking a nearby object)
    else if (this.aiState === 'INSPECT_PROP') {
      this.setEmotion('CURIOUS');
      const toTarget = new THREE.Vector3(this.targetPoint.x - myPos.x, 0, this.targetPoint.z - myPos.z);
      const dist = toTarget.length();
      if (dist > 1.7) {
        toTarget.normalize();
        moveDir.copy(toTarget);
        desiredYaw = Math.atan2(toTarget.x, toTarget.z);
        desiredSpeed = 2.1;
        this.targetHeadYaw = 0;
      } else {
        // Arrived at sound location: stop and look left/right carefully!
        desiredSpeed = 0;
        this.targetHeadYaw = Math.sin(performance.now() * 0.0045) * 0.55;
      }

      if (this.stateTimer <= 0) {
        this.aiState = 'STOP_LOOK';
        this.stateTimer = 2.5 + Math.random() * 2.0;
      }
    }

    // 4. STATE: STOP_LOOK (Standing still, looking around with head and eyes, noticing player)
    else if (this.aiState === 'STOP_LOOK') {
      desiredSpeed = 0;
      this.lookSubTimer += dt;

      if (distToPlayer < 4.8) {
        // Look curiously at the player when player stands close
        this.setEmotion('CURIOUS');
        const toP = new THREE.Vector3(playerPos.x - myPos.x, 0, playerPos.z - myPos.z);
        const angleToP = Math.atan2(toP.x, toP.z);
        let diff = angleToP - this.facingYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        if (Math.abs(diff) > 0.85) {
          desiredYaw = angleToP;
          this.targetHeadYaw = 0;
        } else {
          this.targetHeadYaw = Math.max(-0.65, Math.min(0.65, diff));
        }
      } else {
        // Naturally scan head left, center, right
        this.setEmotion('CALM');
        this.targetHeadYaw = Math.sin(this.lookSubTimer * 1.6) * 0.52;
      }

      if (this.stateTimer <= 0) {
        // Pick a smart patrol point (near workbenches, crate stacks, or other NPCs)
        this._pickSmartPatrolPoint(allNpcs);
        this.aiState = 'WALK_PATROL';
        this.stateTimer = 4.0 + Math.random() * 3.5;
      }
    }

    // 5. STATE: WALK_PATROL (Walking purposefully to destination, then stopping to look around)
    else {
      this.setEmotion('CALM');
      const toTarget = new THREE.Vector3(this.targetPoint.x - myPos.x, 0, this.targetPoint.z - myPos.z);
      const dist = toTarget.length();
      if (dist < 0.85 || this.stateTimer <= 0) {
        this.aiState = 'STOP_LOOK';
        this.stateTimer = 2.6 + Math.random() * 2.8;
        this.lookSubTimer = Math.random() * 3;
        desiredSpeed = 0;
      } else {
        toTarget.normalize();
        moveDir.copy(toTarget);
        desiredYaw = Math.atan2(toTarget.x, toTarget.z);
        desiredSpeed = 1.85;
        this.targetHeadYaw = Math.sin(performance.now() * 0.002) * 0.18;
      }
    }

    // Obstacle avoidance (steer around crates, barrels, workbenches, other NPCs, and platform edges!)
    if (desiredSpeed > 0.05) {
      const steer = new THREE.Vector3();

      // Avoid props
      for (const p of allProps) {
        if (p.broken || !p.solidForPlayer) continue;
        const dx = myPos.x - p.body.position.x;
        const dz = myPos.z - p.body.position.z;
        const dSq = dx * dx + dz * dz;
        const minR = (p.halfExtents ? Math.max(p.halfExtents.x, p.halfExtents.z) : 0.45) + 0.65;
        if (dSq < minR * minR && dSq > 0.0001) {
          const d = Math.sqrt(dSq);
          steer.x += (dx / d) * ((minR - d) * 3.2);
          steer.z += (dz / d) * ((minR - d) * 3.2);
        }
      }

      // Avoid workbenches (-4.5, -5.5) and (5.2, -4.8)
      const benches = [
        { x: -4.5, z: -5.5, rx: 1.9, rz: 0.9 },
        { x: 5.2, z: -4.8, rx: 1.6, rz: 0.85 }
      ];
      for (const b of benches) {
        const dx = myPos.x - b.x;
        const dz = myPos.z - b.z;
        if (Math.abs(dx) < b.rx && Math.abs(dz) < b.rz) {
          steer.x += Math.sign(dx || 1) * 2.5;
          steer.z += Math.sign(dz || 1) * 2.5;
        }
      }

      // Avoid other NPCs
      for (const other of allNpcs) {
        if (other === this || other.dead) continue;
        const oPos = other.getPosition();
        const dx = myPos.x - oPos.x;
        const dz = myPos.z - oPos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < 1.35 * 1.35 && dSq > 0.001) {
          const d = Math.sqrt(dSq);
          steer.x += (dx / d) * 2.0;
          steer.z += (dz / d) * 2.0;
        }
      }

      // Keep well inside 50m platform
      if (Math.abs(myPos.x) > 19.5) steer.x -= Math.sign(myPos.x) * 3.0;
      if (Math.abs(myPos.z) > 19.5) steer.z -= Math.sign(myPos.z) * 3.0;

      moveDir.addScaledVector(steer, 0.55);
      if (moveDir.lengthSq() > 0.001) {
        moveDir.normalize();
        if (this.aiState !== 'FEAR_SHOCK' && this.aiState !== 'RETALIATE') {
          desiredYaw = Math.atan2(moveDir.x, moveDir.z);
        }
      }
    }

    // Smoothly turn facingYaw toward desiredYaw
    let yawDiff = desiredYaw - this.facingYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.facingYaw += yawDiff * Math.min(1, dt * 7.5);

    // Smoothly turn head yaw offset
    this.headYawOffset += (this.targetHeadYaw - this.headYawOffset) * Math.min(1, dt * 6.5);

    // Advance groundPos and walkPhase
    this.currentSpeed += (desiredSpeed - this.currentSpeed) * Math.min(1, dt * 10);
    if (this.currentSpeed > 0.06 && moveDir.lengthSq() > 0.001) {
      this.groundPos.x += moveDir.x * this.currentSpeed * dt;
      this.groundPos.z += moveDir.z * this.currentSpeed * dt;
      this.groundPos.x = Math.max(-22.5, Math.min(22.5, this.groundPos.x));
      this.groundPos.z = Math.max(-22.5, Math.min(22.5, this.groundPos.z));

      this.walkPhase += this.currentSpeed * dt * 3.7;
    } else {
      this.currentSpeed = 0;
      // Smoothly bring walkPhase to neutral standing rest (sin(walkPhase) -> 0)
      const mod = this.walkPhase % Math.PI;
      if (mod > Math.PI * 0.5) {
        this.walkPhase += (Math.PI - mod) * Math.min(1, dt * 8);
      } else {
        this.walkPhase -= mod * Math.min(1, dt * 8);
      }
    }
  }

  _pickSmartPatrolPoint(allNpcs) {
    const landmarks = [
      new THREE.Vector3(-2.4, 0, -1.2),
      new THREE.Vector3(2.4, 0, -1.4),
      new THREE.Vector3(-3.8, 0, -3.8),
      new THREE.Vector3(3.8, 0, -3.5),
      new THREE.Vector3(0.0, 0, -2.5),
      new THREE.Vector3(-1.8, 0, 1.5),
      new THREE.Vector3(2.2, 0, 1.6)
    ];
    const pick = landmarks[Math.floor(Math.random() * landmarks.length)];
    this.targetPoint.set(
      pick.x + (Math.random() - 0.5) * 2.2,
      0,
      pick.z + (Math.random() - 0.5) * 2.2
    );
  }

  _firePistolAtPlayer(player, dist) {
    this.sound.playGunshot();
    this.meleeSwingTimer = 0.18; // Recoil kick on right arm
    if (this.muzzleFlashMesh) {
      this.muzzleFlashMesh.visible = true;
      this.muzzleFlashTimer = 0.07;
    }

    // Accuracy depends on distance so player can dodge/strafe
    const hitChance = Math.max(0.28, 0.78 - dist * 0.03);
    if (Math.random() < hitChance) {
      const myPos = this.groundPos;
      const pPos = player.getPosition();
      const dir = new THREE.Vector3(pPos.x - myPos.x, 0, pPos.z - myPos.z).normalize();
      player.takeDamage(9, dir.multiplyScalar(3.2));
    }
  }

  /**
   * Solves full 11-segment Forward Kinematics for the standing/walking NPC so that:
   * - Hip & knee joints swing naturally with lifting feet (ZERO dragging legs!)
   * - Head looks around independently
   * - Arms swing with walk, raise in fear, or aim weapons / punch in combat
   * - Severed limbs are skipped so they roll freely as detached physics objects on the floor!
   */
  _solveArticulatedStandingAndWalkPose(dt, player) {
    const walkFactor = Math.min(1, this.currentSpeed / 1.8);
    const s = Math.sin(this.walkPhase) * walkFactor;
    const c = Math.cos(this.walkPhase) * walkFactor;

    // Vertical hip bob during stride
    const bobY = Math.abs(s) * 0.032;
    const px = this.groundPos.x;
    const pz = this.groundPos.z;
    const py = 0.90 + bobY;

    const rootQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.facingYaw);

    const setBonePose = (limb, worldPos, worldQuat) => {
      if (!limb || limb.severed) return;
      limb.body.position.set(worldPos.x, worldPos.y, worldPos.z);
      limb.body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
      limb.body.velocity.set(0, 0, 0);
      limb.body.angularVelocity.set(0, 0, 0);
      limb.mesh.position.copy(worldPos);
      limb.mesh.quaternion.copy(worldQuat);
    };

    const localToWorld = (lx, ly, lz, basePos, baseQuat) => {
      return new THREE.Vector3(lx, ly, lz).applyQuaternion(baseQuat).add(basePos);
    };

    // 1. Pelvis
    const pelvisPos = new THREE.Vector3(px, py, pz);
    setBonePose(this.limbs.pelvis, pelvisPos, rootQuat);

    // 2. Abdomen & Upper Torso (slight forward lean when walking & subtle counter-twist)
    const torsoPitch = walkFactor * 0.06;
    const torsoTwist = -s * 0.07;
    const torsoQuat = rootQuat
      .clone()
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(torsoPitch, torsoTwist, 0, 'YXZ')));

    const abdomenPos = localToWorld(0, 0.17, 0, pelvisPos, rootQuat);
    setBonePose(this.limbs.abdomen, abdomenPos, torsoQuat);

    const upperTorsoPos = localToWorld(0, 0.23, 0, abdomenPos, torsoQuat);
    setBonePose(this.limbs.upperTorso, upperTorsoPos, torsoQuat);

    // 3. Neck & Head (with independent head look yaw/pitch!)
    const neckPos = localToWorld(0, 0.17, 0, upperTorsoPos, torsoQuat);
    setBonePose(this.limbs.neck, neckPos, torsoQuat);

    const headQuat = torsoQuat
      .clone()
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.headPitchOffset, this.headYawOffset, 0, 'YXZ')));
    const headPos = localToWorld(0, 0.15, 0, neckPos, headQuat);
    setBonePose(this.limbs.head, headPos, headQuat);

    // 4. Left & Right Legs (Hip swing + Knee bend that physically lifts the foot during forward step!)
    const solveLeg = (thighLimb, calfLimb, hipOffsetX, phaseSign) => {
      const hipSwing = -s * phaseSign * 0.56; // Negative X rotation swings thigh forward (+Z)
      const liftPhase = Math.max(0, c * phaseSign);
      const kneeBend = liftPhase * 0.78 + walkFactor * 0.08; // Positive X rotation bends knee backward (-Z)

      const hipSocket = localToWorld(hipOffsetX, -0.08, 0, pelvisPos, rootQuat);
      const thighQuat = rootQuat
        .clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), hipSwing));
      const thighPos = localToWorld(0, -0.18, 0, hipSocket, thighQuat);
      setBonePose(thighLimb, thighPos, thighQuat);

      const kneeJoint = localToWorld(0, -0.18, 0, thighPos, thighQuat);
      const calfQuat = thighQuat
        .clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), kneeBend));
      const calfPos = localToWorld(0, -0.19, 0, kneeJoint, calfQuat);
      setBonePose(calfLimb, calfPos, calfQuat);
    };

    solveLeg(this.limbs.thighL, this.limbs.calfL, -0.085, 1);
    solveLeg(this.limbs.thighR, this.limbs.calfR, 0.085, -1);

    // 5. Left & Right Arms (Walk swing, Fear hands-up, or Combat aim/melee strike!)
    const solveArm = (upperArm, forearm, shoulderX, isRight) => {
      let upperPitch = s * (isRight ? -1 : 1) * 0.42;
      let upperRoll = isRight ? -0.06 : 0.06;
      let elbowBend = -0.26 - Math.max(0, -upperPitch) * 0.35;

      if (this.aiState === 'FEAR_SHOCK') {
        // Hands raised defensively in terror!
        upperPitch = -1.35 + Math.sin(performance.now() * 0.02 + (isRight ? 1 : 0)) * 0.12;
        upperRoll = isRight ? -0.25 : 0.25;
        elbowBend = -1.15;
      } else if (this.aiState === 'RETALIATE') {
        if (isRight && this.hasPistol) {
          // Right arm extended aiming pistol straight at player + recoil kick
          upperPitch = -1.48 - (this.meleeSwingTimer > 0 ? 0.28 : 0);
          upperRoll = 0.05;
          elbowBend = -0.12;
        } else if (isRight && !this.hasPistol) {
          // Melee weapon strike / guard
          if (this.meleeSwingTimer > 0) {
            upperPitch = -1.85 + (0.35 - this.meleeSwingTimer) * 4.2;
            elbowBend = -0.35;
          } else {
            upperPitch = -0.95;
            elbowBend = -1.1;
          }
        } else {
          // Left off-hand guard
          upperPitch = -0.75;
          elbowBend = -1.05;
        }
      }

      const shoulderSocket = localToWorld(shoulderX, 0.10, 0, upperTorsoPos, torsoQuat);
      const uQuat = torsoQuat
        .clone()
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(upperPitch, 0, upperRoll, 'XYZ')));
      const uPos = localToWorld(0, -0.125, 0, shoulderSocket, uQuat);
      setBonePose(upperArm, uPos, uQuat);

      const elbowJoint = localToWorld(0, -0.125, 0, uPos, uQuat);
      const fQuat = uQuat
        .clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), elbowBend));
      const fPos = localToWorld(0, -0.125, 0, elbowJoint, fQuat);
      setBonePose(forearm, fPos, fQuat);
    };

    solveArm(this.limbs.upperArmL, this.limbs.forearmL, -0.24, false);
    solveArm(this.limbs.upperArmR, this.limbs.forearmR, 0.24, true);

    // Sync any severed limbs from their independent physics bodies!
    for (const l of this.limbList) {
      if (l.severed) {
        l.mesh.position.copy(l.body.position);
        l.mesh.quaternion.copy(l.body.quaternion);
      }
    }
  }

  _syncMeshesFromPhysics() {
    for (const l of this.limbList) {
      l.mesh.position.copy(l.body.position);
      l.mesh.quaternion.copy(l.body.quaternion);
    }
  }

  _updateBloodAndStumpEmitters(dt) {
    // 1. Update continuous arterial blood fountains from severed stumps & deep wounds
    for (let i = this.stumpEmitters.length - 1; i >= 0; i--) {
      const em = this.stumpEmitters[i];
      em.timer -= dt;
      if (em.timer <= 0) {
        this.stumpEmitters.splice(i, 1);
        continue;
      }

      em.accum += dt;
      if (em.accum >= em.interval) {
        em.accum = 0;
        const worldOrigin = em.localOffset.clone().applyMatrix4(em.limb.mesh.matrixWorld);
        const worldDir = em.localNormal
          .clone()
          .applyQuaternion(em.limb.mesh.quaternion)
          .normalize();

        // Pulsing heartbeat pressure spurt
        const pulse = 0.75 + 0.35 * Math.sin(performance.now() * 0.014);
        const impulse = worldDir.multiplyScalar(em.speed * pulse * 10);
        this._spawnBloodSpray(worldOrigin, 2, impulse);
      }
    }

    // 2. Update airborne blood droplets & spawn floor blood decals when droplets hit the concrete!
    for (let i = this.bloodParticles.length - 1; i >= 0; i--) {
      const bp = this.bloodParticles[i];
      bp.age += dt;
      if (bp.age >= bp.maxAge) {
        this.scene.remove(bp.mesh);
        this.bloodParticles.splice(i, 1);
        continue;
      }
      bp.vel.y -= 14.5 * dt;
      bp.mesh.position.addScaledVector(bp.vel, dt);
      if (bp.mesh.position.y < 0.02) {
        bp.mesh.position.y = 0.02;
        bp.vel.set(0, 0, 0);
        if (!bp.drippedDecal && Math.random() < 0.22) {
          bp.drippedDecal = true;
          this.propsManager.addFloorDecal(bp.mesh.position.x, bp.mesh.position.z, 0.14 + Math.random() * 0.16, 'blood');
        }
      }
    }
  }

  updateScreenLabel(camera) {
    if (!this.labelEl) return;
    const headPos = this.limbs.head.severed
      ? this.limbs.upperTorso.mesh.position.clone().add(new THREE.Vector3(0, 0.32, 0))
      : this.limbs.head.mesh.position.clone().add(new THREE.Vector3(0, 0.28, 0));

    const dist = camera.position.distanceTo(headPos);
    if (dist > 22) {
      this.labelEl.style.display = 'none';
      return;
    }

    const projected = headPos.clone().project(camera);
    if (projected.z > 1) {
      this.labelEl.style.display = 'none';
      return;
    }

    const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(projected.y * 0.5) + 0.5) * window.innerHeight;

    this.labelEl.style.display = 'block';
    this.labelEl.style.left = `${x}px`;
    this.labelEl.style.top = `${y}px`;

    const stateEl = document.getElementById(`npc-state-${this.id}`);
    const hpEl = document.getElementById(`npc-hp-${this.id}`);
    if (stateEl) {
      if (this.dead) {
        stateEl.textContent = '💀 МЁРТВ';
      } else if (this.aiState === 'CRAWL_AGONY') {
        stateEl.textContent = '🩸 Ползёт (Оторвана нога)';
      } else if (this.isRagdoll) {
        stateEl.textContent = '💫 Сбит с ног';
      } else if (this.aiState === 'FEAR_SHOCK') {
        stateEl.textContent = '😱 ИСПУГАН: «Ты что творишь?!»';
      } else if (this.aiState === 'RETALIATE') {
        stateEl.textContent = this.hasPistol ? '😡 ОТПОР: Ведёт огонь!' : '😡 ОТПОР: Контратака!';
      } else if (this.aiState === 'INSPECT_PROP') {
        stateEl.textContent = '🤨 Проверяет шум';
      } else if (this.aiState === 'STOP_LOOK') {
        stateEl.textContent = '👀 Остановился и оглядывается';
      } else if (this.aiState === 'WALK_PATROL') {
        stateEl.textContent = '🚶 Идёт по полигону';
      } else {
        stateEl.textContent = '🧍 Спокоен';
      }
    }
    if (hpEl) {
      hpEl.style.width = `${Math.max(0, Math.round((this.hp / this.maxHp) * 100))}%`;
    }
  }

  destroy() {
    for (const c of this.constraints) {
      this.world.removeConstraint(c);
    }
    for (const l of this.limbList) {
      this.scene.remove(l.mesh);
      this.world.removeBody(l.body);
    }
    for (const bp of this.bloodParticles) {
      this.scene.remove(bp.mesh);
    }
    if (this.labelEl && this.labelEl.parentNode) {
      this.labelEl.parentNode.removeChild(this.labelEl);
    }
  }
}

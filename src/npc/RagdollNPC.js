import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Обновлённый НПС (ШАГ 1 – ШАГ 5):
 * - ШАГ 1: 3D-модель строго по пропорциям манекена с первого фото (серая кофта с плечиками и сужением торса,
 *   тёмные штаны, коричневые ботинки, сохранённое лицо со старой модели + система рандома одежды, тона кожи и лица при перезапуске).
 * - ШАГ 2: Внутренние текстуры и декали повреждений из пула 40 вариантов (без красной лужи на полу).
 * - ШАГ 3: Голосовая система из пула 10 различных звуков (крики, стоны от боли, звуки при уроне и сдаче).
 * - ШАГ 5: Физика Ragdoll при переходе в состояние «обездвижен», угловые ограничения суставов
 *   (шея ±45°, плечи ±60°, локти ±90°, колени ±90°) и механика сдачи (поднимает руки вверх при низком здоровье).
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
    this.dead = false; // Внутренний флаг состояния «обездвижен»

    // Ragdoll & posture state
    this.isRagdoll = false;
    this.ragdollTimer = 0;

    // Ground position & orientation for bipedal walking
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
    // 'WALK_PATROL' | 'STOP_LOOK' | 'INSPECT_PROP' | 'FEAR_SHOCK' | 'RETALIATE' | 'SURRENDER' | 'CRAWL_AGONY' | 'IDLE_DUMMY'
    this.aiState = this.personality === 'dummy' ? 'IDLE_DUMMY' : 'STOP_LOOK';
    this.stateTimer = 2.0 + Math.random() * 2.0;
    this.lookSubTimer = 0;
    this.targetPoint = this.groundPos.clone();
    this.dangerSourcePos = null;
    this.hostileToPlayer = this.personality === 'hostile';
    this.surrendered = false;
    this.attackCooldown = 0;
    this.meleeSwingTimer = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 1.5;

    // Face Emotion & Animation State (Лицо со старой модели + пул вариаций)
    this.emotion = 'CALM';
    this.emotionLockTimer = 0;
    this.blinkTimer = 2.2 + Math.random() * 2.5;
    this.isBlinking = false;
    this.eyeLookX = 0;
    this.eyeLookY = 0;
    this.faceDamageMarks = [];

    // Physics & Decal collections
    this.limbs = {};
    this.limbList = [];
    this.constraints = [];
    this.impactParticles = [];
    this.stumpEmitters = [];
    this.muzzleFlashTimer = 0;

    // ШАГ 1: Генерируем рандомный пресет внешности (тон кожи, оттенки серой кофты/штанов/ботинок и вариант лица)
    this.appearance = this._generateRandomAppearance(config.isFirstSpawn && id === 1);
    this._initMaterials();
    this._initFaceCanvas();
    this._buildArticulatedBody(this.groundPos);
    this._createDOMLabel();
  }

  /**
   * ШАГ 1: Система рандома внешности при каждом перезапуске игры (тон кожи, цвет одежды и вариант лица из пула).
   */
  _generateRandomAppearance(useCanonicalRef = false) {
    const skinPool = ['#f2d2b6', '#f6dbc2', '#eac19e', '#dfb28d', '#d6a47e'];
    const hairPool = ['#483126', '#2d1e16', '#5a3e30', '#221813', '#694b3a'];
    // Серая кофта (вариации серого/графитового/серо-оливкового при перезапуске)
    const sweaterPool = [
      { chest: 0x989ea5, shoulder: 0xa3a9b0, mid: 0x8f959c, waist: 0x858b92 },
      { chest: 0x848c94, shoulder: 0x9199a1, mid: 0x798189, waist: 0x6e767e },
      { chest: 0xa4aab2, shoulder: 0xafb5bd, mid: 0x989ea6, waist: 0x8d939b },
      { chest: 0x737b84, shoulder: 0x7f8892, mid: 0x687079, waist: 0x5d656e },
      { chest: 0x8c9288, shoulder: 0x979e93, mid: 0x80867c, waist: 0x747a70 }
    ];
    // Тёмные штаны
    const pantsPool = [0x44494f, 0x363b40, 0x2d3238, 0x4c5259, 0x3b4046];
    // Коричневые ботинки
    const bootPool = [0x583e31, 0x4b3327, 0x664839, 0x3f2b20, 0x52392c];

    if (useCanonicalRef) {
      return {
        skinHex: '#f2d2b6',
        hairHex: '#483126',
        sweater: sweaterPool[0],
        pantsHex: 0x44494f,
        bootHex: 0x583e31,
        faceVariant: 0
      };
    }

    return {
      skinHex: skinPool[Math.floor(Math.random() * skinPool.length)],
      hairHex: hairPool[Math.floor(Math.random() * hairPool.length)],
      sweater: sweaterPool[Math.floor(Math.random() * sweaterPool.length)],
      pantsHex: pantsPool[Math.floor(Math.random() * pantsPool.length)],
      bootHex: bootPool[Math.floor(Math.random() * bootPool.length)],
      faceVariant: Math.floor(Math.random() * 6) // 6 вариантов деталей лица на базе старой текстуры лица
    };
  }

  _initMaterials() {
    const app = this.appearance;

    this.skinMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(app.skinHex),
      roughness: 0.58,
      metalness: 0.03
    });

    this.hairMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(app.hairHex),
      roughness: 0.85,
      metalness: 0.02
    });

    this.shirtChestMat = new THREE.MeshStandardMaterial({
      color: app.sweater.chest,
      roughness: 0.76,
      metalness: 0.04
    });

    this.shirtShoulderMat = new THREE.MeshStandardMaterial({
      color: app.sweater.shoulder,
      roughness: 0.74,
      metalness: 0.04
    });

    this.shirtMidMat = new THREE.MeshStandardMaterial({
      color: app.sweater.mid,
      roughness: 0.78,
      metalness: 0.04
    });

    this.shirtWaistMat = new THREE.MeshStandardMaterial({
      color: app.sweater.waist,
      roughness: 0.8,
      metalness: 0.04
    });

    this.gloveMat = new THREE.MeshStandardMaterial({
      color: 0x3f2b21,
      roughness: 0.68,
      metalness: 0.06
    });

    this.pantsMat = new THREE.MeshStandardMaterial({
      color: app.pantsHex,
      roughness: 0.82,
      metalness: 0.05
    });

    this.bootMat = new THREE.MeshStandardMaterial({
      color: app.bootHex,
      roughness: 0.65,
      metalness: 0.08
    });

    this.bootSoleMat = new THREE.MeshStandardMaterial({
      color: 0x261a14,
      roughness: 0.88,
      metalness: 0.05
    });

    // Внутренние текстуры соединений сегментов
    this.internalCrossMat = new THREE.MeshStandardMaterial({
      map: this.goreTextures ? this.goreTextures.goreCrossSection : null,
      color: 0x5c1d24,
      roughness: 0.42,
      metalness: 0.08
    });

    this.boneMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.45,
      metalness: 0.05
    });
  }

  /**
   * ШАГ 1: Лицо со старой модели с поддержкой пула вариаций и эмоций.
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

    const fv = this.appearance ? this.appearance.faceVariant : 0;

    // 1. Тон кожи из рандомного пула
    ctx.fillStyle = this.appearance ? this.appearance.skinHex : '#f2d2b6';
    ctx.fillRect(0, 0, 256, 256);

    // Вариативные детали лица из пула (щетина, скулы, шрам на брови)
    if (fv === 1 || fv === 4) {
      ctx.fillStyle = 'rgba(60, 42, 32, 0.14)';
      ctx.fillRect(68, 158, 120, 62);
    } else if (fv === 2) {
      ctx.strokeStyle = 'rgba(120, 75, 55, 0.45)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(168, 62);
      ctx.lineTo(178, 92);
      ctx.stroke();
    }

    // Блочная переносица (как на старом лице)
    ctx.fillStyle = 'rgba(176, 128, 94, 0.42)';
    ctx.fillRect(118, 110, 20, 38);
    ctx.fillStyle = 'rgba(146, 98, 68, 0.45)';
    ctx.fillRect(116, 142, 8, 6);
    ctx.fillRect(132, 142, 8, 6);

    const em = this.dead ? 'DEAD' : this.emotion;
    const lx = Math.max(-10, Math.min(10, this.eyeLookX * 10));
    const ly = Math.max(-6, Math.min(6, this.eyeLookY * 6));

    const eyeColors = ['#1f2937', '#1e3a8a', '#14532d', '#3f2b21', '#312e81', '#111827'];
    const pupilColor = eyeColors[fv % eyeColors.length];

    const drawEye = (cx, cy, isLeft) => {
      if (em === 'DEAD') {
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

      const eyeH = em === 'FEAR' ? 34 : em === 'ANGRY' ? 20 : 24;
      const eyeW = em === 'FEAR' ? 38 : 34;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cx - eyeW / 2, cy - eyeH / 2, eyeW, eyeH);
      ctx.strokeStyle = '#3b2419';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - eyeW / 2, cy - eyeH / 2, eyeW, eyeH);

      const pSize = em === 'FEAR' ? 9 : 13;
      ctx.fillStyle = pupilColor;
      ctx.fillRect(cx + lx - pSize / 2, cy + ly - pSize / 2, pSize, pSize);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + lx - pSize / 2 + 2, cy + ly - pSize / 2 + 2, 4, 4);
    };

    drawEye(76, 104, true);
    drawEye(180, 104, false);

    // Брови
    ctx.strokeStyle = this.appearance ? this.appearance.hairHex : '#3a241a';
    ctx.lineWidth = 8 + (fv % 3);
    ctx.lineCap = 'square';

    if (em === 'ANGRY') {
      ctx.beginPath();
      ctx.moveTo(52, 74);
      ctx.lineTo(100, 88);
      ctx.moveTo(204, 74);
      ctx.lineTo(156, 88);
      ctx.stroke();
    } else if (em === 'FEAR') {
      ctx.beginPath();
      ctx.moveTo(52, 82);
      ctx.lineTo(98, 66);
      ctx.moveTo(204, 82);
      ctx.lineTo(158, 66);
      ctx.stroke();

      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(214, 92, 8, 16);
    } else if (em === 'CURIOUS') {
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
      ctx.beginPath();
      ctx.moveTo(54, 80);
      ctx.lineTo(98, 80);
      ctx.moveTo(158, 80);
      ctx.lineTo(202, 80);
      ctx.stroke();
    }

    // Рот
    if (em === 'FEAR') {
      ctx.fillStyle = '#261416';
      ctx.fillRect(92, 168, 72, 34);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(96, 170, 64, 8);
    } else if (em === 'ANGRY') {
      ctx.fillStyle = '#261416';
      ctx.fillRect(88, 172, 80, 22);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(92, 175, 72, 16);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(92, 183);
      ctx.lineTo(164, 183);
      ctx.stroke();
    } else if (em === 'PAIN') {
      ctx.fillStyle = '#261416';
      ctx.fillRect(86, 168, 84, 28);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(92, 171, 72, 9);
    } else if (em === 'DEAD') {
      ctx.fillStyle = '#271a1c';
      ctx.fillRect(100, 174, 56, 18);
    } else if (em === 'CURIOUS') {
      ctx.fillStyle = '#4a2c20';
      ctx.fillRect(110, 176, 36, 10);
    } else {
      ctx.fillStyle = '#4a2c20';
      ctx.fillRect(98, 178, 60, 7);
    }

    // Декали повреждений на лице
    for (const sp of this.faceDamageMarks) {
      ctx.fillStyle = 'rgba(30, 24, 26, 0.72)';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      ctx.fill();
    }

    this.faceTexture.needsUpdate = true;
  }

  /**
   * ШАГ 1 + ШАГ 5: Сборка 3D-модели манекена по пропорциям с первого фото +
   * физические суставы CANNON.ConeTwistConstraint с точными ограничениями углов:
   * шея ±45°, плечи ±60°, локти ±90°, колени ±90°.
   */
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

    // 1. Pelvis / Тазовый блок штанов с нижней узкой секцией серой кофты (как на референс-фото)
    const pelvis = createLimb('pelvis', 'Таз', 0.30, 0.14, 0.19, ox, 0.89, oz, 8, this.pantsMat, 120, false);
    const waistSweaterBlock = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.09, 0.175), this.shirtWaistMat);
    waistSweaterBlock.position.set(0, 0.09, 0);
    pelvis.mesh.add(waistSweaterBlock);

    // 2. Abdomen / Средняя секция серой кофты (сужающаяся книзу ступенька)
    const abdomen = createLimb('abdomen', 'Живот', 0.275, 0.19, 0.188, ox, 1.07, oz, 8, this.shirtMidMat, 90, false);
    const stepShadow = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.016, 0.192),
      new THREE.MeshStandardMaterial({ color: 0x686e75, roughness: 0.9 })
    );
    stepShadow.position.y = 0.088;
    abdomen.mesh.add(stepShadow);

    // 3. Upper Torso / Широкая грудная клетка с угловатыми наплечниками и трапециевидным вырезом шеи (как на фото)
    const upperTorso = createLimb('upperTorso', 'Грудная клетка', 0.35, 0.25, 0.21, ox, 1.30, oz, 11, this.shirtChestMat, 110, false);
    const shCapL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.155, 0.202), this.shirtShoulderMat);
    shCapL.position.set(-0.20, 0.055, 0);
    const shCapR = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.155, 0.202), this.shirtShoulderMat);
    shCapR.position.set(0.20, 0.055, 0);
    const collarSkin = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.045, 0.216), this.skinMat);
    collarSkin.position.set(0, 0.105, 0);
    upperTorso.mesh.add(shCapL, shCapR, collarSkin);

    // 4. Neck & Head (высокая прямоугольная голова с плоской шапкой волос и сохранённым лицом)
    const neck = createLimb('neck', 'Шея', 0.105, 0.075, 0.105, ox, 1.465, oz, 2, this.skinMat, 40, false);
    const head = createLimb('head', 'Голова', 0.216, 0.25, 0.216, ox, 1.625, oz, 4.5, this.skinMat, 35, true);

    const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.032, 0.22), this.hairMat);
    hairCap.position.set(0, 0.115, 0);
    head.mesh.add(hairCap);

    const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.214, 0.224), this.faceMat);
    facePlane.position.set(0, -0.008, 0.109);
    head.mesh.add(facePlane);

    // 5. Left & Right Arms (прямые блочные руки: серый рукав -> голое предплечье -> коричневая беспалая перчатка -> пальцы)
    const upperArmL = createLimb('upperArmL', 'Левое плечо', 0.115, 0.255, 0.115, ox - 0.26, 1.26, oz, 2.6, this.shirtChestMat, 38, true);
    const forearmL = createLimb('forearmL', 'Левое предплечье', 0.102, 0.25, 0.102, ox - 0.26, 0.99, oz, 2.0, this.skinMat, 34, true);
    this._addGoredollHandDetails(forearmL.mesh, true);

    const upperArmR = createLimb('upperArmR', 'Правое плечо', 0.115, 0.255, 0.115, ox + 0.26, 1.26, oz, 2.6, this.shirtChestMat, 38, true);
    const forearmR = createLimb('forearmR', 'Правое предплечье', 0.102, 0.25, 0.102, ox + 0.26, 0.99, oz, 2.0, this.skinMat, 34, true);
    this._addGoredollHandDetails(forearmR.mesh, false);

    this.weaponMeshGroup = this._createEquippedWeaponMesh();
    this.weaponMeshGroup.visible = this.hostileToPlayer;
    forearmR.mesh.add(this.weaponMeshGroup);

    // 6. Left & Right Legs (тёмные штаны со ступенькой колена и коричневыми ботинками)
    const thighL = createLimb('thighL', 'Левое бедро', 0.128, 0.36, 0.138, ox - 0.092, 0.63, oz, 4.5, this.pantsMat, 44, true);
    const calfL = createLimb('calfL', 'Левая голень', 0.114, 0.38, 0.124, ox - 0.092, 0.24, oz, 3.8, this.pantsMat, 38, true);
    this._addGoredollBootDetails(calfL.mesh);

    const thighR = createLimb('thighR', 'Правое бедро', 0.128, 0.36, 0.138, ox + 0.092, 0.63, oz, 4.5, this.pantsMat, 44, true);
    const calfR = createLimb('calfR', 'Правая голень', 0.114, 0.38, 0.124, ox + 0.092, 0.24, oz, 3.8, this.pantsMat, 38, true);
    this._addGoredollBootDetails(calfR.mesh);

    // ШАГ 5: Физические суставы CANNON.ConeTwistConstraint с угловыми ограничениями:
    // шея ±45° (PI/4), плечи ±60° (PI/3), локти ±90° (PI/2), колени ±90° (PI/2).
    const connectWithAngleLimit = (parentLimb, childLimb, pivotParent, pivotChild, maxAngleRad, twistAngleRad = Math.PI / 8) => {
      const c = new CANNON.ConeTwistConstraint(parentLimb.body, childLimb.body, {
        pivotA: new CANNON.Vec3(pivotParent[0], pivotParent[1], pivotParent[2]),
        pivotB: new CANNON.Vec3(pivotChild[0], pivotChild[1], pivotChild[2]),
        axisA: new CANNON.Vec3(0, 1, 0),
        axisB: new CANNON.Vec3(0, 1, 0),
        angle: maxAngleRad,
        twistAngle: twistAngleRad
      });
      c.collideConnected = false;
      this.world.addConstraint(c);
      this.constraints.push(c);

      childLimb.jointConstraint = c;
      childLimb.parentLimb = parentLimb;
      childLimb.jointLocalOnParent = new THREE.Vector3(pivotParent[0], pivotParent[1], pivotParent[2]);
      childLimb.jointLocalOnSelf = new THREE.Vector3(pivotChild[0], pivotChild[1], pivotChild[2]);
      parentLimb.childLimb = childLimb;
    };

    const DEG45 = Math.PI / 4; // ±45° (Шея)
    const DEG60 = Math.PI / 3; // ±60° (Плечи)
    const DEG90 = Math.PI / 2; // ±90° (Локти и Колени)

    // Позвоночник
    connectWithAngleLimit(pelvis, abdomen, [0, 0.08, 0], [0, -0.09, 0], Math.PI / 5, Math.PI / 8);
    connectWithAngleLimit(abdomen, upperTorso, [0, 0.09, 0], [0, -0.13, 0], Math.PI / 5, Math.PI / 8);

    // Шея (±45°)
    connectWithAngleLimit(upperTorso, neck, [0, 0.13, 0], [0, -0.04, 0], DEG45, DEG45 * 0.5);
    connectWithAngleLimit(neck, head, [0, 0.04, 0], [0, -0.125, 0], DEG45, DEG45);

    // Плечи (±60°) и Локти (±90°)
    connectWithAngleLimit(upperTorso, upperArmL, [-0.24, 0.09, 0], [0, 0.12, 0], DEG60, DEG45);
    connectWithAngleLimit(upperArmL, forearmL, [0, -0.13, 0], [0, 0.12, 0], DEG90, Math.PI / 10);

    connectWithAngleLimit(upperTorso, upperArmR, [0.24, 0.09, 0], [0, 0.12, 0], DEG60, DEG45);
    connectWithAngleLimit(upperArmR, forearmR, [0, -0.13, 0], [0, 0.12, 0], DEG90, Math.PI / 10);

    // Тазобедренные суставы (±60°) и Колени (±90°)
    connectWithAngleLimit(pelvis, thighL, [-0.092, -0.07, 0], [0, 0.18, 0], DEG60, Math.PI / 10);
    connectWithAngleLimit(thighL, calfL, [0, -0.18, 0], [0, 0.19, 0], DEG90, Math.PI / 12);

    connectWithAngleLimit(pelvis, thighR, [0.092, -0.07, 0], [0, 0.18, 0], DEG60, Math.PI / 10);
    connectWithAngleLimit(thighR, calfR, [0, -0.18, 0], [0, 0.19, 0], DEG90, Math.PI / 12);

    for (const l of this.limbList) {
      l.mesh.traverse((child) => {
        if (child.isMesh) {
          child.userData = { npc: this, limb: l };
        }
      });
    }
  }

  _addGoredollHandDetails(forearmMesh, isLeft) {
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.088, 0.11), this.gloveMat);
    glove.position.set(0, -0.10, 0);
    forearmMesh.add(glove);

    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.052, 0.098), this.skinMat);
    fingers.position.set(0, -0.168, 0);
    forearmMesh.add(fingers);

    const side = isLeft ? 1 : -1;
    const thumbGlove = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.045, 0.042), this.gloveMat);
    thumbGlove.position.set(side * 0.062, -0.095, 0.025);
    const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.036), this.skinMat);
    thumbTip.position.set(side * 0.062, -0.13, 0.025);
    forearmMesh.add(thumbGlove, thumbTip);
  }

  _addGoredollBootDetails(calfMesh) {
    const ankleBoot = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.13, 0.142), this.bootMat);
    ankleBoot.position.set(0, -0.11, 0);
    calfMesh.add(ankleBoot);

    const footBoot = new THREE.Mesh(new THREE.BoxGeometry(0.136, 0.085, 0.215), this.bootMat);
    footBoot.position.set(0, -0.175, 0.036);
    calfMesh.add(footBoot);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.026, 0.22), this.bootSoleMat);
    sole.position.set(0, -0.225, 0.036);
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
   * Нанесение урона сегменту НПС:
   * - Накладывает локальные декали повреждений на модель и на пол (из пула 40 текстур)
   * - Воспроизводит звук удара и голос из пула 10 голосовых реакций
   * - При низком здоровье (<= 28 HP) переводит НПС в режим Сдачи (SURRENDER — руки вверх!)
   * - При критическом уроне (0 HP) переводит НПС в состояние «обездвижен» (Ragdoll)
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

    // 1. Локальная декаль повреждения на сегменте
    this._attachLocalizedDamageDecal(limb, worldHit, woundType);

    if (limb.key === 'head' || limb.key === 'upperTorso' || Math.random() < 0.4) {
      this.faceDamageMarks.push({
        x: 45 + Math.random() * 165,
        y: 55 + Math.random() * 155,
        r: 5 + Math.random() * 14
      });
      if (this.faceDamageMarks.length > 12) this.faceDamageMarks.shift();
    }

    if (!this.dead) {
      this.setEmotion('PAIN', 0.9);
      this.sound.playNpcVocal('pain'); // Выбирает из пула 10 звуков голоса НПС
    }

    // 2. ШАГ 2: Динамическая тёмная декаль повреждения на полу из пула 40 текстур
    this._spawnImpactParticles(worldHit, Math.min(14, Math.ceil(actualDamage * 0.35)), impulse);
    this.propsManager.addFloorDecal(
      worldHit.x + (Math.random() - 0.5) * 0.35,
      worldHit.z + (Math.random() - 0.5) * 0.35,
      0.26 + Math.random() * 0.22,
      'damage'
    );
    this.sound.playImpact('flesh', Math.min(1, actualDamage / 25));

    // 3. Проверка отсоединения сегмента при разрушении сустава
    if (limb.severable && !limb.severed && limb.hp <= 0) {
      this.severLimb(limb, impulse);
    }

    if (impulse) {
      limb.body.wakeUp();
      limb.body.applyImpulse(
        new CANNON.Vec3(impulse.x, impulse.y, impulse.z),
        new CANNON.Vec3(worldHit.x, worldHit.y, worldHit.z)
      );
    }

    // 4. ШАГ 5: Проверка перехода в состояние «обездвижен» (Ragdoll) или Сдачи (SURRENDER при низком здоровье)
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
      } else if (this.hp <= 28 && this.personality !== 'dummy') {
        // ШАГ 5: При низком здоровье НПС сдаётся и поднимает руки вверх!
        this._enterSurrenderState();
      } else if (actualDamage > 24 || limb.key === 'thighL' || limb.key === 'thighR' || limb.key === 'calfL' || limb.key === 'calfR') {
        this.enterRagdoll(1.8 + Math.min(2.0, actualDamage * 0.04));
      }

      if (byPlayer && this.personality !== 'dummy' && !this.surrendered) {
        this.onWitnessPlayerViolence(null, true);
      }
    }
  }

  /**
   * ШАГ 5: Переводит НПС в состояние сдачи (поднимает обе руки вверх при низком здоровье).
   */
  _enterSurrenderState() {
    if (this.dead) return;
    this.surrendered = true;
    this.hostileToPlayer = false;
    this.aiState = 'SURRENDER';
    this.stateTimer = 30.0;
    this.setEmotion('FEAR', 10.0);
    if (this.weaponMeshGroup) {
      this.weaponMeshGroup.visible = false;
    }
    this.sound.playNpcVocal('surrender');
  }

  _attachLocalizedDamageDecal(limb, worldHitPoint, woundType = 'bullet') {
    if (limb.wounds.length >= 8) return;

    const localPt = limb.mesh.worldToLocal(worldHitPoint.clone());
    const hw = limb.dims.w / 2;
    const hh = limb.dims.h / 2;
    const hd = limb.dims.d / 2;

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
    woundGroup.lookAt(localPt.clone().add(normal));

    const wSize = woundType === 'slash' ? 0.105 : 0.082;
    const tex =
      woundType === 'slash'
        ? this.goreTextures?.slashWound
        : this.goreTextures?.bulletWound;

    const decalMat = new THREE.MeshBasicMaterial({
      map: tex || null,
      color: 0xffffff,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const decalMesh = new THREE.Mesh(new THREE.PlaneGeometry(wSize, wSize), decalMat);
    decalMesh.rotation.z = Math.random() * Math.PI * 2;
    woundGroup.add(decalMesh);

    limb.mesh.add(woundGroup);
    limb.wounds.push(woundGroup);
  }

  /**
   * Отсоединение сегмента с отображением внутренних текстур на стыке.
   */
  severLimb(limb, impulse = null) {
    if (!limb || limb.severed || !limb.jointConstraint) return;
    limb.severed = true;

    this.world.removeConstraint(limb.jointConstraint);
    const cIdx = this.constraints.indexOf(limb.jointConstraint);
    if (cIdx !== -1) this.constraints.splice(cIdx, 1);
    limb.jointConstraint = null;

    this.sound.playGoreSever();

    const parent = limb.parentLimb;
    if (parent && limb.jointLocalOnParent) {
      const outDirParent = limb.jointLocalOnParent.clone().normalize();
      if (outDirParent.lengthSq() < 0.01) outDirParent.set(0, -1, 0);
      this._attachInternalJointTexture(parent, limb.jointLocalOnParent, outDirParent, limb.dims.w * 0.46, true);
    }

    if (limb.jointLocalOnSelf) {
      const outDirSelf = limb.jointLocalOnSelf.clone().normalize();
      if (outDirSelf.lengthSq() < 0.01) outDirSelf.set(0, 1, 0);
      this._attachInternalJointTexture(limb, limb.jointLocalOnSelf, outDirSelf, limb.dims.w * 0.44, false);
    }

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

    this.propsManager.addFloorDecal(limb.mesh.position.x, limb.mesh.position.z, 0.45, 'damage');

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
      this.enterRagdoll(2.4);
    }
  }

  _attachInternalJointTexture(targetLimb, localPos, outDir, radius = 0.052, isParentSide = true) {
    const stumpGroup = new THREE.Group();
    stumpGroup.position.copy(localPos);

    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      outDir.clone().normalize()
    );
    stumpGroup.quaternion.copy(quat);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.94, radius, 0.024, 10),
      this.internalCrossMat
    );
    stumpGroup.add(cap);

    const boneLen = isParentSide ? 0.055 : 0.04;
    const boneShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.36, radius * 0.38, boneLen, 8),
      this.boneMat
    );
    boneShaft.position.y = boneLen * 0.5;
    stumpGroup.add(boneShaft);

    targetLimb.mesh.add(stumpGroup);
  }

  _spawnImpactParticles(origin, count = 8, impulse = null) {
    const geo = new THREE.BoxGeometry(0.032, 0.032, 0.032);
    const mat = new THREE.MeshBasicMaterial({ color: 0x27272a });

    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(origin);
      this.scene.add(m);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.0,
        1.1 + Math.random() * 2.5,
        (Math.random() - 0.5) * 4.0
      );
      if (impulse) {
        vel.addScaledVector(impulse, 0.08);
      }

      this.impactParticles.push({
        mesh: m,
        vel,
        age: 0,
        maxAge: 0.45 + Math.random() * 0.35,
        drippedDecal: false
      });
    }
  }

  enterRagdoll(duration = 2.8, extraImpulse = null) {
    this.isRagdoll = true;
    this.ragdollTimer = Math.max(this.ragdollTimer, duration);

    for (const l of this.limbList) {
      l.body.wakeUp();
      l.body.angularDamping = 0.26;
      if (extraImpulse && !l.severed) {
        l.body.velocity.x += extraImpulse.x * (0.6 + Math.random() * 0.4);
        l.body.velocity.y += extraImpulse.y * (0.6 + Math.random() * 0.4);
        l.body.velocity.z += extraImpulse.z * (0.6 + Math.random() * 0.4);
      }
    }
  }

  /**
   * ШАГ 5: Переход НПС в состояние «обездвижен» с полной физикой Ragdoll и ограничениями суставов.
   */
  kill(impulse = null) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.isRagdoll = true;
    this.ragdollTimer = 999999;
    this.setEmotion('DEAD', 999999);
    this.sound.playNpcVocal('immobilized');
    if (this.weaponMeshGroup) this.weaponMeshGroup.visible = false;

    for (const l of this.limbList) {
      l.body.wakeUp();
      l.body.angularDamping = 0.18;
      if (impulse && !l.severed) {
        l.body.velocity.x += impulse.x * 0.45;
        l.body.velocity.y += impulse.y * 0.45;
        l.body.velocity.z += impulse.z * 0.45;
      }
    }

    const pos = this.getPosition();
    this.propsManager.addFloorDecal(pos.x, pos.z, 0.55, 'damage');
  }

  revive() {
    this.dead = false;
    this.surrendered = false;
    this.hp = this.maxHp;
    this.isRagdoll = false;
    this.ragdollTimer = 0;
    this.hostileToPlayer = this.personality === 'hostile';
    this.aiState = this.personality === 'dummy' ? 'IDLE_DUMMY' : 'STOP_LOOK';
    this.faceDamageMarks = [];
    this.setEmotion('CALM');

    const p = this.limbs.pelvis.body.position;
    this.groundPos.set(p.x, 0, p.z);

    for (const l of this.limbList) {
      l.hp = l.maxHp;
      l.body.velocity.set(0, 0, 0);
      l.body.angularVelocity.set(0, 0, 0);
    }
  }

  onWitnessPlayerViolence(playerPos, wasHitDirectly = false) {
    if (this.dead || this.personality === 'dummy') return;
    if (playerPos) {
      this.dangerSourcePos = playerPos.clone();
    }

    if (this.hp <= 28) {
      this._enterSurrenderState();
      return;
    }

    if (this.aiState === 'CRAWL_AGONY' || this.aiState === 'SURRENDER') {
      this.setEmotion('FEAR', 4.0);
      return;
    }

    if (this.hostileToPlayer || (wasHitDirectly && this.aiState === 'FEAR_SHOCK')) {
      this._enterRetaliationMode();
      return;
    }

    this.aiState = 'FEAR_SHOCK';
    this.stateTimer = wasHitDirectly ? 1.05 : 1.65;
    this.setEmotion('FEAR', 1.8);
    this.sound.playNpcVocal('shock');
  }

  _enterRetaliationMode() {
    if (this.dead || this.aiState === 'CRAWL_AGONY' || this.surrendered) return;
    if (this.hp <= 28) {
      this._enterSurrenderState();
      return;
    }
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
    if (this.dead || this.personality === 'dummy' || this.surrendered) return;
    const myPos = this.getPosition();
    const dist = myPos.distanceTo(soundPos);
    if (dist > radius) return;

    this.dangerSourcePos = soundPos.clone();

    if (type === 'gunshot' || type === 'explosion') {
      this.onWitnessPlayerViolence(soundPos, false);
    } else if (this.aiState === 'WALK_PATROL' || this.aiState === 'STOP_LOOK') {
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

  update(dt, player, allNpcs, allProps) {
    this._updateParticles(dt);
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
          if (this.hp <= 28 && this.personality !== 'dummy') {
            this._enterSurrenderState();
          } else if (this.hostileToPlayer) {
            this.aiState = 'RETALIATE';
          }
        }
      } else {
        this._updateCrawlingAgony(dt, player);
      }
      this._syncMeshesFromPhysics();
      return;
    }

    this._updateAI(dt, player, allNpcs, allProps);
    this._solveArticulatedStandingAndWalkPose(dt, player);
  }

  _updateFaceAnimation(dt, player) {
    if (this.dead) return;

    if (this.emotionLockTimer > 0) {
      this.emotionLockTimer -= dt;
    }

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

    // Check low-HP surrender condition
    if (this.hp <= 28 && !this.surrendered) {
      this._enterSurrenderState();
    }

    let moveDir = new THREE.Vector3(0, 0, 0);
    let desiredSpeed = 0;
    let desiredYaw = this.facingYaw;

    // ШАГ 5: STATE SURRENDER (Сдаётся при низком здоровье — поднимает руки вверх!)
    if (this.aiState === 'SURRENDER') {
      this.setEmotion('FEAR');
      const toPlayer = new THREE.Vector3(playerPos.x - myPos.x, 0, playerPos.z - myPos.z);
      if (toPlayer.lengthSq() > 0.001) {
        desiredYaw = Math.atan2(toPlayer.x, toPlayer.z);
      }
      // Если игрок подходит слишком близко, медленно пятится назад с поднятыми руками
      if (distToPlayer < 2.8) {
        moveDir.copy(toPlayer).normalize().multiplyScalar(-1);
        desiredSpeed = 1.05;
      } else {
        desiredSpeed = 0;
      }
      this.targetHeadYaw = Math.sin(performance.now() * 0.008) * 0.14;
    }

    // 1. STATE: FEAR_SHOCK
    else if (this.aiState === 'FEAR_SHOCK') {
      this.setEmotion('FEAR');
      const threat = this.dangerSourcePos || playerPos;
      const toThreat = new THREE.Vector3(threat.x - myPos.x, 0, threat.z - myPos.z);
      if (toThreat.lengthSq() > 0.001) {
        desiredYaw = Math.atan2(toThreat.x, toThreat.z);
        moveDir.copy(toThreat).normalize().multiplyScalar(-1);
        desiredSpeed = 2.1;
      }
      this.targetHeadYaw = Math.sin(performance.now() * 0.018) * 0.18;

      if (this.stateTimer <= 0) {
        this._enterRetaliationMode();
      }
    }

    // 2. STATE: RETALIATE
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

      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir = Math.random() > 0.5 ? 1 : -1;
        this.strafeTimer = 1.2 + Math.random() * 1.4;
      }
      const rightVec = new THREE.Vector3(toPlayer.z * this.strafeDir, 0, -toPlayer.x * this.strafeDir);

      const rightArmIntact = !this.limbs.upperArmR.severed && !this.limbs.forearmR.severed;

      if (this.hasPistol && rightArmIntact) {
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

        if (this.attackCooldown <= 0 && flatDist < 18.0) {
          this.attackCooldown = 1.15 + Math.random() * 0.55;
          this._firePistolAtPlayer(player, flatDist);
        }
      } else {
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

    // 3. STATE: INSPECT_PROP
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
        desiredSpeed = 0;
        this.targetHeadYaw = Math.sin(performance.now() * 0.0045) * 0.55;
      }

      if (this.stateTimer <= 0) {
        this.aiState = 'STOP_LOOK';
        this.stateTimer = 2.5 + Math.random() * 2.0;
      }
    }

    // 4. STATE: STOP_LOOK
    else if (this.aiState === 'STOP_LOOK') {
      desiredSpeed = 0;
      this.lookSubTimer += dt;

      if (distToPlayer < 4.8) {
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
        this.setEmotion('CALM');
        this.targetHeadYaw = Math.sin(this.lookSubTimer * 1.6) * 0.52;
      }

      if (this.stateTimer <= 0) {
        this._pickSmartPatrolPoint(allNpcs);
        this.aiState = 'WALK_PATROL';
        this.stateTimer = 4.0 + Math.random() * 3.5;
      }
    }

    // 5. STATE: WALK_PATROL
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

    // Obstacle avoidance
    if (desiredSpeed > 0.05) {
      const steer = new THREE.Vector3();

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

      if (Math.abs(myPos.x) > 19.5) steer.x -= Math.sign(myPos.x) * 3.0;
      if (Math.abs(myPos.z) > 19.5) steer.z -= Math.sign(myPos.z) * 3.0;

      moveDir.addScaledVector(steer, 0.55);
      if (moveDir.lengthSq() > 0.001) {
        moveDir.normalize();
        if (this.aiState !== 'FEAR_SHOCK' && this.aiState !== 'RETALIATE' && this.aiState !== 'SURRENDER') {
          desiredYaw = Math.atan2(moveDir.x, moveDir.z);
        }
      }
    }

    let yawDiff = desiredYaw - this.facingYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.facingYaw += yawDiff * Math.min(1, dt * 7.5);

    this.headYawOffset = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.headYawOffset + (this.targetHeadYaw - this.headYawOffset) * Math.min(1, dt * 6.5)));

    this.currentSpeed += (desiredSpeed - this.currentSpeed) * Math.min(1, dt * 10);
    if (this.currentSpeed > 0.06 && moveDir.lengthSq() > 0.001) {
      this.groundPos.x += moveDir.x * this.currentSpeed * dt;
      this.groundPos.z += moveDir.z * this.currentSpeed * dt;
      this.groundPos.x = Math.max(-22.5, Math.min(22.5, this.groundPos.x));
      this.groundPos.z = Math.max(-22.5, Math.min(22.5, this.groundPos.z));

      this.walkPhase += this.currentSpeed * dt * 3.7;
    } else {
      this.currentSpeed = 0;
      const mod = this.walkPhase % Math.PI;
      if (mod > Math.PI * 0.5) {
        this.walkPhase += (Math.PI - mod) * Math.min(1, dt * 8);
      } else {
        this.walkPhase -= mod * Math.min(1, dt * 8);
      }
    }
  }

  _pickSmartPatrolPoint() {
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
    this.meleeSwingTimer = 0.18;
    if (this.muzzleFlashMesh) {
      this.muzzleFlashMesh.visible = true;
      this.muzzleFlashTimer = 0.07;
    }

    const hitChance = Math.max(0.28, 0.78 - dist * 0.03);
    if (Math.random() < hitChance) {
      const myPos = this.groundPos;
      const pPos = player.getPosition();
      const dir = new THREE.Vector3(pPos.x - myPos.x, 0, pPos.z - myPos.z).normalize();
      player.takeDamage(9, dir.multiplyScalar(3.2));
    }
  }

  _solveArticulatedStandingAndWalkPose(dt, player) {
    const walkFactor = Math.min(1, this.currentSpeed / 1.8);
    const s = Math.sin(this.walkPhase) * walkFactor;
    const c = Math.cos(this.walkPhase) * walkFactor;

    const bobY = Math.abs(s) * 0.032;
    const px = this.groundPos.x;
    const pz = this.groundPos.z;
    const py = 0.89 + bobY;

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

    // 2. Abdomen & Upper Torso
    const torsoPitch = walkFactor * 0.06;
    const torsoTwist = -s * 0.07;
    const torsoQuat = rootQuat
      .clone()
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(torsoPitch, torsoTwist, 0, 'YXZ')));

    const abdomenPos = localToWorld(0, 0.175, 0, pelvisPos, rootQuat);
    setBonePose(this.limbs.abdomen, abdomenPos, torsoQuat);

    const upperTorsoPos = localToWorld(0, 0.225, 0, abdomenPos, torsoQuat);
    setBonePose(this.limbs.upperTorso, upperTorsoPos, torsoQuat);

    // 3. Neck & Head (limited to ±45°)
    const neckPos = localToWorld(0, 0.165, 0, upperTorsoPos, torsoQuat);
    setBonePose(this.limbs.neck, neckPos, torsoQuat);

    const clampedHeadYaw = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.headYawOffset));
    const headQuat = torsoQuat
      .clone()
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.headPitchOffset, clampedHeadYaw, 0, 'YXZ')));
    const headPos = localToWorld(0, 0.155, 0, neckPos, headQuat);
    setBonePose(this.limbs.head, headPos, headQuat);

    // 4. Legs (Knee bend strictly within ±90°)
    const solveLeg = (thighLimb, calfLimb, hipOffsetX, phaseSign) => {
      const hipSwing = -s * phaseSign * 0.56;
      const liftPhase = Math.max(0, c * phaseSign);
      const kneeBend = Math.min(Math.PI / 2, liftPhase * 0.78 + walkFactor * 0.08);

      const hipSocket = localToWorld(hipOffsetX, -0.075, 0, pelvisPos, rootQuat);
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

    solveLeg(this.limbs.thighL, this.limbs.calfL, -0.092, 1);
    solveLeg(this.limbs.thighR, this.limbs.calfR, 0.092, -1);

    // 5. Arms (Walk swing, Surrender hands high up, Fear, or Combat)
    const solveArm = (upperArm, forearm, shoulderX, isRight) => {
      let upperPitch = s * (isRight ? -1 : 1) * 0.42;
      let upperRoll = isRight ? -0.06 : 0.06;
      let elbowBend = -0.22 - Math.max(0, -upperPitch) * 0.35;

      if (this.aiState === 'SURRENDER') {
        // ШАГ 5: НПС сдаётся — обе руки подняты высоко вверх над головой!
        const tremble = Math.sin(performance.now() * 0.016 + (isRight ? 1.5 : 0)) * 0.05;
        upperPitch = -2.65 + tremble;
        upperRoll = isRight ? -0.22 : 0.22;
        elbowBend = -0.32;
      } else if (this.aiState === 'FEAR_SHOCK') {
        upperPitch = -1.35 + Math.sin(performance.now() * 0.02 + (isRight ? 1 : 0)) * 0.12;
        upperRoll = isRight ? -0.25 : 0.25;
        elbowBend = -1.15;
      } else if (this.aiState === 'RETALIATE') {
        if (isRight && this.hasPistol) {
          upperPitch = -1.48 - (this.meleeSwingTimer > 0 ? 0.28 : 0);
          upperRoll = 0.05;
          elbowBend = -0.12;
        } else if (isRight && !this.hasPistol) {
          if (this.meleeSwingTimer > 0) {
            upperPitch = -1.85 + (0.35 - this.meleeSwingTimer) * 4.2;
            elbowBend = -0.35;
          } else {
            upperPitch = -0.95;
            elbowBend = -1.1;
          }
        } else {
          upperPitch = -0.75;
          elbowBend = -1.05;
        }
      }

      const shoulderSocket = localToWorld(shoulderX, 0.095, 0, upperTorsoPos, torsoQuat);
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

  _updateParticles(dt) {
    for (let i = this.impactParticles.length - 1; i >= 0; i--) {
      const bp = this.impactParticles[i];
      bp.age += dt;
      if (bp.age >= bp.maxAge) {
        this.scene.remove(bp.mesh);
        this.impactParticles.splice(i, 1);
        continue;
      }
      bp.vel.y -= 14.5 * dt;
      bp.mesh.position.addScaledVector(bp.vel, dt);
      if (bp.mesh.position.y < 0.02) {
        bp.mesh.position.y = 0.02;
        bp.vel.set(0, 0, 0);
        if (!bp.drippedDecal && Math.random() < 0.2) {
          bp.drippedDecal = true;
          this.propsManager.addFloorDecal(bp.mesh.position.x, bp.mesh.position.z, 0.16 + Math.random() * 0.14, 'damage');
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
        stateEl.textContent = '💤 ОБЕЗДВИЖЕН (Ragdoll)';
      } else if (this.aiState === 'SURRENDER') {
        stateEl.textContent = '🏳️ СДАЁТСЯ (Руки вверх!)';
      } else if (this.aiState === 'CRAWL_AGONY') {
        stateEl.textContent = '⚠️ Повреждена нога';
      } else if (this.isRagdoll) {
        stateEl.textContent = '💫 Физика Ragdoll';
      } else if (this.aiState === 'FEAR_SHOCK') {
        stateEl.textContent = '😱 ИСПУГАН';
      } else if (this.aiState === 'RETALIATE') {
        stateEl.textContent = this.hasPistol ? '😡 ОТПОР: Ведёт огонь!' : '😡 ОТПОР: Контратака!';
      } else if (this.aiState === 'INSPECT_PROP') {
        stateEl.textContent = '🤨 Проверяет шум';
      } else if (this.aiState === 'STOP_LOOK') {
        stateEl.textContent = '👀 Оглядывается';
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
    for (const bp of this.impactParticles) {
      this.scene.remove(bp.mesh);
    }
    if (this.labelEl && this.labelEl.parentNode) {
      this.labelEl.parentNode.removeChild(this.labelEl);
    }
  }
}

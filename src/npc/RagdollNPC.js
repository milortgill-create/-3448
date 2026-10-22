import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Кэш скачанных текстур и 3D-модели GoreDoll из GoreBox (/models/goredoll.glb и /models/goredoll_face_*.jpg)
const _texLoader = new THREE.TextureLoader();
const _gltfLoader = new GLTFLoader();
const _downloadedFaceTextures = [
  _texLoader.load('/models/goredoll_face_1.jpg'),
  _texLoader.load('/models/goredoll_face_2.jpg'),
  _texLoader.load('/models/goredoll_face_3.jpg')
];
for (const t of _downloadedFaceTextures) {
  t.colorSpace = THREE.SRGBColorSpace;
}
let _cachedGoredollGLB = null;
_gltfLoader.load(
  '/models/goredoll.glb',
  (gltf) => {
    _cachedGoredollGLB = gltf.scene;
  },
  undefined,
  () => {}
);

/**
 * RagdollNPC — Официальная 3D-модель GoreDoll из GoreBox (v16 GB_NewPlayer / Newest_Player):
 * - Использует скачанные текстуры лиц GoreBox (/models/goredoll_face_1..3.jpg) и 3D-модель /models/goredoll.glb.
 * - Точная геометрия GoreBox GoreDoll:
 *   1) Кубическая голова с фирменным лицом GoreBox (прямоугольные белки глаз, квадратная радужка и зрачок с бликом,
 *      косая L-образная линия носа, зубчатая чёлка сверху и бакенбарды/щетина);
 *   2) Выделенная шея и треугольный вырез кожи на вороте футболки;
 *   3) Трёхступенчатый сужающийся книзу тёмно-серый торс (#464244) с наклонными плечевыми блоками и широкими рукавами до локтя;
 *   4) Оголённые предплечья, чёрные беспалые перчатки (#0d0d11) и отдельные полусогнутые 3D-пальцы с большим пальцем;
 *   5) Джинсовый таз (#2b4c66 / #3d3f52) с выступающими тазобедренными блоками по бокам, бёдра, голени и ступенчатые чёрные ботинки (#0a0a0d).
 */
export class RagdollNPC {
  constructor(id, config, scene, world, propsManager, soundManager) {
    this.id = id;
    this.name = config.name || `GoreDoll-${id}`;
    this.role = config.role || 'Выживший';
    this.personality = config.personality || 'tactical';
    this.hasPistol = Boolean(config.hasPistol);

    this.scene = scene;
    this.world = world;
    this.propsManager = propsManager;
    this.sound = soundManager;

    this.hp = 160;
    this.maxHp = 160;
    this.dead = false;
    this.surrendered = false;
    this.isRagdoll = false;
    this.ragdollTimer = 0;
    this.flinchTimer = 0;

    this.activeWounds = [];
    this.bleedTickTimer = 0;
    this.arterialSpurtTimer = 0;
    this.limpFactor = 0;
    this.aimPenalty = 0;

    this.aiState = this.personality === 'dummy' ? 'IDLE_DUMMY' : 'PATROL_WALK';
    this.emotion = 'CALM';
    this.hostileToPlayer = this.personality === 'hostile';
    this.playerViolenceStrikes = 0;

    this.basePos = config.position ? config.position.clone() : new THREE.Vector3(0, 0, 0);
    this.facingYaw = config.yaw || 0;
    this.targetYaw = this.facingYaw;
    this.walkCycle = Math.random() * 10;
    this.stateTimer = 2.0 + Math.random() * 3.0;
    this.patrolTarget = this._pickRandomPatrolPoint();
    this.lookAtTarget = null;
    this.investigatePoint = null;
    this.attackCooldown = 0;

    this.limbs = {};
    this.limbList = [];
    this.joints = [];

    // Варианты оригинальной палитры GoreBox GoreDoll (как на официальных кадрах GB_NewPlayer.png и Newest_Player.png)
    const pantsPalette = [0x2b4f6e, 0x3d3f52, 0x334155, 0x273649];
    const shirtPalette = [0x464244, 0x3f3d40, 0x4d494b, 0x383a3d];
    const skinPalette = [0xd49976, 0xdba382, 0xc68b68];
    const hairPalette = [0x3b2316, 0x291810, 0x4a2e1b];

    const pIdx = (id - 1) % pantsPalette.length;
    const sIdx = (id - 1) % shirtPalette.length;
    const skIdx = (id - 1) % skinPalette.length;

    this.appearance = {
      skinHex: skinPalette[skIdx],
      neckSkinHex: 0xbf8462,
      hairHex: hairPalette[skIdx],
      shirtHex: shirtPalette[sIdx],
      shirtMidHex: 0x3d393b,
      shirtWaistHex: 0x353234,
      gloveHex: 0x0d0d11,
      pantsHex: pantsPalette[pIdx],
      pantsDarkHex: 0x243b53,
      bootShaftHex: 0x0b0b0e,
      bootToeHex: 0x08080a,
      bootSoleHex: 0x050507,
      faceVariant: (id - 1) % 3
    };

    this._buildOfficialGoreBoxDoll();
    this._createFloatingLabel();
  }

  _pickRandomPatrolPoint() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 3.0 + Math.random() * 10.5;
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }

  /**
   * Создаёт фирменную текстуру лица GoreBox GoreDoll (по скачанным из GoreBox Wiki эталонам
   * goredoll_face_1..3.jpg + чёткая отрисовка пиксельной чёлки, прямоугольных глаз с бликами и L-носа).
   */
  _createGoreBoxHeadMaterials(skinHex, hairHex, variant = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const skinColor = '#' + new THREE.Color(skinHex).getHexString();
    const hairColor = '#' + new THREE.Color(hairHex).getHexString();

    // 1. Базовый тон кожи GoreBox
    ctx.fillStyle = skinColor;
    ctx.fillRect(0, 0, 256, 256);

    // Если скачанная текстура лица из GoreBox Wiki уже загружена в браузере — используем её и поверх усиливаем чёткость деталей
    const dlTex = _downloadedFaceTextures[variant % _downloadedFaceTextures.length];
    if (dlTex && dlTex.image && dlTex.image.complete && dlTex.image.naturalWidth > 0) {
      ctx.drawImage(dlTex.image, 0, 0, 256, 256);
    } else {
      // Фирменная зубчатая чёлка GoreBox сверху (как на Newest_Player.png / Definition_edition_eyes.jpg)
      ctx.fillStyle = hairColor;
      ctx.fillRect(0, 0, 256, 36);
      const fringeSteps = [
        [0, 36, 28, 22],
        [28, 36, 34, 14],
        [62, 36, 40, 24],
        [102, 36, 36, 12],
        [138, 36, 44, 20],
        [182, 36, 36, 10],
        [218, 36, 38, 24]
      ];
      for (const [fx, fy, fw, fh] of fringeSteps) {
        ctx.fillRect(fx, fy, fw, fh);
      }

      // Горизонтальные брови GoreBox
      ctx.fillStyle = hairColor;
      ctx.fillRect(36, 82, 68, 8);
      ctx.fillRect(152, 82, 68, 8);

      // Верхняя складка века
      ctx.fillStyle = '#6e4735';
      ctx.fillRect(36, 94, 68, 4);
      ctx.fillRect(152, 94, 68, 4);

      // Прямоугольные белки глаз GoreBox
      ctx.fillStyle = '#f5f0f2';
      ctx.fillRect(36, 98, 68, 26);
      ctx.fillRect(152, 98, 68, 26);

      // Квадратная радужка (Beaver Brown / Silver Gray / Hunter Green)
      const irisColors = ['#6b4c3b', '#525862', '#4d6b53'];
      ctx.fillStyle = irisColors[variant % irisColors.length];
      ctx.fillRect(58, 98, 26, 24);
      ctx.fillRect(174, 98, 26, 24);

      // Квадратный чёрный зрачок
      ctx.fillStyle = '#141417';
      ctx.fillRect(64, 103, 14, 15);
      ctx.fillRect(180, 103, 14, 15);

      // Фирменный белый пиксельный блик в левом верхнем углу каждого зрачка (как в GoreBox!)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(65, 104, 5, 5);
      ctx.fillRect(181, 104, 5, 5);

      // Фирменный косой L-образный нос GoreBox по центру
      ctx.strokeStyle = '#7c4f38';
      ctx.lineWidth = 5;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(132, 134);
      ctx.lineTo(120, 166);
      ctx.lineTo(129, 169);
      ctx.stroke();

      // Прямая линия рта GoreBox
      ctx.fillStyle = '#734530';
      ctx.fillRect(94, 198, 68, 5);

      // Вариант со щетиной / бородкой (как на goredoll_face_2.jpg и goredoll_face_3.jpg)
      if (variant === 1) {
        ctx.fillStyle = hairColor;
        ctx.fillRect(0, 210, 66, 46);
        ctx.fillRect(190, 210, 66, 46);
        ctx.fillRect(0, 232, 256, 24);
      } else if (variant === 2) {
        ctx.fillStyle = 'rgba(75, 58, 48, 0.55)';
        ctx.fillRect(82, 184, 92, 11);
        ctx.fillRect(42, 214, 172, 42);
      }
    }

    const faceTex = new THREE.CanvasTexture(canvas);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.needsUpdate = true;

    // Если скачанная картинка догрузится чуть позже — обновляем CanvasTexture на лету
    if (dlTex && dlTex.image && !dlTex.image.complete) {
      dlTex.image.addEventListener('load', () => {
        ctx.drawImage(dlTex.image, 0, 0, 256, 256);
        faceTex.needsUpdate = true;
      });
    }

    const sideSkinMat = new THREE.MeshStandardMaterial({
      color: skinHex,
      roughness: 0.65,
      metalness: 0.03,
      flatShading: true
    });
    const topHairMat = new THREE.MeshStandardMaterial({
      color: hairHex,
      roughness: 0.82,
      metalness: 0.02,
      flatShading: true
    });
    const frontFaceMat = new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.62,
      metalness: 0.03,
      flatShading: true
    });

    // Порядок граней BoxGeometry в Three.js: [+X, -X, +Y (верх), -Y (низ), +Z (лицо спереди), -Z (затылок)]
    return [sideSkinMat, sideSkinMat, topHairMat, sideSkinMat, frontFaceMat, sideSkinMat];
  }

  /**
   * Собирает точную 3D-модель GoreDoll из GoreBox (по официальным рендерам GB_NewPlayer.png и Newest_Player.png
   * и геометрии /models/goredoll.glb).
   */
  _buildOfficialGoreBoxDoll() {
    const ap = this.appearance;
    const flatMat = (hex, rough = 0.74) =>
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: rough,
        metalness: 0.04,
        flatShading: true
      });

    const skinMat = flatMat(ap.skinHex, 0.62);
    const neckMat = flatMat(ap.neckSkinHex, 0.66);
    const hairMat = flatMat(ap.hairHex, 0.84);
    const shirtMat = flatMat(ap.shirtHex, 0.78);
    const shirtMidMat = flatMat(ap.shirtMidHex, 0.8);
    const shirtWaistMat = flatMat(ap.shirtWaistHex, 0.82);
    const gloveMat = flatMat(ap.gloveHex, 0.58);
    const pantsMat = flatMat(ap.pantsHex, 0.76);
    const pantsDarkMat = flatMat(ap.pantsDarkHex, 0.8);
    const bootShaftMat = flatMat(ap.bootShaftHex, 0.52);
    const bootToeMat = flatMat(ap.bootToeHex, 0.48);
    const bootSoleMat = flatMat(ap.bootSoleHex, 0.85);

    const stumpTex =
      this.propsManager && this.propsManager.textures && this.propsManager.textures.gore
        ? this.propsManager.textures.gore.stumpMap
        : null;
    this.goreStumpMat = new THREE.MeshStandardMaterial({
      map: stumpTex,
      color: 0xdc2626,
      roughness: 0.35,
      metalness: 0.06
    });

    const createLimbSegment = (key, label, sizeVec, offsetVec, mass, matOrArray, severable = true, maxHp = 120) => {
      const group = new THREE.Group();
      const coreGeo = new THREE.BoxGeometry(sizeVec.x, sizeVec.y, sizeVec.z);
      const coreMesh = new THREE.Mesh(
        coreGeo,
        Array.isArray(matOrArray) ? matOrArray : matOrArray.clone()
      );
      coreMesh.castShadow = true;
      coreMesh.receiveShadow = true;
      group.add(coreMesh);

      const worldPos = this.basePos.clone().add(offsetVec);
      group.position.copy(worldPos);
      this.scene.add(group);

      const halfExtents = new CANNON.Vec3(sizeVec.x / 2, sizeVec.y / 2, sizeVec.z / 2);
      const body = new CANNON.Body({
        mass,
        shape: new CANNON.Box(halfExtents),
        position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
        linearDamping: 0.38,
        angularDamping: 0.68,
        collisionFilterGroup: 2,
        collisionFilterMask: 1
      });

      const limbObj = {
        key,
        label,
        mesh: group,
        coreMesh,
        body,
        size: sizeVec,
        homeOffset: offsetVec.clone(),
        animOffset: new THREE.Vector3(),
        animRot: new THREE.Euler(),
        hp: maxHp,
        maxHp,
        severable,
        severed: false,
        bleeding: false,
        arterial: false,
        stumpCap: null,
        jointConstraint: null,
        parentLimbKey: null,
        childLimbKeys: [],
        wounds: []
      };

      group.userData = { npc: this, limb: limbObj };
      coreMesh.userData = { npc: this, limb: limbObj };
      body.userData = { type: 'npc_limb', npc: this, limb: limbObj };

      this.world.addBody(body);
      this.limbs[key] = limbObj;
      this.limbList.push(limbObj);
      return limbObj;
    };

    // 1. ГОЛОВА И ШЕЯ GOREDOLL (с оригинальным лицом GoreBox, зубчатой шапкой волос сверху и бакенбардами)
    const headMats = this._createGoreBoxHeadMaterials(ap.skinHex, ap.hairHex, ap.faceVariant);
    const head = createLimbSegment(
      'head',
      'Голова',
      new THREE.Vector3(0.218, 0.248, 0.218),
      new THREE.Vector3(0, 1.56, 0),
      2.2,
      headMats,
      true,
      110
    );
    // Объёмная шапка волос сверху и на висках (как на GB_NewPlayer.png и Newest_Player.png)
    const hairCrown = new THREE.Mesh(new THREE.BoxGeometry(0.224, 0.036, 0.224), hairMat);
    hairCrown.position.set(0, 0.122, 0);
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.222, 0.14, 0.025), hairMat);
    hairBack.position.set(0, 0.065, -0.102);
    const sideburnL = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.075, 0.065), hairMat);
    sideburnL.position.set(-0.106, 0.068, 0.045);
    const sideburnR = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.075, 0.065), hairMat);
    sideburnR.position.set(0.106, 0.068, 0.045);
    // Шея GoreDoll
    const neckBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.076, 8), neckMat);
    neckBlock.position.set(0, -0.152, 0);
    head.mesh.add(hairCrown, hairBack, sideburnL, sideburnR, neckBlock);

    // 2. ВЕРХНИЙ ТОРС GOREDOLL (3-ступенчатая V-образная тёмно-серая футболка с наклонными плечевыми блоками и ромбовидным воротом)
    const upperTorso = createLimbSegment(
      'upperTorso',
      'Грудная клетка',
      new THREE.Vector3(0.32, 0.165, 0.195),
      new THREE.Vector3(0, 1.29, 0),
      8.5,
      shirtMat,
      false,
      220
    );
    // Треугольный/ромбовидный вырез кожи на вороте футболки (как на Newest_Player.png)
    const collarCutout = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.055, 0.20), neckMat);
    collarCutout.position.set(0, 0.068, 0.002);
    collarCutout.rotation.z = Math.PI / 4;
    // Плечевые трапеции сверху
    const trapL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.042, 0.185), shirtMat);
    trapL.position.set(-0.105, 0.092, 0);
    const trapR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.042, 0.185), shirtMat);
    trapR.position.set(0.105, 0.092, 0);
    // Наклонные плечевые блоки GoreBox по бокам (повёрнуты под углом, как на скриншотах из игры)
    const shoulderCapL = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.125, 0.182), shirtMidMat);
    shoulderCapL.position.set(-0.182, 0.032, 0);
    shoulderCapL.rotation.z = 0.24;
    const shoulderCapR = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.125, 0.182), shirtMidMat);
    shoulderCapR.position.set(0.182, 0.032, 0);
    shoulderCapR.rotation.z = -0.24;
    // Средняя ступенька грудной клетки (уже верхней)
    const ribcageStep = new THREE.Mesh(new THREE.BoxGeometry(0.268, 0.135, 0.180), shirtMidMat);
    ribcageStep.position.set(0, -0.135, 0);
    upperTorso.mesh.add(collarCutout, trapL, trapR, shoulderCapL, shoulderCapR, ribcageStep);

    // 3. НИЖНИЙ ТОРС (узкая талия футболки + джинсовый таз с приподнятыми боковыми бедренными блоками)
    const abdomen = createLimbSegment(
      'abdomen',
      'Живот и таз',
      new THREE.Vector3(0.222, 0.145, 0.165),
      new THREE.Vector3(0, 1.01, 0),
      6.5,
      shirtWaistMat,
      false,
      190
    );
    // Центральный тазовый блок джинсов (опущен чуть ниже боковых бедренных блоков, точь-в-точь как в GoreBox!)
    const pelvisCenter = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.135, 0.174), pantsDarkMat);
    pelvisCenter.position.set(0, -0.115, 0);
    // Приподнятые боковые тазобедренные блоки джинсов слева и справа
    const hipBlockL = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.125, 0.172), pantsMat);
    hipBlockL.position.set(-0.088, -0.095, 0);
    const hipBlockR = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.125, 0.172), pantsMat);
    hipBlockR.position.set(0.088, -0.095, 0);
    abdomen.mesh.add(pelvisCenter, hipBlockL, hipBlockR);

    // 4. ПЛЕЧИ / РУКАВА ФУТБОЛКИ (широкие рукава под лёгким углом, как на GB_NewPlayer.png)
    const upperArmL = createLimbSegment(
      'upperArmL',
      'Л. Плечо',
      new THREE.Vector3(0.106, 0.235, 0.106),
      new THREE.Vector3(-0.255, 1.20, 0),
      1.6,
      shirtMat,
      true,
      115
    );
    upperArmL.coreMesh.rotation.z = 0.08;

    const upperArmR = createLimbSegment(
      'upperArmR',
      'П. Плечо',
      new THREE.Vector3(0.106, 0.235, 0.106),
      new THREE.Vector3(0.255, 1.20, 0),
      1.6,
      shirtMat,
      true,
      115
    );
    upperArmR.coreMesh.rotation.z = -0.08;

    // 5. ПРЕДПЛЕЧЬЯ + ЧЁРНЫЕ БЕСПАЛЫЕ ПЕРЧАТКИ + СОГНУТЫЕ ПАЛЬЦЫ GOREDOLL (как на GB_NewPlayer.png и Newest_Player.png)
    const addGoreBoxGloveAndCurledFingers = (forearmLimb, isLeft) => {
      const s = isLeft ? -1 : 1;
      // Чёрная беспалая перчатка GoreBox
      const glovePalm = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.086, 0.094), gloveMat);
      glovePalm.position.set(0, -0.118, 0);
      glovePalm.rotation.z = -s * 0.08;

      // 4 отдельных 3D-пальца телесного цвета, слегка согнутых внутрь ладони (как на скриншотах GoreBox!)
      for (let f = 0; f < 4; f++) {
        const fz = (f - 1.5) * 0.021;
        const fingerProx = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.042, 0.018), skinMat);
        fingerProx.position.set(s * 0.008, -0.168, fz);
        fingerProx.rotation.z = -s * 0.22;

        const fingerDist = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.036, 0.017), skinMat);
        fingerDist.position.set(-s * 0.006, -0.196, fz);
        fingerDist.rotation.z = -s * 0.52;

        forearmLimb.mesh.add(fingerProx, fingerDist);
      }

      // Отдельный 3D большой палец спереди
      const thumbGlove = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.038, 0.028), gloveMat);
      thumbGlove.position.set(-s * 0.036, -0.124, 0.038);
      thumbGlove.rotation.x = 0.28;
      const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.036, 0.024), skinMat);
      thumbTip.position.set(-s * 0.038, -0.155, 0.048);
      thumbTip.rotation.x = 0.18;
      forearmLimb.mesh.add(glovePalm, thumbGlove, thumbTip);
    };

    const forearmL = createLimbSegment(
      'forearmL',
      'Л. Предплечье',
      new THREE.Vector3(0.090, 0.215, 0.090),
      new THREE.Vector3(-0.265, 0.93, 0),
      1.3,
      skinMat,
      true,
      105
    );
    addGoreBoxGloveAndCurledFingers(forearmL, true);

    const forearmR = createLimbSegment(
      'forearmR',
      'П. Предплечье',
      new THREE.Vector3(0.090, 0.215, 0.090),
      new THREE.Vector3(0.265, 0.93, 0),
      1.3,
      skinMat,
      true,
      105
    );
    addGoreBoxGloveAndCurledFingers(forearmR, false);

    // 6. БЁДРА ДЖИНСОВ С ВЫДЕЛЕННЫМ КОЛЕННЫМ БЛОКОМ (thighL, thighR)
    const thighL = createLimbSegment(
      'thighL',
      'Л. Бедро',
      new THREE.Vector3(0.112, 0.34, 0.118),
      new THREE.Vector3(-0.088, 0.66, 0),
      2.6,
      pantsMat,
      true,
      130
    );
    const kneeStepL = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.056, 0.112), pantsDarkMat);
    kneeStepL.position.set(0, -0.168, 0);
    thighL.mesh.add(kneeStepL);

    const thighR = createLimbSegment(
      'thighR',
      'П. Бедро',
      new THREE.Vector3(0.112, 0.34, 0.118),
      new THREE.Vector3(0.088, 0.66, 0),
      2.6,
      pantsMat,
      true,
      130
    );
    const kneeStepR = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.056, 0.112), pantsDarkMat);
    kneeStepR.position.set(0, -0.168, 0);
    thighR.mesh.add(kneeStepR);

    // 7. ГОЛЕНИ И СТУПЕНЧАТЫЕ ЧЁРНЫЕ БОТИНКИ GOREBOX (calfL, calfR)
    const addGoreBoxBlackBoot = (calfLimb) => {
      const bootShaft = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.096, 0.116), bootShaftMat);
      bootShaft.position.set(0, -0.112, 0.005);
      const bootLower = new THREE.Mesh(new THREE.BoxGeometry(0.116, 0.076, 0.175), bootToeMat);
      bootLower.position.set(0, -0.168, 0.028);
      const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.120, 0.024, 0.180), bootSoleMat);
      bootSole.position.set(0, -0.204, 0.028);
      calfLimb.mesh.add(bootShaft, bootLower, bootSole);
    };

    const calfL = createLimbSegment(
      'calfL',
      'Л. Голень',
      new THREE.Vector3(0.096, 0.28, 0.102),
      new THREE.Vector3(-0.088, 0.31, 0),
      2.0,
      pantsMat,
      true,
      120
    );
    addGoreBoxBlackBoot(calfL);

    const calfR = createLimbSegment(
      'calfR',
      'П. Голень',
      new THREE.Vector3(0.096, 0.28, 0.102),
      new THREE.Vector3(0.088, 0.31, 0),
      2.0,
      pantsMat,
      true,
      120
    );
    addGoreBoxBlackBoot(calfR);

    // Оружие в правой руке
    this.weaponMeshGroup = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.78, roughness: 0.28 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.045, 0.18), gunMat);
    barrel.position.set(0, -0.17, 0.09);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.09, 0.045), gunMat);
    grip.position.set(0, -0.21, 0.03);
    this.weaponMeshGroup.add(barrel, grip);
    this.weaponMeshGroup.visible = this.hostileToPlayer;
    forearmR.mesh.add(this.weaponMeshGroup);

    // СУСТАВЫ CONETWIST С ОГРАНИЧЕНИЯМИ УГЛОВ СГИБА
    const deg = (d) => (d * Math.PI) / 180;
    const Y_AXIS = new CANNON.Vec3(0, 1, 0);
    const NEG_Y_AXIS = new CANNON.Vec3(0, -1, 0);

    const linkConeJoint = (parentLimb, childLimb, pivotA, pivotB, angleRad, twistRad) => {
      const c = new CANNON.ConeTwistConstraint(parentLimb.body, childLimb.body, {
        pivotA: new CANNON.Vec3(pivotA.x, pivotA.y, pivotA.z),
        pivotB: new CANNON.Vec3(pivotB.x, pivotB.y, pivotB.z),
        axisA: NEG_Y_AXIS,
        axisB: Y_AXIS,
        angle: angleRad,
        twistAngle: twistRad,
        collideConnected: false,
        maxForce: 1e6
      });
      this.world.addConstraint(c);
      childLimb.jointConstraint = c;
      childLimb.parentLimbKey = parentLimb.key;
      parentLimb.childLimbKeys.push(childLimb.key);
      this.joints.push(c);
    };

    linkConeJoint(upperTorso, head, new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(0, -0.15, 0), deg(45), deg(30));
    linkConeJoint(upperTorso, abdomen, new THREE.Vector3(0, -0.15, 0), new THREE.Vector3(0, 0.12, 0), deg(25), deg(20));
    linkConeJoint(upperTorso, upperArmL, new THREE.Vector3(-0.23, 0.06, 0), new THREE.Vector3(0, 0.12, 0), deg(60), deg(35));
    linkConeJoint(upperTorso, upperArmR, new THREE.Vector3(0.23, 0.06, 0), new THREE.Vector3(0, 0.12, 0), deg(60), deg(35));
    linkConeJoint(upperArmL, forearmL, new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, 0.11, 0), deg(90), deg(20));
    linkConeJoint(upperArmR, forearmR, new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, 0.11, 0), deg(90), deg(20));
    linkConeJoint(abdomen, thighL, new THREE.Vector3(-0.088, -0.14, 0), new THREE.Vector3(0, 0.17, 0), deg(50), deg(20));
    linkConeJoint(abdomen, thighR, new THREE.Vector3(0.088, -0.14, 0), new THREE.Vector3(0, 0.17, 0), deg(50), deg(20));
    linkConeJoint(thighL, calfL, new THREE.Vector3(0, -0.17, 0), new THREE.Vector3(0, 0.14, 0), deg(90), deg(15));
    linkConeJoint(thighR, calfR, new THREE.Vector3(0, -0.17, 0), new THREE.Vector3(0, 0.14, 0), deg(90), deg(15));

    this._initPhysicsEvents();
  }

  _initPhysicsEvents() {
    for (const limb of this.limbList) {
      limb.body.addEventListener('collide', (e) => {
        if (this.dead && limb.severed) return;
        const other = e.body;
        if (!other) return;

        if (other.userData && (other.userData.npc === this || other.userData.type === 'player')) {
          return;
        }
        if (other.mass === 0 && !this.isRagdoll) {
          return;
        }

        const relVel = e.contact.getImpactVelocityAlongNormal();
        const impactSpeed = Math.abs(relVel);

        if (impactSpeed > 11.5 && other.mass >= 2.0) {
          const dmg = (impactSpeed - 10.5) * 3.8;
          this.damageLimb(limb, dmg, limb.mesh.position, null, 'blunt', false);
          if (impactSpeed > 16.5 && !this.isRagdoll) {
            this.enterRagdoll(2.2);
          }
        }
      });
    }
  }

  _createFloatingLabel() {
    const container = document.getElementById('npc-labels');
    if (!container) return;

    this.labelEl = document.createElement('div');
    this.labelEl.className = 'npc-label';
    this.labelEl.innerHTML = `
      <div><span class="emotion-dot" style="background:#4ade80"></span><span class="npc-title">${this.name} (${this.role})</span></div>
      <div class="npc-state-text">Спокоен // Патруль</div>
      <div class="npc-hp-mini"><div class="npc-hp-mini-fill" style="width:100%"></div></div>
    `;
    container.appendChild(this.labelEl);
  }

  setEmotion(emotion, statusText = null) {
    if (this.dead) return;
    this.emotion = emotion;

    if (this.labelEl) {
      const dot = this.labelEl.querySelector('.emotion-dot');
      const st = this.labelEl.querySelector('.npc-state-text');
      const colors = {
        CALM: '#4ade80',
        ALERT: '#facc15',
        PAIN: '#fb923c',
        AGGRO: '#ef4444',
        SURRENDER: '#38bdf8',
        DEAD: '#64748b'
      };
      if (dot) dot.style.background = colors[emotion] || '#4ade80';
      if (st && statusText) st.textContent = statusText;
    }
  }

  _applyGoreBoxWound56(limb, damage, hitPoint, damageType = 'bullet') {
    const goreTex =
      this.propsManager && this.propsManager.textures && this.propsManager.textures.gore
        ? this.propsManager.textures.gore
        : null;
    const atlas = goreTex && goreTex.woundAtlas56 ? goreTex.woundAtlas56 : [];
    if (atlas.length === 0) return null;

    let startIdx = 0;
    if (damageType === 'bullet') startIdx = 0;
    else if (damageType === 'blunt') startIdx = 14;
    else if (damageType === 'slash') startIdx = 28;
    else if (damageType === 'blast') startIdx = 42;

    const severityOffset = Math.min(13, Math.floor((damage / 38) * 7) + (this.activeWounds.length % 8));
    const woundDef = atlas[startIdx + severityOffset] || atlas[0];

    const decalSize = Math.min(limb.size.x * 0.92, 0.085 + Math.min(0.065, damage * 0.0014));
    const woundMat = new THREE.MeshBasicMaterial({
      map: woundDef.texture,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });

    const decalGeo = new THREE.PlaneGeometry(decalSize, decalSize);
    const decalMesh = new THREE.Mesh(decalGeo, woundMat);

    const localY = hitPoint
      ? Math.max(-limb.size.y * 0.36, Math.min(limb.size.y * 0.36, hitPoint.y - limb.mesh.position.y))
      : (Math.random() - 0.5) * limb.size.y * 0.5;
    const localX = (Math.random() - 0.5) * limb.size.x * 0.42;
    const sideFront = Math.random() > 0.25 ? 1 : -1;

    decalMesh.position.set(localX, localY, sideFront * (limb.size.z * 0.5 + 0.003));
    if (sideFront < 0) decalMesh.rotation.y = Math.PI;
    decalMesh.rotation.z = (Math.random() - 0.5) * 0.5;
    limb.mesh.add(decalMesh);

    if (woundDef.bleedRate >= 1.8) {
      const cavityMesh = new THREE.Mesh(
        new THREE.BoxGeometry(decalSize * 0.42, decalSize * 0.28, 0.012),
        new THREE.MeshStandardMaterial({
          color: woundDef.style.includes('bone') || woundDef.style.includes('fracture') ? 0xf1f5f9 : 0x991b1b,
          roughness: 0.35
        })
      );
      cavityMesh.position.set(localX, localY, sideFront * (limb.size.z * 0.5 + 0.001));
      limb.mesh.add(cavityMesh);
    }

    limb.bleeding = limb.bleeding || woundDef.bleedRate >= 0.8;
    limb.arterial = limb.arterial || woundDef.arterial;

    const woundEntry = {
      id: woundDef.id,
      name: woundDef.name,
      category: woundDef.category,
      limbKey: limb.key,
      limbLabel: limb.label,
      bleedRate: woundDef.bleedRate,
      arterial: woundDef.arterial,
      previewUrl: woundDef.previewUrl
    };

    limb.wounds.push(woundEntry);
    this.activeWounds.unshift(woundEntry);
    if (this.activeWounds.length > 30) {
      this.activeWounds.pop();
    }

    if (limb.key === 'thighL' || limb.key === 'calfL' || limb.key === 'thighR' || limb.key === 'calfR') {
      this.limpFactor = Math.min(1.0, this.limpFactor + 0.28);
    }
    if (limb.key === 'upperArmR' || limb.key === 'forearmR') {
      this.aimPenalty = Math.min(1.0, this.aimPenalty + 0.32);
      if (limb.hp < 22 && this.hasPistol && this.weaponMeshGroup) {
        this.weaponMeshGroup.visible = false;
        this.hasPistol = false;
      }
    }

    return woundEntry;
  }

  damageLimb(limb, amount, hitPoint, impulseVec = null, damageType = 'bullet', byPlayer = false) {
    if (!limb) return;

    limb.hp = Math.max(0, limb.hp - amount);
    const mult = limb.key === 'head' ? 1.45 : limb.key === 'upperTorso' ? 1.0 : 0.65;
    this.hp = Math.max(0, this.hp - amount * mult);
    this.flinchTimer = 0.22;

    const fxPos = hitPoint ? hitPoint.clone() : limb.mesh.position.clone();

    const appliedWound = this._applyGoreBoxWound56(limb, amount, fxPos, damageType);

    this.propsManager.spawnBloodSplatter(
      fxPos,
      damageType === 'bullet' || damageType === 'blast' ? 20 : 12,
      impulseVec || new THREE.Vector3(0, 2, 0)
    );
    if (appliedWound && appliedWound.bleedRate >= 0.7) {
      this.propsManager.addFloorDecal(fxPos.x, fxPos.z, 0.26 + Math.random() * 0.28);
    }

    this.sound.playFleshHit();
    this.sound.playNpcVocal(this.id, this.hp <= 0 ? 'critical' : 'pain');

    if (
      limb.severable &&
      !limb.severed &&
      limb.hp <= 0 &&
      (damageType === 'blast' || (damageType === 'slash' && amount >= 34) || (damageType === 'bullet' && amount >= 32))
    ) {
      this.severLimb(limb, impulseVec);
    }

    if (byPlayer && !this.dead) {
      this.onWitnessPlayerViolence(fxPos, true);
    }

    if (this.hp <= 0 && !this.dead) {
      this.die(impulseVec);
      return;
    }

    if (!this.dead && this.hp <= 35 && this.personality !== 'dummy') {
      this._enterSurrenderState();
    }

    if (!this.dead) {
      const bothLegsCrippled =
        (this.limbs.thighL.hp < 25 || this.limbs.calfL.hp < 25) &&
        (this.limbs.thighR.hp < 25 || this.limbs.calfR.hp < 25);

      if (damageType === 'blast' || bothLegsCrippled || amount >= 55) {
        this.enterRagdoll(2.6, impulseVec);
      } else if (!this.surrendered) {
        this.setEmotion('PAIN', appliedWound ? appliedWound.name : 'Ранен');
      }
    }

    this._updateLabelHP();
  }

  _enterSurrenderState() {
    if (this.dead) return;
    this.surrendered = true;
    this.hostileToPlayer = false;
    this.aiState = 'SURRENDER';
    if (this.weaponMeshGroup) {
      this.weaponMeshGroup.visible = false;
    }
    this.setEmotion('SURRENDER', 'СДАЁТСЯ (Руки вверх)');
  }

  severLimb(limb, impulseVec = null) {
    if (!limb || !limb.severable || limb.severed) return;
    limb.severed = true;
    limb.hp = 0;
    limb.bleeding = true;
    limb.arterial = true;

    if (limb.jointConstraint) {
      this.world.removeConstraint(limb.jointConstraint);
      limb.jointConstraint = null;
    }

    this.sound.playGoreSever();
    this.sound.playNpcVocal(this.id, 'critical');

    const wPos = limb.mesh.position.clone();
    this.propsManager.spawnBloodSplatter(wPos, 32, new THREE.Vector3(0, 3.8, 0));
    this.propsManager.addFloorDecal(wPos.x, wPos.z, 0.58);

    const capRadius = Math.min(limb.size.x, limb.size.z) * 0.46;
    const capGeo = new THREE.CylinderGeometry(capRadius, capRadius, 0.024, 14);
    const childCap = new THREE.Mesh(capGeo, this.goreStumpMat);
    childCap.position.y = limb.size.y * 0.5 + 0.006;
    limb.mesh.add(childCap);

    if (limb.parentLimbKey && this.limbs[limb.parentLimbKey]) {
      const parentLimb = this.limbs[limb.parentLimbKey];
      const parentCap = new THREE.Mesh(capGeo, this.goreStumpMat);
      if (limb.key === 'head') {
        parentCap.position.set(0, parentLimb.size.y * 0.5 + 0.01, 0);
      } else if (limb.key.includes('Arm')) {
        const side = limb.key.includes('L') ? -1 : 1;
        parentCap.rotation.z = Math.PI / 2;
        parentCap.position.set(side * (parentLimb.size.x * 0.5 + 0.01), 0.06, 0);
      } else {
        parentCap.position.set(0, -parentLimb.size.y * 0.5 - 0.01, 0);
      }
      parentLimb.mesh.add(parentCap);
    }

    limb.body.wakeUp();
    if (impulseVec) {
      limb.body.velocity.set(impulseVec.x * 0.45, Math.max(2.5, impulseVec.y * 0.35), impulseVec.z * 0.45);
    } else {
      limb.body.velocity.set((Math.random() - 0.5) * 4, 2.8, (Math.random() - 0.5) * 4);
    }
    limb.body.angularVelocity.set(
      (Math.random() - 0.5) * 9,
      (Math.random() - 0.5) * 9,
      (Math.random() - 0.5) * 9
    );

    for (const childKey of limb.childLimbKeys) {
      const ch = this.limbs[childKey];
      if (ch && !ch.severed) {
        this.severLimb(ch, impulseVec);
      }
    }

    if (limb.key === 'head') {
      this.die(impulseVec);
    } else if (limb.key.includes('thigh') || limb.key.includes('calf')) {
      this.enterRagdoll(4.5, impulseVec);
    }
  }

  enterRagdoll(duration = 3.0, impulseVec = null) {
    this.isRagdoll = true;
    this.ragdollTimer = Math.max(this.ragdollTimer, duration);

    for (const limb of this.limbList) {
      limb.body.wakeUp();
      if (impulseVec && !limb.severed) {
        const factor = limb.key === 'upperTorso' ? 0.55 : 0.3;
        limb.body.velocity.x += impulseVec.x * factor;
        limb.body.velocity.y += Math.max(1.2, impulseVec.y * factor);
        limb.body.velocity.z += impulseVec.z * factor;
      }
    }
  }

  die(impulseVec = null) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.surrendered = false;
    this.enterRagdoll(999999, impulseVec);
    this.setEmotion('DEAD', 'ОБЕЗДВИЖЕН (Ragdoll)');
    this._updateLabelHP();
  }

  revive() {
    this.dead = false;
    this.surrendered = false;
    this.hp = this.maxHp;
    this.isRagdoll = false;
    this.ragdollTimer = 0;
    this.activeWounds = [];
    this.limpFactor = 0;
    this.aimPenalty = 0;

    for (const limb of this.limbList) {
      limb.hp = limb.maxHp;
      limb.bleeding = false;
      limb.arterial = false;
      limb.wounds = [];
      const targetPos = this.basePos.clone().add(limb.homeOffset);
      limb.body.position.set(targetPos.x, targetPos.y, targetPos.z);
      limb.body.velocity.set(0, 0, 0);
      limb.body.angularVelocity.set(0, 0, 0);
      limb.body.quaternion.set(0, 0, 0, 1);
    }

    this.setEmotion('CALM', 'Восстановлен');
    this._updateLabelHP();
  }

  _updateLabelHP() {
    if (!this.labelEl) return;
    const fill = this.labelEl.querySelector('.npc-hp-mini-fill');
    if (fill) {
      const pct = Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100));
      fill.style.width = `${pct}%`;
    }
  }

  onHearSound(soundPos, radius, type, label) {
    if (this.dead || this.personality === 'dummy' || this.surrendered) return;
    const myPos = this.getPosition();
    const dist = myPos.distanceTo(soundPos);
    if (dist > radius) return;

    this.investigatePoint = soundPos.clone();
    this.lookAtTarget = soundPos.clone();

    if (type === 'explosion') {
      this.aiState = 'RETREAT_DANGER';
      this.stateTimer = 4.0;
      this.setEmotion('ALERT', 'Укрытие от взрыва!');
    } else if (type === 'gunshot') {
      if (this.hostileToPlayer) {
        this.aiState = 'COMBAT_PLAYER';
      } else {
        this.aiState = 'INVESTIGATE_SOUND';
        this.stateTimer = 4.5;
        this.setEmotion('ALERT', `Слышит: ${label}`);
      }
    }
  }

  onWitnessPlayerViolence(eventPos, wasDirectHitOnMe = false) {
    if (this.dead || this.personality === 'dummy') return;
    const dist = this.getPosition().distanceTo(eventPos);
    if (!wasDirectHitOnMe && dist > 18) return;

    this.playerViolenceStrikes += wasDirectHitOnMe ? 2 : 1;

    if (this.hp <= 35) {
      this._enterSurrenderState();
      return;
    }

    if (this.playerViolenceStrikes >= 1) {
      this._enterRetaliationMode();
    }
  }

  _enterRetaliationMode() {
    if (this.dead || this.personality === 'dummy' || this.surrendered) return;
    this.hostileToPlayer = true;
    this.aiState = 'COMBAT_PLAYER';
    if (this.weaponMeshGroup && this.hasPistol) {
      this.weaponMeshGroup.visible = true;
    }
    this.setEmotion('AGGRO', this.hasPistol ? 'Огонь на поражение!' : 'Атакует в ближнем бою!');
  }

  getPosition() {
    const t = this.limbs.upperTorso;
    return t ? t.mesh.position.clone() : this.basePos.clone();
  }

  _updateWoundBleeding(dt) {
    if (this.activeWounds.length === 0) return;

    let totalBleed = 0;
    const arterialLimbs = [];
    const bleedingLimbs = [];

    for (const limb of this.limbList) {
      if (limb.arterial) arterialLimbs.push(limb);
      else if (limb.bleeding) bleedingLimbs.push(limb);
      for (const w of limb.wounds) {
        totalBleed += w.bleedRate;
      }
    }

    if (arterialLimbs.length > 0 && !this.dead) {
      this.arterialSpurtTimer += dt;
      if (this.arterialSpurtTimer >= 0.55) {
        this.arterialSpurtTimer = 0;
        const pick = arterialLimbs[Math.floor(Math.random() * arterialLimbs.length)];
        const pos = pick.mesh.position.clone();
        this.propsManager.spawnBloodSplatter(
          pos,
          6,
          new THREE.Vector3((Math.random() - 0.5) * 4, 2.2, (Math.random() - 0.5) * 4)
        );
        this.propsManager.addFloorDecal(pos.x + (Math.random() - 0.5) * 0.35, pos.z + (Math.random() - 0.5) * 0.35, 0.22);
      }
    }

    if (totalBleed > 0 && !this.dead) {
      this.bleedTickTimer += dt;
      if (this.bleedTickTimer >= 1.4) {
        this.bleedTickTimer = 0;
        this.hp = Math.max(0, this.hp - totalBleed * 0.65);
        this._updateLabelHP();

        if (bleedingLimbs.length > 0) {
          const pick = bleedingLimbs[Math.floor(Math.random() * bleedingLimbs.length)];
          this.propsManager.addFloorDecal(pick.mesh.position.x, pick.mesh.position.z, 0.18);
        }

        if (this.hp <= 0) {
          this.die();
        } else if (this.hp <= 35 && !this.surrendered && this.personality !== 'dummy') {
          this._enterSurrenderState();
        }
      }
    }
  }

  update(dt, player, allNpcs, propsList) {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.flinchTimer > 0) this.flinchTimer = Math.max(0, this.flinchTimer - dt);

    this._updateWoundBleeding(dt);

    if (this.isRagdoll) {
      if (!this.dead) {
        this.ragdollTimer -= dt;
        const torsoSpeed = this.limbs.upperTorso.body.velocity.length();
        const headReady = !this.limbs.head.severed;
        const legsReady = !this.limbs.thighL.severed && !this.limbs.thighR.severed;

        if (this.ragdollTimer <= 0 && torsoSpeed < 1.2 && headReady && legsReady) {
          this.isRagdoll = false;
          this.basePos.set(
            this.limbs.upperTorso.body.position.x,
            0,
            this.limbs.upperTorso.body.position.z
          );
          if (this.hp <= 35) {
            this._enterSurrenderState();
          } else {
            this.setEmotion(
              this.hostileToPlayer ? 'AGGRO' : 'ALERT',
              this.hostileToPlayer ? 'Поднялся в бой!' : 'Поднялся на ноги'
            );
          }
        }
      }
    } else if (!this.dead) {
      this._updateTacticalAI(dt, player, allNpcs, propsList);
      this._driveActiveBalancePose(dt);
    }

    for (const limb of this.limbList) {
      limb.mesh.position.copy(limb.body.position);
      limb.mesh.quaternion.copy(limb.body.quaternion);
    }
  }

  _updateTacticalAI(dt, player, allNpcs, propsList) {
    if (this.personality === 'dummy') {
      this.walkCycle += dt * 1.4;
      return;
    }

    const playerPos = player.getPosition();
    const myPos = this.basePos.clone();
    const distToPlayer = myPos.distanceTo(playerPos);

    if (this.surrendered || this.aiState === 'SURRENDER') {
      this.lookAtTarget = playerPos.clone();
      const toPlayer = playerPos.clone().sub(myPos);
      this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
      if (distToPlayer < 4.2) {
        const away = myPos.clone().sub(playerPos).normalize();
        this._moveTowards(myPos.clone().addScaledVector(away, 3.0), dt, 1.35);
      } else {
        this.walkCycle += dt * 1.8;
      }
      this._smoothRotateYaw(dt, 6.0);
      return;
    }

    for (const prop of propsList) {
      if (prop.broken) continue;
      const pVel = prop.body.velocity.length();
      if (pVel > 5.0) {
        const pPos = new THREE.Vector3(prop.body.position.x, 0, prop.body.position.z);
        if (pPos.distanceTo(myPos) < 4.5) {
          this.aiState = 'DODGE_HAZARD';
          this.investigatePoint = pPos;
          this.stateTimer = 1.2;
          this.setEmotion('ALERT', 'Уклонение!');
          break;
        }
      }
    }

    this.stateTimer -= dt;

    switch (this.aiState) {
      case 'PATROL_WALK': {
        this._moveTowards(this.patrolTarget, dt, 2.05);
        if (myPos.distanceTo(this.patrolTarget) < 1.2 || this.stateTimer <= 0) {
          this.aiState = 'STOP_LOOK';
          this.stateTimer = 2.0 + Math.random() * 2.5;
          this.setEmotion('CALM', 'Осматривает сектор');
        } else if (distToPlayer < 6.5) {
          this.lookAtTarget = playerPos;
        }
        break;
      }

      case 'STOP_LOOK': {
        this.walkCycle += dt * 1.6;
        if (distToPlayer < 7.5) {
          const toP = playerPos.clone().sub(myPos);
          this.targetYaw = Math.atan2(toP.x, toP.z);
        } else if (Math.random() < 0.02) {
          this.targetYaw += (Math.random() - 0.5) * 1.2;
        }
        if (this.stateTimer <= 0) {
          this.patrolTarget = this._pickRandomPatrolPoint();
          this.aiState = 'PATROL_WALK';
          this.stateTimer = 5.0 + Math.random() * 4.0;
          this.setEmotion('CALM', 'Патрулирует периметр');
        }
        break;
      }

      case 'INVESTIGATE_SOUND': {
        if (this.investigatePoint) {
          this._moveTowards(this.investigatePoint, dt, 2.8);
          if (myPos.distanceTo(this.investigatePoint) < 2.2 || this.stateTimer <= 0) {
            this.aiState = 'STOP_LOOK';
            this.stateTimer = 3.0;
            this.setEmotion('ALERT', 'Проверяет источник шума');
          }
        } else {
          this.aiState = 'STOP_LOOK';
        }
        break;
      }

      case 'DODGE_HAZARD':
      case 'RETREAT_DANGER': {
        const threat = this.investigatePoint || playerPos;
        const awayDir = myPos.clone().sub(threat).normalize();
        if (awayDir.lengthSq() < 0.01) awayDir.set(1, 0, 0);
        const safePt = myPos.clone().addScaledVector(awayDir, 6.0);
        this._moveTowards(safePt, dt, 4.1);
        if (this.stateTimer <= 0) {
          this.aiState = this.hostileToPlayer ? 'COMBAT_PLAYER' : 'STOP_LOOK';
          this.stateTimer = 2.5;
        }
        break;
      }

      case 'COMBAT_PLAYER': {
        const toPlayer = playerPos.clone().sub(myPos);
        this.targetYaw = Math.atan2(toPlayer.x, toPlayer.z);

        if (this.hasPistol && !this.limbs.forearmR.severed) {
          if (distToPlayer > 11.5) {
            this._moveTowards(playerPos, dt, 3.0);
          } else if (distToPlayer < 5.0) {
            const backPt = myPos.clone().sub(toPlayer.normalize().multiplyScalar(3.0));
            this._moveTowards(backPt, dt, 2.5);
          } else {
            this.walkCycle += dt * 3.0;
          }

          if (this.attackCooldown <= 0 && distToPlayer < 22) {
            this.attackCooldown = 1.25 + Math.random() * 0.7;
            this._fireAtPlayer(player);
          }
        } else {
          if (distToPlayer > 1.75) {
            this._moveTowards(playerPos, dt, 3.8);
          } else if (this.attackCooldown <= 0) {
            this.attackCooldown = 0.95;
            this.sound.playImpact('flesh', 0.85);
            player.takeDamage(12, toPlayer.normalize().multiplyScalar(4.0));
          }
        }
        break;
      }
    }

    this._smoothRotateYaw(dt, 6.5);
  }

  _moveTowards(targetPt, dt, speed) {
    const dir = new THREE.Vector3(targetPt.x - this.basePos.x, 0, targetPt.z - this.basePos.z);
    const dist = dir.length();
    if (dist < 0.05) return;
    dir.normalize();

    this.targetYaw = Math.atan2(dir.x, dir.z);

    const effectiveSpeed = speed * (1.0 - this.limpFactor * 0.45);
    this.basePos.x += dir.x * effectiveSpeed * dt;
    this.basePos.z += dir.z * effectiveSpeed * dt;

    this.basePos.x = Math.max(-22.5, Math.min(22.5, this.basePos.x));
    this.basePos.z = Math.max(-22.5, Math.min(22.5, this.basePos.z));

    this.walkCycle += dt * effectiveSpeed * 3.4;
  }

  _smoothRotateYaw(dt, turnSpeed) {
    let diff = this.targetYaw - this.facingYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facingYaw += diff * Math.min(1, dt * turnSpeed);
  }

  _fireAtPlayer(player) {
    if (!this.limbs.forearmR || this.limbs.forearmR.severed) return;
    this.sound.playGunshot();

    const muzzlePos = this.limbs.forearmR.mesh.position.clone().add(new THREE.Vector3(0, 0.05, 0));
    const flash = new THREE.PointLight(0xfbbf24, 10, 5);
    flash.position.copy(muzzlePos);
    this.scene.add(flash);
    setTimeout(() => this.scene.remove(flash), 55);

    const hitChance = Math.max(0.15, 0.58 * (1.0 - this.aimPenalty * 0.65));
    if (Math.random() < hitChance) {
      player.takeDamage(9);
    }
  }

  _driveActiveBalancePose(dt) {
    const s = Math.sin(this.walkCycle);
    const c = Math.cos(this.walkCycle);
    const isMoving =
      this.aiState === 'PATROL_WALK' ||
      this.aiState === 'INVESTIGATE_SOUND' ||
      this.aiState === 'DODGE_HAZARD' ||
      this.aiState === 'RETREAT_DANGER' ||
      (this.aiState === 'COMBAT_PLAYER' && (!this.hasPistol || this.attackCooldown > 0.4));

    const swingAmp = isMoving ? 0.34 : 0.03;
    const limpDip = isMoving && this.limpFactor > 0 ? Math.max(0, s) * this.limpFactor * 0.065 : 0;
    const flinchKick = this.flinchTimer > 0 ? Math.sin((this.flinchTimer / 0.22) * Math.PI) * 0.14 : 0;
    const bob = (isMoving ? Math.abs(c) * 0.025 : Math.sin(this.walkCycle) * 0.008) - limpDip;

    for (const limb of this.limbList) {
      limb.animOffset.set(0, bob, 0);
      limb.animRot.set(0, 0, 0);
    }

    if (this.limbs.upperTorso) {
      this.limbs.upperTorso.animRot.x = -flinchKick;
    }

    if (this.limbs.thighL && this.limbs.thighR && this.limbs.calfL && this.limbs.calfR) {
      this.limbs.thighL.animRot.x = s * swingAmp;
      this.limbs.thighL.animOffset.z = Math.sin(s * swingAmp) * 0.09;
      this.limbs.calfL.animRot.x = Math.max(0, -s * swingAmp * 0.85);
      this.limbs.calfL.animOffset.z = this.limbs.thighL.animOffset.z - Math.sin(this.limbs.calfL.animRot.x) * 0.09;

      this.limbs.thighR.animRot.x = -s * swingAmp;
      this.limbs.thighR.animOffset.z = Math.sin(-s * swingAmp) * 0.09;
      this.limbs.calfR.animRot.x = Math.max(0, s * swingAmp * 0.85);
      this.limbs.calfR.animOffset.z = this.limbs.thighR.animOffset.z - Math.sin(this.limbs.calfR.animRot.x) * 0.09;
    }

    if (this.limbs.upperArmL && this.limbs.forearmL) {
      if (this.surrendered) {
        this.limbs.upperArmL.animRot.x = -Math.PI * 0.86;
        this.limbs.upperArmL.animRot.z = 0.14;
        this.limbs.upperArmL.animOffset.set(-0.02, 0.22, 0.02);

        this.limbs.forearmL.animRot.x = -Math.PI * 0.92;
        this.limbs.forearmL.animRot.z = 0.10;
        this.limbs.forearmL.animOffset.set(-0.03, 0.64, 0.03);
      } else {
        this.limbs.upperArmL.animRot.x = -s * swingAmp * 0.65;
        this.limbs.forearmL.animRot.x = -0.16 - Math.max(0, s * swingAmp * 0.45);
      }
    }

    if (this.limbs.upperArmR && this.limbs.forearmR) {
      if (this.surrendered) {
        this.limbs.upperArmR.animRot.x = -Math.PI * 0.86;
        this.limbs.upperArmR.animRot.z = -0.14;
        this.limbs.upperArmR.animOffset.set(0.02, 0.22, 0.02);

        this.limbs.forearmR.animRot.x = -Math.PI * 0.92;
        this.limbs.forearmR.animRot.z = -0.10;
        this.limbs.forearmR.animOffset.set(0.03, 0.64, 0.03);
      } else if (this.hostileToPlayer && this.hasPistol) {
        this.limbs.upperArmR.animRot.x = -1.25;
        this.limbs.upperArmR.animOffset.z = 0.14;
        this.limbs.upperArmR.animOffset.y = 0.08;

        this.limbs.forearmR.animRot.x = -1.45;
        this.limbs.forearmR.animOffset.z = 0.34;
        this.limbs.forearmR.animOffset.y = 0.26;
      } else {
        this.limbs.upperArmR.animRot.x = s * swingAmp * 0.65;
        this.limbs.forearmR.animRot.x = -0.16 - Math.max(0, -s * swingAmp * 0.45);
      }
    }

    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.facingYaw);

    for (const limb of this.limbList) {
      if (limb.severed) continue;

      const localPos = limb.homeOffset.clone().add(limb.animOffset);
      localPos.applyQuaternion(yawQuat);
      const targetPos = this.basePos.clone().add(localPos);

      const localQuat = new THREE.Quaternion().setFromEuler(limb.animRot);
      const targetQuat = yawQuat.clone().multiply(localQuat);

      limb.body.position.set(
        THREE.MathUtils.lerp(limb.body.position.x, targetPos.x, Math.min(1, dt * 18)),
        THREE.MathUtils.lerp(limb.body.position.y, targetPos.y, Math.min(1, dt * 18)),
        THREE.MathUtils.lerp(limb.body.position.z, targetPos.z, Math.min(1, dt * 18))
      );
      limb.body.velocity.set(0, 0, 0);
      limb.body.angularVelocity.set(0, 0, 0);
      limb.body.quaternion.set(targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w);
    }
  }

  updateScreenLabel(camera) {
    if (!this.labelEl) return;
    const headOrTorso = !this.limbs.head.severed ? this.limbs.head : this.limbs.upperTorso;
    const worldPos = headOrTorso.mesh.position.clone();
    worldPos.y += 0.34;

    const projected = worldPos.project(camera);
    if (projected.z > 1.0) {
      this.labelEl.style.display = 'none';
      return;
    }

    const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    this.labelEl.style.display = 'block';
    this.labelEl.style.left = `${x}px`;
    this.labelEl.style.top = `${y}px`;
  }

  destroy() {
    for (const c of this.joints) {
      this.world.removeConstraint(c);
    }
    for (const l of this.limbList) {
      this.scene.remove(l.mesh);
      this.world.removeBody(l.body);
    }
    if (this.labelEl && this.labelEl.parentNode) {
      this.labelEl.parentNode.removeChild(this.labelEl);
    }
  }
}

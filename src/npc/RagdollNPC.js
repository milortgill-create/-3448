import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * RagdollNPC — Точная 3D-модель по эталонному фото + 56 видов и рисунков ран GoreBox + Красная кровь:
 * - Точная геометрия и палитра по фото (блок головы цвета кожи с тонкой коричневой полоской волос сверху,
 *   открытая шея, серая кофта со ступенчатым V-силуэтом и плечевыми блоками, оголённые предплечья,
 *   тёмно-коричневые беспалые перчатки с пальцами, тёмно-серые штаны с просветом между бёдрами,
 *   коричневые ботинки).
 * - Отсутствие самоколлизий между сегментами НПС и коллизий с капсулой игрока: НПС НЕ разваливается
 *   от одного удара и НЕ падает от касания игрока.
 * - Полная система 56 видов ран и 56 уникальных рисунков ран GoreBox (пулевые, ушибленные/гематомы,
 *   рубленые/резаные от лома, взрывные/открытые переломы) с артериальным и венозным кровотечением,
 *   хромотой при ранении ног и потерей точности/оружия при ранении рук.
 * - Ограничения углов сгиба суставов (шея ±45°, плечи ±60°, локти ±90°, колени ±90°) и механика сдачи.
 */
export class RagdollNPC {
  constructor(id, config, scene, world, propsManager, soundManager) {
    this.id = id;
    this.name = config.name || `Испытуемый-${id}`;
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

    // Список активных ран НПС (из атласа 56 видов ран GoreBox)
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

    // Фиксированная эталонная палитра точь-в-точь как на присланном фото
    this.appearance = {
      skinHex: 0xf3d4b5,
      neckSkinHex: 0xe4c2a2,
      hairHex: 0x4b3628,
      shirtHex: 0x9aa0a6,
      shirtMidHex: 0x8f959b,
      shirtWaistHex: 0x83898f,
      gloveHex: 0x493325,
      pantsHex: 0x3d4145,
      pantsDarkHex: 0x32363a,
      bootShaftHex: 0x5c3e2b,
      bootToeHex: 0x4a3121,
      bootSoleHex: 0x2b1c12
    };

    this._buildExactReferenceDoll();
    this._createFloatingLabel();
  }

  _pickRandomPatrolPoint() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 3.0 + Math.random() * 10.5;
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }

  /**
   * Строит 3D-модель НПС в точь-в-точь по присланному фото:
   * - Плоское гранёное освещение (flatShading: true)
   * - Чистый прямоугольный блок головы цвета кожи (#f3d4b5) с тонкой коричневой полоской волос сверху (#4b3628)
   * - Выделенная шея и V-образный вырез ворота на серой кофте
   * - Плечевые накладки и ступенчатое сужение серого торса к талии
   * - Серые рукава до локтя, оголённые предплечья, коричневые беспалые перчатки и пальцы
   * - Тёмно-серые штаны с чётким разделением бёдер и массивные коричневые ботинки
   */
  _buildExactReferenceDoll() {
    const ap = this.appearance;
    const flatMat = (hex, rough = 0.72) =>
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: rough,
        metalness: 0.04,
        flatShading: true
      });

    const skinMat = flatMat(ap.skinHex, 0.62);
    const neckMat = flatMat(ap.neckSkinHex, 0.65);
    const hairMat = flatMat(ap.hairHex, 0.82);
    const shirtMat = flatMat(ap.shirtHex, 0.76);
    const shirtMidMat = flatMat(ap.shirtMidHex, 0.78);
    const shirtWaistMat = flatMat(ap.shirtWaistHex, 0.8);
    const gloveMat = flatMat(ap.gloveHex, 0.7);
    const pantsMat = flatMat(ap.pantsHex, 0.8);
    const pantsDarkMat = flatMat(ap.pantsDarkHex, 0.82);
    const bootShaftMat = flatMat(ap.bootShaftHex, 0.68);
    const bootToeMat = flatMat(ap.bootToeHex, 0.64);
    const bootSoleMat = flatMat(ap.bootSoleHex, 0.88);

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

    // Вспомогательный билдер сегмента:
    // collisionFilterGroup = 2, collisionFilterMask = 1 -> Сегменты НПС сталкиваются с полом/предметами (группа 1),
    // но НИКОГДА не сталкиваются друг с другом, поэтому НПС не разваливается изнутри!
    const createLimbSegment = (key, label, sizeVec, offsetVec, mass, mat, severable = true, maxHp = 120) => {
      const group = new THREE.Group();
      const coreGeo = new THREE.BoxGeometry(sizeVec.x, sizeVec.y, sizeVec.z);
      const coreMesh = new THREE.Mesh(coreGeo, mat.clone());
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

    // 1. ГОЛОВА И ШЕЯ (точь-в-точь как на фото: чистый бежевый прямоугольный блок + тонкая коричневая шапочка волос сверху)
    const head = createLimbSegment(
      'head',
      'Голова',
      new THREE.Vector3(0.205, 0.255, 0.205),
      new THREE.Vector3(0, 1.56, 0),
      2.2,
      skinMat,
      true,
      110
    );
    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.209, 0.024, 0.209), hairMat);
    hairTop.position.set(0, 0.132, 0);
    const neckBlock = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.072, 0.102), neckMat);
    neckBlock.position.set(0, -0.155, 0);
    head.mesh.add(hairTop, neckBlock);

    // 2. ВЕРХНИЙ ТОРС / ГРУДЬ (ступенчатая серая кофта с плечевыми блоками и V-образным вырезом шеи)
    const upperTorso = createLimbSegment(
      'upperTorso',
      'Грудная клетка',
      new THREE.Vector3(0.31, 0.27, 0.185),
      new THREE.Vector3(0, 1.25, 0),
      8.5,
      shirtMat,
      false,
      220
    );
    // V-вырез цвета кожи сверху по центру груди
    const vNeckSkin = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.048, 0.19), skinMat);
    vNeckSkin.position.set(0, 0.118, 0.002);
    // Выступающие плечевые блоки серой кофты слева и справа (как на фото)
    const shoulderCapL = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.125, 0.178), shirtMat);
    shoulderCapL.position.set(-0.175, 0.072, 0);
    const shoulderCapR = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.125, 0.178), shirtMat);
    shoulderCapR.position.set(0.175, 0.072, 0);
    // Средняя ступенька торса
    const chestMidStep = new THREE.Mesh(new THREE.BoxGeometry(0.265, 0.11, 0.176), shirtMidMat);
    chestMidStep.position.set(0, -0.095, 0);
    upperTorso.mesh.add(vNeckSkin, shoulderCapL, shoulderCapR, chestMidStep);

    // 3. НИЖНИЙ ТОРС И ТАЗ (талиевый блок серой кофты + верх тёмно-серых штанов с просветом)
    const abdomen = createLimbSegment(
      'abdomen',
      'Живот и таз',
      new THREE.Vector3(0.235, 0.23, 0.165),
      new THREE.Vector3(0, 0.99, 0),
      6.5,
      shirtWaistMat,
      false,
      190
    );
    // Верхний блок тёмных штанов (пояс и бедренная кокетка)
    const pelvisPants = new THREE.Mesh(new THREE.BoxGeometry(0.258, 0.115, 0.172), pantsDarkMat);
    pelvisPants.position.set(0, -0.068, 0);
    const pelvisHipL = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.065, 0.168), pantsMat);
    pelvisHipL.position.set(-0.076, -0.135, 0);
    const pelvisHipR = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.065, 0.168), pantsMat);
    pelvisHipR.position.set(0.076, -0.135, 0);
    abdomen.mesh.add(pelvisPants, pelvisHipL, pelvisHipR);

    // 4. ПЛЕЧИ И РУКАВА КОФТЫ (upperArmL, upperArmR)
    const upperArmL = createLimbSegment(
      'upperArmL',
      'Л. Плечо',
      new THREE.Vector3(0.098, 0.23, 0.098),
      new THREE.Vector3(-0.245, 1.21, 0),
      1.6,
      shirtMidMat,
      true,
      115
    );
    const cuffSleeveL = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.032, 0.102), shirtWaistMat);
    cuffSleeveL.position.y = -0.105;
    upperArmL.mesh.add(cuffSleeveL);

    const upperArmR = createLimbSegment(
      'upperArmR',
      'П. Плечо',
      new THREE.Vector3(0.098, 0.23, 0.098),
      new THREE.Vector3(0.245, 1.21, 0),
      1.6,
      shirtMidMat,
      true,
      115
    );
    const cuffSleeveR = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.032, 0.102), shirtWaistMat);
    cuffSleeveR.position.y = -0.105;
    upperArmR.mesh.add(cuffSleeveR);

    // 5. ПРЕДПЛЕЧЬЯ + БЕСПАЛЫЕ КОРИЧНЕВЫЕ ПЕРЧАТКИ + ПАЛЬЦЫ (forearmL, forearmR)
    const addGloveAndFingers = (forearmLimb, isLeft) => {
      const s = isLeft ? -1 : 1;
      // Коричневая беспалая перчатка
      const gloveBox = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.078, 0.092), gloveMat);
      gloveBox.position.set(0, -0.115, 0);
      // Выступающие бежевые пальцы
      const fingersBox = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.062, 0.078), skinMat);
      fingersBox.position.set(0, -0.175, 0);
      // Большой палец сбоку
      const thumbBase = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.038, 0.035), gloveMat);
      thumbBase.position.set(s * 0.048, -0.118, 0.024);
      const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.032, 0.030), skinMat);
      thumbTip.position.set(s * 0.052, -0.146, 0.028);
      forearmLimb.mesh.add(gloveBox, fingersBox, thumbBase, thumbTip);
    };

    const forearmL = createLimbSegment(
      'forearmL',
      'Л. Предплечье',
      new THREE.Vector3(0.086, 0.21, 0.086),
      new THREE.Vector3(-0.245, 0.94, 0),
      1.3,
      skinMat,
      true,
      105
    );
    addGloveAndFingers(forearmL, true);

    const forearmR = createLimbSegment(
      'forearmR',
      'П. Предплечье',
      new THREE.Vector3(0.086, 0.21, 0.086),
      new THREE.Vector3(0.245, 0.94, 0),
      1.3,
      skinMat,
      true,
      105
    );
    addGloveAndFingers(forearmR, false);

    // 6. БЁДРА С ПРОСВЕТОМ МЕЖДУ НОГАМИ (thighL, thighR)
    const thighL = createLimbSegment(
      'thighL',
      'Л. Бедро',
      new THREE.Vector3(0.104, 0.34, 0.112),
      new THREE.Vector3(-0.082, 0.66, 0),
      2.6,
      pantsMat,
      true,
      130
    );
    const kneeCapL = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.055, 0.108), pantsDarkMat);
    kneeCapL.position.set(0, -0.165, 0);
    thighL.mesh.add(kneeCapL);

    const thighR = createLimbSegment(
      'thighR',
      'П. Бедро',
      new THREE.Vector3(0.104, 0.34, 0.112),
      new THREE.Vector3(0.082, 0.66, 0),
      2.6,
      pantsMat,
      true,
      130
    );
    const kneeCapR = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.055, 0.108), pantsDarkMat);
    kneeCapR.position.set(0, -0.165, 0);
    thighR.mesh.add(kneeCapR);

    // 7. ГОЛЕНИ И КОРИЧНЕВЫЕ БОТИНКИ (calfL, calfR)
    const addBrownBoot = (calfLimb) => {
      // Голенище коричневого ботинка
      const bootShaft = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.095, 0.112), bootShaftMat);
      bootShaft.position.set(0, -0.11, 0.004);
      // Массивный носок/нижняя часть ботинка (чуть шире голенища, как на фото)
      const bootLower = new THREE.Mesh(new THREE.BoxGeometry(0.114, 0.075, 0.165), bootToeMat);
      bootLower.position.set(0, -0.165, 0.026);
      // Подошва
      const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.022, 0.172), bootSoleMat);
      bootSole.position.set(0, -0.202, 0.026);
      calfLimb.mesh.add(bootShaft, bootLower, bootSole);
    };

    const calfL = createLimbSegment(
      'calfL',
      'Л. Голень',
      new THREE.Vector3(0.090, 0.28, 0.096),
      new THREE.Vector3(-0.082, 0.31, 0),
      2.0,
      pantsDarkMat,
      true,
      120
    );
    addBrownBoot(calfL);

    const calfR = createLimbSegment(
      'calfR',
      'П. Голень',
      new THREE.Vector3(0.090, 0.28, 0.096),
      new THREE.Vector3(0.082, 0.31, 0),
      2.0,
      pantsDarkMat,
      true,
      120
    );
    addBrownBoot(calfR);

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

    // СУСТАВЫ CONETWIST С ОГРАНИЧЕНИЯМИ УГЛОВ СГИБА (collideConnected: false, чтобы соседние сегменты не толкали друг друга!)
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

    // Шея: ±45°
    linkConeJoint(upperTorso, head, new THREE.Vector3(0, 0.16, 0), new THREE.Vector3(0, -0.15, 0), deg(45), deg(30));
    // Поясница: ±25°
    linkConeJoint(upperTorso, abdomen, new THREE.Vector3(0, -0.14, 0), new THREE.Vector3(0, 0.12, 0), deg(25), deg(20));
    // Плечи: ±60°
    linkConeJoint(upperTorso, upperArmL, new THREE.Vector3(-0.22, 0.09, 0), new THREE.Vector3(0, 0.12, 0), deg(60), deg(35));
    linkConeJoint(upperTorso, upperArmR, new THREE.Vector3(0.22, 0.09, 0), new THREE.Vector3(0, 0.12, 0), deg(60), deg(35));
    // Локти: ±90°
    linkConeJoint(upperArmL, forearmL, new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, 0.11, 0), deg(90), deg(20));
    linkConeJoint(upperArmR, forearmR, new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, 0.11, 0), deg(90), deg(20));
    // Тазобедренные суставы: ±50°
    linkConeJoint(abdomen, thighL, new THREE.Vector3(-0.082, -0.13, 0), new THREE.Vector3(0, 0.17, 0), deg(50), deg(20));
    linkConeJoint(abdomen, thighR, new THREE.Vector3(0.082, -0.13, 0), new THREE.Vector3(0, 0.17, 0), deg(50), deg(20));
    // Колени: ±90°
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

        // Игнорируем столкновения с сегментами НПС и с капсулой игрока, чтобы НПС не падал от касания игрока!
        if (other.userData && (other.userData.npc === this || other.userData.type === 'player')) {
          return;
        }
        // Игнорируем обычное стояние на полу
        if (other.mass === 0 && !this.isRagdoll) {
          return;
        }

        const relVel = e.contact.getImpactVelocityAlongNormal();
        const impactSpeed = Math.abs(relVel);

        // Только очень сильный удар тяжёлым летящим предметом (ящик, бочка, шлакоблок на высокой скорости) наносит урон
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

  /**
   * Выбирает подходящую рану из 56 видов и 56 рисунков ран GoreBox и прикрепляет её 3D-декаль на конечность!
   */
  _applyGoreBoxWound56(limb, damage, hitPoint, damageType = 'bullet') {
    const goreTex =
      this.propsManager && this.propsManager.textures && this.propsManager.textures.gore
        ? this.propsManager.textures.gore
        : null;
    const atlas = goreTex && goreTex.woundAtlas56 ? goreTex.woundAtlas56 : [];
    if (atlas.length === 0) return null;

    // Подбираем категорию из 56 видов ран:
    // 0..13 = bullet (14 видов)
    // 14..27 = blunt (14 видов)
    // 28..41 = slash (14 видов)
    // 42..55 = blast (14 видов)
    let startIdx = 0;
    if (damageType === 'bullet') startIdx = 0;
    else if (damageType === 'blunt') startIdx = 14;
    else if (damageType === 'slash') startIdx = 28;
    else if (damageType === 'blast') startIdx = 42;

    // Учитываем тяжесть урона и существующие раны, чтобы открывать все 14 подвидов внутри категории
    const severityOffset = Math.min(13, Math.floor((damage / 38) * 7) + (this.activeWounds.length % 8));
    const woundDef = atlas[startIdx + severityOffset] || atlas[0];

    // 1. Создаём 3D-декаль с уникальным рисунком этой раны непосредственно на повреждённом сегменте тела
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

    // Размещаем на передней/боковой грани конечности в точке попадания
    const localY = hitPoint
      ? Math.max(-limb.size.y * 0.36, Math.min(limb.size.y * 0.36, hitPoint.y - limb.mesh.position.y))
      : (Math.random() - 0.5) * limb.size.y * 0.5;
    const localX = (Math.random() - 0.5) * limb.size.x * 0.42;
    const sideFront = Math.random() > 0.25 ? 1 : -1;

    decalMesh.position.set(localX, localY, sideFront * (limb.size.z * 0.5 + 0.003));
    if (sideFront < 0) decalMesh.rotation.y = Math.PI;
    decalMesh.rotation.z = (Math.random() - 0.5) * 0.5;
    limb.mesh.add(decalMesh);

    // Если рана глубокая (резаная, пулевая крупная или взрывная) — добавляем объёмный 3D-слой обнажённой красной ткани/кости
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

    // 2. Регистрируем рану и её механики (кровотечение, артериальный выброс, хромота, штраф к точности)
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

    // Пересчитываем механические эффекты ран (хромота при ранении ног, дрожь прицела при ранении рук)
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

  /**
   * Наносит урон конкретной части тела, создаёт рану из 56 видов и брызги красной крови.
   * НПС НЕ разваливается от одного удара!
   */
  damageLimb(limb, amount, hitPoint, impulseVec = null, damageType = 'bullet', byPlayer = false) {
    if (!limb) return;

    limb.hp = Math.max(0, limb.hp - amount);
    const mult = limb.key === 'head' ? 1.45 : limb.key === 'upperTorso' ? 1.0 : 0.65;
    this.hp = Math.max(0, this.hp - amount * mult);
    this.flinchTimer = 0.22;

    const fxPos = hitPoint ? hitPoint.clone() : limb.mesh.position.clone();

    // 1. Применяем рану из 56 видов и рисунков ран GoreBox
    const appliedWound = this._applyGoreBoxWound56(limb, amount, fxPos, damageType);

    // 2. Красные брызги крови и красная лужа на полу
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

    // 3. Отсоединение конечности происходит ТОЛЬКО при полном разрушении сегмента (limb.hp <= 0)
    // И мощном рубящем/взрывном/крупнокалиберном воздействии (а не от одного лёгкого удара!)
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

    // 4. Проверка критического состояния
    if (this.hp <= 0 && !this.dead) {
      this.die(impulseVec);
      return;
    }

    // При низком здоровье (<= 35 HP) НПС сдаётся и поднимает руки вверх
    if (!this.dead && this.hp <= 35 && this.personality !== 'dummy') {
      this._enterSurrenderState();
    }

    // В регдолл падает только от взрыва, сильного удара по ногам или тяжёлого нокдауна (НЕ от одного обычного удара рукой)
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

  /**
   * Отсоединяет сегмент конечности с открытием красного среза (мышцы + кость) и фонтаном красной крови.
   */
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

  /**
   * Обрабатывает активное кровотечение из ран (венозные капли и пульсирующие артериальные выбросы красной крови).
   */
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

    // Пульсирующий артериальный выброс красной крови каждые 0.55 сек
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

    // Венозное капание и потеря здоровья от кровопотери каждые 1.4 сек
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

    // Хромота при ранении ног снижает скорость передвижения (как в GoreBox)
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
      limb.body. velocity.set(0, 0, 0);
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

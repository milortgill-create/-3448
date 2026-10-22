import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TextureGenerator } from './textures/TextureGenerator.js';
import { SoundManager } from './audio/SoundManager.js';
import { TestMap } from './world/TestMap.js';
import { PropsManager } from './physics/PropsManager.js';
import { RagdollNPC } from './npc/RagdollNPC.js';
import { FirstPersonPlayer } from './player/FirstPersonPlayer.js';
import { TouchControls } from './player/TouchControls.js';

class MezhdugornySandboxGame {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.npcs = [];
    this.nextNpcId = 1;
    this.timeScale = 1.0;
    this.aiGlobalMode = 0;
    this.dollInspectMode = 'player'; // 'player' | 'npc'
    this.fpsFrames = 0;
    this.fpsLastTime = performance.now();
    this.currentFps = 60;

    this._initRendererAndScene();
    this._initPhysicsWorld();
    this._startLoadingSequence();
  }

  _initRendererAndScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      74,
      window.innerWidth / window.innerHeight,
      0.08,
      140
    );
    this.scene.add(this.camera);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.autoClear = false;

    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      if (this.player) {
        this.player.onResize(window.innerWidth, window.innerHeight);
      }
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _initPhysicsWorld() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 10;
    this.world.defaultContactMaterial.friction = 0.48;
    this.world.defaultContactMaterial.restitution = 0.16;
  }

  _setLoadingProgress(pct, text) {
    const bar = document.getElementById('loading-progress');
    const st = document.getElementById('loading-status');
    if (bar) bar.style.width = `${pct}%`;
    if (st) st.textContent = text;
  }

  _startLoadingSequence() {
    const texGen = new TextureGenerator(this.renderer);
    this.textures = {};

    setTimeout(() => {
      this._setLoadingProgress(35, 'Генерация 2K PBR текстур бетона (2048×2048)...');
      this.textures.concrete = texGen.createConcrete2K();

      setTimeout(() => {
        this._setLoadingProgress(68, 'Генерация 2K текстур ящиков, бочек и текстур ран GoreBox...');
        this.textures.wood = texGen.createWoodCrate2K();
        this.textures.barrelRed = texGen.createMetalBarrel2K('#b91c1c', '#facc15', 'ОГНЕОПАСНО // ПРОПАН');
        this.textures.barrelBlue = texGen.createMetalBarrel2K('#1d4ed8', '#e2e8f0', 'ТЕХ. ВОДА // МЕЖДУГОРНЫЙ');
        this.textures.cinder = texGen.createCinderBlockTexture();
        this.textures.gore = texGen.createGoreAndWoundTextures();

        setTimeout(() => {
          this._setLoadingProgress(92, 'Сборка Goredoll НПС, 2D куклы травм и оружия...');
          this._buildGameSystems();
          this._setLoadingProgress(100, 'Готово!');

          setTimeout(() => {
            const loader = document.getElementById('loading-screen');
            if (loader) loader.classList.add('fade-out');
          }, 150);
        }, 25);
      }, 25);
    }, 20);
  }

  _buildGameSystems() {
    this.sound = new SoundManager();
    this.testMap = new TestMap(this.scene, this.world, this.textures);

    this.propsManager = new PropsManager(
      this.scene,
      this.world,
      this.textures,
      this.sound,
      (pos, radius, type, label) => this._broadcastSoundToNPCs(pos, radius, type, label),
      (msg) => this.showToast(msg)
    );

    this.propsManager.onExplosionBlast = (centerPos, radius, force) => {
      if (this.player) {
        const pDist = this.player.getPosition().distanceTo(centerPos);
        if (pDist < radius * 1.6) {
          this.player.addCameraShake(Math.min(1.0, (1 - pDist / (radius * 1.6)) * 0.95));
        }
        if (pDist < radius * 0.9) {
          const pFactor = 1 - pDist / (radius * 0.9);
          this.player.takeDamage(Math.round(38 * pFactor));
        }
      }

      for (const npc of this.npcs) {
        const nPos = npc.getPosition();
        const dist = nPos.distanceTo(centerPos);
        if (dist < radius) {
          const factor = Math.pow(1 - dist / radius, 1.1);
          const dir = nPos.clone().sub(centerPos).normalize();
          dir.y = 0.65;
          dir.normalize();
          const blastVec = dir.clone().multiplyScalar(force * 0.8 * factor);

          if (dist < radius * 0.58) {
            const severCandidates = [
              npc.limbs.forearmL,
              npc.limbs.forearmR,
              npc.limbs.calfL,
              npc.limbs.upperArmR,
              npc.limbs.thighL
            ].filter((l) => l && !l.severed);
            const count = dist < radius * 0.35 ? 2 : 1;
            for (let k = 0; k < count && severCandidates.length > 0; k++) {
              const pick = severCandidates.splice(Math.floor(Math.random() * severCandidates.length), 1)[0];
              npc.severLimb(pick, blastVec);
            }
          }

          npc.damageLimb(
            npc.limbs.upperTorso,
            78 * factor,
            nPos,
            blastVec,
            'bullet',
            true
          );
          npc.enterRagdoll(4.2, dir.multiplyScalar(force * 0.5 * factor));
        } else if (dist < radius * 2.2) {
          npc.onWitnessPlayerViolence(centerPos, false);
        }
      }
    };

    this.propsManager.populateInitialProps();
    this._spawnInitialNPCs();

    this.player = new FirstPersonPlayer(
      this.camera,
      this.scene,
      this.world,
      this.propsManager,
      this.sound,
      (msg) => this.showToast(msg),
      () => this.triggerHitmarker(),
      (playerPos, attackedNpc) => this._notifyNPCsOfPlayerAttack(playerPos, attackedNpc)
    );

    this.touchControls = new TouchControls(this.player, this);
    this._bindUIEvents();
    this._renderBackpackList();
    this._updateBodyDollHUD();

    this.lastFrameTime = performance.now();
    this._animate();
  }

  _notifyNPCsOfPlayerAttack(playerPos, attackedNpc) {
    for (const npc of this.npcs) {
      if (npc.dead) continue;
      npc.onWitnessPlayerViolence(playerPos, npc === attackedNpc);
    }
  }

  _spawnInitialNPCs() {
    const npc1 = new RagdollNPC(
      this.nextNpcId++,
      {
        name: 'Артём',
        role: 'Стрелок',
        personality: 'tactical',
        hasPistol: true,
        position: new THREE.Vector3(-2.1, 0, -1.2),
        yaw: 0.35
      },
      this.scene,
      this.world,
      this.propsManager,
      this.sound
    );

    const npc2 = new RagdollNPC(
      this.nextNpcId++,
      {
        name: 'Игнат',
        role: 'Механик',
        personality: 'tactical',
        hasPistol: false,
        position: new THREE.Vector3(2.2, 0, -1.5),
        yaw: -0.4
      },
      this.scene,
      this.world,
      this.propsManager,
      this.sound
    );

    this.npcs.push(npc1, npc2);
  }

  _broadcastSoundToNPCs(pos, radius, type, label) {
    for (const npc of this.npcs) {
      npc.onHearSound(pos, radius, type, label);
    }
  }

  showToast(message) {
    const feed = document.getElementById('event-feed');
    if (!feed) return;
    const el = document.createElement('div');
    el.className = 'event-toast';
    el.textContent = message;
    feed.appendChild(el);

    while (feed.children.length > 2) {
      feed.removeChild(feed.firstChild);
    }
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2400);
  }

  triggerHitmarker() {
    const hm = document.getElementById('hitmarker');
    if (!hm) return;
    hm.classList.remove('hidden');
    clearTimeout(this._hmTimer);
    this._hmTimer = setTimeout(() => hm.classList.add('hidden'), 140);
  }

  /**
   * Universal touch + pointer + click binder so every button in the game
   * responds immediately on Android phones and PC browsers!
   */
  _bindTap(el, callback) {
    if (!el) return;
    let lastTime = 0;
    const trigger = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      if (now - lastTime < 90) return;
      lastTime = now;
      callback(e);
    };
    el.addEventListener('touchstart', trigger, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      trigger(e);
    });
    el.addEventListener('click', trigger);
  }

  _bindUIEvents() {
    // 1. Hotbar Weapon Slots (1: Руки, 2: RCV2, 3: Лом, 4: ПМ)
    document.querySelectorAll('.hotbar-slot').forEach((el) => {
      this._bindTap(el, () => {
        const slot = Number(el.dataset.slot);
        this.player.setSlot(slot);
        const names = ['', '✊ Руки', '⚡ RCV2 Reality Crusher', '🔧 Стальной Лом', '🔫 Пистолет ПМ 9×18'];
        this.showToast(`В руках: ${names[slot]}`);
      });
    });

    // 2. Modals: Inventory Modal & Spawn Menu Modal
    const menuEl = document.getElementById('spawn-menu');
    const invEl = document.getElementById('inventory-modal');

    const toggleSpawnMenu = () => {
      if (!menuEl) return;
      if (invEl) invEl.classList.add('hidden');
      const isHidden = menuEl.classList.toggle('hidden');
      if (!isHidden && document.pointerLockElement) {
        document.exitPointerLock();
      }
    };

    const toggleInventory = () => {
      if (!invEl) return;
      if (menuEl) menuEl.classList.add('hidden');
      const isHidden = invEl.classList.toggle('hidden');
      if (!isHidden) {
        if (document.pointerLockElement) document.exitPointerLock();
        this._renderBackpackList();
        this._updateInventoryDollInspector();
      }
    };

    this._bindTap(document.getElementById('q-toggle-menu'), toggleSpawnMenu);
    this._bindTap(document.getElementById('close-spawn-menu'), toggleSpawnMenu);

    this._bindTap(document.getElementById('btn-open-inventory'), toggleInventory);
    this._bindTap(document.getElementById('body-doll-hud'), toggleInventory);
    this._bindTap(document.getElementById('close-inventory-modal'), toggleInventory);

    // 3. Inventory Equipment & Medical Buttons
    document.querySelectorAll('.inv-equip-btn').forEach((btn) => {
      this._bindTap(btn, () => {
        const slot = Number(btn.dataset.equip);
        this.player.setSlot(slot);
        if (invEl) invEl.classList.add('hidden');
        this.showToast(`Экипировано оружие #${slot}`);
      });
    });

    this._bindTap(document.getElementById('btn-switch-doll-target'), () => {
      this.dollInspectMode = this.dollInspectMode === 'player' ? 'npc' : 'player';
      this._updateInventoryDollInspector();
    });

    this._bindTap(document.getElementById('btn-rcv2-mode'), () => {
      const modeName = this.player.cycleRcv2Mode();
      const btn = document.getElementById('btn-rcv2-mode');
      if (btn) btn.textContent = modeName;
    });

    this._bindTap(document.getElementById('btn-pistol-mode'), () => {
      this.player.pistolAuto = !this.player.pistolAuto;
      const btn = document.getElementById('btn-pistol-mode');
      if (btn) {
        btn.textContent = this.player.pistolAuto
          ? '🔫 Режим ПМ: Автоматический'
          : '🔫 Режим ПМ: Одиночный';
      }
      this.showToast(this.player.pistolAuto ? '🔫 ПМ: Авто-огонь' : '🔫 ПМ: Одиночный огонь');
    });

    this._bindTap(document.getElementById('btn-store-held'), () => {
      if (this.player.storeHeldInBackpack()) {
        this._renderBackpackList();
      }
    });

    this._bindTap(document.getElementById('inv-use-medkit'), () => {
      this.player.useMedkit(false);
      this._updateInventoryDollInspector();
      this._updateBodyDollHUD();
    });

    this._bindTap(document.getElementById('inv-use-bandage'), () => {
      this.player.useBandage();
      this._updateInventoryDollInspector();
      this._updateBodyDollHUD();
    });

    this._bindTap(document.getElementById('inv-use-armor'), () => {
      this.player.equipArmor();
      this._updateHUD(performance.now());
    });

    this._bindTap(document.getElementById('inv-use-adrenaline'), () => {
      this.player.useAdrenaline();
      this._updateInventoryDollInspector();
    });

    // 4. Spawn Menu Buttons
    this._bindTap(document.getElementById('q-fullscreen'), async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
          this.showToast('⛶ Полный экран');
        } else {
          await document.exitFullscreen();
        }
      } catch (_) {}
    });

    this._bindTap(document.getElementById('q-flashlight'), () => {
      this.player.toggleFlashlight();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyQ' || e.code === 'Tab') {
        e.preventDefault();
        toggleSpawnMenu();
      }
      if (e.code === 'KeyI') {
        e.preventDefault();
        toggleInventory();
      }
      if (e.code === 'KeyT') {
        this.toggleSlowMo();
      }
    });

    const btnCycleAi = document.getElementById('btn-cycle-ai');
    this._bindTap(btnCycleAi, () => {
      this.aiGlobalMode = (this.aiGlobalMode + 1) % 3;
      const modes = ['Умный', 'Бой', 'Манекен'];
      if (btnCycleAi) btnCycleAi.textContent = `🧠 Режим ИИ: ${modes[this.aiGlobalMode]}`;
      for (const npc of this.npcs) {
        if (npc.dead) continue;
        if (this.aiGlobalMode === 0) {
          npc.personality = 'tactical';
          npc.hostileToPlayer = false;
          npc.aiState = 'STOP_LOOK';
          npc.setEmotion('CALM');
          if (npc.weaponMeshGroup) npc.weaponMeshGroup.visible = false;
        } else if (this.aiGlobalMode === 1) {
          npc.personality = 'hostile';
          npc._enterRetaliationMode();
        } else {
          npc.personality = 'dummy';
          npc.hostileToPlayer = false;
          npc.aiState = 'IDLE_DUMMY';
          npc.setEmotion('CALM');
          if (npc.weaponMeshGroup) npc.weaponMeshGroup.visible = false;
        }
      }
    });

    document.querySelectorAll('.spawn-item-btn').forEach((btn) => {
      this._bindTap(btn, () => {
        this.spawnFromMenu(btn.dataset.spawn);
      });
    });

    this._bindTap(document.getElementById('act-ragdoll-all'), () => {
      for (const npc of this.npcs) {
        if (!npc.dead) {
          npc.enterRagdoll(3.6, new THREE.Vector3((Math.random() - 0.5) * 4, 3.2, (Math.random() - 0.5) * 4));
        }
      }
      this.showToast('💥 НПС в регдолле');
    });

    this._bindTap(document.getElementById('act-revive-all'), () => {
      for (const npc of this.npcs) {
        npc.revive();
      }
      this.showToast('💉 НПС подняты на ноги');
    });

    this._bindTap(document.getElementById('act-toggle-slowmo'), () => {
      this.toggleSlowMo();
    });

    this._bindTap(document.getElementById('act-toggle-spotlights'), () => {
      const modeName = this.testMap.cycleLightingMode();
      this.showToast(`💡 ${modeName}`);
    });

    this._bindTap(document.getElementById('act-explosion-center'), () => {
      this.propsManager.triggerExplosion(new THREE.Vector3(0, 0.8, -2.5), 10.5, 48);
    });

    this._bindTap(document.getElementById('act-reset-scene'), () => {
      this.resetSandbox();
      if (menuEl) menuEl.classList.add('hidden');
    });
  }

  /**
   * Renders the player's Backpack items inside the Inventory modal.
   */
  _renderBackpackList() {
    const listEl = document.getElementById('backpack-list');
    const countEl = document.getElementById('backpack-count');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (countEl) countEl.textContent = String(this.player.backpack.length);

    if (this.player.backpack.length === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '10.5px';
      empty.style.color = '#64748b';
      empty.textContent = 'Рюкзак пуст (возьмите предмет ✋ и нажмите «Убрать в рюкзак»)';
      listEl.appendChild(empty);
      return;
    }

    this.player.backpack.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'backpack-item-btn';
      btn.textContent = `📤 Достать: ${item.name}`;
      this._bindTap(btn, () => {
        this.player.backpack.splice(idx, 1);
        this.spawnFromMenu(item.kind === 'bottle' ? 'bottle_single' : item.kind);
        this._renderBackpackList();
      });
      listEl.appendChild(btn);
    });
  }

  /**
   * Computes the CSS class ('healthy' | 'bruised' | 'bleeding' | 'critical' | 'severed') for a limb on the 2D GoreBox Body Doll.
   */
  _getLimbTraumaClass(limb) {
    if (!limb) return 'healthy';
    if (limb.severed || limb.hp <= 0) return 'severed';
    const ratio = limb.hp / limb.maxHp;
    if (ratio < 0.35) return 'critical';
    if (limb.bleeding || ratio < 0.65) return 'bleeding';
    if (ratio < 0.95) return 'bruised';
    return 'healthy';
  }

  /**
   * Updates the Live 2D GoreBox Body Trauma Doll on the HUD (`#body-doll-hud`).
   * Automatically shows the targeted NPC's limb injuries when aiming at an NPC, or the Player's own body trauma!
   */
  _updateBodyDollHUD() {
    const ownerEl = document.getElementById('doll-hud-owner');
    const statusEl = document.getElementById('doll-hud-status');
    if (!ownerEl || !statusEl) return;

    const targetNpc =
      (this.player.hoveredTarget && this.player.hoveredTarget.npc) ||
      (this.player.heldTarget && this.player.heldTarget.npc) ||
      null;

    const limbMap = targetNpc ? targetNpc.limbs : this.player.playerLimbs;
    ownerEl.textContent = targetNpc ? `НПС: ${targetNpc.name.toUpperCase()}` : 'КУКЛА: ИГРОК';
    ownerEl.style.color = targetNpc ? '#38bdf8' : '#94a3b8';

    const keys = [
      'head',
      'upperTorso',
      'abdomen',
      'upperArmL',
      'forearmL',
      'upperArmR',
      'forearmR',
      'thighL',
      'calfL',
      'thighR',
      'calfR'
    ];

    let severedCount = 0;
    let criticalCount = 0;
    let bleedingCount = 0;
    let bruisedCount = 0;

    for (const k of keys) {
      const svgPart = document.getElementById(`doll-${k}`);
      const limb = limbMap[k];
      if (!svgPart || !limb) continue;

      const st = this._getLimbTraumaClass(limb);
      svgPart.setAttribute('class', `doll-part ${st}`);
      if (st === 'severed') severedCount++;
      else if (st === 'critical') criticalCount++;
      else if (st === 'bleeding') bleedingCount++;
      else if (st === 'bruised') bruisedCount++;
    }

    if (targetNpc && targetNpc.dead) {
      statusEl.textContent = '💀 МЁРТВ';
      statusEl.style.color = '#ef4444';
    } else if (severedCount > 0) {
      statusEl.textContent = `🩸 Оторвано: ${severedCount}`;
      statusEl.style.color = '#f87171';
    } else if (criticalCount > 0) {
      statusEl.textContent = `⚠️ Перелом (${criticalCount})`;
      statusEl.style.color = '#ef4444';
    } else if (bleedingCount > 0) {
      statusEl.textContent = `🩸 Кровотечение`;
      statusEl.style.color = '#fb923c';
    } else if (bruisedCount > 0) {
      statusEl.textContent = `Ушибы / Ранения`;
      statusEl.style.color = '#facc15';
    } else {
      statusEl.textContent = `Все конечности целы`;
      statusEl.style.color = '#4ade80';
    }
  }

  /**
   * Updates the detailed 2D Body Trauma Doll & Limb Diagnostics inside the Inventory Modal.
   */
  _updateInventoryDollInspector() {
    const titleEl = document.getElementById('inv-doll-title');
    const breakdownEl = document.getElementById('inv-limb-breakdown');
    if (!titleEl || !breakdownEl) return;

    const inspectNpc =
      this.dollInspectMode === 'npc'
        ? this.player.lastInspectedNpc || this.npcs[0] || null
        : null;

    const limbMap = inspectNpc ? inspectNpc.limbs : this.player.playerLimbs;
    titleEl.textContent = inspectNpc
      ? `🩺 Кукла травм НПС: ${inspectNpc.name} (${Math.ceil(inspectNpc.hp)} HP)`
      : `🩺 Кукла травм: Игрок (${Math.ceil(this.player.hp)} HP)`;

    const keys = [
      'head',
      'upperTorso',
      'abdomen',
      'upperArmL',
      'forearmL',
      'upperArmR',
      'forearmR',
      'thighL',
      'calfL',
      'thighR',
      'calfR'
    ];

    for (const k of keys) {
      const svgPart = document.getElementById(`idoll-${k}`);
      const limb = limbMap[k];
      if (!svgPart || !limb) continue;
      const st = this._getLimbTraumaClass(limb);
      svgPart.setAttribute('class', `doll-part ${st}`);
    }

    // Build readable breakdown rows for major body zones
    const summaryRows = [
      { key: 'head', name: 'Голова' },
      { key: 'upperTorso', name: 'Грудная клетка' },
      { key: 'abdomen', name: 'Живот / Таз' },
      { key: 'forearmL', name: 'Левая рука' },
      { key: 'forearmR', name: 'Правая рука' },
      { key: 'calfL', name: 'Левая нога' },
      { key: 'calfR', name: 'Правая нога' }
    ];

    breakdownEl.innerHTML = '';
    for (const item of summaryRows) {
      const limb = limbMap[item.key];
      if (!limb) continue;
      const st = this._getLimbTraumaClass(limb);
      const pct = Math.max(0, Math.round((limb.hp / limb.maxHp) * 100));
      let statusLabel = `${pct}%`;
      if (st === 'severed') statusLabel = 'ОТОРВАНА 🩸';
      else if (st === 'critical') statusLabel = `${pct}% (Перелом)`;
      else if (st === 'bleeding') statusLabel = `${pct}% (Кровь)`;

      const row = document.createElement('div');
      row.className = `limb-stat-row ${st}`;
      row.innerHTML = `<span>${item.name}</span><strong>${statusLabel}</strong>`;
      breakdownEl.appendChild(row);
    }
  }

  _getSpawnPointInFront(dist = 2.8, height = 1.2) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    fwd.y = 0;
    fwd.normalize();
    const pos = this.camera.position.clone().addScaledVector(fwd, dist);
    pos.y = height;
    return pos;
  }

  spawnFromMenu(kind) {
    const pos = this._getSpawnPointInFront(3.0, 1.4);
    if (kind === 'crate_std') {
      this.propsManager.spawnCrate(pos, 0.82, false);
      this.showToast('📦 +Ящик');
    } else if (kind === 'bottle_single') {
      this.propsManager.spawnBottle(pos, 'green');
      this.showToast('🍾 +Бутылка');
    } else if (kind === 'bottle_pack') {
      const flavors = ['green', 'amber', 'clear'];
      for (let i = 0; i < 6; i++) {
        const bp = pos.clone().add(new THREE.Vector3((i - 2.5) * 0.22, 0, 0));
        this.propsManager.spawnBottle(bp, flavors[i % 3]);
      }
      this.showToast('🍾 +6 бутылок');
    } else if (kind === 'cinderblock') {
      this.propsManager.spawnCinderBlock(pos);
      this.showToast('🧱 +Шлакоблок');
    } else if (kind === 'barrel_red') {
      this.propsManager.spawnBarrel(pos, true);
      this.showToast('🛢️ +Взрывная бочка');
    } else if (kind === 'barrel_steel') {
      this.propsManager.spawnBarrel(pos, false);
      this.showToast('🛢️ +Стальная бочка');
    } else if (kind === 'worklight') {
      this.propsManager.spawnPortableWorklight(pos);
      this.showToast('🔦 +Прожектор');
    } else if (kind === 'npc_survivor' || kind === 'npc_hostile' || kind === 'npc_dummy') {
      const names = ['Виктор', 'Захар', 'Макар', 'Север', 'Клим'];
      const pickName = names[this.nextNpcId % names.length];
      const npc = new RagdollNPC(
        this.nextNpcId++,
        {
          name: pickName,
          role: kind === 'npc_hostile' ? 'Мародёр' : kind === 'npc_dummy' ? 'Манекен' : 'Выживший',
          personality: kind === 'npc_hostile' ? 'hostile' : kind === 'npc_dummy' ? 'dummy' : 'tactical',
          hasPistol: this.nextNpcId % 2 === 0,
          position: new THREE.Vector3(pos.x, 0, pos.z)
        },
        this.scene,
        this.world,
        this.propsManager,
        this.sound
      );
      if (kind === 'npc_hostile') {
        npc._enterRetaliationMode();
      }
      this.npcs.push(npc);
      this.showToast(`🧍 +НПС ${npc.name}`);
    }
  }

  toggleSlowMo() {
    this.timeScale = this.timeScale < 0.9 ? 1.0 : 0.25;
    this.showToast(this.timeScale < 0.9 ? '⏱ Слоу-мо 0.25x' : '⏱ Время 1.0x');
  }

  resetSandbox() {
    this.player.releaseHeldObject(false);
    this.propsManager.clearAllDebris();
    while (this.propsManager.props.length > 0) {
      const p = this.propsManager.props.pop();
      this.scene.remove(p.mesh);
      this.world.removeBody(p.body);
    }
    while (this.npcs.length > 0) {
      const n = this.npcs.pop();
      n.destroy();
    }
    this.nextNpcId = 1;
    this.propsManager.populateInitialProps();
    this._spawnInitialNPCs();
    this.player.useMedkit(true);
    this.player.playerPos.set(0, 0, 4.8);
    this.player.velX = 0;
    this.player.velZ = 0;
    this.player.verticalVel = 0;
    this.player.yaw = 0;
    this.player.pitch = -0.06;
    this.showToast('🔄 Полигон перезапущен');
  }

  _updateHUD(now) {
    this.fpsFrames++;
    if (now - this.fpsLastTime >= 250) {
      this.currentFps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsFrames = 0;
      this.fpsLastTime = now;

      const fpsEl = document.getElementById('hud-fps');
      if (fpsEl) fpsEl.textContent = String(this.currentFps);

      const hpVal = document.getElementById('player-hp-val');
      if (hpVal) hpVal.textContent = String(Math.round(this.player.hp));

      const armVal = document.getElementById('player-armor-val');
      if (armVal) armVal.textContent = String(Math.round(this.player.armor));

      this._updateBodyDollHUD();
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const now = performance.now();
    const rawDt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const dt = rawDt * this.timeScale;

    this.world.step(1 / 60, dt, 3);

    this.testMap.update(dt);
    this.propsManager.update(dt);

    for (const npc of this.npcs) {
      npc.update(dt, this.player, this.npcs, this.propsManager.props);
      npc.updateScreenLabel(this.camera);
    }

    this.player.update(dt, this.npcs, this.touchControls);
    if (this.touchControls) {
      this.touchControls.updateUI();
    }
    this._updateHUD(now);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.player.viewmodelScene, this.player.viewmodelCamera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__GAME__ = new MezhdugornySandboxGame();
});

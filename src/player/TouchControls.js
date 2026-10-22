/**
 * GoreBox Android Multi-Touch Control System:
 * - Left-screen Analog Thumbstick
 * - Right-screen Multi-Touch Look Pad
 * - Action Button Cluster (Attack/Fire/Throw, Grab/Drop, Jump, Freeze/RCV2 Mode)
 *   Bound with touchstart + pointerdown + mousedown so every button responds immediately!
 */
export class TouchControls {
  constructor(player, game) {
    this.player = player;
    this.game = game;

    this.moveX = 0;
    this.moveY = 0;
    this.isSprinting = false;
    this.enabled = true;

    this._joyTouchId = null;
    this._joyPointerId = null;
    this._lookTouchId = null;
    this._lookPointerId = null;
    this._joyCenter = { x: 82, y: window.innerHeight - 80 };
    this._joyMaxRadius = 44;
    this._lastLookPos = { x: 0, y: 0 };

    this._initDOM();
    this._bindJoystickEvents();
    this._bindLookZoneEvents();
    this._bindActionButtons();
  }

  _initDOM() {
    this.container = document.getElementById('android-touch-ui');
    this.joyZone = document.getElementById('touch-joystick-zone');
    this.joyBase = document.getElementById('touch-joystick-base');
    this.joyKnob = document.getElementById('touch-joystick-knob');
    this.lookZone = document.getElementById('touch-look-zone');

    this.btnAttack = document.getElementById('btn-touch-attack');
    this.btnGrab = document.getElementById('btn-touch-grab');
    this.btnFreeze = document.getElementById('btn-touch-freeze');
    this.btnJump = document.getElementById('btn-touch-jump');
  }

  _updateStickFromPoint(clientX, clientY) {
    const dx = clientX - this._joyCenter.x;
    const dy = clientY - this._joyCenter.y;
    const dist = Math.hypot(dx, dy);
    const maxR = this._joyMaxRadius;

    const clampedDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    if (this.joyKnob) {
      this.joyKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    }

    const normX = kx / maxR;
    const normY = ky / maxR;

    if (Math.hypot(normX, normY) < 0.08) {
      this.moveX = 0;
      this.moveY = 0;
      this.isSprinting = false;
    } else {
      this.moveX = normX;
      this.moveY = -normY;
      this.isSprinting = dist > maxR * 0.78 && this.moveY > 0.25;
    }

    if (this.joyBase) {
      this.joyBase.classList.toggle('sprinting', this.isSprinting);
    }
  }

  _startJoystickAt(clientX, clientY) {
    if (!this.joyBase) return;
    const rect = this.joyBase.getBoundingClientRect();
    const baseCx = rect.left + rect.width / 2;
    const baseCy = rect.top + rect.height / 2;

    if (Math.hypot(clientX - baseCx, clientY - baseCy) <= rect.width * 0.85) {
      this._joyCenter = { x: baseCx, y: baseCy };
    } else {
      const clampedX = Math.max(66, Math.min(window.innerWidth * 0.38, clientX));
      const clampedY = Math.max(120, Math.min(window.innerHeight - 66, clientY));
      this.joyBase.style.left = `${clampedX - 56}px`;
      this.joyBase.style.bottom = `${window.innerHeight - clampedY - 56}px`;
      this._joyCenter = { x: clampedX, y: clampedY };
    }

    this.joyBase.classList.add('active');
    this._updateStickFromPoint(clientX, clientY);
  }

  _bindJoystickEvents() {
    if (!this.joyZone) return;

    this.joyZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.changedTouches[0];
        if (!touch) return;
        this._joyTouchId = touch.identifier;
        this._startJoystickAt(touch.clientX, touch.clientY);
      },
      { passive: false }
    );

    window.addEventListener(
      'touchmove',
      (e) => {
        if (this._joyTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this._joyTouchId) {
            this._updateStickFromPoint(t.clientX, t.clientY);
            break;
          }
        }
      },
      { passive: false }
    );

    const endJoyTouch = (e) => {
      if (this._joyTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._joyTouchId) {
          this._resetJoystick();
          return;
        }
      }
      let stillActive = false;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this._joyTouchId) {
          stillActive = true;
          break;
        }
      }
      if (!stillActive) this._resetJoystick();
    };

    window.addEventListener('touchend', endJoyTouch, { passive: false });
    window.addEventListener('touchcancel', endJoyTouch, { passive: false });

    this.joyZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      e.stopPropagation();
      this._joyPointerId = e.pointerId;
      this._startJoystickAt(e.clientX, e.clientY);
    });

    window.addEventListener('pointermove', (e) => {
      if (this._joyPointerId === null || e.pointerId !== this._joyPointerId) return;
      this._updateStickFromPoint(e.clientX, e.clientY);
    });

    const endJoyPointer = (e) => {
      if (this._joyPointerId !== null && e.pointerId === this._joyPointerId) {
        this._joyPointerId = null;
        this._resetJoystick();
      }
    };
    window.addEventListener('pointerup', endJoyPointer);
    window.addEventListener('pointercancel', endJoyPointer);
  }

  _resetJoystick() {
    this._joyTouchId = null;
    this._joyPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.isSprinting = false;
    if (this.joyKnob) {
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
    }
    if (this.joyBase) {
      this.joyBase.classList.remove('active', 'sprinting');
      this.joyBase.style.left = '26px';
      this.joyBase.style.bottom = '24px';
    }
  }

  _bindLookZoneEvents() {
    if (!this.lookZone) return;

    const applyLookDelta = (dx, dy) => {
      const sens = 0.0045;
      this.player.yaw -= dx * sens;
      this.player.pitch = Math.max(-1.42, Math.min(1.42, this.player.pitch - dy * sens));
    };

    this.lookZone.addEventListener(
      'touchstart',
      (e) => {
        // Ignore if touch started on an action button
        if (e.target && e.target.closest && e.target.closest('.abtn')) return;
        e.preventDefault();
        const touch = e.changedTouches[0];
        if (!touch) return;
        this._lookTouchId = touch.identifier;
        this._lastLookPos = { x: touch.clientX, y: touch.clientY };
      },
      { passive: false }
    );

    window.addEventListener(
      'touchmove',
      (e) => {
        if (this._lookTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this._lookTouchId) {
            const dx = t.clientX - this._lastLookPos.x;
            const dy = t.clientY - this._lastLookPos.y;
            this._lastLookPos = { x: t.clientX, y: t.clientY };
            applyLookDelta(dx, dy);
            break;
          }
        }
      },
      { passive: false }
    );

    const endLookTouch = (e) => {
      if (this._lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._lookTouchId) {
          this._lookTouchId = null;
          return;
        }
      }
    };
    window.addEventListener('touchend', endLookTouch, { passive: false });
    window.addEventListener('touchcancel', endLookTouch, { passive: false });

    this.lookZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.target && e.target.closest && e.target.closest('.abtn')) return;
      this._lookPointerId = e.pointerId;
      this._lastLookPos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
      if (this._lookPointerId === null || e.pointerId !== this._lookPointerId) return;
      const dx = e.clientX - this._lastLookPos.x;
      const dy = e.clientY - this._lastLookPos.y;
      this._lastLookPos = { x: e.clientX, y: e.clientY };
      applyLookDelta(dx, dy);
    });

    const endLookPointer = (e) => {
      if (this._lookPointerId !== null && e.pointerId === this._lookPointerId) {
        this._lookPointerId = null;
      }
    };
    window.addEventListener('pointerup', endLookPointer);
    window.addEventListener('pointercancel', endLookPointer);
  }

  _bindActionButtons() {
    const bindButton = (el, onDown, onUp = null) => {
      if (!el) return;
      let lastDown = 0;

      const handleDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (now - lastDown < 55) return;
        lastDown = now;
        el.classList.add('pressed');
        onDown();
      };

      const handleUp = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('pressed');
        if (onUp) onUp();
      };

      el.addEventListener('touchstart', handleDown, { passive: false });
      el.addEventListener('touchend', handleUp, { passive: false });
      el.addEventListener('touchcancel', handleUp, { passive: false });
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        handleDown(e);
      });
      el.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'touch') return;
        handleUp(e);
      });
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (now - lastDown < 180) return;
        lastDown = now;
        onDown();
        if (onUp) setTimeout(onUp, 80);
      });
    };

    // 🔥 Primary Attack / Shoot / Launch Held Object
    bindButton(
      this.btnAttack,
      () => {
        this.player.mouseDownLeft = true;
        this.player.performPrimaryAction();
      },
      () => {
        this.player.mouseDownLeft = false;
      }
    );

    // ✋ Grab / Drop Object or NPC Limb
    bindButton(this.btnGrab, () => {
      if (this.player.heldTarget) {
        this.player.releaseHeldObject(false);
      } else {
        const grabbed = this.player.tryGrabTarget();
        if (!grabbed) {
          this.game.showToast('Наведите прицел на ящик, бутылку, бочку или НПС');
        }
      }
    });

    // ❄️ Freeze Held Object / Cycle RCV2 Mode
    bindButton(this.btnFreeze, () => {
      this.player.toggleFreezeHeldObject();
    });

    // ⬆️ Jump
    bindButton(this.btnJump, () => {
      this.player.jump();
    });
  }

  updateUI() {
    if (!this.enabled) return;

    const isHolding = Boolean(this.player.heldTarget);
    const canGrab = Boolean(this.player.hoveredTarget) || isHolding;

    if (this.btnGrab) {
      this.btnGrab.classList.toggle('highlight', canGrab);
    }

    if (this.btnFreeze) {
      const showFreeze = isHolding || this.player.activeSlot === 2 || this.player.activeSlot === 4;
      this.btnFreeze.classList.toggle('hidden', !showFreeze);
      const iconSpan = this.btnFreeze.querySelector('.abtn-icon');
      if (iconSpan) {
        if (isHolding) {
          iconSpan.textContent = '❄️';
        } else if (this.player.activeSlot === 4) {
          iconSpan.textContent = '🔄';
        } else {
          iconSpan.textContent = '⚙️';
        }
      }
    }
  }
}

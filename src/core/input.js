// Keyboard + mouse (pointer lock) input.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // pressed this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ControlLeft', 'ControlRight', 'Tab'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    document.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.pressed.add('Mouse0');
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignored */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(...codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }
  tap(...codes) { for (const c of codes) if (this.pressed.has(c)) return true; return false; }

  get forward() { return this.down('KeyW', 'ArrowUp'); }
  get back() { return this.down('KeyS', 'ArrowDown'); }
  get left() { return this.down('KeyA', 'ArrowLeft'); }
  get right() { return this.down('KeyD', 'ArrowRight'); }
  get rise() { return this.down('Space'); }
  get dive() { return this.down('ControlLeft', 'ControlRight', 'KeyC'); }
  get dash() { return this.tap('ShiftLeft', 'ShiftRight'); }
  get sprint() { return this.down('ShiftLeft', 'ShiftRight'); }
  get action() { return this.tap('Space', 'KeyE', 'Mouse0'); }
  get actionHeld() { return this.down('Space', 'KeyE'); }

  consumeMouse() {
    const s = 0.0022 * this.sensitivity;
    const dx = this.mouseDX * s;
    const dy = this.mouseDY * s * (this.invertY ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return [dx, dy];
  }

  endFrame() { this.pressed.clear(); }
}

// Gamepad (standard mapping) + keyboard input, merged into named actions.
// Works plug-and-play with Xbox and DualShock 4 controllers in Chrome/Edge.

export const ACTIONS = ['confirm', 'cancel', 'tool', 'designate', 'seedPrev', 'seedNext', 'pause', 'hud', 'switchPlayer', 'debug'];
export const ACTION_LABELS = {
  confirm: 'Interact / Confirm', cancel: 'Cancel / Back', tool: 'Cycle tool', designate: 'Plan mode (designate)',
  seedPrev: 'Previous seed', seedNext: 'Next seed', pause: 'Pause menu', hud: 'Toggle HUD (hold: switch player)',
  switchPlayer: 'Switch player', debug: 'Debug menu',
};
export const PAD_BUTTON_NAMES = ['A / ✕', 'B / ○', 'X / □', 'Y / △', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'Back / Share', 'Start / Options', 'L-stick', 'R-stick', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home / PS', 'Touchpad'];

export const DEFAULT_BINDINGS = {
  pad: { confirm: [0], cancel: [1], tool: [2], designate: [3], seedPrev: [4], seedNext: [5], pause: [9], hud: [8], switchPlayer: [], debug: [] },
  keys: {
    confirm: ['KeyE', 'Space', 'Enter'], cancel: ['KeyQ', 'Backspace'], tool: ['KeyF'], designate: ['Tab'],
    seedPrev: ['KeyZ', 'BracketLeft'], seedNext: ['KeyC', 'BracketRight'], pause: ['Escape'], hud: ['KeyH'],
    switchPlayer: ['KeyP'], debug: ['Backquote', 'F9'],
  },
};
const DIR_KEYS = { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'] };
const DIR_PAD = { up: 12, down: 13, left: 14, right: 15 };
const DEADZONE = 0.28;
const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'F9']);

class Input {
  constructor() {
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    this.keys = new Set();
    this.keyEdges = [];
    this.state = {};
    for (const a of [...ACTIONS, 'up', 'down', 'left', 'right']) this.state[a] = { down: false, pressed: false, released: false, held: 0, repeat: false, rt: 0 };
    this.axis = { x: 0, y: 0 };
    this.anyPressed = false;
    this.pads = [];
    this.prevPadButtons = new Map();
    this.capture = null;
    this.lastWasPad = false;
    this.enabled = true;
    addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.keyEdges.push(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  setBindings(b) {
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    if (b?.pad) Object.assign(this.bindings.pad, b.pad);
    if (b?.keys) Object.assign(this.bindings.keys, b.keys);
  }

  // Next button/key press is handed to cb instead of normal input (rebinding).
  captureNext(cb) { this.capture = cb; }

  connectedPads() { return (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(p => p && p.connected); }

  update(dt) {
    const pads = this.connectedPads();
    this.pads = pads;
    const padDown = new Set();
    let ax = 0, ay = 0;
    let padEdge = null;
    for (const p of pads) {
      const prev = this.prevPadButtons.get(p.index) || [];
      const now = p.buttons.map(b => b.pressed || b.value > 0.5);
      now.forEach((d, i) => { if (d) padDown.add(i); if (d && !prev[i] && padEdge == null) padEdge = i; });
      this.prevPadButtons.set(p.index, now);
      const x = p.axes[0] || 0, y = p.axes[1] || 0;
      if (Math.hypot(x, y) > DEADZONE) { ax += x; ay += y; }
    }
    const keyEdges = this.keyEdges; this.keyEdges = [];
    this.anyPressed = padEdge != null || keyEdges.length > 0;
    if (this.anyPressed) this.lastWasPad = padEdge != null;

    if (this.capture && this.anyPressed) {
      const cb = this.capture; this.capture = null;
      cb(padEdge != null ? { pad: padEdge } : { key: keyEdges[0] });
      for (const s of Object.values(this.state)) { s.pressed = false; s.released = false; s.repeat = false; }
      this.suppress = true;
      return;
    }

    // keys tapped and released between two frames still count as down for one frame
    const keysNow = keyEdges.length ? new Set([...this.keys, ...keyEdges]) : this.keys;
    const isDown = {};
    for (const a of ACTIONS) {
      isDown[a] = (this.bindings.pad[a] || []).some(b => padDown.has(b)) || (this.bindings.keys[a] || []).some(k => keysNow.has(k));
    }
    for (const d of ['up', 'down', 'left', 'right']) isDown[d] = padDown.has(DIR_PAD[d]) || DIR_KEYS[d].some(k => keysNow.has(k));
    // stick contributes to direction buttons for menu navigation
    if (ay < -0.5) isDown.up = true; if (ay > 0.5) isDown.down = true;
    if (ax < -0.5) isDown.left = true; if (ax > 0.5) isDown.right = true;
    // keyboard/dpad contribute to analog axis
    let dx = (isDown.right ? 1 : 0) - (isDown.left ? 1 : 0), dy = (isDown.down ? 1 : 0) - (isDown.up ? 1 : 0);
    if (Math.hypot(ax, ay) < 0.01) { ax = dx; ay = dy; }
    const len = Math.hypot(ax, ay);
    if (len > 1) { ax /= len; ay /= len; }
    this.axis.x = ax; this.axis.y = ay;

    for (const [a, s] of Object.entries(this.state)) {
      const d = !!isDown[a] && !this.suppress;
      s.pressed = d && !s.down;
      s.released = !d && s.down;
      s.repeat = false;
      if (d) {
        s.held += dt;
        if (s.pressed) { s.repeat = true; s.rt = 0.38; }
        else { s.rt -= dt; if (s.rt <= 0) { s.repeat = true; s.rt = 0.11; } }
      } else if (!s.released) s.held = 0;
      s.down = d;
    }
    if (this.suppress && !padDown.size && !this.keys.size) this.suppress = false;
  }
  afterFrame() { for (const s of Object.values(this.state)) if (s.released) s.held = 0; }

  pressed(a) { return this.enabled && this.state[a]?.pressed; }
  released(a) { return this.enabled && this.state[a]?.released; }
  down(a) { return this.enabled && this.state[a]?.down; }
  held(a) { return this.state[a]?.held || 0; }
  nav(a) { return this.enabled && this.state[a]?.repeat; } // pressed + auto-repeat
  consume(a) { const s = this.state[a]; if (s) { s.pressed = false; s.repeat = false; } }
  consumeAll() { for (const s of Object.values(this.state)) { s.pressed = false; s.repeat = false; s.released = false; } }

  bindingLabel(action) {
    const p = (this.bindings.pad[action] || []).map(i => PAD_BUTTON_NAMES[i] || `Button ${i}`);
    const k = (this.bindings.keys[action] || []).map(c => c.replace(/^Key/, '').replace(/^Digit/, ''));
    return [p.join(', '), k.join(', ')].filter(Boolean).join('  ·  ') || '—';
  }
}

export const input = new Input();

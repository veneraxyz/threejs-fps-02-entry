// DUSTFALL — keyboard, mouse and pointer lock. The input module owns the
// DOM listeners and exposes a plain object the sim reads each tick. It
// never mutates game state itself.

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    yawDelta: 0, // accumulated mouse movement since last tick
    pitchDelta: 0,
    firing: false, // mouse button held
    fired: false, // mouse button pressed since last tick (semi-auto)
    locked: false,
    sensitivity: 0.0022,
    // One-shot actions consumed by the sim each tick:
    wantReload: false,
    wantGrenade: false,
    wantInteract: false, // E held (plant / defuse channel)
    wantJump: false,
    wantBuy: false, // B pressed
    wantSlot: 0, // 1/2/3 pressed, 0 = none
    wantPause: false, // Esc handled by pointer lock exit
  };

  const onKey = (down) => (e) => {
    if (e.repeat) return;
    const k = e.code;
    if (down) input.keys.add(k);
    else input.keys.delete(k);
    if (!down) return;
    if (k === 'KeyR') input.wantReload = true;
    if (k === 'KeyG') input.wantGrenade = true;
    if (k === 'KeyB') input.wantBuy = true;
    if (k === 'Space') input.wantJump = true;
    if (k === 'Digit1') input.wantSlot = 1;
    if (k === 'Digit2') input.wantSlot = 2;
    if (k === 'Digit3') input.wantSlot = 3;
    if (k === 'Space' || k === 'Tab') e.preventDefault();
  };
  window.addEventListener('keydown', onKey(true));
  window.addEventListener('keyup', onKey(false));

  canvas.addEventListener('mousedown', (e) => {
    if (!input.locked) return;
    if (e.button === 0) {
      input.firing = true;
      input.fired = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    // Mouse right increases the sim yaw, which turns the camera right
    // (camera rotation.y is the negative of the sim yaw).
    input.yawDelta += e.movementX * input.sensitivity;
    input.pitchDelta -= e.movementY * input.sensitivity;
  });

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) input.firing = false;
  });

  input.lock = () => {
    if (!input.locked) canvas.requestPointerLock();
  };
  input.unlock = () => {
    if (input.locked) document.exitPointerLock();
  };

  // Called by the sim after each tick: clears the per-tick deltas.
  input.endTick = () => {
    input.yawDelta = 0;
    input.pitchDelta = 0;
    input.fired = false;
    input.wantReload = false;
    input.wantGrenade = false;
    input.wantJump = false;
    input.wantBuy = false;
    input.wantSlot = 0;
  };

  input.forward = () => input.keys.has('KeyW') || input.keys.has('ArrowUp');
  input.back = () => input.keys.has('KeyS') || input.keys.has('ArrowDown');
  input.left = () => input.keys.has('KeyA') || input.keys.has('ArrowLeft');
  input.right = () => input.keys.has('KeyD') || input.keys.has('ArrowRight');
  input.crouching = () => input.keys.has('ControlLeft') || input.keys.has('ControlRight') || input.keys.has('KeyC');
  input.interacting = () => input.keys.has('KeyE');

  return input;
}

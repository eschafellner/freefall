import { MAX_PITCH, wrapAngle } from '@freefall/shared';
import type { EquipmentCommand, PlayerInput } from '@freefall/shared';

export class DesktopInput {
  yaw = 0;
  pitch = -0.12;
  private firing = false;
  private acquiredAt = -Infinity;
  private expectingFirstMotion = true;
  private aiming = false;
  private equipment?: EquipmentCommand;
  private reloadPressed = false;
  private readonly keys = new Set<string>();
  private readonly listeners = new AbortController();
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, onLock: (locked: boolean) => void, onError: () => void, onIdle: () => void, onInteract: () => void, onBalloon: () => void) {
    this.canvas = canvas;
    const options = { signal: this.listeners.signal };
    const clear = () => {
      this.keys.clear();
      this.equipment = undefined;
      this.firing = this.aiming = this.reloadPressed = false;
      onIdle();
    };
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) clear();
      else {
        this.acquiredAt = performance.now();
        this.expectingFirstMotion = true;
      }
      onLock(this.locked);
    }, options);
    document.addEventListener('pointerlockerror', onError, options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clear();
    }, options);
    window.addEventListener('blur', clear, options);
    window.addEventListener('keydown', (event) => {
      if (!this.locked) return;
      this.keys.add(event.code);
      if (event.code === 'KeyE' && !event.repeat) onInteract();
      if (event.code === 'KeyB' && !event.repeat) onBalloon();
      if (!event.repeat) {
        if (event.code === 'Digit1') this.equipment = 'primary';
        if (event.code === 'Digit2') this.equipment = 'secondary';
        if (event.code === 'KeyG') this.equipment = 'grenade';
        if (event.code === 'KeyH') this.equipment = 'stim';
      }
      if (event.code === 'KeyR' && !event.repeat) this.reloadPressed = true;
      if (event.code.startsWith('Key') || event.code.startsWith('Shift') || event.code === 'Space') {
        event.preventDefault();
      }
    }, options);
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    window.addEventListener('mousedown', (event) => {
      if (!this.locked) return;
      if (event.button === 0) this.firing = true;
      if (event.button === 2) this.aiming = true;
    }, options);
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.firing = false;
      if (event.button === 2) this.aiming = false;
    }, options);
    canvas.addEventListener('contextmenu', (event) => {
      if (this.locked) event.preventDefault();
    }, options);
    canvas.addEventListener('mousemove', (event) => {
      // Pointer lock can report the absolute-to-relative cursor recenter as its first movement.
      const sinceLock = event.timeStamp - this.acquiredAt;
      if (!this.locked || sinceLock < 110 || (!event.movementX && !event.movementY)) return;
      const largeDelta = Math.abs(event.movementX) > 175 || Math.abs(event.movementY) > 175;
      if (largeDelta && (this.expectingFirstMotion || sinceLock < 650)) return;
      this.expectingFirstMotion = false;
      const sensitivity = 0.00235;
      this.yaw = wrapAngle(this.yaw + event.movementX * sensitivity);
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - event.movementY * sensitivity));
    }, options);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  lock(): void {
    if (this.locked) return;
    // Browsers can return void or a promise and report failure through pointerlockerror.
    const result = this.canvas.requestPointerLock();
    result?.catch(() => {});
  }

  get aim(): boolean { return this.locked && this.aiming; }

  get sprint(): boolean {
    return this.locked && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
  }

  sample(seq: number, idle = false, life = 0): PlayerInput {
    const active = this.locked && !idle;
    const reload = active && this.reloadPressed;
    const equipment = active ? this.equipment : undefined;
    this.equipment = undefined;
    this.reloadPressed = false;
    return {
      seq,
      forward: active ? Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')) : 0,
      strafe: active ? Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) : 0,
      yaw: this.yaw,
      pitch: this.pitch,
      sprint: active && this.sprint,
      fire: active && this.firing,
      aim: active && this.aiming,
      reload, ...(equipment && { equipment, life }),
    };
  }

  dispose(): void {
    this.listeners.abort();
    if (this.locked) document.exitPointerLock();
  }
}

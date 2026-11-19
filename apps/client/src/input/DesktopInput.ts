import { MAX_PITCH, wrapAngle } from '@freefall/shared';
import type { EquipmentCommand, PlayerInput, PostureCommand } from '@freefall/shared';

import { bindings, keyboardCode } from './Bindings.ts';
import type { InputAction } from './Bindings.ts';

const EQUIPMENT = {
  SWITCH_PRIMARY: 'primary', SWITCH_SECONDARY: 'secondary', THROW_GRENADE: 'grenade', USE_STIM: 'stim', MELEE: 'melee',
} as const;
const POSTURE = { CROUCH: 'crouch', DIVE: 'dive', STAND_UP: 'stand' } as const;

export class DesktopInput {
  yaw = 0;
  pitch = -0.12;
  private posture?: PostureCommand;
  private diveIntent?: Pick<PlayerInput, 'forward' | 'strafe' | 'yaw'>;
  private acquiredAt = -Infinity;
  private expectingFirstMotion = true;

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
      this.posture = undefined;
      this.diveIntent = undefined;
      this.reloadPressed = false;
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
    const press = (code: string) => {
      if (!this.locked) return false;
      const down = this.keys.has(code);
      this.keys.add(code);
      if (!down) {
        if (code === bindings.code('INTERACT')) onInteract();
        if (code === bindings.code('BALLOON')) onBalloon();
        if (code === bindings.code('RELOAD')) this.reloadPressed = true;
        for (const command of Object.keys(EQUIPMENT) as (keyof typeof EQUIPMENT)[]) {
          if (code === bindings.code(command)) this.equipment = EQUIPMENT[command];
        }
        for (const command of Object.keys(POSTURE) as (keyof typeof POSTURE)[]) {
          if (code !== bindings.code(command)) continue;
          this.posture = POSTURE[command];
          if (this.posture === 'dive') this.diveIntent = { forward: this.forward(), strafe: this.strafe(), yaw: this.yaw };
        }
      }
      return true;
    };
    window.addEventListener('keydown', (event) => {
      if (!this.locked) return;
      if (!event.repeat) press(keyboardCode(event.code));
      if (event.code.startsWith('Key') || event.code !== 'Escape' && this.keys.has(keyboardCode(event.code))) event.preventDefault();
    }, options);
    window.addEventListener('keyup', (event) => {
      if (keyboardCode(event.code) !== 'Shift' || !event.shiftKey) this.keys.delete(keyboardCode(event.code));
    }, options);
    window.addEventListener('mousedown', (event) => {
      if (press(`Mouse${event.button}`)) event.preventDefault();
    }, options);
    window.addEventListener('mouseup', (event) => this.keys.delete(`Mouse${event.button}`), options);
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

  private held(action: InputAction): boolean { return this.keys.has(bindings.code(action)); }

  private forward(): number { return Number(this.held('MOVE_FORWARD')) - Number(this.held('MOVE_BACKWARD')); }
  private strafe(): number { return Number(this.held('MOVE_RIGHT')) - Number(this.held('MOVE_LEFT')); }

  get aim(): boolean { return this.locked && this.held('AIM'); }
  get sprint(): boolean { return this.locked && this.held('SPRINT'); }

  sample(seq: number, idle = false, life = 0): PlayerInput {
    const active = this.locked && !idle;
    const reload = active && this.reloadPressed;
    const equipment = active ? this.equipment : undefined;
    const posture = active ? this.posture : undefined;
    const intent = posture === 'dive' ? this.diveIntent : undefined;
    this.posture = undefined;
    this.diveIntent = undefined;
    this.equipment = undefined;
    this.reloadPressed = false;
    return {
      seq,
      forward: active ? this.forward() : 0,
      strafe: active ? this.strafe() : 0,
      yaw: this.yaw,
      ...intent,
      pitch: this.pitch,
      sprint: active && this.sprint,
      fire: active && this.held('FIRE'),
      aim: active && this.held('AIM'),
      reload, ...(equipment && { equipment }), ...(posture && { posture }), ...((equipment || posture) && { life }),
    };
  }

  dispose(): void {
    this.listeners.abort();
    if (this.locked) document.exitPointerLock();
  }
}

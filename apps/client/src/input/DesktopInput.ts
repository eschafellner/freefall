import { MAX_PITCH, wrapAngle } from '@freefall/shared';
import type { DiveIntent, EquipmentCommand, PlayerInput, PostureCommand } from '@freefall/shared';

import { cameraPreferences } from '../rendering/CameraPreferences.ts';
import { bindings, inputContext, keyboardCode } from './Bindings.ts';
import type { InputAction } from './Bindings.ts';

const EQUIPMENT = {
  SWITCH_PRIMARY: 'primary', SWITCH_SECONDARY: 'secondary', THROW_GRENADE: 'grenade', USE_STIM: 'stim', MELEE: 'melee',
} as const;
const POSTURE = { CROUCH: 'crouch', DIVE: 'dive', STAND_UP: 'stand' } as const;
const STICK_DEAD_ZONE = .18;

export function analogMovement(x: number, y: number): Pick<DiveIntent, 'forward' | 'strafe'> {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= STICK_DEAD_ZONE) return { forward: 0, strafe: 0 };
  const strength = Math.min(1, (length - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE));
  return { forward: -y / length * strength, strafe: x / length * strength };
}

export class DesktopInput {
  yaw = 0;
  pitch = -0.12;
  lastAction?: InputAction;
  private posture?: PostureCommand;
  private diveIntent?: DiveIntent;
  private acquiredAt = -Infinity;
  private expectingFirstMotion = true;
  private focused = true;

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
      this.lastAction = undefined;
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
    window.addEventListener('blur', () => { this.focused = false; clear(); }, options);
    window.addEventListener('focus', () => { this.focused = true; }, options);
    const press = (code: string) => {
      if (!this.active) return false;
      const action = bindings.action(code);
      if (!action) return false;
      if (this.keys.has(code)) return true;
      this.keys.add(code);
      this.lastAction = action;
      if (action === 'INTERACT') onInteract();
      if (action === 'BALLOON') onBalloon();
      if (action === 'RELOAD') this.reloadPressed = true;
      if (action in EQUIPMENT) this.equipment = EQUIPMENT[action as keyof typeof EQUIPMENT];
      if (action in POSTURE) {
        this.posture = POSTURE[action as keyof typeof POSTURE];
        this.diveIntent = this.posture === 'dive' ? { ...this.movement(), yaw: this.yaw } : undefined;
      }
      return true;
    };
    window.addEventListener('keydown', (event) => {
      if (!this.active) return;
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
      if (!this.active || sinceLock < 110 || (!event.movementX && !event.movementY)) return;
      const largeDelta = Math.abs(event.movementX) > 175 || Math.abs(event.movementY) > 175;
      if (largeDelta && (this.expectingFirstMotion || sinceLock < 650)) return;
      this.expectingFirstMotion = false;
      const sensitivity = 0.00235 * cameraPreferences.sensitivity;
      this.yaw = wrapAngle(this.yaw + event.movementX * sensitivity);
      this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - event.movementY * sensitivity));
    }, options);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private get active(): boolean {
    return this.focused && !document.hidden && inputContext(this.locked) === 'gameplay';
  }

  lock(): void {
    if (this.locked) return;
    // Browsers can return void or a promise and report failure through pointerlockerror.
    const result = this.canvas.requestPointerLock();
    result?.catch(() => {});
  }

  private held(action: InputAction): boolean { return this.keys.has(bindings.code(action)); }

  private movement(): Pick<DiveIntent, 'forward' | 'strafe'> {
    const forward = Number(this.held('MOVE_FORWARD')) - Number(this.held('MOVE_BACKWARD'));
    const strafe = Number(this.held('MOVE_RIGHT')) - Number(this.held('MOVE_LEFT'));
    if (forward || strafe) return { forward, strafe };
    let pads: readonly (Gamepad | null)[];
    try {
      pads = navigator.getGamepads?.() ?? [];
    } catch {
      return { forward, strafe }; // Embedded clients can be denied access by the browser.
    }
    for (const pad of pads) {
      if (pad?.mapping !== 'standard') continue;
      const direction = analogMovement(pad.axes[0], pad.axes[1]);
      if (direction.forward || direction.strafe) return direction;
    }
    return { forward: 0, strafe: 0 };
  }

  get aim(): boolean { return this.active && this.held('AIM'); }
  get sprint(): boolean { return this.active && this.held('SPRINT'); }

  sample(seq: number, idle = false, life = 0): PlayerInput {
    const active = this.active && !idle;
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
      ...(active ? this.movement() : { forward: 0, strafe: 0 }),
      yaw: this.yaw,
      ...(intent && { diveIntent: intent }),
      pitch: this.pitch,
      sprint: active && this.sprint,
      fire: active && this.held('FIRE'),
      aim: active && this.held('AIM'),
      reload, ...(equipment && { equipment }), ...(posture && { posture }), life,
    };
  }

  dispose(): void {
    this.listeners.abort();
    if (this.locked) document.exitPointerLock();
  }
}

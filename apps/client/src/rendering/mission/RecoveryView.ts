import * as T from 'three';
import { BALLOON, NET, groundHeight } from '@freefall/shared';
import type { ExtractionSnapshot, PlayersSnapshot, PositionXZ, WorldDefinition } from '@freefall/shared';
import { PanelBatch, emitter, metal, plate } from './ShipParts.ts';
import { TOW, TowLine, hookAt, hookVelocity } from './RecoveryTow.ts';

/** The fighter always comes in on the same course; the balloon weathervanes its nose towards it. */
const COURSE = Math.PI * .235;
const APPROACH_DISTANCE = 183;
const APPROACH_SECONDS = BALLOON.approachTicks / NET.tickHz;
/** Linear part of the approach: the fighter brakes in and crosses the line at TOW.pickupSpeed. */
const APPROACH_LINEAR = TOW.pickupSpeed * APPROACH_SECONDS;
/** Envelope half axes (m): width, height, length. */
const HULL = { x: 1.55, y: 1.5, z: 3.3 } as const;
/** Pickup yoke under the strobe pod, below the envelope centre. The lift line runs from here to the operators. */
const YOKE_DROP = TOW.yokeDrop;
/** Catch point of the fighter's hook (crossbar) in fighter space with the hook deployed. */
const HOOK_TIP = new T.Vector3(0, -1.0, .88);
const SHREDS = 26;
const POINTS = 14;
const BURST_SECONDS = 3.2;
const UP = new T.Vector3(0, 1, 0);

/** Double flash of the pickup strobe every 1.4 s: 1 while lit, 0 in between. */
export function strobe(seconds: number): number {
  const phase = (((seconds % 1.4) + 1.4) % 1.4) / 1.4;
  return phase < .045 || (phase > .13 && phase < .175) ? 1 : 0;
}

/** Envelope fabric: twelve olive gores with taped seams, darker caps and low-visibility stencils. */
function envelopeTexture(): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext('2d')!;
  const gores = ['#555a3c', '#4f5437'];
  for (let i = 0; i < 12; i++) {
    context.fillStyle = gores[i % 2];
    context.fillRect(i * 2048 / 12, 0, 2048 / 12 + 1, 1024);
  }
  // Wear: dust and abrasion, deterministic so every client sees the same balloon.
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    context.fillStyle = random() < .5 ? 'rgba(30,32,20,.09)' : 'rgba(150,146,112,.06)';
    context.fillRect(random() * 2048, random() * 1024, 2 + random() * 9, 1 + random() * 4);
  }
  context.fillStyle = '#2f321f';
  for (let i = 0; i <= 12; i++) context.fillRect(i * 2048 / 12 - 3, 0, 6, 1024);
  // Tail (canvas top) and nose (canvas bottom) caps.
  context.fillRect(0, 0, 2048, 46);
  context.fillRect(0, 990, 2048, 34);
  context.fillStyle = '#3a3d27';
  context.fillRect(0, 46, 2048, 22);
  context.fillRect(0, 968, 2048, 22);
  // Stencils run along the length: about 98 px per metre along it, 214 px per metre around it.
  const label = (u: number, angle: number) => {
    context.save();
    context.translate(u * 2048, 512);
    context.rotate(angle);
    context.scale(.98, 2.14);
    context.fillStyle = 'rgba(196,188,150,.72)';
    context.font = '700 34px monospace';
    context.textAlign = 'center';
    context.fillText('FB-20  BERGUNG', 0, -8);
    context.font = '600 15px monospace';
    context.fillText('HE  4,6 m³  ·  LEINE NICHT BELASTEN', 0, 14);
    context.fillRect(-150, 22, 300, 3);
    context.restore();
  };
  label(.535, Math.PI / 2);
  label(.965, -Math.PI / 2);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Four tail fins in X configuration; each fin spans radius and length. */
function finGeometry(): T.BufferGeometry {
  const outline = [[1.05, 1.75], [2.3, 3.05], [2.3, 3.7], [.55, 3.45]];
  const positions: number[] = [];
  for (let fin = 0; fin < 4; fin++) {
    const angle = Math.PI / 4 + fin * Math.PI / 2;
    const corner = ([r, z]: number[]) => [Math.cos(angle) * r * HULL.x / 1.55, Math.sin(angle) * r * HULL.y / 1.55, z];
    const [a, b, c, d] = outline.map(corner);
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

interface Shred { origin: T.Vector3; velocity: T.Vector3; axis: T.Vector3; spin: number; size: number }

export interface RecoveryCarry { readonly anchor: T.Vector3; readonly rotation: T.Quaternion; readonly pivot: number }

export class RecoveryView {
  readonly root = new T.Group();
  private readonly envelope = new T.Group();
  private readonly pod = new T.Group();
  private readonly riser: T.Mesh;
  private readonly canister = new T.Group();
  private readonly fighter = new T.Group();
  private readonly lid = new T.Group();
  private readonly hook = new T.Group();
  private readonly lens = emitter(0xff3a2c, .3);
  private readonly glow: T.Sprite;
  private readonly lidLight = emitter(0xff3a2c, 1.2);
  private readonly hookLight = emitter(0xffb15a, 1.6);
  private readonly anchorLine: T.Line;
  private readonly ropes: T.Line[];
  private readonly shreds: T.InstancedMesh;
  private readonly puff: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>;
  private readonly shredData: Shred[] = [];
  private readonly heading = new T.Vector3(Math.sin(COURSE), 0, -Math.cos(COURSE));
  private readonly top = new T.Vector3();
  private readonly yoke = new T.Vector3();
  private readonly catchPoint = new T.Vector3();
  private readonly burstCentre = new T.Vector3();
  private readonly hookPoint = new T.Vector3();
  private readonly velocity = new T.Vector3();
  private readonly tip = new T.Vector3();
  private readonly start = new T.Vector3();
  private readonly end = new T.Vector3();
  private readonly lastEnd = Array.from({ length: 4 }, () => new T.Vector3());
  private readonly ids: (string | undefined)[] = [];
  private readonly tows = new Map<string, TowLine>();
  private readonly carries = new Map<string, RecoveryCarry>();
  private towKey = -1;
  private since = 0;
  private lifting = false;
  private readonly dummy = new T.Object3D();

  constructor() {
    const fabric = new T.MeshStandardMaterial({ map: envelopeTexture(), roughness: .9, metalness: 0 });
    const tape = metal(0x2f321f, .9, .02);
    const webbing = metal(0x23251a, .95, .02);
    const housing = metal(0x1d201c, .55, .5);
    const shell = metal(0x454b40);
    const armor = metal(0x58665e);
    const dark = metal(0x232f30, .53);
    const blue = emitter(0x79beed, 2.7);

    const hull = new T.SphereGeometry(1, 40, 24).rotateX(Math.PI / 2);
    const envelope = new T.Mesh(hull, fabric);
    envelope.scale.set(HULL.x, HULL.y, HULL.z);
    envelope.castShadow = true;
    this.envelope.add(envelope);
    const fins = new T.Mesh(finGeometry(), new T.MeshStandardMaterial({ color: 0x41452c, roughness: .88, side: T.DoubleSide }));
    fins.castShadow = true;
    this.envelope.add(fins);
    const nose = new T.Mesh(new T.SphereGeometry(1, 16, 10), tape);
    nose.scale.set(.42, .42, .16);
    nose.position.z = -HULL.z + .05;
    this.envelope.add(nose);
    // Belly load patch with the harness ring the riser hangs from.
    plate(this.envelope, webbing, 0, -HULL.y + .02, 0, .9, .08, 1.4);
    const ring = new T.Mesh(new T.TorusGeometry(.13, .025, 6, 16), housing);
    ring.position.y = -HULL.y - .06;
    this.envelope.add(ring);

    // The strobe pod hangs plumb under the envelope; its origin is the pickup yoke where the line attaches.
    const riserLength = YOKE_DROP - HULL.y - .55;
    this.riser = plate(this.pod, webbing, 0, .55 + riserLength / 2, 0, .045, riserLength, .045);
    plate(this.pod, housing, 0, .44, 0, .22, .1, .22);
    const body = new T.Mesh(new T.CylinderGeometry(.1, .12, .3, 12), housing);
    body.position.y = .12;
    this.pod.add(body);
    const dome = new T.Mesh(new T.SphereGeometry(.13, 14, 8), this.lens);
    dome.position.y = .3;
    dome.scale.y = .85;
    this.pod.add(dome);
    for (const y of [.25, .36]) plate(this.pod, housing, 0, y, 0, .03, .12, .24).rotation.y = y * 9;
    const yoke = new T.Mesh(new T.TorusGeometry(.09, .022, 6, 14), housing);
    yoke.position.y = -.05;
    this.pod.add(yoke);
    this.glow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: 0xff4a36, blending: T.AdditiveBlending,
      depthWrite: false, transparent: true, sizeAttenuation: false }));
    this.glow.position.y = .3;
    this.pod.add(this.glow);

    plate(this.canister, shell, 0, .19, 0, 1.05, .38, .77);
    this.lid.position.set(0, .38, -.36);
    plate(this.lid, shell, 0, .045, .36, 1.04, .09, .77);
    plate(this.lid, this.lidLight, 0, .104, .37, .84, .038, .16);
    this.canister.add(this.lid);

    const parts = new PanelBatch();
    const wing = new T.Mesh(new T.ConeGeometry(5.5, .34, 3), shell);
    wing.rotation.y = Math.PI * .5;
    wing.scale.z = .82;
    this.fighter.add(wing);
    parts.add(armor, 0, .21, -.6, 2.28, 1.04, 7.8);
    parts.add(armor, 0, .08, -4.91, 1.46, .65, 1.4);
    parts.add(dark, 0, .78, -2.48, 1.24, .48, 2.45);
    for (const side of [-1, 1]) {
      parts.add(armor, side * 2.17, .22, 1.03, 1.73, .81, 3.9, side * .18);
      parts.add(dark, side * 2.2, 1.03, 1.89, .19, 1.39, 1.8);
      parts.add(blue, side * 2.22, .16, 2.99, 1.2, .33, .23);
      const exhaust = new T.Mesh(new T.ConeGeometry(.5, 4.8, 9, 1, true),
        new T.MeshBasicMaterial({ color: 0x79beed, opacity: .42, transparent: true, depthWrite: false }));
      exhaust.position.set(side * 2.23, .16, 5.24);
      exhaust.rotation.x = Math.PI / 2;
      this.fighter.add(exhaust);
    }
    this.fighter.rotation.order = 'YXZ';
    this.hook.position.set(0, -.24, .86);
    plate(this.hook, dark, 0, -.38, 0, .18, .75, .18);
    plate(this.hook, this.hookLight, 0, -.76, .02, 1.1, .16, .25);
    this.fighter.add(this.hook);
    parts.finish(this.fighter);

    const line = (color: number) => {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(POINTS * 3), 3));
      const rope = new T.Line(geometry, new T.LineBasicMaterial({ color }));
      rope.frustumCulled = false;
      this.root.add(rope);
      return rope;
    };
    this.anchorLine = line(0x7d7556);
    this.ropes = Array.from({ length: 4 }, () => line(0x8f8662));

    // Burst: envelope shreds and the talc puff of the bursting skin.
    const shredMaterial = fabric.clone();
    shredMaterial.side = T.DoubleSide;
    // Thin fabric lets light through: keeps backlit shreds from turning black.
    shredMaterial.emissive.set(0x23251a);
    this.shreds = new T.InstancedMesh(new T.PlaneGeometry(1, .62, 2, 1), shredMaterial, SHREDS);
    this.shreds.frustumCulled = false;
    this.shreds.instanceMatrix.setUsage(T.DynamicDrawUsage);
    let seed = 11;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < SHREDS; i++) {
      const direction = new T.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
      this.shredData.push({
        origin: new T.Vector3(direction.x * HULL.x, direction.y * HULL.y, direction.z * HULL.z),
        velocity: direction.clone().multiplyScalar(7 + random() * 9).add(new T.Vector3(0, 2.5, 0)),
        axis: new T.Vector3(random() - .5, random() - .5, random() - .5).normalize(),
        spin: 5 + random() * 9, size: .35 + random() * .5,
      });
    }
    this.puff = new T.Mesh(new T.SphereGeometry(1, 14, 10),
      new T.MeshBasicMaterial({ color: 0xc4c1a8, transparent: true, depthWrite: false, opacity: 0 }));
    this.root.add(this.envelope, this.pod, this.canister, this.fighter, this.shreds, this.puff);
    this.root.visible = false;
  }

  get audioPosition(): T.Vector3 | undefined {
    return this.root.visible && this.fighter.visible ? this.fighter.position : undefined;
  }

  /** Towed operator: harness position and body orientation from the line simulation (LIFT only). */
  carry(id: string): RecoveryCarry | undefined {
    return this.lifting ? this.carries.get(id) : undefined;
  }

  /** Hook position while the fighter tows the line. */
  get hookPosition(): T.Vector3 | undefined {
    return this.lifting ? this.hookPoint : undefined;
  }

  /**
   * Chase view of a towed operator: from the side and behind, first framing the catch above, then the line between
   * operator and fighter. False when the operator is not on the line.
   */
  chase(id: string, position: T.Vector3, target: T.Vector3): boolean {
    const carry = this.carry(id);
    if (!carry) return false;
    const { anchor } = carry;
    const { heading } = this;
    position.set(anchor.x - heading.x * 13 + heading.z * 15, anchor.y + 4.5, anchor.z - heading.z * 13 - heading.x * 15);
    target.lerpVectors(anchor, this.hookPoint, .55 - .27 * T.MathUtils.smoothstep(this.since, .4, 2.2));
    return true;
  }

  /** Balloon centre at a tick: rises in 3.4 s after the canister opens, then sways on its line. */
  private balloonAt(state: ExtractionSnapshot, tick: number, base: number, target: T.Vector3): T.Vector3 {
    const age = Math.max(0, (tick - state.startedAt) / NET.tickHz);
    const fill = Math.min(1, age * .66);
    return target.set(state.x + Math.sin(tick * .031) * .63 * fill, base + .61 + BALLOON.height * Math.min(1, age / 3.4),
      state.z + Math.cos(tick * .027) * .47 * fill);
  }

  update(state: ExtractionSnapshot | undefined, tick: number, dt: number, players: PlayersSnapshot | undefined,
    own: string, position: PositionXZ, world?: WorldDefinition): void {
    this.root.visible = state?.method === 'balloon';
    this.lifting = false;
    if (state?.method !== 'balloon') {
      this.ids.length = 0;
      this.tows.clear();
      this.towKey = -1;
      return;
    }
    const base = groundHeight(world, state.x, state.z);
    const ground = (x: number, z: number) => groundHeight(world, x, z);
    const age = Math.max(0, (tick - state.startedAt) / NET.tickHz);
    const fill = Math.min(1, age * .66);
    const scale = .13 + .87 * fill;
    const lift = state.phase === 'LIFT';
    const seconds = tick / NET.tickHz;
    const t = T.MathUtils.clamp((tick - state.phaseAt) / Math.max(1, state.endsAt - state.phaseAt), 0, 1);
    const since = lift ? Math.max(0, (tick - state.phaseAt) / NET.tickHz) : 0;
    this.since = since;
    this.balloonAt(state, tick, base, this.top);
    this.yoke.copy(this.top).addScaledVector(UP, -YOKE_DROP * scale);
    // The catch happens at the yoke position of the tick the line is taken (end of APPROACH = start of LIFT).
    const catchTick = lift ? state.phaseAt : state.endsAt;
    this.balloonAt(state, catchTick, base, this.catchPoint).addScaledVector(UP, -YOKE_DROP);

    // Envelope: nose into the fighter's course, gentle sway; gone once the hook has the line.
    this.envelope.visible = !lift;
    this.envelope.scale.setScalar(scale);
    this.envelope.position.copy(this.top);
    this.envelope.rotation.set(Math.sin(tick * .027) * .04, Math.atan2(this.heading.x, this.heading.z), Math.sin(tick * .031) * .06);
    this.riser.visible = !lift;
    const flash = strobe(seconds);
    this.lens.emissiveIntensity = .35 + 7 * flash;
    this.glow.material.opacity = .12 + .88 * flash;
    this.glow.scale.setScalar((lift ? .05 : .085) * (.4 + .6 * fill));
    this.lidLight.emissiveIntensity = .25 + .2 * Math.sin(seconds * 2.4);
    this.canister.position.set(state.x, base, state.z);
    this.lid.rotation.x = -1.9 * Math.min(1, age * 2.7);

    this.fighter.visible = state.phase !== 'COUNTDOWN';
    if (this.fighter.visible) this.placeFighter(lift, t, since);
    if (lift) {
      this.pod.position.copy(this.hookPoint);
      this.pod.scale.setScalar(1);
    } else {
      this.pod.position.copy(this.yoke);
      this.pod.scale.setScalar(scale);
    }
    this.updateBurst(lift ? since : -1);

    // Ground anchor: the canister holds the balloon until the hook takes the line.
    this.anchorLine.visible = !lift;
    if (!lift) {
      this.start.set(state.x, base + .42, state.z);
      this.drawLine(this.anchorLine, this.start, this.yoke, .03 * this.start.distanceTo(this.yoke));
    }

    if (lift && this.towKey !== state.phaseAt) {
      this.tows.clear();
      this.towKey = state.phaseAt;
    }
    this.carries.clear();
    this.ropes.forEach((rope, index) => {
      const id = state.securedIds[index];
      const player = id === own ? position : players?.players.find((operator) => operator.id === id);
      rope.visible = Boolean(player && id);
      if (!player || !id) {
        this.ids[index] = undefined;
        return;
      }
      const harness = this.lastEnd[index];
      const y = groundHeight(world, player.x, player.z) + TOW.harness;
      if (id !== this.ids[index] || id === own || lift) harness.set(player.x, y, player.z);
      else {
        const smoothing = 1 - Math.exp(-dt * 15);
        harness.set(T.MathUtils.lerp(harness.x, player.x, smoothing), T.MathUtils.lerp(harness.y, y, smoothing),
          T.MathUtils.lerp(harness.z, player.z, smoothing));
      }
      this.ids[index] = id;
      if (!lift) {
        const span = harness.distanceTo(this.yoke);
        this.drawLine(rope, harness, this.yoke, .5 * Math.sqrt(Math.max(0, (span * TOW.slack) ** 2 - span * span)));
        return;
      }
      let tow = this.tows.get(id);
      if (!tow) {
        tow = new TowLine(harness, this.catchPoint, this.heading, ground);
        this.tows.set(id, tow);
      }
      tow.advance(since);
      this.carries.set(id, { anchor: tow.position, rotation: tow.rotation, pivot: TOW.harness });
      this.drawLine(rope, tow.position, this.hookPoint, tow.sag(this.hookPoint));
    });
    this.lifting = lift;
  }

  private placeFighter(lift: boolean, t: number, since: number): void {
    const { fighter, heading, velocity } = this;
    if (lift) {
      hookAt(this.catchPoint, heading, since, this.hookPoint);
      hookVelocity(heading, since, velocity);
    } else {
      // Brakes in from altitude: quadratic part bleeds speed and height, the linear part is the pickup speed.
      const rest = 1 - t;
      const along = APPROACH_LINEAR * rest + (APPROACH_DISTANCE - APPROACH_LINEAR) * rest * rest;
      this.hookPoint.copy(this.catchPoint).addScaledVector(heading, -along).addScaledVector(UP, 46 * rest * rest);
      const speed = (APPROACH_LINEAR + 2 * (APPROACH_DISTANCE - APPROACH_LINEAR) * rest) / APPROACH_SECONDS;
      velocity.copy(heading).multiplyScalar(speed).addScaledVector(UP, -92 * rest / APPROACH_SECONDS);
    }
    const horizontal = Math.hypot(velocity.x, velocity.z);
    fighter.rotation.set(Math.atan2(velocity.y, horizontal), Math.atan2(-heading.x, -heading.z),
      lift ? -.12 * Math.min(1, since) : .15 * (1 - t));
    this.hook.rotation.x = lift ? 0 : -1.32 * (1 - T.MathUtils.smoothstep(t, .4, .85));
    this.hookLight.emissiveIntensity = lift ? 2.4 : 1.2 + .8 * t;
    // The hook's crossbar flies the computed path; the airframe hangs above it.
    this.tip.copy(HOOK_TIP).applyEuler(fighter.rotation);
    fighter.position.copy(this.hookPoint).sub(this.tip);
  }

  private updateBurst(since: number): void {
    const active = since >= 0 && since < BURST_SECONDS;
    this.shreds.visible = active;
    this.puff.visible = active && since < .6;
    if (!active) return;
    const { dummy } = this;
    const drag = 1.8;
    const fall = 3.4;
    const travel = (1 - Math.exp(-drag * since)) / drag;
    const shrink = T.MathUtils.clamp((BURST_SECONDS - since) / 1.4, 0, 1);
    const yaw = Math.atan2(this.heading.x, this.heading.z);
    // Shreds keep the envelope's momentum, then flutter down at the fabric's terminal speed.
    const centre = this.burstCentre.copy(this.catchPoint).addScaledVector(UP, YOKE_DROP);
    this.shredData.forEach((shred, index) => {
      dummy.position.copy(shred.origin).applyAxisAngle(UP, yaw).add(centre);
      dummy.position.x += (shred.velocity.x) * travel;
      dummy.position.y += (shred.velocity.y + fall) * travel - fall * since;
      dummy.position.z += (shred.velocity.z) * travel;
      dummy.quaternion.setFromAxisAngle(shred.axis, shred.spin * since * (.4 + .6 * Math.exp(-since)));
      dummy.scale.setScalar(shred.size * shrink);
      dummy.updateMatrix();
      this.shreds.setMatrixAt(index, dummy.matrix);
    });
    this.shreds.instanceMatrix.needsUpdate = true;
    const puff = Math.min(1, since / .6);
    this.puff.position.copy(centre);
    this.puff.scale.set(HULL.x, HULL.y, HULL.z).multiplyScalar(1 + 2.2 * Math.sqrt(puff));
    this.puff.rotation.y = yaw;
    this.puff.material.opacity = .22 * (1 - puff) ** 2;
  }

  private drawLine(line: T.Line, from: T.Vector3, to: T.Vector3, sag: number): void {
    const attribute = line.geometry.getAttribute('position');
    for (let i = 0; i < POINTS; i++) {
      const u = i / (POINTS - 1);
      this.end.lerpVectors(from, to, u);
      attribute.setXYZ(i, this.end.x, this.end.y - Math.sin(Math.PI * u) * sag, this.end.z);
    }
    attribute.needsUpdate = true;
  }
}

function glowTexture(): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.18, 'rgba(255,220,210,.85)');
  gradient.addColorStop(.45, 'rgba(255,120,100,.25)');
  gradient.addColorStop(1, 'rgba(255,80,60,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(canvas);
}

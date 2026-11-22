import * as T from 'three';
import { CARRIER_BENCHES, CARRIER_LOCKERS, CARRIER_ROOM_SIZE, CARRIER_ROOMS, CARRIER_WINDOW_WALLS, CARRIER_WORLD } from '@freefall/shared';
import type { MissionSnapshot, Obstacle } from '@freefall/shared';
import { carrierAlarm } from '../../audio/CarrierAlarm.ts';
import { PanelBatch, emitter, metal, plate, stencil } from './ShipParts.ts';
import { CarrierBeacons } from './CarrierBeacons.ts';
import { CarrierHologram } from './CarrierHologram.ts';
import { CARRIER_SUN, CarrierSpace, glow } from './CarrierSpace.ts';

const ROOM_ACCENT: Record<string, number> = {
  AUSRÜSTUNG: 0xffb35c, WAFFENKAMMER: 0xff5a3c, RÜSTUNG: 0x7fa8ff, FORSCHUNG: 0x3fe0c0,
};
const SILL = 1.05;
const LINTEL = 3.95;
const WHITE = new T.Color(0xd0d4bf);
const ALARM_RED = new T.Color(0xff3a22);

/** Soft additive light cards: glow under ceiling fixtures, light pools on the deck and window bloom. */
class CardBatch {
  private readonly matrices: T.Matrix4[] = [];
  private readonly dummy = new T.Object3D();
  private readonly material: T.Material;
  constructor(material: T.Material) { this.material = material; }
  add(x: number, y: number, z: number, w: number, h: number, rx: number, ry = 0): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(rx, ry, 0);
    this.dummy.scale.set(w, h, 1);
    this.dummy.updateMatrix();
    this.matrices.push(this.dummy.matrix.clone());
  }
  finish(parent: T.Object3D): T.InstancedMesh {
    const mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), this.material, this.matrices.length);
    this.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    mesh.renderOrder = 5;
    parent.add(mesh);
    return mesh;
  }
}

const cardMaterial = (map: T.Texture, color: number, opacity: number) => new T.MeshBasicMaterial({
  map, color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false, toneMapped: false,
});

/** Volume of light falling through one window pane, fading along the ray. */
function shaft(width: number, height: number, length: number, direction: T.Vector3, color: number): T.Mesh {
  // Open tube: the four sides of a unit box without its caps (z from 0 at the window to 1 at the far end).
  const corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
    const nx = (ay + by) === 0 ? Math.sign(ax + bx) : 0, ny = (ax + bx) === 0 ? Math.sign(ay + by) : 0;
    positions.push(ax, ay, 0, bx, by, 0, bx, by, 1, ax, ay, 0, bx, by, 1, ax, ay, 1);
    for (let k = 0; k < 6; k++) normals.push(nx, ny, 0);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  const material = new T.ShaderMaterial({
    uniforms: { tint: { value: new T.Color(color) }, strength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vAlong; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vAlong = position.z;
        vec4 view = modelViewMatrix * vec4(position, 1.);
        vView = -view.xyz; vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 tint; uniform float strength; varying float vAlong; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        // Fade out close to the camera so walking through a shaft never pops.
        float fade = smoothstep(0., .06, vAlong) * pow(max(1. - vAlong, 0.), 1.8) * smoothstep(.6, 3.5, length(vView));
        gl_FragColor = vec4(tint * strength * fade * (.2 + .8 * facing) * .03, 1.);
      }`,
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(new T.Vector3(width, 0, 0), new T.Vector3(0, height, 0), direction.clone().multiplyScalar(length));
  mesh.renderOrder = 6;
  return mesh;
}

export class Carrier {
  readonly root = new T.Group();
  private readonly detail = new T.Group();
  private readonly alarm = emitter(0xd93521, .9);
  private readonly lit = emitter(0xd0d4bf, 1.9);
  private readonly doors = new T.Group();
  private readonly space = new CarrierSpace();
  private readonly hologram = new CarrierHologram();
  private readonly beacons: CarrierBeacons;
  private readonly main: { light: T.PointLight; color: T.Color; intensity: number }[] = [];
  private readonly rooms: T.PointLight[] = [];
  private readonly shafts: T.ShaderMaterial[] = [];
  private readonly fill = new T.HemisphereLight(0x9fb9c4, 0x2b2622, .45);
  private red = 0;
  private last = 0;

  constructor() {
    const structure = new PanelBatch();
    const details = new PanelBatch();
    const deck = metal(0x353c3b, .58, .55);
    const frame = metal(0x39413d);
    const armor = metal(0x535e58);
    const trim = metal(0x252826);
    const hull = metal(0x1c2122, .62, .6);
    const equipment = metal(0x535743);
    const yellow = metal(0xaf852c);
    const lit = this.lit;
    const cool = emitter(0x9fdcff, 1.25);
    const lcd = emitter(0x789383, .75);
    const red = this.alarm;
    const glass = new T.MeshStandardMaterial({ color: 0x9ec9d8, roughness: .22, metalness: .8, transparent: true, opacity: .14,
      depthWrite: false });
    const panel = structure.add.bind(structure);
    const detail = details.add.bind(details);
    const soft = glow([[0, 'rgba(255,255,255,1)'], [.45, 'rgba(255,255,255,.35)'], [1, 'rgba(0,0,0,0)']]).map!;
    const ceilingGlow = new CardBatch(cardMaterial(soft, 0xffe7c4, .32));
    const floorGlow = new CardBatch(cardMaterial(soft, 0xffe7c4, .07));
    const windowGlow = new Map<number, CardBatch>();

    for (let z = -15; z <= 15; z += 3) for (let x = -10.5; x <= 10.5; x += 3) {
      panel((x + z * 3) % 6 > 0 ? armor : deck, x, -.075, z, 2.968, .15, 2.965);
      detail(trim, x, .008, z - 1.32, 2.5, .019, .04);
    }
    panel(deck, 0, -.12, .1, 24, .21, 34);
    panel(frame, 0, 4.95, .15, 24.8, .42, 34.2);
    panel(deck, 0, -.11, -28, 15, .22, 24);
    panel(frame, 0, 5.25, -28, 15.2, .4, 24);
    panel(frame, 0, 2.5, -39.8, 15.2, 5, .4);
    for (const side of [-1, 1]) {
      for (const z of [-16, -13, -4.5, 4.5, 13, 16]) {
        panel(frame, side * 11.66, 2.44, z, .84, 4.88, .5);
        panel(armor, side * 11.46, 3.6, z, .12, 1.58, .73);
        panel(lit, side * 11.38, 2.9, z, .11, .57, .13);
      }
      for (let z = -15; z < 16; z += 5) {
        panel(trim, side * 7.8, 4.66, z, 1.04, .26, 3.25);
        panel(lit, side * 7.8, 4.5, z, .63, .08, 2.88);
        ceilingGlow.add(side * 7.8, 4.47, z, 2.6, 5.2, Math.PI / 2);
        floorGlow.add(side * 7.8, .03, z, 3.4, 5.6, -Math.PI / 2);
        panel(armor, side * 10.2, 4.5, z, .25, .25, 5.05);
        detail(yellow, side * 10.6, 4.45, z, .08, .25, 5.05);
      }
      for (let z = -16; z <= 16; z += .78) {
        panel(yellow, side * 2.6, .014, z, .075, .03, .57);
      }
      for (let z = -26; z < -17; z += 2.15) {
        panel(red, side * 2.69, .04, z, .16, .08, .95);
        panel(lit, side * 1.8, 4.48, z, .32, .08, 1);
      }
      // Hangar: guide lights along the deck towards the lander and floodlight bars under the ceiling.
      for (let z = -38; z <= -19; z += 1.9) panel(cool, side * 5.9, .02, z, .14, .03, .34);
      for (const z of [-34, -28, -22]) {
        panel(trim, side * 4.6, 4.95, z, .5, .2, 3.4);
        panel(lit, side * 4.6, 4.84, z, .3, .06, 3.1);
        ceilingGlow.add(side * 4.6, 4.8, z, 1.8, 5, Math.PI / 2);
      }
      const door = new T.Group();
      plate(door, armor, 0, 1.95, 0, 2.75, 3.9, .34);
      plate(door, frame, 0, 2.85, .21, 2.5, .32, .12);
      plate(door, yellow, 0, .47, .22, 2.5, .22, .12);
      door.position.set(side * 4.05, 0, -17.3);
      this.doors.add(door);
    }
    this.root.add(this.doors);

    const skip = new Set<Obstacle>([...CARRIER_WINDOW_WALLS, ...CARRIER_LOCKERS, ...CARRIER_BENCHES]);
    for (const wall of CARRIER_WORLD.obstacles) {
      const { x, z, halfX, halfZ, height } = wall;
      if (z < -25 || (x === 0 && z === 0) || skip.has(wall)) continue;
      if (wall.bottom !== undefined) {
        panel(frame, x, (wall.bottom + height) / 2, z, halfX * 2, height - wall.bottom, halfZ * 2);
        for (const side of [-1, 1]) {
          detail(yellow, x, wall.bottom + .05, z + side * halfZ, halfX * 2, .10, .025);
        }
        continue;
      }
      const furniture = height < 2 && halfX >= .5;
      panel(furniture ? equipment : armor, x, height * .5, z, halfX * 2, height, halfZ * 2);
      if (!furniture && halfX < 1 && height >= 2) {
        detail(frame, x, .18, z, halfX * 2 + .16, .34, halfZ * 2);
        detail(equipment, x, 3.86, z, halfX * 2 + .08, .29, halfZ * 2);
      } else if (furniture) {
        detail(trim, x, height + .036, z, halfX * 2.08, .12, halfZ * 2.05);
        detail(lcd, x, height + .1, z, .96, .07, .7);
        for (const u of [-1.5, 0, 1.5]) {
          detail(frame, x + u, .35, z + halfZ + .045, 1.12, .47, .12);
        }
      }
    }
    for (const { x, z, halfX } of CARRIER_BENCHES) {
      panel(trim, x, .35, z, halfX * 2, .13, .63);
      panel(equipment, x, .46, z, halfX * 2, .14, .55);
      panel(armor, x, .65, z - .27, halfX * 2, .37, .10);
      for (const side of [-1, 1]) {
        panel(frame, x + side * (halfX - .19), .22, z, .15, .45, .47);
      }
    }
    for (const z of [-15, -10, -5, 0, 5, 10, 15]) {
      panel(armor, 0, 4.68, z, 23.9, .23, .3);
      panel(armor, 0, 4.76, z + 2.5, 7, .14, .09);
      panel(lit, 0, 4.69, z + 2.5, 5.5, .08, .055);
      if (z < 15) ceilingGlow.add(0, 4.6, z + 2.5, 7.5, 1.6, Math.PI / 2);
      for (const x of [-3.8, 3.8]) detail(trim, x, 4.57, z, .22, .2, 5);
    }

    // Side rooms: 17 x 12 m, locker row, station desk, coloured work light and a window band in the hull.
    const { inner, outer, halfDepth } = CARRIER_ROOM_SIZE;
    const width = outer - inner + .2;
    for (const room of CARRIER_ROOMS) {
      const side = Math.sign(room.x);
      const away = Math.sign(room.z);
      const accent = ROOM_ACCENT[room.label] ?? 0xd0d4bf;
      const accentLit = emitter(accent, 2.2);
      panel(deck, room.x, -.11, room.z, width, .22, halfDepth * 2 + .2);
      panel(frame, room.x, 4.92, room.z, width, .32, halfDepth * 2 + .2);
      for (const u of [-4.2, 0, 4.2]) {
        panel(trim, room.x + u, 4.7, room.z, .5, .18, 7.6);
        panel(lit, room.x + u, 4.6, room.z, .26, .06, 7.2);
        ceilingGlow.add(room.x + u, 4.56, room.z, 1.8, 8.4, Math.PI / 2);
      }
      floorGlow.add(room.x, .03, room.z, 10, 8, -Math.PI / 2);
      // Accent band along the walls at shoulder height.
      for (const dz of [-1, 1]) panel(accentLit, room.x, 3.2, room.z + dz * (halfDepth - .27), width - .6, .05, .03);
      // Lockers.
      const lockerZ = room.z + away * (halfDepth - .62);
      for (let i = 0; i < 7; i++) {
        const x = room.x - 4.65 + i * 1.55;
        panel(equipment, x, 1.25, lockerZ, 1.46, 2.5, .74);
        detail(frame, x, 1.3, lockerZ - away * .38, 1.32, 2.2, .03);
        detail(trim, x + .45, 1.3, lockerZ - away * .4, .06, .4, .03);
        detail(accentLit, x - .5, 2.25, lockerZ - away * .4, .1, .05, .02);
        detail(lcd, x, 2.05, lockerZ - away * .4, .6, .14, .02);
      }
      panel(accentLit, room.x, 2.58, lockerZ - away * .3, 10.8, .04, .06);
      // Station desk screen and a large wall display beside the door.
      panel(accentLit, room.x + side, 1.5, room.z - away * 1.2, 3.2, .05, .05);
      panel(trim, room.x - side * 3.4, 2.4, room.z - away * (halfDepth - .3), 4.2, 1.7, .08);
      panel(lcd, room.x - side * 3.4, 2.4, room.z - away * (halfDepth - .36), 3.9, 1.45, .02);
      const light = new T.PointLight(new T.Color(accent).lerp(WHITE, .35), 24, 15, 1.6);
      light.position.set(room.x, 4.05, room.z);
      this.rooms.push(light);
      this.root.add(light);
      stencil(this.root, room.label, 'SKYFALL  /  CREW DECK', [side * 11.57, 3.47, room.z], 3.1, -side * Math.PI / 2);
    }

    // Hull windows. The starboard side and the hangar look down on Dev' Ault, the rear window into the sun.
    for (const wall of CARRIER_WINDOW_WALLS) {
      const alongX = wall.halfX > wall.halfZ;
      const length = 2 * (alongX ? wall.halfX : wall.halfZ);
      const thick = 2 * (alongX ? wall.halfZ : wall.halfX);
      const hangar = wall.z < -17;
      const top = hangar ? 5.05 : 4.76;
      const inward = alongX ? -Math.sign(wall.z) : -Math.sign(wall.x);
      const region = length > 20 ? length - 6.4 : length - 2.4;
      const panes = Math.round(region / 3.2);
      const pane = region / panes;
      const put = (material: T.Material, u: number, y: number, w: number, h: number, depth: number, n = 0, batch = panel) =>
        alongX ? batch(material, wall.x + u, y, wall.z + n * inward, w, h, depth)
          : batch(material, wall.x + n * inward, y, wall.z + u, depth, h, w);
      const end = (length - region) / 2;
      for (const s of [-1, 1]) put(armor, s * (length / 2 - end / 2), top / 2, end, top, thick);
      put(armor, 0, SILL / 2, region, SILL, thick);
      put(armor, 0, (top + LINTEL) / 2, region, top - LINTEL, thick);
      put(trim, 0, SILL, region + .2, .1, thick + .34);
      put(cool, 0, SILL + .06, region - .1, .03, .05, thick / 2 + .12);
      put(trim, 0, LINTEL, region + .2, .14, thick + .22);
      // Exterior: hull ledge below the window band with a row of running lights.
      put(hull, 0, -.6, length + 1.4, .7, 5, -(thick / 2 + 2.5));
      put(hull, 0, top + .35, length + 1.4, .7, 3, -(thick / 2 + 1.5));
      for (let u = -length / 2; u <= length / 2 + .01; u += length / 6) put(red, u, -.22, .14, .08, .14, -(thick / 2 + 4.8), detail);
      const starboard = !alongX && (wall.x > 0);
      const sunward = alongX && wall.z > 0;
      // Window bloom matches the light outside: sun, planet glow or faint starlight.
      const tint = sunward ? 0xffd9a8 : starboard || (hangar && wall.x > 0) ? 0x6fb4ff : 0x26304a;
      if (!windowGlow.has(tint)) windowGlow.set(tint, new CardBatch(cardMaterial(soft, tint, sunward ? .16 : .2)));
      const cards = windowGlow.get(tint)!;
      for (let i = 0; i < panes; i++) {
        const u = -region / 2 + pane * (i + .5);
        put(glass, u, (SILL + LINTEL) / 2, pane - .3, LINTEL - SILL, .03);
        // Light from outside spilling onto the deck in front of the pane.
        const reach = thick / 2 + 1.6;
        const card = alongX ? [wall.x + u, .035, wall.z + inward * reach] as const : [wall.x + inward * reach, .035, wall.z + u] as const;
        cards.add(card[0], card[1], card[2], alongX ? pane * 1.1 : 3.4, alongX ? 3.4 : pane * 1.1, -Math.PI / 2);
        if (sunward) {
          // Sun shafts through the rear panorama window, falling onto the mess deck.
          const ray = CARRIER_SUN.clone().negate();
          const beam = shaft(pane - .3, LINTEL - SILL, 13, ray, 0xffd6a0);
          beam.matrix.setPosition(wall.x + u, (SILL + LINTEL) / 2, wall.z - thick / 2);
          this.shafts.push(beam.material as T.ShaderMaterial);
          this.detail.add(beam);
        }
      }
      for (let i = 0; i <= panes; i++) {
        const u = -region / 2 + pane * i;
        put(frame, u, (SILL + LINTEL) / 2, i % panes ? .3 : .42, LINTEL - SILL, thick + .14);
      }
    }

    for (const x of [-3, 3]) {
      panel(frame, x, 2.43, -17.06, .36, 4.86, 1.03);
      panel(red, x + Math.sign(x) * .26, 2.4, -16.51, .17, 1.72, .12);
      for (let i = 0; i < 6; i++) detail(yellow, x + Math.sign(x) * .67, .011, -15.4 + i * .45, .86, .027, .16, .5);
    }
    for (const side of [-1, 1]) {
      // Flush inspection housings above the checkpoint. Reuse the existing panel batches.
      panel(trim, side * 3.35, 3.76, -16.21, .36, .24, .46, side * .20);
      detail(lcd, side * 3.35, 3.74, -15.99, .12, .09, .04, side * .20);
      panel(equipment, side * 6.4, 2.55, -16.60, 3.75, 1.22, .08);
    }
    stencil(this.root, 'PERSONENKONTROLLE', 'SEKTOR 03  /  ZUGANG WIRD ERFASST', [-6.4, 2.55, -16.53], 3.52);
    stencil(this.root, 'VERLUSTREGISTER', 'ERSATZ ZUGEWIESEN  /  WIDERSPRUCH GESPERRT', [6.4, 2.55, -16.53], 3.52, 0, '#c7a598');
    stencil(this.root, 'ALBATROSS 02', 'BOARDING  /  LUFTSCHLEUSE', [0, 4.23, -16.52], 4.8);
    stencil(this.root, 'SKYFALL', 'FLOTTENKOMMANDO  /  DECK 03', [0, 4.33, 16.66], 3.1, Math.PI);
    stencil(this.root, 'MISSIONSKONSOLE', 'DEV\' AULT  /  TAKTISCHE PLANUNG', [0, .74, 1.61], 2.85, 0, '#c6c9ad');

    // Mission console with the projector ring in its top.
    panel(frame, 0, .34, 0, 2.64, .68, 2.64);
    panel(armor, 0, .84, 0, 3.16, .36, 3.16);
    panel(trim, 0, 1.03, 0, 2.9, .04, 2.9);
    const holo = emitter(0x52f0dc, 3.2);
    for (const [radius, tube] of [[.36, .03], [.62, .012], [1.18, .02]] as const) {
      const ring = new T.Mesh(new T.TorusGeometry(radius, tube, 6, 64), holo);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.07;
      this.root.add(ring);
    }
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      panel(holo, Math.cos(angle) * .9, 1.06, Math.sin(angle) * .9, .34, .02, .03, -angle);
    }
    for (const s of [-1, 1]) for (const t of [-1, 1]) panel(cool, s * 1.56, .62, t * 1.56, .06, .5, .06);

    // Light rig. Real lights stay few: the hologram, two mess fixtures, the hangar flood, one per room.
    const lights: [number, number, number, number, number, number][] = [
      [0, 4.2, -8, 0xffe2c0, 16, 19], [0, 4.2, 8.5, 0xffe2c0, 16, 19], [0, 4.6, -29, 0xcfe6ff, 30, 22],
    ];
    for (const [x, y, z, color, intensity, distance] of lights) {
      const light = new T.PointLight(color, intensity, distance, 1.5);
      light.position.set(x, y, z);
      this.main.push({ light, color: new T.Color(color), intensity });
      this.root.add(light);
    }

    this.beacons = new CarrierBeacons([
      { position: [-3, 4.62, -16.36], light: true }, { position: [3, 4.62, -16.36], light: true },
      { position: [0, 4.98, -21.5], hanging: true }, { position: [0, 4.98, -38.6], hanging: true },
      { position: [-6.2, 4.6, -12.2], hanging: true }, { position: [6.2, 4.6, -12.2], hanging: true },
    ]);

    structure.finish(this.root);
    details.finish(this.detail);
    ceilingGlow.finish(this.detail);
    floorGlow.finish(this.detail);
    for (const cards of windowGlow.values()) cards.finish(this.root);
    this.root.add(this.detail, this.space.root, this.hologram.root, this.beacons.root, this.fill);
  }

  update(now: number, state: MissionSnapshot | undefined, low: boolean, pixelRatio = 1): void {
    const dt = Math.min(.1, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    const level = carrierAlarm(state);
    this.detail.visible = !low;
    this.space.update(now, pixelRatio);
    const lamps = this.beacons.update(now, level, low);
    this.red += ((level === 2 ? 1 : 0) - this.red) * Math.min(1, dt * 3);
    this.hologram.update(now, this.red, low, pixelRatio);
    const pulse = .5 + .5 * Math.sin(now * .0075);
    // Under alarm the work lights drop and turn red; the boarding call only warms them a little.
    for (const { light, color, intensity } of this.main) {
      light.color.copy(color).lerp(ALARM_RED, this.red * .75);
      light.intensity = intensity * (1 - this.red * (.45 + .2 * pulse));
    }
    for (const light of this.rooms) {
      light.visible = !low;
      light.intensity = 24 * (1 - this.red * .5);
    }
    this.lit.emissive.copy(WHITE).lerp(ALARM_RED, this.red * .7);
    this.lit.emissiveIntensity = 1.9 * (1 - this.red * .35);
    this.alarm.emissiveIntensity = level === 2 ? 1.8 + 1.6 * pulse : level === 1 ? 1.1 + .5 * lamps * pulse : .68;
    for (const material of this.shafts) material.uniforms.strength.value = 1 - this.red * .4;
    const open = state?.state === 'DEPLOYMENT' ? 1.37 : 4.05;
    this.doors.children.forEach((door, i) => {
      const target = (i === 0 ? -1 : 1) * open;
      door.position.x += (target - door.position.x) * Math.min(1, dt * 4);
    });
  }
}

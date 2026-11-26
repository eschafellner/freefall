import * as T from 'three';
import { CARRIER_HALLS, CARRIER_SHIP, CARRIER_WALLS } from '@freefall/shared';
import { stencil } from '../ShipParts.ts';
import type { CarrierContext } from './CarrierContext.ts';

const HANGAR = CARRIER_HALLS.hangar;
const TOP = HANGAR.ceiling;
const COLUMNS = [-25.6, -30.2, -34.8, -39.4, -44];
const GATE = { halfWidth: 13, height: 10.5, z: -46.3 };

/** Atmosphere shield across the open hangar gate: faint blue sheet with a hex lattice, scan bands and a bright rim. */
function shield(width: number, height: number): { mesh: T.Mesh; uniforms: { time: T.IUniform<number>; strength: T.IUniform<number> } } {
  const uniforms = { time: { value: 0 }, strength: { value: 1 } };
  const material = new T.ShaderMaterial({
    uniforms: { ...uniforms, size: { value: new T.Vector2(width, height) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vView;
      void main() { vUv = uv; vec4 view = modelViewMatrix * vec4(position, 1.); vView = -view.xyz; gl_Position = projectionMatrix * view; }`,
    fragmentShader: /* glsl */ `
      uniform float time, strength; uniform vec2 size; varying vec2 vUv; varying vec3 vView;
      float hex(vec2 p) {
        p.x *= 1.1547; p.y += mod(floor(p.x), 2.) * .5;
        vec2 f = abs(fract(p) - .5);
        return abs(max(f.x * 1.5 + f.y, f.y * 2.) - 1.);
      }
      void main() {
        vec2 p = vUv * size;
        // Lattice only shows in a travelling wave and near the frame; the sheet itself is barely there.
        float sweep = exp(-pow(fract(time * .06) * (size.x + 16.) - 8. - p.x, 2.) * .08);
        vec2 edge = min(vUv, 1. - vUv) * size;
        float near = exp(-min(edge.x, edge.y) * .45);
        float lattice = smoothstep(.03, 0., hex(p * .7)) * (.01 + .22 * sweep + .1 * near);
        float band = smoothstep(.85, 1., sin(p.y * .6 - time * 1.3) * .5 + .5) * .05;
        float rim = exp(-min(edge.x, edge.y) * 2.6) * .8;
        float fade = smoothstep(.5, 4., length(vView));
        vec3 color = vec3(.25, .62, 1.) * (lattice + band + .015) + vec3(.5, .85, 1.) * rim;
        gl_FragColor = vec4(color * strength * fade * .32, 1.);
      }`,
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(width, height), material);
  mesh.renderOrder = 7;
  return { mesh, uniforms };
}

/** Lights in two rows leading out through the gate onto the flight deck lip; a pulse runs outwards. */
function chaser(count: number, start: number, step: number): { mesh: T.InstancedMesh; update(seconds: number): void } {
  const mesh = new T.InstancedMesh(new T.BoxGeometry(.32, .06, .5), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), count * 2);
  const dummy = new T.Object3D();
  for (let i = 0; i < count; i++) for (const side of [0, 1]) {
    dummy.position.set(side ? 6.4 : -6.4, .02, start - i * step);
    dummy.updateMatrix();
    mesh.setMatrixAt(i * 2 + side, dummy.matrix);
  }
  const color = new T.Color();
  const base = new T.Color(0x2f7ad0), hot = new T.Color(0xbfe6ff);
  const update = (seconds: number) => {
    for (let i = 0; i < count; i++) {
      const phase = (seconds * 1.3 - i * .12) % 1.6;
      const k = Math.max(0, 1 - Math.abs(phase) * 5);
      color.copy(base).lerp(hot, k).multiplyScalar(.6 + k * 2.2);
      mesh.setColorAt(i * 2, color);
      mesh.setColorAt(i * 2 + 1, color);
    }
    mesh.instanceColor!.needsUpdate = true;
  };
  update(0);
  mesh.computeBoundingSphere();
  return { mesh, update };
}

export function buildHangar(c: CarrierContext): void {
  const { kit, p } = c;
  kit.zone = 'hangar';
  const mid = (HANGAR.minZ + HANGAR.maxZ) / 2, length = HANGAR.maxZ - HANGAR.minZ;
  // Deck with the launch pad of Albatross 02: hazard border, lighter cradle plates, hatch seams and clamp housings.
  kit.box(p.deckDark, 0, -.1, mid, 35.2, .2, length + .6);
  const pad = { x: 5.7, front: CARRIER_SHIP.z - 7.2, back: CARRIER_SHIP.z + 6.4 };
  kit.box(p.deck, 0, .006, (pad.front + pad.back) / 2, pad.x * 2, .012, pad.back - pad.front);
  for (const side of [-1, 1]) kit.box(p.hazard, side * pad.x, .014, (pad.front + pad.back) / 2, .5, .02, pad.back - pad.front + .5);
  for (const z of [pad.front, pad.back]) kit.box(p.hazard, 0, .014, z, pad.x * 2 + .5, .02, .5);
  for (const x of [-3.9, 0, 3.9]) kit.box(p.black, x, .016, CARRIER_SHIP.z - .4, .05, .02, 12.6);
  kit.box(p.black, 0, .016, CARRIER_SHIP.z - .4, 7.8, .02, .05);
  for (const [x, z] of [[-3.4, CARRIER_SHIP.z - 3.4], [3.4, CARRIER_SHIP.z - 3.4], [-3.4, CARRIER_SHIP.z + 3.4], [3.4, CARRIER_SHIP.z + 3.4]]) {
    kit.box(p.frameDark, x, .12, z, 1.1, .24, 1.1);
    kit.box(p.yellow, x, .26, z, .8, .06, .8);
    kit.cylinder(p.steel, x, .4, z, .2, .3, 'y', 12);
  }
  // Lanes and guide lights.
  for (const side of [-1, 1]) {
    for (let z = HANGAR.maxZ - 1; z > HANGAR.minZ + .5; z -= 1.5) kit.box(p.cool, side * 6.4, .02, z, .14, .03, .34);
    for (let z = HANGAR.maxZ - .8; z > HANGAR.minZ; z -= 1) kit.box(p.yellow, side * 7.4, .014, z, .1, .02, .6, 0, { vary: .1 });
  }
  // Walls: port plain, starboard with a tall window band towards Dev' Ault, aft wall with the Leitstand window, the gate.
  for (const wall of CARRIER_WALLS) {
    if (wall.z > HANGAR.maxZ + .5 || Math.abs(wall.x) < 3.5 && Math.abs(wall.z - GATE.z) > .1) continue;
    if (Math.abs(wall.z - HANGAR.maxZ) < .01) {
      kit.box(p.wall, wall.x, 2.8, wall.z, wall.halfX * 2, 5.6, wall.halfZ * 2);
      continue;
    }
    if (Math.abs(wall.z - GATE.z) < .01) continue;
    kit.box(p.wall, wall.x, TOP / 2, wall.z, wall.halfX * 2, TOP, wall.halfZ * 2);
  }
  const aft = HANGAR.maxZ;
  for (const side of [-1, 1]) kit.box(p.wall, side * 11.95, 7.1, aft, 10.7, 3, .6);
  kit.box(p.wall, 0, (8.6 + TOP) / 2, aft, 35.2, TOP - 8.6, .6);
  kit.box(p.wall, 0, 4.9, aft, 6.2, 1.4, .6);
  kit.box(p.glass, 0, 7.1, aft - .02, 13.2, 3, .03);
  kit.box(p.frameDark, 0, 5.62, aft - .38, 13.8, .2, .5);
  kit.box(p.frameDark, 0, 8.6, aft - .34, 13.8, .2, .42);
  for (const x of [-6.6, -3.3, 0, 3.3, 6.6]) kit.box(p.frameDark, x, 7.1, aft - .3, Math.abs(x) > 6 ? .34 : .2, 3, .34);
  // Starboard window wall.
  const wx = 17.3;
  kit.box(p.wall, wx, .6, mid, .6, 1.2, length + .6);
  kit.box(p.wall, wx, (9.2 + TOP) / 2, mid, .6, TOP - 9.2, length + .6);
  kit.box(p.glass, wx, 5.2, mid, .03, 8, length);
  kit.box(p.frameDark, wx - .2, 1.24, mid, .6, .1, length);
  for (let z = HANGAR.maxZ - 1.15; z > HANGAR.minZ; z -= 2.3) kit.box(p.frameDark, wx - .05, 5.2, z, .3, 8, .14);
  const planet = c.glow(0x6fb4ff, .16);
  for (let z = HANGAR.maxZ - 2; z > HANGAR.minZ + 1; z -= 4) planet.pool(wx - 2.4, .035, z, 4, 4);
  // Columns, catwalks with railings and brackets on both walls.
  for (const side of [-1, 1]) {
    for (const z of COLUMNS) {
      kit.box(p.frameDark, side * 16.55, TOP / 2, z, .9, TOP, .8);
      kit.box(p.frame, side * 16.08, TOP / 2, z, .06, TOP - .4, .5);
      kit.box(p.hazard, side * 16.55, .55, z, .96, 1.1, .86);
      kit.beam(p.frameDark, [side * 16.1, 4.6, z], [side * 14.4, 6.35, z], .3, .3);
      kit.box(p.frameDark, side * 16.0, TOP - 2.9, z, .5, .3, .9);
      kit.box(c.lit, side * 15.74, TOP - 3.06, z, .04, .04, .7);
      c.glow(0xdfe9ff, .07).add(side * 17.0, TOP - 5.5, z + (z > -44 ? 2.3 : -2.3), 4.6, 6, 0, side * -Math.PI / 2);
    }
    kit.box(p.grate, side * 15.35, 6.45, mid, 2.3, .08, length - .4);
    kit.box(p.frameDark, side * 15.35, 6.36, mid, 2.3, .12, length - .4);
    kit.box(p.frameDark, side * 14.22, 6.4, mid, .12, .3, length - .4);
    for (let z = HANGAR.maxZ - .6; z > HANGAR.minZ + .3; z -= 1.6) kit.box(p.steel, side * 14.25, 7.0, z, .05, 1.1, .05);
    kit.cylinder(p.yellow, side * 14.25, 7.55, mid, .04, length - .4, 'z', 8);
    kit.cylinder(p.yellow, side * 14.25, 7.05, mid, .025, length - .4, 'z', 6);
    for (let z = HANGAR.maxZ - 3; z > HANGAR.minZ; z -= 4.6) {
      kit.box(c.lit, side * 15.9, 6.31, z, .06, .03, 1.2);
      c.floorGlow.pool(side * 15.3, 6.52, z, 2.4, 2.4);
    }
    // Ladder down from the catwalk near the aft wall.
    kit.box(p.steel, side * 14.15, 3.2, HANGAR.maxZ - 2.3, .05, 6.4, .05);
    kit.box(p.steel, side * 14.15, 3.2, HANGAR.maxZ - 2.9, .05, 6.4, .05);
    for (let y = .3; y < 6.4; y += .3) kit.box(p.steel, side * 14.15, y, HANGAR.maxZ - 2.6, .04, .04, .6);
  }
  // Port wall services: fuel and coolant lines, hose reels, panels.
  for (const [y, r, material] of [[2.6, .14, p.yellow], [2.95, .1, p.blue], [3.25, .08, p.red]] as const) kit.cylinder(material, -16.75, y, mid, r, length, 'z', 12);
  for (const z of [-28, -37, -42.5]) {
    kit.box(p.frameDark, -16.7, 1.4, z, .5, 2.4, 1.6);
    kit.cylinder(p.red, -16.3, 1.6, z, .5, .3, 'x', 20);
    kit.cylinder(p.rubber, -16.15, 1.6, z, .38, .32, 'x', 20);
    kit.box(p.lcd, -16.42, 2.3, z, .03, .3, .5);
  }
  // Roof: slab, trusses across the hall, crane rails and the gantry crane over the gate end.
  kit.box(p.ceiling, 0, TOP + .25, mid, 35.2, .5, length + .6);
  for (const z of COLUMNS) {
    kit.box(p.frameDark, 0, TOP - .25, z, 33.4, .5, .5);
    kit.box(p.frameDark, 0, TOP - 1.7, z, 33.4, .35, .45);
    for (let x = -16; x < 16; x += 2) {
      kit.beam(p.frame, [x, TOP - 1.7, z], [x + 1, TOP - .25, z], .12, .12);
      kit.beam(p.frame, [x + 1, TOP - .25, z], [x + 2, TOP - 1.7, z], .12, .12);
    }
    for (const x of [-9, -3, 3, 9]) {
      kit.box(p.frameDark, x, TOP - 2.05, z, 1.2, .35, .7);
      kit.box(c.lit, x, TOP - 2.24, z, 1, .03, .5);
      c.ceilingGlow.add(x, TOP - 2.26, z, 2.6, 1.8, Math.PI / 2);
      c.floorGlow.pool(x, .03, z, 6, 6);
    }
  }
  for (const side of [-1, 1]) kit.box(p.frameDark, side * 12, TOP - 2.2, mid, .5, .55, length - .2);
  const craneZ = -40.6;
  kit.box(p.yellow, 0, TOP - 2.85, craneZ, 24.6, .8, .7);
  kit.box(p.hazard, 0, TOP - 3.28, craneZ, 24.6, .08, .72);
  for (const side of [-1, 1]) kit.box(p.yellow, side * 12, TOP - 2.6, craneZ, .9, .6, 2.6);
  kit.box(p.frameDark, -4.5, TOP - 3.5, craneZ, 1.6, .7, 1.4);
  for (const dx of [-.25, .25]) kit.cylinder(p.steel, -4.5 + dx, TOP - 5.4, craneZ, .02, 3.6, 'y', 4);
  kit.box(p.yellow, -4.5, TOP - 7.3, craneZ, .7, .5, .45);
  kit.cylinder(p.steel, -4.5, TOP - 7.75, craneZ, .08, .4, 'y', 8);
  // Gate: jambs, header, retracted leaves, hazard edges; the opening is closed by the atmosphere shield.
  for (const side of [-1, 1]) {
    kit.box(p.wall, side * 15.3, TOP / 2, GATE.z, 4.6, TOP, .6);
    kit.box(p.frameDark, side * (GATE.halfWidth + .6), GATE.height / 2, GATE.z + .5, 1.2, GATE.height, 1.4);
    kit.box(p.hazard, side * (GATE.halfWidth + .02), GATE.height / 2, GATE.z + .5, .06, GATE.height, 1.2);
    for (let y = 1; y < GATE.height; y += 1.5) kit.box(p.cool, side * (GATE.halfWidth + .06), y, GATE.z + 1.1, .05, .5, .12);
    kit.box(p.frame, side * 15.4, GATE.height / 2, GATE.z - 1.2, 3.8, GATE.height, 1.6);
    for (let y = .5; y < GATE.height; y += .9) kit.box(p.frameDark, side * 15.4, y, GATE.z - .38, 3.6, .1, .06);
  }
  kit.box(p.wall, 0, (GATE.height + TOP) / 2, GATE.z, 26, TOP - GATE.height, .6);
  kit.box(p.frameDark, 0, GATE.height + .35, GATE.z + .5, 28.4, .7, 1.4);
  kit.box(p.hazard, 0, GATE.height + .02, GATE.z + .5, 26, .06, 1.2);
  kit.box(p.hazard, 0, .014, GATE.z + 1.2, 26, .02, .8);
  // Outside the gate: the flight deck lip with its edge lights, dark hull sides.
  kit.box(p.deckDark, 0, -.35, GATE.z - 12, 30, .5, 24);
  for (const side of [-1, 1]) {
    kit.box(p.frameDark, side * 15.8, 2, GATE.z - 12, 1.6, 5, 24);
    for (let z = GATE.z - 1; z > GATE.z - 24; z -= 3) kit.box(c.alarm, side * 15, .1, z, .2, .1, .2);
  }
  const lights = chaser(14, GATE.z + 6, 2.2);
  c.detail.add(lights.mesh);
  const field = shield(GATE.halfWidth * 2, GATE.height);
  field.mesh.position.set(0, GATE.height / 2, GATE.z + .2);
  c.root.add(field.mesh);
  c.tick.push((seconds) => {
    lights.update(seconds);
    field.uniforms.time.value = seconds;
  });
  stencil(c.root, 'ATMOSPHÄRENSCHILD', 'AKTIV  /  DRUCK GEHALTEN', [0, 11.4, GATE.z + 1.25], 5.2);
  c.addLight(0xcfe6ff, 40, 34, 0, TOP - 3.2, -28.6);
  c.addLight(0xcfe6ff, 36, 32, 0, TOP - 3.4, -37.4);
}

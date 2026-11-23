import * as T from 'three';
import { groundHeight, poiToWorld } from '@freefall/shared';
import type { PickupKind, PickupSnapshot, PointOfInterest, WorldDefinition } from '@freefall/shared';
import { randomSource } from '../environment/noise.ts';

/**
 * Points of Interest: biomneutrale Bauteile (Wracks, Leichen, Kisten, Sandsäcke, Monolith) und die aufnehmbaren
 * Gegenstände. Felsen eines PoI rendert das Biom selbst; die metallischen Kollider (`debris`) bekommen hier ihr Modell.
 * Alle Modelle sind prozedural aus Grundkörpern gebaut.
 */
const cube = new T.BoxGeometry(1, 1, 1);
const standard = (color: number, roughness = .82, metalness = .2) => new T.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color: number, intensity = 1.6, extra: T.MeshStandardMaterialParameters = {}) =>
  new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .4, ...extra });

class Kit {
  readonly hull = standard(0x667058, .8, .15);
  readonly hullDark = standard(0x3a413a, .75, .2);
  readonly scorched = standard(0x1d1b19, .95, .1);
  readonly steel = standard(0x6a706a, .5, .6);
  readonly hazard = standard(0x9b7536, .7, .3);
  readonly concrete = standard(0x8a877c, .95, .02);
  readonly sandbag = standard(0x8d7b59, 1, 0);
  readonly canvas = standard(0x5c5f48, .98, 0);
  readonly wood = standard(0x6b5134, .95, 0);
  readonly armor = standard(0x4f5a45, .8, .25);
  readonly fabric = standard(0x3d4436, .95, 0);
  readonly convict = standard(0xb4592a, .9, .05);
  readonly skin = standard(0x8a6f5c, .9, 0);
  readonly visor = standard(0x1d2a2e, .25, .6);
  readonly resin = glow(0x6a2a5a, .45, { roughness: .3 });
  readonly ember = glow(0xff6a1e, 1.4);
  readonly lamp = glow(0xd9e7c0, 1.3);
  readonly obsidian = standard(0x15121b, .22, .55);
  readonly rune = glow(0xb48cff, 2.4);
  readonly chitin = standard(0x2b211c, .55, .15);
}

type Place = (part: T.Object3D, lx: number, lz: number, lift?: number) => T.Object3D;

function box(parent: T.Object3D, material: T.Material, x: number, y: number, z: number, w: number, h: number, d: number,
  rx = 0, ry = 0, rz = 0): T.Mesh {
  const mesh = new T.Mesh(cube, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Gefallener Soldat aus Grundkörpern. `sitting`: an einen Felsen gelehnt, sonst liegend. */
function corpse(kit: Kit, uniform: T.Material, sitting: boolean): T.Group {
  const body = new T.Group();
  const torso = new T.Group();
  torso.position.set(0, sitting ? .42 : .2, 0);
  torso.rotation.x = sitting ? -.42 : -Math.PI / 2;
  body.add(torso);
  box(torso, uniform, 0, .3, 0, .46, .6, .26);
  box(torso, kit.armor, 0, .34, .06, .48, .42, .1);
  box(torso, kit.fabric, 0, .32, -.18, .36, .42, .16);
  const head = new T.Mesh(new T.SphereGeometry(.15, 10, 8), kit.armor);
  head.position.set(.04, .72, .02);
  head.rotation.z = .5;
  head.castShadow = true;
  torso.add(head);
  box(torso, kit.visor, .05, .72, .14, .2, .07, .06);
  for (const side of [-1, 1]) {
    box(torso, uniform, side * .32, .26, .1, .12, .5, .13, .3, 0, side * .35);
    // Beine: sitzend nach vorn ausgestreckt, liegend in Verlängerung des Körpers.
    const leg = box(body, uniform, side * .13, .1, sitting ? .45 : .62, .15, .15, .78);
    leg.rotation.y = side * .12;
    box(body, kit.fabric, side * .13, .12, sitting ? .86 : 1.03, .16, .2, .14);
  }
  return body;
}

function sandbags(parent: T.Object3D, kit: Kit, length: number, rows: number, place: Place, lx: number, lz: number, alongX: boolean): void {
  const bags = Math.max(1, Math.round(length / .62));
  for (let row = 0; row < rows; row++) for (let k = 0; k < bags; k++) {
    const offset = -length / 2 + (k + .5 + (row % 2) * .5) * (length / bags);
    if (offset > length / 2) continue;
    const bag = new T.Mesh(cube, kit.sandbag);
    bag.scale.set(alongX ? .58 : .34, .22, alongX ? .34 : .58);
    bag.castShadow = bag.receiveShadow = true;
    parent.add(place(bag, lx + (alongX ? offset : 0), lz + (alongX ? 0 : offset), .11 + row * .21));
  }
}

function crate(kit: Kit, material: T.Material, size = .7): T.Group {
  const group = new T.Group();
  box(group, material, 0, size * .5, 0, size, size, size * .7);
  box(group, kit.hullDark, 0, size, 0, size * 1.04, .05, size * .74);
  return group;
}

function buildPoi(poi: PointOfInterest, world: WorldDefinition, kit: Kit): T.Group {
  const root = new T.Group();
  root.position.set(poi.x, poi.ground, poi.z);
  root.rotation.y = -poi.turn * Math.PI / 2;
  root.name = 'PoI ' + poi.kind;
  const random = randomSource(Math.round(poi.x * 31 + poi.z * 17) >>> 0);
  /** Setzt ein Teil an lokaler Position auf das Gelände unter ihm. */
  const place: Place = (part, lx, lz, lift = 0) => {
    const at = poiToWorld(poi, lx, lz);
    part.position.set(lx, groundHeight(world, at.x, at.z) - poi.ground + lift, lz);
    root.add(part);
    return part;
  };
  const group = (lx: number, lz: number, yaw = 0, lift = 0) => {
    const part = new T.Group();
    part.rotation.y = yaw;
    return place(part, lx, lz, lift) as T.Group;
  };
  const scorch = (lx: number, lz: number, radius: number) => {
    const mark = new T.Mesh(new T.CircleGeometry(radius, 20).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({
      color: 0x14110f, roughness: 1, transparent: true, opacity: .62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    mark.receiveShadow = true;
    place(mark, lx, lz, .03);
  };
  const debris = (count: number, spread: number, material: T.Material) => {
    for (let k = 0; k < count; k++) {
      const piece = new T.Mesh(cube, material);
      piece.scale.set(.2 + random() * .6, .05 + random() * .12, .2 + random() * .5);
      piece.rotation.set((random() - .5) * .6, random() * 6.28, (random() - .5) * .6);
      piece.castShadow = true;
      const angle = random() * 6.28, r = 1.5 + random() * spread;
      place(piece, Math.cos(angle) * r, Math.sin(angle) * r, .05);
    }
  };

  switch (poi.kind) {
    case 'rock-operator': {
      const fallen = group(0, .75, Math.PI);
      fallen.add(corpse(kit, kit.fabric, true));
      fallen.rotation.y = 0;
      const rifle = group(.9, 1.3, .7, .05);
      box(rifle, kit.hullDark, 0, 0, 0, .08, .08, .9);
      box(rifle, kit.hullDark, 0, -.04, -.1, .07, .16, .1);
      const flare = new T.Mesh(new T.CylinderGeometry(.03, .03, .22, 6), kit.ember);
      flare.rotation.z = Math.PI / 2;
      place(flare, -.8, 1.6, .04);
      break;
    }
    case 'ruin': {
      const wall = (lx: number, lz: number, length: number, high: number, alongX: boolean) => {
        const segments = Math.round(length / .9);
        for (let k = 0; k < segments; k++) {
          const h = high * (.35 + random() * .65);
          const offset = -length / 2 + (k + .5) * (length / segments);
          const part = new T.Mesh(cube, kit.concrete);
          part.scale.set(alongX ? length / segments + .02 : .5, h, alongX ? .5 : length / segments + .02);
          part.castShadow = part.receiveShadow = true;
          place(part, lx + (alongX ? offset : 0), lz + (alongX ? 0 : offset), h / 2 - .2);
        }
      };
      wall(-3.2, 0, 6, 2.6, false);
      wall(0, -3.2, 6, 2.1, true);
      wall(2.8, 2.6, 2.2, 1.3, false);
      const slab = new T.Mesh(cube, kit.concrete);
      slab.scale.set(5.6, .12, 5.6);
      slab.receiveShadow = true;
      place(slab, 0, 0, .02);
      const beam = group(.4, -.6, .5, .8);
      box(beam, kit.steel, 0, 0, 0, .18, .18, 4.2, .25, 0, .15);
      debris(14, 4.5, kit.concrete);
      scorch(.6, .8, 2.2);
      break;
    }
    case 'albatross-wreck': {
      scorch(0, 0, 7.5);
      const hull = group(0, 0, .08, .5);
      hull.rotation.z = .22;
      box(hull, kit.hull, 0, .9, 0, 3.6, 1.9, 9.6);
      box(hull, kit.hullDark, 0, 1.95, 0, 2.6, .3, 8.8);
      box(hull, kit.scorched, -.9, 1.2, 1.5, 2.1, 1.4, 3.2, 0, 0, -.3);
      // Bug mit zersplittertem Cockpit.
      box(hull, kit.hull, 0, .75, 5.4, 2.8, 1.4, 1.6, -.25);
      box(hull, kit.visor, 0, 1.25, 5.75, 2.2, .45, .9, -.5);
      for (let i = 0; i < 6; i++) box(hull, kit.hazard, 1.81, .4, -3.5 + i * .5, .02, .12, .28);
      // Abgerissener Flügel und Heckflosse.
      const wing = group(3.9, .8, -.3, .35);
      wing.rotation.z = -.35;
      box(wing, kit.hull, 0, 0, 0, 3.2, .22, 1.8);
      box(wing, kit.scorched, 1.4, .05, 0, .6, .26, 1.7);
      const tail = group(-.6, -7.2, .4, 0);
      tail.rotation.x = -.35;
      box(tail, kit.hull, 0, 1.3, 0, .35, 2.8, 2.4);
      box(tail, kit.hazard, .19, 2.1, 0, .02, .5, 1.2);
      // Glutnester und Trümmer.
      for (const [x, z] of [[-1.2, 2.8], [1.4, -2.4], [3.2, 2.4]]) {
        const ember = new T.Mesh(new T.IcosahedronGeometry(.35, 0), kit.ember);
        place(ember, x, z, .15);
      }
      debris(18, 8, kit.hull);
      debris(8, 6, kit.scorched);
      break;
    }
    case 'convict-remains': {
      for (const [x, z, yaw] of [[-.9, .4, .3], [1, .5, -.2]] as const) group(x, z, yaw).add(corpse(kit, kit.convict, true));
      const third = group(.1, 2.6, 1.9);
      third.add(corpse(kit, kit.convict, false));
      place(crate(kit, kit.hull, .55), 2.4, 1.4).rotation.y = .4;
      break;
    }
    case 'trench': {
      sandbags(root, kit, 4, 3, place, -2.6, -1.9, true);
      sandbags(root, kit, 4, 3, place, 2.6, 1.9, true);
      const floor = new T.Mesh(cube, kit.scorched);
      floor.scale.set(9, .04, 2.6);
      floor.receiveShadow = true;
      place(floor, 0, 0, .01);
      for (let k = -3; k <= 3; k++) {
        const plank = new T.Mesh(cube, kit.wood);
        plank.scale.set(1.1, .05, .22);
        plank.receiveShadow = true;
        place(plank, k * 1.2, 0, .05).rotation.y = (random() - .5) * .3;
      }
      group(-.5, -.9, 1.3).add(corpse(kit, kit.fabric, false));
      place(crate(kit, kit.hull, .5), 3.6, -.3);
      break;
    }
    case 'drop-pod': {
      scorch(0, 0, 4.5);
      const pod = group(0, 0, .6, 1.1);
      pod.rotation.x = .35;
      const shell = new T.Mesh(new T.CylinderGeometry(.85, 1.1, 2.8, 10), kit.hull);
      shell.castShadow = shell.receiveShadow = true;
      pod.add(shell);
      const cap = new T.Mesh(new T.ConeGeometry(.85, .9, 10), kit.scorched);
      cap.position.y = 1.85;
      pod.add(cap);
      box(pod, kit.lamp, 0, .9, .86, .3, .1, .05);
      box(pod, kit.hazard, 0, -.6, .9, .9, .14, .05);
      const hatch = group(1.7, .9, -.6, .08);
      box(hatch, kit.hull, 0, 0, 0, 1.1, .08, 1.5);
      debris(10, 3, kit.scorched);
      break;
    }
    case 'field-camp': {
      for (const [x, z] of [[-2.7, 0], [2.7, .9]]) {
        // Dreiseitiges Prisma entlang x mit First nach oben.
        const tent = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 3.4, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), kit.canvas);
        tent.castShadow = tent.receiveShadow = true;
        place(tent, x, z, .72);
      }
      place(crate(kit, kit.hull, .7), 0, -2.8);
      place(crate(kit, kit.hazard, .45), .7, -2.4).rotation.y = .5;
      const fire = new T.Mesh(new T.CylinderGeometry(.55, .6, .06, 10), kit.scorched);
      place(fire, .2, 1.8, .03);
      place(new T.Mesh(new T.IcosahedronGeometry(.18, 0), kit.ember), .2, 1.8, .1);
      const mast = new T.Mesh(new T.CylinderGeometry(.04, .06, 3.2, 6), kit.steel);
      place(mast, -.8, -3.6, 1.6);
      break;
    }
    case 'burnt-nest': {
      scorch(0, 0, 6.5);
      for (let k = 0; k < 7; k++) {
        const mound = new T.Mesh(new T.SphereGeometry(1, 10, 7), k % 3 ? kit.chitin : kit.scorched);
        const s = 1 + random() * 1.1;
        mound.scale.set(s, s * (.45 + random() * .3), s * (.8 + random() * .4));
        mound.castShadow = mound.receiveShadow = true;
        const angle = k / 7 * 6.28, r = k ? 1.6 + random() * .6 : 0;
        place(mound, Math.cos(angle) * r, Math.sin(angle) * r, 0);
      }
      for (let k = 0; k < 9; k++) {
        const vein = new T.Mesh(cube, kit.resin);
        vein.scale.set(.08, .06, 1.2 + random() * 1.6);
        const angle = random() * 6.28;
        place(vein, Math.cos(angle) * 2.8, Math.sin(angle) * 2.8, .05).rotation.y = angle + Math.PI / 2;
      }
      for (let k = 0; k < 5; k++) {
        const leg = new T.Mesh(cube, kit.chitin);
        leg.scale.set(.06, .06, .9);
        const angle = random() * 6.28;
        place(leg, Math.cos(angle) * 4.6, Math.sin(angle) * 4.6, .12).rotation.set(.4, angle, .3);
      }
      break;
    }
    case 'survey-rig': {
      const rig = group(0, 0);
      for (let k = 0; k < 3; k++) {
        const angle = k / 3 * 6.28;
        const leg = new T.Mesh(new T.CylinderGeometry(.06, .08, 5.4, 6), kit.steel);
        leg.position.set(Math.cos(angle) * .8, 2.5, Math.sin(angle) * .8);
        leg.rotation.set(Math.sin(angle) * -.16, 0, Math.cos(angle) * .16);
        leg.castShadow = true;
        rig.add(leg);
      }
      box(rig, kit.hazard, 0, 4.9, 0, .7, .4, .7);
      const pipe = new T.Mesh(new T.CylinderGeometry(.09, .09, 5, 8), kit.hullDark);
      pipe.position.y = 2.3;
      rig.add(pipe);
      box(rig, kit.lamp, 0, 5.2, 0, .14, .1, .14);
      const tank = group(2.6, 0, 0, .7);
      const body = new T.Mesh(new T.CylinderGeometry(.65, .65, 2.6, 12), kit.hull);
      body.rotation.x = Math.PI / 2;
      body.castShadow = true;
      tank.add(body);
      for (let k = 0; k < 6; k++) {
        const core = new T.Mesh(new T.CylinderGeometry(.08, .08, .9, 8), kit.concrete);
        place(core, -1.4 + k * .3, -1.8, .08).rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'gun-emplacement': {
      sandbags(root, kit, 4, 4, place, 0, -2.5, true);
      sandbags(root, kit, 3.2, 4, place, -2.5, 0, false);
      sandbags(root, kit, 3.2, 4, place, 2.5, 0, false);
      const mount = group(0, 0, .5);
      box(mount, kit.hullDark, 0, .35, 0, 1.2, .7, 1.2);
      const barrel = new T.Mesh(new T.CylinderGeometry(.12, .16, 3.2, 10), kit.steel);
      barrel.rotation.x = Math.PI / 2 - .35;
      barrel.position.set(0, .95, 1.3);
      barrel.castShadow = true;
      mount.add(barrel);
      box(mount, kit.scorched, 0, .9, -.2, .9, .5, .9);
      for (let k = 0; k < 6; k++) {
        const shell = new T.Mesh(new T.CylinderGeometry(.05, .05, .32, 6), kit.hazard);
        place(shell, -1 + random() * 2, -1.2 + random() * 1.4, .05).rotation.set(Math.PI / 2, random() * 6, 0);
      }
      break;
    }
    case 'relay-debris': {
      const mast = group(0, 0, 0, .35);
      mast.rotation.z = Math.PI / 2 - .1;
      for (const side of [-1, 1]) box(mast, kit.steel, side * .3, 0, 0, .1, .1, 8);
      for (let z = -3.8; z <= 3.8; z += 1.1) box(mast, kit.steel, 0, 0, z, .7, .08, .08);
      const cabinet = group(1.6, 2.2, .3);
      box(cabinet, kit.hull, 0, .8, 0, 1.1, 1.6, .7);
      box(cabinet, kit.lamp, .2, 1.4, .36, .2, .08, .02);
      const dish = new T.Mesh(new T.SphereGeometry(1.4, 16, 6, 0, Math.PI * 2, 0, Math.PI * .27),
        new T.MeshStandardMaterial({ color: 0x929386, side: T.DoubleSide, roughness: .75, metalness: .37 }));
      dish.rotation.x = 2.6;
      dish.castShadow = true;
      place(dish, -2, 2.4, .5);
      debris(8, 4, kit.steel);
      break;
    }
    case 'monolith': {
      const stone = new T.Mesh(new T.CylinderGeometry(.55, 1.05, 7.2, 5), kit.obsidian);
      stone.castShadow = stone.receiveShadow = true;
      place(stone, 0, 0, 3.4).rotation.set(.04, .3, -.03);
      for (let k = 0; k < 5; k++) {
        const line = new T.Mesh(cube, kit.rune);
        line.scale.set(.06, .9 + random() * 1.6, .06);
        const angle = k / 5 * 6.28 + .3;
        place(line, Math.cos(angle) * .78, Math.sin(angle) * .78, 1.5 + random() * 3);
      }
      for (let k = 0; k < 9; k++) {
        const shard = new T.Mesh(new T.OctahedronGeometry(.25 + random() * .35, 0), k % 3 ? kit.obsidian : kit.rune);
        shard.scale.y = 2 + random() * 2;
        shard.castShadow = true;
        const angle = k / 9 * 6.28, r = 2.6 + random() * 2.4;
        place(shard, Math.cos(angle) * r, Math.sin(angle) * r, .4).rotation.set((random() - .5) * .8, random() * 6, (random() - .5) * .8);
      }
      scorch(0, 0, 5);
      break;
    }
  }
  return root;
}

/** Vorlage je Gegenstand, rund 0,3–0,6 m groß, mit Leuchtpunkt zur Erkennung. */
function pickupTemplate(kind: PickupKind, kit: Kit): T.Group {
  const root = new T.Group();
  const add = (mesh: T.Mesh) => { mesh.castShadow = true; root.add(mesh); return mesh; };
  switch (kind) {
    case 'tissue': {
      const holder = add(new T.Mesh(new T.CylinderGeometry(.12, .14, .08, 10), kit.hullDark));
      holder.position.y = .04;
      const vial = add(new T.Mesh(new T.CylinderGeometry(.07, .07, .34, 12),
        new T.MeshStandardMaterial({ color: 0xd8f0ff, transparent: true, opacity: .38, roughness: .05, metalness: .1 })));
      vial.position.y = .26;
      const core = add(new T.Mesh(new T.CylinderGeometry(.05, .05, .24, 10), glow(0xe0384f, 1.8)));
      core.position.y = .24;
      const cap = add(new T.Mesh(new T.CylinderGeometry(.08, .08, .05, 10), kit.steel));
      cap.position.y = .45;
      root.rotation.z = .25;
      break;
    }
    case 'rock': {
      const tray = add(new T.Mesh(cube, kit.hullDark));
      tray.scale.set(.42, .05, .2);
      tray.position.y = .025;
      for (let k = 0; k < 3; k++) {
        const core = add(new T.Mesh(new T.CylinderGeometry(.055, .055, .36, 10), standard([0x8a7a66, 0x6e6458, 0x9c8a70][k], .9, .05)));
        core.rotation.z = Math.PI / 2;
        core.position.set(0, .1, -.06 + k * .06);
      }
      const band = add(new T.Mesh(cube, glow(0x9fd0ff, 1.1)));
      band.scale.set(.03, .02, .2);
      band.position.set(.16, .06, 0);
      break;
    }
    case 'artifact': {
      const shard = add(new T.Mesh(new T.OctahedronGeometry(.22, 0), glow(0xb48cff, 2.6, { roughness: .2, metalness: .3 })));
      shard.scale.y = 1.6;
      shard.position.y = .75;
      shard.name = 'float';
      const ring = add(new T.Mesh(new T.TorusGeometry(.34, .02, 6, 24), glow(0x7d5cff, 1.8)));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .08;
      break;
    }
    case 'mark': {
      const medal = add(new T.Mesh(new T.CylinderGeometry(.13, .13, .03, 18), standard(0xd8b458, .3, .85)));
      medal.rotation.x = Math.PI / 2 - .3;
      medal.position.y = .16;
      const star = add(new T.Mesh(new T.CylinderGeometry(.06, .06, .035, 5), standard(0xfff0b8, .25, .9)));
      star.rotation.x = Math.PI / 2 - .3;
      star.position.set(0, .16, .01);
      const ribbon = add(new T.Mesh(cube, standard(0x3a5f9a, .9, 0)));
      ribbon.scale.set(.1, .14, .02);
      ribbon.position.set(0, .32, -.03);
      const beam = new T.Mesh(new T.CylinderGeometry(.04, .09, 3.2, 8, 1, true),
        new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: .28, depthWrite: false, toneMapped: false }));
      beam.position.y = 1.7;
      beam.name = 'beam';
      root.add(beam);
      break;
    }
    case 'ammo': {
      add(new T.Mesh(cube, standard(0x4a5236, .85, .15))).scale.set(.42, .22, .26);
      root.children[0].position.y = .11;
      const stripe = add(new T.Mesh(cube, kit.hazard));
      stripe.scale.set(.43, .05, .27);
      stripe.position.y = .16;
      const label = add(new T.Mesh(cube, glow(0xe0c45a, .6)));
      label.scale.set(.12, .06, .005);
      label.position.set(0, .11, .133);
      break;
    }
    case 'stims': {
      add(new T.Mesh(cube, standard(0xd8d6cf, .6, .1))).scale.set(.36, .18, .24);
      root.children[0].position.y = .09;
      const bar = add(new T.Mesh(cube, glow(0xd8343a, .9)));
      bar.scale.set(.16, .005, .05);
      bar.position.y = .183;
      const cross = add(new T.Mesh(cube, glow(0xd8343a, .9)));
      cross.scale.set(.05, .005, .16);
      cross.position.y = .183;
      break;
    }
    case 'grenades': {
      add(new T.Mesh(cube, standard(0x2f3a2b, .85, .2))).scale.set(.46, .24, .3);
      root.children[0].position.y = .12;
      const band = add(new T.Mesh(cube, glow(0xe07a2a, .7)));
      band.scale.set(.47, .05, .31);
      band.position.y = .18;
      for (const x of [-.1, .1]) {
        const g = add(new T.Mesh(new T.SphereGeometry(.06, 8, 6), standard(0x3f4a34, .7, .3)));
        g.position.set(x, .28, 0);
      }
      break;
    }
  }
  // Leichter Leuchtpunkt am Boden, damit Funde aus der Nähe auffallen.
  const halo = new T.Mesh(new T.CircleGeometry(.4, 16).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({
    color: kind === 'tissue' ? 0xe0384f : kind === 'rock' ? 0x9fd0ff : kind === 'artifact' ? 0xb48cff : kind === 'mark' ? 0xffe08a : 0xd9e7c0,
    transparent: true, opacity: .22, depthWrite: false, toneMapped: false }));
  halo.position.y = .02;
  halo.name = 'halo';
  root.add(halo);
  return root;
}

export class PointsOfInterestView {
  readonly root = new T.Group();
  private readonly world: WorldDefinition;
  private readonly kit = new Kit();
  private readonly templates = new Map<PickupKind, T.Group>();
  private readonly items = new Map<string, T.Group>();
  private readonly pickupRoot = new T.Group();
  private last?: readonly PickupSnapshot[];

  constructor(world: WorldDefinition) {
    this.world = world;
    this.root.name = 'Points of Interest';
    for (const poi of world.pointsOfInterest ?? []) this.root.add(buildPoi(poi, world, this.kit));
    // Vorlagen hängen unsichtbar im Baum, damit die Entsorgung der Mission sie mit erfasst.
    const library = new T.Group();
    library.visible = false;
    for (const kind of ['tissue', 'rock', 'artifact', 'mark', 'ammo', 'stims', 'grenades'] as const) {
      const template = pickupTemplate(kind, this.kit);
      this.templates.set(kind, template);
      library.add(template);
    }
    this.root.add(library, this.pickupRoot);
  }

  /** Gleicht die Gegenstände mit dem Snapshot ab und animiert Artefakte und Markenstrahlen. */
  update(pickups: readonly PickupSnapshot[] | undefined, now: number, reducedMotion = false): void {
    this.pickupRoot.visible = !!pickups;
    if (pickups && pickups !== this.last) {
      this.last = pickups;
      const seen = new Set<string>();
      for (const pickup of pickups) {
        seen.add(pickup.id);
        if (this.items.has(pickup.id)) continue;
        const item = this.templates.get(pickup.kind)!.clone();
        item.position.set(pickup.x, groundHeight(this.world, pickup.x, pickup.z), pickup.z);
        item.rotation.y = (pickup.x * 13.7 + pickup.z * 7.1) % 6.28;
        item.userData.kind = pickup.kind;
        this.pickupRoot.add(item);
        this.items.set(pickup.id, item);
      }
      for (const [id, item] of this.items) if (!seen.has(id)) { item.removeFromParent(); this.items.delete(id); }
    }
    if (reducedMotion) return;
    const t = now / 1000;
    for (const item of this.items.values()) {
      const kind = item.userData.kind as PickupKind;
      if (kind === 'artifact') {
        const shard = item.getObjectByName('float');
        if (shard) { shard.position.y = .75 + Math.sin(t * 1.6 + item.position.x) * .08; shard.rotation.y = t * .9; }
      } else if (kind === 'mark') {
        const beam = item.getObjectByName('beam') as T.Mesh | undefined;
        if (beam) (beam.material as T.MeshBasicMaterial).opacity = .2 + Math.sin(t * 2.4) * .08;
      }
    }
  }
}

import { ModelParts } from '../ModelParts.ts';
import * as T from 'three';

export function createKestrel() {
  const finish = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.59, metalness: 0.32 });
  const receiver = 0x3c4546;
  const phosphate = 0x252a2d;
  const polymer = 0x49483e;
  const rubber = 0x252825;
  const steel = 0x636968;
  const m = new ModelParts();
  // Local origin at the strong-hand grip, front along -Z, all measurements in meters.
  m.box(polymer, 0, -.024, .018, .057, .113, .071, .009, -.22); // grip
  for (let i = 0; i < 3; i++) m.box(rubber, 0, -.035 - i * .013, .048 - i * .004, .057, .004, .009);
  m.box(receiver, 0, .078, -.111, .085, .101, .287, .009);
  m.box(phosphate, 0, .045, -.126, .076, .054, .247, .007);
  m.box(steel, .043, .095, -.102, .008, .035, .079, .002);
  m.box(phosphate, .048, .057, -.029, .007, .019, .042, .002);
  m.box(steel, .049, .063, -.176, .007, .018, .018, .002);
  m.box(phosphate, 0, .007, -.071, .046, .013, .096, .003); // trigger guard
  m.box(phosphate, 0, .026, -.111, .039, .043, .012, .002);
  m.box(steel, 0, .031, -.064, .011, .041, .009, .001, .19);
  m.box(polymer, 0, .081, -.334, .078, .081, .205, .01);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) m.box(phosphate, side * .039, .088, -.263 - i * .041, .004, .013, .026, .001);
    for (const z of [.014, -.174, -.219]) m.tube(steel, side * .043, .073, z, .004, .004, .006);
  }
  m.box(phosphate, 0, .131, -.217, .049, .014, .448, .003);
  for (let i = 0; i < 13; i++) m.box(steel, 0, .139, -.016 - i * .034, .049, .004, .012);
  m.tube(steel, 0, .101, -.498, .015, .015, .13, Math.PI / 2);
  m.tube(phosphate, 0, .101, -.567, .022, .020, .055, Math.PI / 2);
  m.tube(0x111618, 0, .101, -.595, .011, .011, .002, Math.PI / 2);
  // Two-piece stock and dark recoil pad.
  m.box(steel, 0, .082, .104, .042, .041, .176, .006);
  m.box(polymer, 0, .072, .198, .063, .066, .154, .008);
  m.box(polymer, 0, .028, .214, .038, .024, .116, .004, -.36);
  m.box(rubber, 0, .038, .272, .058, .12, .021, .007, -.07);
  // Worn bevels on the receiver and recessed stock pad read at shoulder-camera distance.
  m.box(0x778078, 0, .128, -.12, .064, .004, .245, .001);
  for (const z of [.15, .19, .23]) m.box(rubber, 0, .098, z, .06, .028, .016, .003);
  const optic = new ModelParts();
  optic.box(phosphate, 0, .009, 0, .052, .018, .087, .003);
  optic.box(phosphate, 0, .041, -.016, .052, .052, .025, .008);
  optic.box(0x364d49, 0, .045, -.003, .031, .027, .003, .001);
  optic.box(steel, .027, .035, -.021, .009, .019, .025, .002);
  const magazine = new ModelParts();
  magazine.box(polymer, 0, -.066, .009, .063, .126, .097, .006, -.18);
  magazine.box(polymer, 0, -.14, .028, .063, .043, .098, .007, -.26);
  magazine.box(phosphate, 0, -.162, .034, .07, .013, .102, .003, -.26);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      magazine.box(phosphate, side * .031, -.077, -.015 + i * .023, .004, .093, .005, .001, -.18);
    }
  }
  const bodyMesh = m.mesh(finish);
  const opticMesh = optic.mesh(finish);
  const magazineMesh = magazine.mesh(finish);
  const sidearm = new ModelParts();
  sidearm.box(0x434941, 0, -.018, .016, .044, .112, .06, .008, -.19);
  sidearm.box(phosphate, 0, .041, -.051, .043, .037, .185, .006);
  sidearm.box(0x66706d, 0, .066, -.056, .038, .036, .194, .005);
  sidearm.box(rubber, 0, -.012, -.034, .017, .012, .056, .003);
  sidearm.box(phosphate, 0, .004, -.06, .018, .036, .012, .002);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) sidearm.box(phosphate, side * .019, .064, .013 - i * .008, .003, .026, .003);
  }
  const sight = new ModelParts();
  sight.box(steel, 0, .004, -.135, .007, .008, .011);
  sight.box(phosphate, 0, .005, .028, .031, .009, .009);
  const base = new ModelParts();
  base.box(rubber, 0, -.06, .014, .05, .015, .066, .003);
  const pistol = { body: sidearm.mesh(finish).geometry, optic: sight.mesh(finish).geometry,
    magazine: base.mesh(finish).geometry, finish };
  return { pistol, finish, body: bodyMesh.geometry, optic: opticMesh.geometry, magazine: magazineMesh.geometry };
}

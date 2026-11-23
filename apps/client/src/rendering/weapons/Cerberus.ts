import { ModelParts } from '../ModelParts.ts';
import * as T from 'three';

/**
 * VX-13 Cerberus, procedural: pump-action 13-gauge with a long barrel over the tube magazine. Same part contract as
 * the P-01 (`body`, `optic`, `magazine`, `slide`): `slide` is the pump forend, `magazine` the shell in the
 * support hand during a single-round reload. Local origin at the grip, front along -Z, meters.
 */
export function createCerberus(finish: T.MeshStandardMaterial) {
  const receiver = 0x2f3537;
  const phosphate = 0x22272a;
  const polymer = 0x3e3d35;
  const rubber = 0x232622;
  const steel = 0x5c6262;
  const hull = 0x8e2c22;
  const brass = 0xa8843f;
  const m = new ModelParts();
  m.box(polymer, 0, -.024, .018, .055, .115, .07, .009, -.22); // pistol grip
  for (let i = 0; i < 3; i++) m.box(rubber, 0, -.035 - i * .013, .048 - i * .004, .055, .004, .009);
  m.box(receiver, 0, .072, -.12, .066, .088, .26, .008);
  m.box(phosphate, 0, .121, -.12, .04, .012, .21, .002); // top rail
  m.box(0x111618, .034, .086, -.115, .002, .03, .07); // ejection port
  m.box(0x111618, 0, .027, -.165, .03, .006, .09, .001); // loading port
  m.box(phosphate, 0, .007, -.071, .046, .013, .096, .003); // trigger guard
  m.box(steel, 0, .031, -.064, .011, .041, .009, .001, .19); // trigger
  // Side saddle with four spare shells on the left receiver wall.
  m.box(phosphate, -.037, .068, -.12, .006, .036, .12, .002);
  for (let i = 0; i < 4; i++) {
    m.tube(hull, -.044, .068, -.08 - i * .027, .0085, .0085, .032, 0);
    m.tube(brass, -.044, .048, -.08 - i * .027, .009, .009, .008, 0);
  }
  m.tube(steel, 0, .098, -.55, .0135, .0135, .62, Math.PI / 2); // barrel
  m.tube(phosphate, 0, .052, -.47, .017, .017, .48, Math.PI / 2); // tube magazine
  m.tube(steel, 0, .052, -.716, .019, .019, .022, Math.PI / 2); // magazine cap
  m.box(phosphate, 0, .075, -.69, .03, .066, .028, .004); // barrel clamp
  m.tube(0x111618, 0, .098, -.861, .009, .009, .003, Math.PI / 2); // bore
  m.box(steel, 0, .116, -.84, .006, .012, .008); // bead sight
  // Fixed stock and recoil pad.
  m.box(polymer, 0, .07, .11, .05, .06, .2, .008);
  m.box(polymer, 0, .03, .2, .04, .05, .14, .006, -.3);
  m.box(rubber, 0, .045, .275, .056, .13, .025, .007, -.07);
  m.box(0x6d756f, 0, .118, -.12, .05, .003, .24, .001);

  const sight = new ModelParts();
  sight.box(steel, 0, .006, .02, .03, .012, .014, .002); // ghost-ring rear sight
  sight.box(0x111618, 0, .012, .02, .012, .008, .016);

  const pump = new ModelParts();
  pump.box(polymer, 0, .052, -.40, .05, .052, .17, .01);
  for (let i = 0; i < 6; i++) pump.box(rubber, 0, .03, -.335 - i * .026, .052, .008, .01);

  const shell = new ModelParts();
  shell.tube(hull, 0, 0, 0, .0095, .0095, .058, Math.PI / 2);
  shell.tube(brass, 0, 0, .031, .01, .01, .01, Math.PI / 2);

  return {
    body: m.mesh(finish).geometry, optic: sight.mesh(finish).geometry, magazine: shell.mesh(finish).geometry,
    slide: pump.mesh(finish).geometry as T.BufferGeometry | undefined, finish,
  };
}

import { CARRIER_DOORS } from '@freefall/shared';
import { stencil } from '../ShipParts.ts';
import type { CarrierContext } from './CarrierContext.ts';

/**
 * Door signs in the mess: one band for every doorway, between the tallest door header (3.8 m) and the gallery
 * underside (4.6 m), whatever the door height. The pipe runs on the mess walls duck into the wall around them.
 */
export const DOOR_SIGN = { y: 4.2, width: 2.6, /** Clear wall either side of a sign. */ margin: .35 } as const;
/** Doorways in the mess side walls, which carry a sign above them. */
export const MESS_DOORS = CARRIER_DOORS.filter((door) => door.axis === 'x' && Math.abs(Math.abs(door.x) - 12) < .01);

/**
 * A stencil sign on a dark backing plate with a lit edge underneath. `wall` is the point on the outermost face of the
 * wall dressing (pilasters, rails) the sign is mounted on; `yaw` turns the sign like `stencil` (0 faces +z), and the
 * plate stands in front of that face so nothing on the wall can cut through the sign.
 */
export function mountedSign(c: CarrierContext, title: string, subtitle: string, wall: readonly [number, number, number],
  width: number, yaw = 0, tint?: string): void {
  const { kit, p } = c;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  const height = width / 4;
  const at = (out: number): [number, number] => [wall[0] + nx * out, wall[2] + nz * out];
  const across = Math.abs(nx) > .5;
  const plate = (material: Parameters<typeof kit.box>[0], out: number, y: number, w: number, h: number, depth: number) => {
    const [x, z] = at(out);
    if (across) kit.box(material, x, y, z, depth, h, w);
    else kit.box(material, x, y, z, w, h, depth);
  };
  plate(p.frameDark, .03, wall[1], width + .12, height + .1, .06);
  plate(p.lamp(0xd8e2dc, .8), .05, wall[1] - height / 2 - .035, width - .2, .015, .02);
  const [x, z] = at(.065);
  stencil(c.root, title, subtitle, [x, wall[1], z], width, yaw, tint);
}

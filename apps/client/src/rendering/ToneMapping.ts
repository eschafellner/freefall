import * as T from 'three';

/**
 * FREEFALL grade on top of ACES Filmic: ACES alone desaturates strongly, which made the planets look washed out.
 * The saturation step runs after the curve, so highlights still roll off like ACES. Works in the direct render path and
 * through OutputPass (CustomToneMapping).
 */
export const TONE_GRADE = { saturation: 1.2 } as const;

T.ShaderChunk.tonemapping_pars_fragment = T.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }', `
vec3 CustomToneMapping( vec3 color ) {
  vec3 mapped = ACESFilmicToneMapping( color );
  float luma = dot( mapped, vec3( .2126, .7152, .0722 ) );
  return clamp( mix( vec3( luma ), mapped, ${TONE_GRADE.saturation.toFixed(3)} ), 0., 1. );
}`);

export const TONE_MAPPING = T.CustomToneMapping;

/** Natural palette boost for surfaces, plants and props (HSL saturation factor). */
export const VIVID = 1.2;

const hsl = { h: 0, s: 0, l: 0 };
export function vivid(color: T.Color, amount = VIVID): T.Color {
  color.getHSL(hsl);
  return color.setHSL(hsl.h, Math.min(1, hsl.s * amount), hsl.l);
}
export const vividHex = (hex: number, amount = VIVID) => vivid(new T.Color(hex), amount).getHex();

/** Saturates a geometry's vertex colours in place. */
export function vividColors(geometry: T.BufferGeometry, amount = VIVID): void {
  const colors = geometry.getAttribute('color');
  if (!colors) return;
  const color = new T.Color();
  for (let i = 0; i < colors.count; i++) {
    vivid(color.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i)), amount);
    colors.setXYZ(i, color.r, color.g, color.b);
  }
  colors.needsUpdate = true;
}

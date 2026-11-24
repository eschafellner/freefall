import type * as T from 'three';
import { ORGANIC_GLSL } from '../SchabeModel.ts';

/** Surface families of the procedural wear layer. */
export type WearKind = 'metal' | 'paint' | 'concrete' | 'fabric' | 'wood' | 'organic' | 'stone';

/** [grime, scratches, pores, weave, grain, relief] per family. */
const WEAR: Readonly<Record<WearKind, readonly [number, number, number, number, number, number]>> = {
  metal: [.35, .8, 0, 0, 0, .35],
  paint: [.4, .55, .1, 0, 0, .3],
  concrete: [.45, 0, .8, 0, 0, .9],
  fabric: [.35, 0, .1, 1, 0, .45],
  wood: [.3, 0, .2, 0, 1, .7],
  organic: [.25, 0, .5, 0, 0, 1],
  stone: [.35, 0, .6, 0, 0, 1.1],
};

/**
 * Procedural wear for plain-coloured props without UVs or textures: world-space grime and stains, scratched edges on
 * metal and paint, pores on concrete and stone, weave on fabric, grain on wood, plus a matching bump. Everything is
 * computed from 3D noise in world space, so instanced and scaled parts never show stretched or repeating tiles.
 */
export function applySurfaceWear<M extends T.MeshStandardMaterial>(material: M, kind: WearKind, scale = 1): M {
  const [grime, scratches, pores, weave, grain, relief] = WEAR[kind];
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + '|wear-' + kind + '-v1';
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      varying vec3 vWearWorld;
      varying vec3 vWearNormal;
    `).replace('#include <project_vertex>', `
      #include <project_vertex>
      {
        mat4 wearModel = modelMatrix;
        #ifdef USE_INSTANCING
          wearModel = modelMatrix * instanceMatrix;
        #endif
        vWearWorld = (wearModel * vec4(transformed, 1.0)).xyz;
        vWearNormal = normalize(mat3(wearModel) * objectNormal);
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec3 vWearWorld;
      varying vec3 vWearNormal;
      ${ORGANIC_GLSL}
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 wearP = vWearWorld * ${scale.toFixed(3)};
      vec3 wearN = normalize(vWearNormal);
      float wearStain = schabeNoise(wearP * .7) * .6 + schabeNoise(wearP * 2.3) * .4;
      // Grime collects low and on faces turned away from the sky; rain streaks run down vertical faces.
      float wearStreak = schabeNoise(vec3(wearP.x * 6.0, wearP.y * .35, wearP.z * 6.0)) * (1.0 - abs(wearN.y));
      float wearGrime = ${grime.toFixed(3)} * clamp(smoothstep(.45, .8, wearStain) + max(0.0, -wearN.y) * .5 + wearStreak * .35, 0.0, 1.0);
      diffuseColor.rgb *= 1.0 - wearGrime * .55;
      float wearScratch = ${scratches.toFixed(3)} * smoothstep(.9, .97, schabeNoise(wearP * vec3(40.0, 3.0, 40.0)))
        * smoothstep(.35, .7, schabeNoise(wearP * 1.7 + 4.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .6, .56), wearScratch * .55);
      float wearPore = ${pores.toFixed(3)} * smoothstep(.72, .9, schabeNoise(wearP * 23.0));
      diffuseColor.rgb *= 1.0 - wearPore * .35;
      vec3 wearAxis = abs(wearN.x) > .7 ? wearP.zyx : abs(wearN.z) > .7 ? wearP : wearP.xzy;
      float wearWeave = ${weave.toFixed(3)} * (.5 + .5 * sin(wearAxis.x * 140.0) * sin(wearAxis.y * 140.0));
      diffuseColor.rgb *= 1.0 - wearWeave * .14;
      float wearGrain = ${grain.toFixed(3)} * (.5 + .5 * sin(wearAxis.x * 6.0 + schabeNoise(wearAxis * vec3(2.0, 18.0, 2.0)) * 6.0));
      diffuseColor.rgb *= 1.0 - wearGrain * .22;
      diffuseColor.rgb *= .92 + .16 * schabeNoise(wearP * 9.0);
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + wearGrime * .25 - wearScratch * .3, .05, 1.0);
    `).replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      {
        float wearHeight = (schabeNoise(wearP * 17.0) * .6 + schabeNoise(wearP * 41.0) * .4) * ${relief.toFixed(3)}
          + wearPore * -.6 + wearWeave * .25 + wearGrain * .5 - wearScratch * .4;
        float wearNear = 1.0 - smoothstep(14.0, 40.0, length(vViewPosition));
        if (wearNear > 0.0) normal = schabeBump(-vViewPosition, normal, vec2(dFdx(wearHeight), dFdy(wearHeight)) * .55 * wearNear, faceDirection);
      }
    `);
  };
  material.needsUpdate = true;
  return material;
}

import { ORGANIC_GLSL } from './SchabeModel.ts';

/**
 * Matte, worn chitin for the warrior castes (concept: hardened, layered armor, non-reflective): mottled pigment,
 * pitted and scored plates, sinew that lets light through, and ember veins that beat with `vWarriorPulse` (set by the
 * animation shader, 0 for fallen bodies). Reads the `tissue` attribute (breath, sway, membrane, veins) and `vSurface`.
 */
export function applyWarriorSurface(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `
    #include <common>
    attribute vec4 tissue;
    varying vec3 vWarriorLocal;
    varying vec4 vWarriorTissue;
    varying float vWarriorPulse;
  `).replace('#include <begin_vertex>', `
    vWarriorLocal = position;
    vWarriorTissue = tissue;
    vWarriorPulse = 0.0;
    #include <begin_vertex>
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
    #include <common>
    varying vec3 vWarriorLocal;
    varying vec4 vWarriorTissue;
    varying float vWarriorPulse;
    ${ORGANIC_GLSL}
  `).replace('#include <color_fragment>', `
    #include <color_fragment>
    vec3 warriorP = vWarriorLocal;
    float warriorSoft = vWarriorTissue.z;
    float warriorHard = 1.0 - warriorSoft;
    float warriorMottle = schabeNoise(warriorP * 7.0) * .55 + schabeNoise(warriorP * 19.0) * .45;
    // Pits and scored growth lines on the plates.
    float warriorPits = smoothstep(.8, .92, schabeNoise(warriorP * 24.0)) * warriorHard;
    float warriorGrain = smoothstep(.55, .95, abs(sin(dot(warriorP, vec3(9.0, 23.0, 31.0)) + schabeNoise(warriorP * 5.0) * 3.0)))
      * warriorHard;
    float warriorVeins = vWarriorTissue.w * smoothstep(.86, .97,
      1.0 - abs(schabeNoise(warriorP * 11.0 + vec3(0.0, 0.0, warriorP.x * 3.0)) * 2.0 - 1.0));
    diffuseColor.rgb *= mix(.78 + .4 * warriorMottle, .88 + .24 * warriorMottle, warriorSoft);
    diffuseColor.rgb *= 1.0 - .22 * warriorPits - .18 * warriorGrain;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.07, .02, .015), warriorVeins * .5);
  `).replace('#include <normal_fragment_maps>', `
    #include <normal_fragment_maps>
    {
      float relief = schabeNoise(warriorP * 46.0) * warriorHard * .55 - warriorPits * .7 - warriorGrain * .25
        + schabeNoise(warriorP * vec3(12.0, 26.0, 60.0)) * warriorSoft * 1.3 + warriorVeins * .6;
      float warriorNear = 1.0 - smoothstep(10.0, 30.0, length(vViewPosition));
      if (warriorNear > 0.0) normal = schabeBump(-vViewPosition, normal, vec2(dFdx(relief), dFdy(relief)) * warriorNear, faceDirection);
    }
  `).replace('#include <opaque_fragment>', `
    {
      float warriorLight = clamp(dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(.333))
        / max(.03, dot(diffuseColor.rgb, vec3(.333))), 0.0, 2.0);
      float warriorRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
      // Faint dusty sheen on the plate edges, warm light through sinew, beating ember veins.
      outgoingLight += vec3(.16, .13, .11) * warriorRim * warriorHard * .12 * warriorLight;
      outgoingLight += vec3(.6, .16, .1) * warriorSoft * (.3 * warriorRim + .05) * warriorLight * diffuseColor.rgb * 2.0;
      outgoingLight += vec3(1.0, .3, .07) * warriorVeins * (.04 + .22 * vWarriorPulse);
    }
    #include <opaque_fragment>
  `);
}

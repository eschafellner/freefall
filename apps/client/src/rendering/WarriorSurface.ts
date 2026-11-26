import { ORGANIC_GLSL } from './SchabeModel.ts';

export interface WarriorSurfaceOptions {
  /**
   * Cells per metre of a raised scale pattern (Worley cells: domed scales with dark seams) on hard plates, replacing the
   * scored growth lines. 0 keeps the plain finish.
   */
  readonly scales?: number;
}

/**
 * Matte, worn chitin for the warrior castes (concept: hardened, layered armor, non-reflective): mottled pigment,
 * pitted and scored plates, sinew that lets light through, and ember veins that beat with `vWarriorPulse` (set by the
 * animation shader, 0 for fallen bodies). Reads the `tissue` attribute (breath, sway, membrane, veins) and `vSurface`.
 */
export function applyWarriorSurface(shader: { vertexShader: string; fragmentShader: string }, options: WarriorSurfaceOptions = {}): void {
  const scales = options.scales ?? 0;
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
    ${scales ? `
    // Worley cells: distance to the nearest and second nearest feature point, and a random value per cell.
    vec3 warriorCells(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      float f1 = 8.0, f2 = 8.0, id = 0.0;
      for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 o = vec3(schabeHash(i + g), schabeHash(i + g + 17.3), schabeHash(i + g + 41.7)) * .8 + .1;
        vec3 r = g + o - f;
        float d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; id = schabeHash(i + g + 7.1); } else if (d < f2) { f2 = d; }
      }
      return vec3(sqrt(f1), sqrt(f2), id);
    }` : ''}
  `).replace('#include <color_fragment>', `
    #include <color_fragment>
    vec3 warriorP = vWarriorLocal;
    float warriorSoft = vWarriorTissue.z;
    // tissue.y: polish (smooth bone of horns and claws).
    float warriorHard = (1.0 - warriorSoft) * (1.0 - vWarriorTissue.y);
    float warriorMottle = schabeNoise(warriorP * 7.0) * .55 + schabeNoise(warriorP * 19.0) * .45;
    // Pits and scored growth lines on the plates.
    float warriorPits = smoothstep(.8, .92, schabeNoise(warriorP * 24.0)) * warriorHard;
    float warriorGrain = smoothstep(.55, .95, abs(sin(dot(warriorP, vec3(9.0, 23.0, 31.0)) + schabeNoise(warriorP * 5.0) * 3.0)))
      * warriorHard;
    float warriorVeins = vWarriorTissue.w * smoothstep(.86, .97,
      1.0 - abs(schabeNoise(warriorP * 11.0 + vec3(0.0, 0.0, warriorP.x * 3.0)) * 2.0 - 1.0));
    diffuseColor.rgb *= mix(.78 + .4 * warriorMottle, .88 + .24 * warriorMottle, warriorSoft);
    ${scales ? `
    // Raised scales with sooty seams, each a little lighter or darker; they replace the scored grain.
    // Fades out before the seams get thinner than a pixel (no speckle at distance or at grazing angles); the cell search
    // is skipped where nothing of it would show.
    float warriorCellPixel = length(fwidth(warriorP)) * ${scales.toFixed(2)};
    float warriorCellFade = (1.0 - smoothstep(.07, .22, warriorCellPixel)) * warriorHard;
    vec3 warriorCell = vec3(1.0, 2.0, .5);
    if (warriorCellFade > 0.0) warriorCell = warriorCells(warriorP * ${scales.toFixed(2)});
    float warriorSeam = (1.0 - smoothstep(.07 - warriorCellPixel, .07 + warriorCellPixel, warriorCell.y - warriorCell.x)) * warriorCellFade;
    float warriorDome = (1.0 - smoothstep(.0, .75, warriorCell.x)) * warriorCellFade;
    warriorGrain = 0.0;
    // Pits only where they are larger than a couple of pixels (no black speckle at distance).
    warriorPits *= 1.0 - smoothstep(.4, .9, length(fwidth(warriorP)) * 24.0);
    diffuseColor.rgb *= (1.0 - .32 * warriorSeam) * (1.0 + (.16 * warriorCell.z - .08 + .16 * warriorDome) * warriorCellFade);` : ''}
    diffuseColor.rgb *= 1.0 - .22 * warriorPits - .18 * warriorGrain;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.07, .02, .015), warriorVeins * .5);
  `).replace('#include <normal_fragment_maps>', `
    #include <normal_fragment_maps>
    {
      float relief = schabeNoise(warriorP * 46.0) * warriorHard * .55${scales ? ' * (1.0 - smoothstep(.25, .7, length(fwidth(warriorP)) * 46.0))' : ''} - warriorPits * .7 - warriorGrain * .25
        + schabeNoise(warriorP * vec3(12.0, 26.0, 60.0)) * warriorSoft * 1.3 + warriorVeins * .6${scales ? ' + warriorDome * 1.1 - warriorSeam * .9' : ''};
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

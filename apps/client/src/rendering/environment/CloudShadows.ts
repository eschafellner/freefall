import * as T from 'three';

/**
 * Shadows of passing clouds. One shared uniform: xy = drift offset in metres, z = strength (0 = off), w = coverage
 * threshold (lower = more cloud). Only the direct sun light is darkened, so the sky fill keeps shadows readable.
 */
export interface CloudShadowUniform { value: T.Vector4 }

export const CLOUD_SHADOW_SCALE = 115;

export function createCloudShadows(cloudThreshold: number): CloudShadowUniform {
  // The planet's sky cover sets how much of the ground lies in cloud shadow.
  return { value: new T.Vector4(0, 0, 0, .38 + cloudThreshold * .4) };
}

/** Adds cloud shadows to a lit material, keeping any earlier shader hooks. */
export function applyCloudShadows(material: T.Material, uniform: CloudShadowUniform): void {
  const compile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => previousKey + '/cloud-shadow-v1';
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.cloudShadow = uniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      varying vec2 vCloudWorld;
    `).replace('#include <project_vertex>', `
      #include <project_vertex>
      {
        vec4 cloudWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cloudWorld = instanceMatrix * cloudWorld;
        #endif
        vCloudWorld = (modelMatrix * cloudWorld).xz;
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform vec4 cloudShadow;
      varying vec2 vCloudWorld;
      float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float cloudNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(cloudHash(i), cloudHash(i + vec2(1., 0.)), f.x), mix(cloudHash(i + vec2(0., 1.)), cloudHash(i + 1.), f.x), f.y);
      }
      float cloudShade() {
        if (cloudShadow.z <= 0.) return 1.;
        vec2 p = (vCloudWorld + cloudShadow.xy) / ${CLOUD_SHADOW_SCALE.toFixed(1)};
        float n = cloudNoise(p) * .58 + cloudNoise(p * 2.3 + 3.1) * .3 + cloudNoise(p * 5.3 + 7.7) * .12;
        return 1. - cloudShadow.z * smoothstep(cloudShadow.w, cloudShadow.w + .12, n);
      }
    `).replace('#include <lights_fragment_end>', `
      #include <lights_fragment_end>
      {
        float cloudLight = cloudShade();
        reflectedLight.directDiffuse *= cloudLight;
        reflectedLight.directSpecular *= cloudLight;
      }
    `);
  };
  material.needsUpdate = true;
}

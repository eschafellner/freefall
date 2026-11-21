import * as T from 'three';

export class VegetationWind {
  // x/y map to world X/Z. z/w hold the visual phase and turbulence.
  readonly flow = { value: new T.Vector4() };
}

export function applyVegetationWind(material: T.MeshStandardMaterial, wind: VegetationWind, shape: 'ground' | 'crown' | 'crown-far'): void {
  const compile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => previousKey + '/vegetation-wind-v1/' + shape;
  const weighting = shape === 'ground'
    ? 'clamp(transformed.y * 2.35, 0.0, 1.0)'
    : 'smoothstep(.24, 1.05, position.y)';
  const leverage = shape === 'ground' ? '.15' : shape === 'crown' ? '.32' : '.25';
  const detail = shape === 'crown' ? ' + ffWind.w * .12 * min(length(position.xz), 1.0) * sin(2.8 * phase + dot(position.xz, vec2(2.8, 3.4)))' : '';
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.ffWind = wind.flow;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      uniform vec4 ffWind;
    `).replace('#include <project_vertex>', `
      #ifdef USE_INSTANCING
        vec2 flow = ffWind.xy;
        if (dot(flow, flow) > .000001) {
          // Generated terrain groups have identity transforms. Instance axes include slope and scale.
          vec3 root = instanceMatrix[3].xyz;
          float phase = ffWind.z + dot(root.xz, vec2(.143, .196)) + fract(dot(root.xz, vec2(.317, .721))) * 2.5;
          float heightWeight = ${weighting};
          float sway = .56 + .36 * sin(phase)${detail};
          vec2 drift = flow * (${leverage} * sway * heightWeight * heightWeight);
          vec3 side = instanceMatrix[0].xyz;
          vec3 forward = instanceMatrix[2].xyz;
          transformed.x += dot(side.xz, drift) / max(dot(side, side), .0001);
          transformed.z += dot(forward.xz, drift) / max(dot(forward, forward), .0001);
        }
      #endif
      #include <project_vertex>
    `);
  };
}

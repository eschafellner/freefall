import * as T from 'three';
import { noise, smoothstep } from './noise.ts';
import { PLANET_SURFACES } from './PlanetSurfaces.ts';
import type { SurfaceFinish } from './PlanetSurfaces.ts';
import { repeatSurfaceMap } from './SurfaceMaterials.ts';

const TAU = Math.PI * 2;
const TERRAIN_TILE = 256;
const PROP_TILE = 128;
/**
 * Ground haze beyond the playable range: past `start` metres the fog distance grows by `stretch` only, and the fog
 * never fully hides the ground, so the horizon backdrop reads as a silhouette. Terrain and backdrop share it, which
 * keeps the seam invisible and the haze monotonic with distance.
 */
export const GROUND_HAZE = { start: 260, stretch: .2, cap: .82 } as const;

interface Grain { shade: number; height: number; roughness: number }

function iceSeam(u: number, v: number): number {
  const x = u * 7, y = v * 7;
  const tx = Math.floor(x), ty = Math.floor(y);
  let nearest = Infinity, second = Infinity;
  for (let j = ty - 1; j <= ty + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) {
    const a = i + .19 + noise(i, j, 410, 7) * .62;
    const b = j + .19 + noise(i, j, 844, 7) * .62;
    const d = (a - x) ** 2 + (b - y) ** 2;
    if (d < nearest) {
      second = nearest;
      nearest = d;
    } else if (d < second) second = d;
  }
  return 1 - smoothstep(.007, .064, second - nearest);
}

function leafLitter(u: number, v: number): number {
  const size = 19;
  const x = u * size, y = v * size, i = Math.floor(x), j = Math.floor(y);
  const a = noise(i, j, 300, size);
  const b = noise(i, j, 322, size);
  const angle = a * TAU;
  const dx = x - i - (.34 + .32 * b), dy = y - j - (.34 + .32 * a);
  const along = dx * Math.cos(angle) + dy * Math.sin(angle);
  const width = -dx * Math.sin(angle) + dy * Math.cos(angle);
  const shape = Math.abs(along) / (.22 + .18 * b) + (width / (.08 + .1 * a)) ** 2;
  return smoothstep(.86, .22, shape) * (.48 + .52 * a);
}

function grain(finish: SurfaceFinish, u: number, v: number, size: number): Grain {
  const broad = noise(u * 8, v * 8, 38, 8);
  const grit = noise(u * 61, v * 61, 12, 61);
  const micro = noise(u * size, v * size, 22, size);
  const pores = smoothstep(.61, .88, grit);
  switch (finish) {
    case 'snow': {
      const drift = noise(u * 14, v * 5, 120, 14, 5);
      return { shade: .54 + .27 * drift + .21 * micro, height: drift * .9 + micro * .27 + pores * .36,
        roughness: .89 + .10 * grit };
    }
    case 'ice':
    case 'frost': {
      const frost = finish === 'frost';
      const seam = iceSeam(u + broad * .06, v + broad * .029);
      const fracture = seam * smoothstep(.29, .61, noise(u * 19, v * 19, 97, 19));
      const haze = noise(u * 31, v * 13, 56, 31, 13);
      return { shade: .26 + broad * .40 + haze * .19 + fracture * .44 + (frost ? grit * .18 : 0),
        height: haze * .48 - fracture * .78 + micro * (frost ? .36 : .10),
        roughness: (frost ? .50 : .22) + .27 * broad + .09 * fracture };
    }
    case 'sand':
    case 'hardpan': {
      const wind = noise(u * 6, v * 6, 51, 6);
      const drift = noise(u * 3, v * 5, 62, 3, 5);
      const ramp = .5 + .5 * Math.sin(TAU * (v * 13 + u * 4 + wind * 1.65 + drift * 1.2));
      const ripple = ramp ** 3 * (.18 + .82 * smoothstep(.26, .72, .63 * broad + .37 * drift));
      const fine = finish === 'sand';
      return { shade: .45 + broad * .19 + ripple * (fine ? .22 : .09) + micro * .13,
        height: ripple * (fine ? 1.24 : .55) + grit * .25 + micro * .22 + pores * (fine ? .11 : .56),
        roughness: .77 + .16 * grit + .04 * ramp };
    }
    case 'rock':
    case 'gravel': {
      const stratum = noise(u * 8, v * 31 + broad * 2, 54, 8, 31);
      const chips = smoothstep(.48, .86, noise(u * 32, v * 32, 71, 32));
      const gravel = finish === 'gravel';
      return { shade: .28 + broad * .30 + stratum * .23 + chips * .27,
        height: stratum * (gravel ? .58 : 1.36) + grit * .50 + chips * (gravel ? 1.8 : .57) + micro * .18,
        roughness: .76 + stratum * .17 + pores * .05 };
    }
    case 'grass':
    case 'moss': {
      const fibre = noise(u * 104, v * 69, 82, 104, 69);
      const moss = finish === 'moss';
      const clump = noise(u * 23, v * 26, 144, 23, 26);
      return { shade: .32 + clump * .32 + fibre * .29 + broad * .15,
        height: clump * .61 + fibre * (moss ? .40 : .58) + pores * .36,
        roughness: .87 + clump * .12 };
    }
    case 'earth':
    case 'forest-floor':
    case 'litter': {
      const leaves = finish === 'earth' ? 0 : leafLitter(u, v) * (finish === 'litter' ? 1 : .86);
      return { shade: .24 + broad * .32 + grit * .14 + leaves * .72 + micro * .10,
        height: broad * .32 + grit * .41 + pores * .82 + leaves * 1.13 + micro * .17,
        roughness: .84 + .10 * grit + .06 * leaves };
    }
    case 'bark': {
      const channels = noise(u * 45 + broad * 1.2, v * 5, 645, 45, 5);
      const ridges = smoothstep(.16, .70, channels);
      return { shade: .19 + ridges * .53 + grit * .19, height: ridges * 1.56 + grit * .32 + pores * .21,
        roughness: .88 + ridges * .10 };
    }
  }
}

const byte = (value: number) => Math.round(T.MathUtils.clamp(value, 0, 1) * 255);

function surfaceTile(finish: SurfaceFinish, size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const pixel = j * size + i;
    const value = grain(finish, i / size, j / size, size);
    height[pixel] = value.height;
    data[pixel * 4] = byte(value.shade);
    data[pixel * 4 + 1] = byte(value.roughness);
  }
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = height[j * size + (i + 1) % size] - height[j * size + (i + size - 1) % size];
    const dz = height[((j + 1) % size) * size + i] - height[((j + size - 1) % size) * size + i];
    const normal = Math.hypot(dx, dz, 1);
    const pixel = (j * size + i) * 4;
    data[pixel + 2] = byte(.5 - .5 * dx / normal);
    data[pixel + 3] = byte(.5 - .5 * dz / normal);
  }
  return data;
}

export function createPlanetMaterials(planet: string, seed: number, anisotropy: number) {
  const layers = PLANET_SURFACES[planet];
  const packed = new Uint8Array(TERRAIN_TILE * TERRAIN_TILE * 4 * layers.length);
  for (const [index, [finish]] of layers.entries()) {
    packed.set(surfaceTile(finish, TERRAIN_TILE), index * TERRAIN_TILE * TERRAIN_TILE * 4);
  }
  const atlas = new T.DataArrayTexture(packed, TERRAIN_TILE, TERRAIN_TILE, layers.length);
  atlas.name = planet + ':terrain-surface';
  atlas.wrapS = atlas.wrapT = T.RepeatWrapping;
  atlas.generateMipmaps = true;
  atlas.minFilter = T.LinearMipmapLinearFilter;
  atlas.magFilter = T.LinearFilter;
  atlas.anisotropy = anisotropy;
  atlas.needsUpdate = true;

  const textures: T.Texture[] = [atlas];
  const detailRange = { value: new T.Vector2(72, 112) };
  const colors = layers.map(([, color, roughness]) => {
    const rgb = new T.Color(color);
    return new T.Vector4(rgb.r, rgb.g, rgb.b, roughness);
  });
  const scales = new T.Vector4(...layers.map(([, , , metres]) => 1 / metres));
  const angle = seed / 0x100000000 * TAU;
  const facing = new T.Vector2(Math.cos(angle), Math.sin(angle));
  const ground = new T.MeshStandardMaterial({ name: 'Planet terrain PBR', metalness: 0 });
  ground.customProgramCacheKey = () => 'planet-surface-pbr-v2';
  ground.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      planetTile: { value: atlas }, planetColors: { value: colors }, planetScale: { value: scales },
      planetFacing: { value: facing }, planetDetailRange: detailRange,
      groundHaze: { value: new T.Vector3(GROUND_HAZE.start, GROUND_HAZE.stretch, GROUND_HAZE.cap) },
    });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec4 surfaceWeights;
      attribute float surfaceTone;
      attribute vec3 surfaceMacro;
      varying vec4 vPlanetWeights;
      varying vec3 vPlanetGround;
      varying vec3 vPlanetMacro;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vPlanetWeights = surfaceWeights;
      vPlanetGround = vec3(position.xz, surfaceTone);
      vPlanetMacro = surfaceMacro;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform highp sampler2DArray planetTile;
      uniform vec4 planetColors[4];
      uniform vec4 planetScale;
      uniform vec2 planetFacing;
      uniform vec2 planetDetailRange;
      varying vec4 vPlanetWeights;
      varying vec3 vPlanetGround;
      varying vec3 vPlanetMacro;
      uniform vec3 groundHaze;
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      vec4 weights = max(vPlanetWeights, 0.0);
      weights /= max(dot(weights, vec4(1.0)), .0001);
      vec2 p = vPlanetGround.xy;
      vec2 uv = vec2(dot(p, planetFacing), dot(p, vec2(-planetFacing.y, planetFacing.x)));
      uv += .74 * sin(uv.yx * vec2(.33, .27) + sin(uv * .095));
      vec2 gradX = dFdx(uv);
      vec2 gradY = dFdy(uv);
      float visibility = 1.0 - smoothstep(planetDetailRange.x, planetDetailRange.y, length(vViewPosition));
      vec4 surface = vec4(0.0);
      vec2 microNormal = vec2(0.0);
      for (int layer = 0; layer < 4; layer++) {
        vec4 finish = planetColors[layer];
        float weight = weights[layer];
        if (visibility > 0.0 && weight > .018) {
          float scale = planetScale[layer];
          vec4 detail = textureGrad(planetTile, vec3(uv * scale, float(layer)), gradX * scale, gradY * scale);
          float mixStrength = visibility * smoothstep(.018, .075, weight);
          finish.rgb *= mix(1.0, .64 + detail.r * .65, mixStrength);
          finish.a = mix(finish.a, detail.g, mixStrength * .78);
          microNormal += (detail.ba * 2.0 - 1.0) * weight * mixStrength;
        }
        surface += weight * finish;
      }
      diffuseColor.rgb *= surface.rgb * vPlanetGround.z * vPlanetMacro;
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor *= surface.a;
    `).replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      if (visibility > 0.0) {
        // Surface coordinates are world XZ, including the seed rotation.
        vec3 tangent = mat3(viewMatrix) * vec3(planetFacing.x, 0.0, planetFacing.y);
        tangent = normalize(tangent - normal * dot(normal, tangent));
        vec3 bitangent = cross(tangent, normal);
        normal = normalize(normal + tangent * microNormal.x + bitangent * microNormal.y);
      }
    `).replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          // Slower haze past the playable range so distant ridges read as silhouettes instead of vanishing.
          float hazeDepth = vFogDepth > groundHaze.x ? groundHaze.x + (vFogDepth - groundHaze.x) * groundHaze.y : vFogDepth;
          float fogFactor = min(1.0 - exp(-fogDensity * fogDensity * hazeDepth * hazeDepth), groundHaze.z);
        #else
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
      #endif
    `);
  };

  const prop = (finish: SurfaceFinish, color: number, roughness: number) => {
    const tile = surfaceTile(finish, PROP_TILE);
    const albedo = new Uint8Array(tile.length);
    const normals = new Uint8Array(tile.length);
    for (let i = 0; i < tile.length; i += 4) {
      const shade = byte(.57 + tile[i] / 255 * .42);
      albedo.set([shade, shade, shade, 255], i);
      const x = tile[i + 2] / 127.5 - 1, y = tile[i + 3] / 127.5 - 1;
      normals.set([tile[i + 2], tile[i + 3], byte(.5 + .5 * Math.sqrt(Math.max(0, 1 - x * x - y * y))), 255], i);
    }
    const map = repeatSurfaceMap(albedo, PROP_TILE), normalMap = repeatSurfaceMap(normals, PROP_TILE);
    map.anisotropy = normalMap.anisotropy = anisotropy;
    map.name = finish + ':albedo';
    normalMap.name = finish + ':normal';
    textures.push(map, normalMap);
    return new T.MeshStandardMaterial({ name: finish, color, roughness, metalness: 0, map, normalMap,
      normalScale: new T.Vector2(.52, .52) });
  };
  return { ground, detailRange, prop, textures };
}

export interface RockSurfaceOptions {
  /** Ground colour the rock foot blends into. */
  ground: number;
  /** Colour of the deposit on upward faces (moss, drift sand, snow). */
  dust: number;
  /** 0 = no deposit, 1 = heavy deposit. */
  coverage: number;
  /** Texture repeat in metres. */
  metres: number;
}

/** Shared toggles that follow the graphics quality (deposit is skipped on Low). */
export interface RockSurfaceControls { dusting: { value: number } }

/** Height of the darkened, ground-tinted band at the rock foot in metres. */
export const ROCK_CONTACT_HEIGHT = .65;

/**
 * Turns a `prop()` material into a world-space rock surface: triplanar albedo and normal detail with a fixed size in
 * metres (instead of the stretched sphere UVs), a darkened, ground-tinted foot and a planet deposit on upward faces.
 * Meshes using it need a per-vertex or per-instance `rockGround` attribute holding the ground height under the rock.
 */
export function applyRockSurface(material: T.MeshStandardMaterial, options: RockSurfaceOptions,
  controls: RockSurfaceControls): void {
  const uniforms = {
    rockScale: { value: 1 / options.metres },
    rockGroundColor: { value: new T.Color(options.ground) },
    rockDustColor: { value: new T.Color(options.dust) },
    rockCoverage: { value: options.coverage },
    rockContact: { value: ROCK_CONTACT_HEIGHT },
    rockDusting: controls.dusting,
  };
  material.customProgramCacheKey = () => 'planet-rock-surface-v1';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute float rockGround;
      varying vec3 vRockWorld;
      varying vec3 vRockNormal;
      varying float vRockRise;
    `).replace('#include <project_vertex>', `
      #include <project_vertex>
      mat4 rockModel = modelMatrix;
      #ifdef USE_INSTANCING
        rockModel = modelMatrix * instanceMatrix;
      #endif
      vec4 rockWorld = rockModel * vec4(transformed, 1.0);
      vRockWorld = rockWorld.xyz;
      // Rocks are scaled non-uniformly: normals need the inverse transpose.
      vRockNormal = normalize(transpose(inverse(mat3(rockModel))) * objectNormal);
      vRockRise = rockWorld.y - rockGround;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform float rockScale;
      uniform vec3 rockGroundColor;
      uniform vec3 rockDustColor;
      uniform float rockCoverage;
      uniform float rockContact;
      uniform float rockDusting;
      varying vec3 vRockWorld;
      varying vec3 vRockNormal;
      varying float vRockRise;
    `).replace('#include <map_fragment>', `
      vec3 rockN = normalize(vRockNormal);
      vec3 rockBlend = pow(abs(rockN), vec3(4.0));
      rockBlend /= dot(rockBlend, vec3(1.0));
      vec3 rockP = vRockWorld * rockScale;
      vec4 rockAlbedo = texture2D(map, rockP.zy) * rockBlend.x + texture2D(map, rockP.xz) * rockBlend.y
        + texture2D(map, rockP.xy) * rockBlend.z;
      // Broad tone variation breaks up large faces; the tile itself gets a little more contrast than on small props.
      float rockMacro = texture2D(map, vRockWorld.xz * rockScale * .19 + .37).r;
      float rockBreak = texture2D(map, vRockWorld.zy * rockScale * .61 + .11).r;
      diffuseColor.rgb *= clamp(rockAlbedo.rgb * 1.45 - .38, 0.0, 1.2) * (.8 + .32 * rockMacro);
      // Foot: ambient-occlusion substitute and a soft tint toward the surrounding ground.
      float rockFoot = 1.0 - smoothstep(0.0, rockContact, vRockRise);
      rockFoot *= rockFoot;
      diffuseColor.rgb = mix(diffuseColor.rgb, rockGroundColor * (.55 + .45 * rockAlbedo.r), rockFoot * .42);
      diffuseColor.rgb *= 1.0 - .38 * rockFoot;
      float rockDeposit = 0.0;
      if (rockDusting > 0.0 && rockCoverage > 0.0) {
        // Broad world-space breakup so the deposit gathers in patches instead of a uniform cap.
        float patches = rockMacro * .6 + rockBreak * .4;
        float facing = rockN.y + (patches - .74) * 1.6;
        rockDeposit = smoothstep(.9 - .4 * rockCoverage, 1.15 - .3 * rockCoverage, facing) * rockDusting;
        rockDeposit *= 1.0 - rockFoot;
        diffuseColor.rgb = mix(diffuseColor.rgb, rockDustColor * (.7 + .4 * rockAlbedo.r), rockDeposit * .9);
      }
    `).replace('#include <normal_fragment_maps>', `
      {
        // Triplanar UDN blend in world space, then into view space.
        vec2 nx = (texture2D(normalMap, rockP.zy).xy * 2.0 - 1.0) * normalScale;
        vec2 ny = (texture2D(normalMap, rockP.xz).xy * 2.0 - 1.0) * normalScale;
        vec2 nz = (texture2D(normalMap, rockP.xy).xy * 2.0 - 1.0) * normalScale;
        // Deposits soften the relief they cover.
        float relief = 1.0 - .6 * rockDeposit;
        vec3 worldNormal = normalize(
          vec3(rockN.x, nx.y * relief + rockN.y, nx.x * relief + rockN.z) * rockBlend.x
          + vec3(ny.x * relief + rockN.x, rockN.y, ny.y * relief + rockN.z) * rockBlend.y
          + vec3(nz.x * relief + rockN.x, nz.y * relief + rockN.y, rockN.z) * rockBlend.z);
        normal = normalize(mat3(viewMatrix) * worldNormal);
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif
      }
    `);
  };
  material.needsUpdate = true;
}

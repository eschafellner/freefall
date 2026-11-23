import * as T from 'three';
import type { AtmosphereSettings, PlanetAtmosphereProfile } from '@freefall/shared';
import type { AtmosphereLighting } from './AtmosphereController.ts';
import { noise, smoothstep } from './noise.ts';
import { TONE_GRADE } from '../ToneMapping.ts';

export type LightingScene = 'arena' | 'carrier' | 'surface';

const ARENA: AtmosphereSettings = {
  exposure: 1,
  sun: { offset: [-79, 65, 46], color: 0xffedda, intensity: 1.72 },
  fill: { sky: 0xcfdeeb, ground: 0x8f7c62, intensity: 1.26 },
  environmentIntensity: .42,
  shadow: { extent: 81, radius: 2.6 },
  fog: { color: 0xb7b8ad, density: .0068 },
  sky: { zenith: 0x869eac, clouds: 0xd3d4cf, cloudShadow: 0x697a84, belowHorizon: 0x5b5546,
    cloudThreshold: .33, cloudScale: 1, hazeHeight: .32, sunGlow: 1 },
};
const CARRIER_FOG = { color: 0x0c1418, density: .0075 };
/**
 * Carrier interior: low ambient so the practical lights carry the scene; the directional light is the cool
 * shine of Dev' Ault coming in from starboard.
 */
const CARRIER: AtmosphereSettings = {
  ...ARENA,
  exposure: 1,
  sun: { offset: [80, 34, 52], color: 0x8fbbe8, intensity: .62 },
  fill: { sky: 0x6d8796, ground: 0x2a2522, intensity: .5 },
  environmentIntensity: .22,
};
const FIXED_SURFACE_FOG = { color: ARENA.fog.color, density: .0041 };

/** Cloud cover of the baked sky (same noise as `skyTexture`), used to veil the sun discs behind clouds. */
function skyCoverage(profile: AtmosphereSettings): T.DataTexture {
  const width = 256, height = 128, data = new Uint8Array(width * height);
  const { sky } = profile;
  for (let y = 0; y < height; y++) {
    const e = ((y + .5) / height - .5) * Math.PI, v = Math.sin(e), ring = Math.cos(e);
    for (let x = 0; x < width; x++) {
      const a = ((x + .5) / width - .5) * Math.PI * 2;
      const scale = sky.cloudScale / Math.max(.16, v + .12);
      const cx = Math.cos(a) * ring * scale, cz = Math.sin(a) * ring * scale;
      const coverage = noise(cx * 1.7, cz * 1.7, 61) * .58 + noise(cx * 4.3, cz * 4.3, 62) * .29 +
        noise(cx * 10.7, cz * 10.7, 63) * .10 + noise(cx * 23, cz * 23, 64) * .03;
      const cloud = smoothstep(sky.cloudThreshold - .09, sky.cloudThreshold + .10, coverage);
      // Low haze also swallows the discs near the horizon.
      data[y * width + x] = Math.round(Math.min(1, Math.max(cloud, 1 - smoothstep(0, sky.hazeHeight * .5, v))) * 255);
    }
  }
  const texture = new T.DataTexture(data, width, height, T.RedFormat, T.UnsignedByteType);
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.wrapS = T.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Sun discs, companion stars, moons and gas giants drawn over the sky background. Premultiplied alpha: stars add light,
 * bodies cover the sky. Depth 1 with LessEqual keeps them behind every surface.
 */
function celestialSky() {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const vec3s = (n: number) => Array.from({ length: n }, () => new T.Vector3());
  const uniforms = {
    coverage: { value: null as T.Texture | null }, veil: { value: 0 }, brightness: { value: 1 },
    sunCount: { value: 0 }, sunDir: { value: vec3s(3) }, sunColor: { value: vec3s(3) }, sunSize: { value: [0, 0, 0] },
    bodyDir: { value: vec3s(2) }, bodyColor: { value: vec3s(2) }, bodyShape: { value: [new T.Vector4(), new T.Vector4()] },
  };
  const material = new T.ShaderMaterial({
    uniforms, depthWrite: false, depthFunc: T.LessEqualDepth, transparent: true,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
    vertexShader: `
      varying vec2 screen;
      void main() {
        screen = position.xy;
        gl_Position = vec4(position.xy, 1., 1.);
      }
    `,
    fragmentShader: `
      #include <common>
      uniform mat4 projectionMatrix;
      uniform sampler2D coverage;
      uniform float veil, brightness;
      uniform int sunCount;
      uniform vec3 sunDir[3], sunColor[3];
      uniform float sunSize[3];
      uniform vec3 bodyDir[2], bodyColor[2];
      uniform vec4 bodyShape[2];
      varying vec2 screen;
      float angleTo(vec3 a, vec3 b) { return atan(length(cross(a, b)), dot(a, b)); }
      void main() {
        vec3 ray = normalize(transpose(mat3(viewMatrix)) * vec3(screen.x / projectionMatrix[0][0],
          screen.y / projectionMatrix[1][1], -1.));
        float horizon = smoothstep(-.01, .045, ray.y);
        float cover = clamp(texture2D(coverage, equirectUv(ray)).r + veil, 0., 1.);
        vec4 body = vec4(0.);
        for (int i = 0; i < 2; i++) {
          vec4 shape = bodyShape[i];
          if (shape.w < .5) continue;
          vec3 dir = bodyDir[i];
          float facing = dot(ray, dir);
          if (facing <= 0.) continue;
          vec3 t = normalize(cross(dir, vec3(0., 1., 0.)));
          vec3 b = cross(t, dir);
          vec3 p = ray - dir * facing;
          float u = dot(p, t) / shape.x, v = dot(p, b) / shape.x, r2 = u * u + v * v;
          float fade = horizon * (1. - cover * .7);
          // Ring seen at a slant; its front half covers the planet.
          float rv = v / .3, rr = sqrt(u * u + rv * rv);
          float ring = shape.z > 0. ? smoothstep(1.28, 1.34, rr) * (1. - smoothstep(shape.z - .1, shape.z, rr)) *
            (.5 + .3 * sin(rr * 46.) + .2 * sin(rr * 13.)) : 0.;
          bool front = rv < 0.;
          if (r2 < 1. && !(front && ring > .05)) {
            vec3 n = normalize(t * u + b * v - dir * sqrt(1. - r2));
            float lit = max(dot(n, sunDir[0]), 0.);
            float bands = shape.y > 0. ? .8 + .2 * sin(v * shape.y * 3.14 + sin(u * 2.7) * .7) : .9 + .1 * sin(u * 9. + v * 5.);
            vec3 color = bodyColor[i] * bands * (.05 + .8 * lit) * brightness;
            float alpha = (1. - smoothstep(.93, 1., r2)) * fade;
            body = vec4(color * alpha, alpha) + body * (1. - alpha);
          } else if (ring > 0.) {
            float alpha = ring * .75 * fade;
            body = vec4(bodyColor[i] * .85 * brightness * alpha, alpha) + body * (1. - alpha);
          }
        }
        vec3 light = vec3(0.);
        float discs = 0.;
        for (int i = 0; i < 3; i++) {
          if (i >= sunCount) break;
          float d = angleTo(ray, sunDir[i]), s = sunSize[i];
          float disc = 1. - smoothstep(s * .8, s, d);
          float halo = exp(-d / (s * 2.5)) * .32 + exp(-d / (s * 10. + .01)) * .07;
          // Moderate disc brightness keeps coloured companions coloured after tone mapping.
          light += sunColor[i] * (disc * 7. * (1. - cover * .92) + halo * (1. - cover * .6));
          // A disc hides the sky behind it, so coloured stars keep their colour instead of adding up to white.
          discs = max(discs, disc * .9 * (1. - cover * .92));
        }
        light *= horizon * brightness * (1. - body.a);
        gl_FragColor = vec4(body.rgb + light, max(body.a, discs * horizon * (1. - body.a)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Planet celestial sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 101;
  mesh.visible = false;
  return { mesh, uniforms, dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); } };
}

function skyTexture(hdr: boolean, profile: AtmosphereSettings): T.DataTexture {
  const width = 512;
  const height = 256;
  const data = hdr ? new Uint16Array(width * height * 4) : new Uint8Array(width * height * 4);
  const encode = hdr ? T.DataUtils.toHalfFloat : (value: number) => Math.round(Math.min(1, value) * 255);
  const { sky } = profile;
  const sun = new T.Vector3(...profile.sun.offset).normalize();
  const horizon = new T.Color(profile.fog.color);
  const blue = new T.Color(sky.zenith);
  const cloud = new T.Color(sky.clouds);
  const darker = new T.Color(sky.cloudShadow);
  const underground = new T.Color(sky.belowHorizon);
  const legacy = profile === ARENA;
  const glow = legacy ? new T.Color().setRGB(1, .88, .68) : new T.Color(profile.sun.color);
  const color = new T.Color();
  const gray = new T.Color();
  for (let y = 0; y < height; y++) {
    const e = ((y + 0.5) / height - 0.5) * Math.PI;
    const v = Math.sin(e);
    const ring = Math.cos(e);
    const altitude = smoothstep(0, sky.hazeHeight, v);
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const a = (u - 0.5) * Math.PI * 2;
      const directionX = Math.cos(a) * ring;
      const directionZ = Math.sin(a) * ring;
      const towardSun = Math.max(0, directionX * sun.x + v * sun.y + directionZ * sun.z);
      // Project onto a horizontal cloud deck. Clamp its projected scale close to the hazy horizon.
      const scale = sky.cloudScale / Math.max(0.16, v + 0.12);
      const cx = directionX * scale;
      const cz = directionZ * scale;
      const coverage = noise(cx * 1.7, cz * 1.7, 61) * 0.58 + noise(cx * 4.3, cz * 4.3, 62) * 0.29 +
        noise(cx * 10.7, cz * 10.7, 63) * 0.10 + noise(cx * 23, cz * 23, 64) * 0.03;
      gray.copy(darker).lerp(cloud, smoothstep(0.31, 0.72, coverage));
      color.copy(blue).lerp(gray, smoothstep(sky.cloudThreshold - .09, sky.cloudThreshold + .10, coverage));
      color.lerp(horizon, 1 - altitude);
      if (v < 0) color.lerp(underground, smoothstep(0, 0.35, -v));
      const scattering = Math.pow(towardSun, 54) * (0.13 + 0.6 * (1 - coverage)) * sky.sunGlow * (legacy ? 1 : altitude);
      color.r += scattering * glow.r;
      color.g += scattering * glow.g;
      color.b += scattering * glow.b;
      const i = (y * width + x) * 4;
      data[i] = encode(color.r);
      data[i + 1] = encode(color.g);
      data[i + 2] = encode(color.b);
      data[i + 3] = encode(1);
    }
  }
  const texture = new T.DataTexture(data, width, height, T.RGBAFormat, hdr ? T.HalfFloatType : T.UnsignedByteType);
  texture.mapping = T.EquirectangularReflectionMapping;
  texture.colorSpace = T.LinearSRGBColorSpace;
  texture.minFilter = texture.magFilter = T.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Three mixes fog after tone mapping in direct mode. With OutputPass the mix is in scene-linear light.
// Match the display-space haze to the sky's ACESFilmicToneMapping at the horizon for the direct path.
function mapFogToDisplay(color: T.Color, exposure: number): void {
  const scale = exposure / .6;
  const r = color.r * scale, g = color.g * scale, b = color.b * scale;
  const fit = (value: number) => (value * (value + .0245786) - .000090537) /
    (value * (.983729 * value + .432951) + .238081);
  const ar = fit(.59719 * r + .35458 * g + .04823 * b);
  const ag = fit(.076 * r + .90834 * g + .01566 * b);
  const ab = fit(.0284 * r + .13383 * g + .83777 * b);
  const r2 = 1.60475 * ar - .53108 * ag - .07367 * ab, g2 = -.10208 * ar + 1.10813 * ag - .00605 * ab;
  const b2 = -.00327 * ar - .07276 * ag + 1.07602 * ab;
  // Same saturation step as the custom tone mapping.
  const luma = .2126 * r2 + .7152 * g2 + .0722 * b2, k = TONE_GRADE.saturation;
  color.setRGB(
    T.MathUtils.clamp(luma + (r2 - luma) * k, 0, 1),
    T.MathUtils.clamp(luma + (g2 - luma) * k, 0, 1),
    T.MathUtils.clamp(luma + (b2 - luma) * k, 0, 1),
  );
}

function blendedSky() {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const uniforms = {
    sourceSky: { value: null as T.Texture | null }, tint: { value: new T.Color() },
    horizon: { value: new T.Color() }, amount: { value: 0 }, brightness: { value: 1 },
    bakedSun: { value: new T.Vector3() }, directSun: { value: new T.Vector3() },
    bakedSunColor: { value: new T.Color() }, directSunColor: { value: new T.Color() },
    glow: { value: 0 }, shiftSun: { value: 0 },
    horizonGlow: { value: new T.Color() }, horizonAmount: { value: 0 }, zenithTint: { value: new T.Color() }, zenithAmount: { value: 0 },
    coverage: { value: null as T.Texture | null },
  };
  const material = new T.ShaderMaterial({
    uniforms, depthWrite: false, depthFunc: T.LessEqualDepth,
    vertexShader: `
      varying vec2 screen;
      void main() {
        screen = position.xy;
        gl_Position = vec4(position.xy, 1., 1.);
      }
    `,
    fragmentShader: `
      #include <common>
      uniform mat4 projectionMatrix;
      uniform sampler2D sourceSky;
      uniform vec3 tint, horizon, bakedSun, directSun, bakedSunColor, directSunColor;
      uniform float amount, brightness, glow, shiftSun;
      uniform vec3 horizonGlow, zenithTint;
      uniform float horizonAmount, zenithAmount;
      uniform sampler2D coverage;
      varying vec2 screen;
      void main() {
        vec3 ray = normalize(transpose(mat3(viewMatrix)) * vec3(screen.x / projectionMatrix[0][0],
          screen.y / projectionMatrix[1][1], -1.));
        vec3 sky = texture2D(sourceSky, equirectUv(ray)).rgb;
        // Reposition the soft directional highlight for dawn and dusk using the existing sun vector.
        if (shiftSun > .5) {
          float was = pow(max(0., dot(ray, bakedSun)), 54.);
          float now = pow(max(0., dot(ray, directSun)), 50.);
          sky = max(vec3(0.), sky + (directSunColor * now - bakedSunColor * was) * glow);
        }
        vec3 gray = vec3(dot(sky, vec3(.2126, .7152, .0722)));
        vec3 shaded = mix(sky, gray * .60 + tint * .40, amount) * brightness;
        // Dawn and dusk: cooler, deeper zenith and a warm band along the horizon, strongest toward the sun.
        float up = clamp(ray.y, 0., 1.);
        shaded = mix(shaded, zenithTint * brightness, zenithAmount * smoothstep(.06, .75, up));
        vec2 rayFlat = ray.xz / max(length(ray.xz), 1e-4);
        vec2 sunFlat = directSun.xz / max(length(directSun.xz), 1e-4);
        float toward = max(0., dot(rayFlat, sunFlat));
        float band = 1. - smoothstep(-.04, .32 + .18 * toward, ray.y);
        shaded += horizonGlow * horizonAmount * band * band * (.35 + .65 * toward * toward * toward);
        // Low sun colours the whole sky, clouds included, most on the sun side.
        shaded = mix(shaded, shaded * (.55 + horizonGlow * .6), horizonAmount * .55 * (.35 + .65 * toward));
        // Cloud undersides catch the low sun: strongest toward it and in the lower sky.
        float cloud = texture2D(coverage, equirectUv(ray)).r * smoothstep(-.02, .06, ray.y);
        shaded += horizonGlow * horizonAmount * cloud * (.18 + 1.1 * toward * toward * toward) * (1. - smoothstep(.35, .85, ray.y)) * .55;
        float horizonBlend = (1. - smoothstep(.012, .18, abs(ray.y))) * min(1., amount * 3.);
        gl_FragColor = vec4(mix(shaded, horizon, horizonBlend), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Planet sky blend';
  mesh.frustumCulled = false;
  mesh.renderOrder = 100;
  mesh.visible = false;
  return { mesh, uniforms, dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); } };
}

/** Sun offset of a profile, lowered by `elevation` and turned by `azimuth` around the vertical axis. */
export function sunOffset(profile: AtmosphereSettings, elevation: number, azimuth: number, out: T.Vector3): T.Vector3 {
  const [x, y, z] = profile.sun.offset;
  const c = Math.cos(azimuth), s = Math.sin(azimuth);
  return out.set(x * c - z * s, y * elevation, x * s + z * c);
}

export function createLighting(scene: T.Scene, hdr: boolean) {
  const legacySky = skyTexture(hdr, ARENA);
  const carrierBackground = new T.Color(0x010206);
  const fog = new T.FogExp2(ARENA.fog.color, ARENA.fog.density);
  scene.fog = fog;
  const fill = new T.HemisphereLight();
  const sun = new T.DirectionalLight();
  const shadow = sun.shadow;
  shadow.camera.near = 1;
  shadow.camera.far = 244;
  shadow.bias = -0.00035;
  shadow.normalBias = 0.075;
  shadow.autoUpdate = false;
  const blend = blendedSky();
  const celestial = celestialSky();
  // Companion stars (desert): shadowless lights from their own directions.
  const companions = [new T.DirectionalLight(), new T.DirectionalLight()];
  for (const light of companions) {
    light.intensity = 0;
    scene.add(light, light.target);
  }
  scene.add(fill, sun, sun.target, blend.mesh, celestial.mesh);
  const turned = new T.Vector3();
  const scratchColor = new T.Color();

  let planetSky: { profile: PlanetAtmosphereProfile; texture: T.DataTexture; coverage: T.DataTexture } | undefined;
  let background: T.Color | T.DataTexture = legacySky;
  let current: AtmosphereSettings = ARENA;
  let currentMode: LightingScene | undefined;
  let currentPost = false;
  let weatherActive = false;
  let exposure = 1;
  let sunElevation = 1;
  let sunAzimuth = 0;

  function update(mode: LightingScene, post: boolean, x: number, z: number, atmosphere?: PlanetAtmosphereProfile, weather?: AtmosphereLighting,
    view?: T.Vector3): boolean {
    const planet = mode === 'surface' ? atmosphere : undefined;
    const profile = planet ?? (mode === 'carrier' ? CARRIER : ARENA);
    const applied = Boolean(planet && weather);
    const changed = current !== profile || currentMode !== mode || currentPost !== post || weatherActive !== applied;
    if (changed) {
      if (planet && planetSky?.profile !== planet) {
        const texture = skyTexture(hdr, planet);
        planetSky?.texture.dispose();
        planetSky?.coverage.dispose();
        planetSky = { profile: planet, texture, coverage: skyCoverage(planet) };
      }
      const sky = planet && planetSky ? planetSky.texture : legacySky;
      background = mode === 'carrier' ? carrierBackground : sky;
      scene.environment = hdr ? sky : null;
      scene.environmentIntensity = profile.environmentIntensity;
      blend.uniforms.bakedSun.value.fromArray(profile.sun.offset).normalize();
      blend.uniforms.bakedSunColor.value.setHex(profile.sun.color);
      const haze = mode === 'carrier' ? CARRIER_FOG : mode === 'surface' && !planet ? FIXED_SURFACE_FOG : profile.fog;
      exposure = profile.exposure;
      fog.color.setHex(haze.color);
      if (planet && !post) mapFogToDisplay(fog.color, profile.exposure);
      fog.density = haze.density;

      sun.color.setHex(profile.sun.color);
      sun.intensity = profile.sun.intensity;
      fill.color.setHex(profile.fill.sky);
      fill.groundColor.setHex(profile.fill.ground);
      fill.intensity = profile.fill.intensity;
      shadow.radius = profile.shadow.radius;
      shadow.camera.left = shadow.camera.bottom = -profile.shadow.extent;
      shadow.camera.right = shadow.camera.top = profile.shadow.extent;
      shadow.camera.updateProjectionMatrix();
      current = profile;
      currentMode = mode;
      currentPost = post;
      weatherActive = applied;
    }
    // DescentView may replace the sky for a cinematic frame; always start from the active profile.
    blend.mesh.visible = Boolean(planet && weather && planetSky &&
      (weather.skyAmount > .0001 || weather.glowAmount > .0001 || weather.zenithAmount > .0001));
    scene.background = blend.mesh.visible ? null : background;
    if (planet && weather && planetSky) {
      exposure = profile.exposure * weather.exposure;
      fog.color.copy(weather.fog);
      if (view && weather.glowAmount > 0) {
        // Haze glows warm toward the low sun and stays cool on the opposite side.
        sunOffset(profile, weather.elevation, weather.azimuth, turned).setY(0).normalize();
        const facing = Math.hypot(view.x, view.z) > 1e-4 ? (view.x * turned.x + view.z * turned.z) / Math.hypot(view.x, view.z) : 0;
        const toward = Math.max(0, facing) ** 2, away = Math.max(0, -facing);
        fog.color.lerp(scratchColor.copy(weather.glow), weather.glowAmount * toward * .32)
          .lerp(scratchColor.copy(weather.zenith), weather.zenithAmount * away * .18);
      }
      if (!post) mapFogToDisplay(fog.color, exposure);
      fog.density = weather.fogDensity;
      sun.color.setHex(profile.sun.color).multiply(weather.sunTint);
      sun.intensity = profile.sun.intensity * weather.sun;
      fill.intensity = profile.fill.intensity * weather.fill;
      fill.color.copy(weather.fillSky);
      fill.groundColor.copy(weather.fillGround);
      scene.environmentIntensity = profile.environmentIntensity * weather.environment;
      if (blend.mesh.visible) {
        blend.uniforms.sourceSky.value = planetSky.texture;
        blend.uniforms.coverage.value = planetSky.coverage;
        blend.uniforms.tint.value.copy(weather.skyTint);
        blend.uniforms.horizon.value.copy(weather.fog);
        blend.uniforms.amount.value = weather.skyAmount;
        blend.uniforms.brightness.value = weather.skyBrightness;
        blend.uniforms.shiftSun.value = Number(weather.elevation < .8 || weather.azimuth !== 0);
        blend.uniforms.glow.value = profile.sky.sunGlow * .34;
        sunOffset(profile, weather.elevation, weather.azimuth, blend.uniforms.directSun.value).normalize();
        blend.uniforms.directSunColor.value.copy(sun.color);
        blend.uniforms.horizonGlow.value.copy(weather.glow);
        blend.uniforms.horizonAmount.value = weather.glowAmount;
        blend.uniforms.zenithTint.value.copy(weather.zenith);
        blend.uniforms.zenithAmount.value = weather.zenithAmount;
      }
    } else {
      blend.uniforms.sourceSky.value = null;
    }

    // Celestial layer and companion stars follow the same sun rotation as the main light.
    const sky = planet?.celestial;
    const elevationNow = weather?.elevation ?? 1, azimuthNow = weather?.azimuth ?? 0;
    celestial.mesh.visible = Boolean(planet && sky && planetSky && mode === 'surface');
    if (planet && sky && planetSky) {
      const u = celestial.uniforms;
      u.coverage.value = planetSky.coverage;
      u.veil.value = weather ? Math.min(.9, weather.skyAmount * 1.2) : 0;
      u.brightness.value = weather?.skyBrightness ?? 1;
      const suns = [{ offset: profile.sun.offset, color: profile.sun.color, size: sky.sunSize, intensity: profile.sun.intensity }, ...sky.suns];
      u.sunCount.value = Math.min(3, suns.length);
      for (const [i, star] of suns.slice(0, 3).entries()) {
        sunOffset({ ...profile, sun: { ...profile.sun, offset: star.offset } }, elevationNow, azimuthNow, u.sunDir.value[i]).normalize();
        const tint = scratchColor.setHex(star.color);
        if (i === 0 && weather) tint.multiply(weather.sunTint);
        u.sunColor.value[i].set(tint.r, tint.g, tint.b).multiplyScalar(Math.min(1.4, star.intensity));
        u.sunSize.value[i] = star.size;
      }
      for (let i = 0; i < 2; i++) {
        const body = sky.bodies[i];
        u.bodyShape.value[i].set(body?.size ?? 0, body?.bands ?? 0, body?.ring ?? 0, body ? 1 : 0);
        if (!body) continue;
        u.bodyDir.value[i].set(...body.offset).normalize();
        const tint = scratchColor.setHex(body.color);
        u.bodyColor.value[i].set(tint.r, tint.g, tint.b);
      }
    }
    for (const [i, light] of companions.entries()) {
      const star = planet && mode === 'surface' ? sky?.suns[i] : undefined;
      light.intensity = star ? star.intensity * (weather?.sun ?? 1) : 0;
      if (!star) continue;
      light.color.setHex(star.color);
      sunOffset({ ...profile, sun: { ...profile.sun, offset: star.offset } }, elevationNow, azimuthNow, turned);
      light.target.position.set(Math.round(x / 24) * 24, 0, Math.round(z / 24) * 24);
      light.position.copy(light.target.position).add(turned);
    }

    const shadowX = planet ? Math.round(x / 24) * 24 : 0;
    const shadowZ = planet ? Math.round(z / 24) * 24 : 0;
    const elevation = weather?.elevation ?? 1;
    const azimuth = weather?.azimuth ?? 0;
    if (!changed && sunElevation === elevation && sunAzimuth === azimuth && sun.target.position.x === shadowX &&
        sun.target.position.z === shadowZ) return false;
    sun.target.position.set(shadowX, 0, shadowZ);
    sunElevation = elevation;
    sunAzimuth = azimuth;
    sunOffset(profile, elevation, azimuth, sun.position).add(sun.target.position);
    return true;
  }

  update('arena', false, 0, 0);
  return {
    sun,
    update,
    get exposure() { return exposure; },
    clearPlanet() {
      if (scene.background === planetSky?.texture) scene.background = null;
      if (scene.environment === planetSky?.texture) scene.environment = null;
      planetSky?.texture.dispose();
      planetSky?.coverage.dispose();
      planetSky = undefined;
      blend.uniforms.sourceSky.value = null;
      blend.mesh.visible = false;
      celestial.mesh.visible = false;
      celestial.uniforms.coverage.value = null;
      for (const light of companions) light.intensity = 0;
      currentMode = undefined;
    },
    dispose() {
      scene.background = null;
      scene.environment = null;
      planetSky?.texture.dispose();
      planetSky?.coverage.dispose();
      legacySky.dispose();
      blend.dispose();
      celestial.dispose();
      for (const light of companions) scene.remove(light, light.target);
      shadow.dispose();
      scene.remove(fill, sun, sun.target);
    },
  };
}

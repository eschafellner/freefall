import * as T from 'three';
import type { AtmosphereSettings, PlanetAtmosphereProfile } from '@freefall/shared';
import type { AtmosphereLighting } from './AtmosphereController.ts';
import { noise, smoothstep } from './noise.ts';

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
const CARRIER_FOG = { color: 0x1d2b2e, density: .009 };
const FIXED_SURFACE_FOG = { color: ARENA.fog.color, density: .0041 };

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
  color.setRGB(
    T.MathUtils.clamp(1.60475 * ar - .53108 * ag - .07367 * ab, 0, 1),
    T.MathUtils.clamp(-.10208 * ar + 1.10813 * ag - .00605 * ab, 0, 1),
    T.MathUtils.clamp(-.00327 * ar - .07276 * ag + 1.07602 * ab, 0, 1),
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
  const carrierBackground = new T.Color(0x101b1f);
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
  scene.add(fill, sun, sun.target, blend.mesh);

  let planetSky: { profile: PlanetAtmosphereProfile; texture: T.DataTexture } | undefined;
  let background: T.Color | T.DataTexture = legacySky;
  let current: AtmosphereSettings = ARENA;
  let currentMode: LightingScene | undefined;
  let currentPost = false;
  let weatherActive = false;
  let exposure = 1;
  let sunElevation = 1;
  let sunAzimuth = 0;

  function update(mode: LightingScene, post: boolean, x: number, z: number, atmosphere?: PlanetAtmosphereProfile, weather?: AtmosphereLighting): boolean {
    const planet = mode === 'surface' ? atmosphere : undefined;
    const profile = planet ?? ARENA;
    const applied = Boolean(planet && weather);
    const changed = current !== profile || currentMode !== mode || currentPost !== post || weatherActive !== applied;
    if (changed) {
      if (planet && planetSky?.profile !== planet) {
        const texture = skyTexture(hdr, planet);
        planetSky?.texture.dispose();
        planetSky = { profile: planet, texture };
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
      planetSky = undefined;
      blend.uniforms.sourceSky.value = null;
      blend.mesh.visible = false;
      currentMode = undefined;
    },
    dispose() {
      scene.background = null;
      scene.environment = null;
      planetSky?.texture.dispose();
      legacySky.dispose();
      blend.dispose();
      shadow.dispose();
      scene.remove(fill, sun, sun.target);
    },
  };
}

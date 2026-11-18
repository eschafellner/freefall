import * as T from 'three';
import { noise, smoothstep } from './noise.ts';

export const LIGHTING = {
  exposure: 1.0,
  fog: 0xb7b8ad,
  fogDensity: 0.0068,
  sun: [-79, 65, 46] as const,
  shadowExtent: 81,
} as const;

function skyTexture(hdr: boolean): T.DataTexture {
  const width = 512;
  const height = 256;
  const data = hdr ? new Uint16Array(width * height * 4) : new Uint8Array(width * height * 4);
  const encode = hdr ? T.DataUtils.toHalfFloat : (value: number) => Math.round(Math.min(1, value) * 255);
  const sun = new T.Vector3(...LIGHTING.sun).normalize();
  const horizon = new T.Color(LIGHTING.fog);
  const blue = new T.Color(0x869eac);
  const cloud = new T.Color(0xd3d4cf);
  const darker = new T.Color(0x697a84);
  const underground = new T.Color(0x5b5546);
  const color = new T.Color();
  const gray = new T.Color();
  for (let y = 0; y < height; y++) {
    const e = ((y + 0.5) / height - 0.5) * Math.PI;
    const v = Math.sin(e);
    const ring = Math.cos(e);
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const a = (u - 0.5) * Math.PI * 2;
      const directionX = Math.cos(a) * ring;
      const directionZ = Math.sin(a) * ring;
      const towardSun = Math.max(0, directionX * sun.x + v * sun.y + directionZ * sun.z);
      // Project onto a horizontal cloud deck. Clamp its projected scale close to the hazy horizon.
      const scale = 1 / Math.max(0.16, v + 0.12);
      const cx = directionX * scale;
      const cz = directionZ * scale;
      const coverage = noise(cx * 1.7, cz * 1.7, 61) * 0.58 + noise(cx * 4.3, cz * 4.3, 62) * 0.29 +
        noise(cx * 10.7, cz * 10.7, 63) * 0.10 + noise(cx * 23, cz * 23, 64) * 0.03;
      gray.copy(darker).lerp(cloud, smoothstep(0.31, 0.72, coverage));
      color.copy(blue).lerp(gray, smoothstep(0.24, 0.43, coverage));
      color.lerp(horizon, 1 - smoothstep(0, 0.32, v));
      if (v < 0) color.lerp(underground, smoothstep(0, 0.35, -v));
      const scattering = Math.pow(towardSun, 54) * (0.13 + 0.6 * (1 - coverage));
      color.r += scattering;
      color.g += scattering * 0.88;
      color.b += scattering * 0.68;
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

export function createLighting(scene: T.Scene, hdr: boolean) {
  const sky = skyTexture(hdr);
  scene.background = sky;
  scene.environment = hdr ? sky : null;
  scene.environmentIntensity = 0.42;
  scene.fog = new T.FogExp2(LIGHTING.fog, LIGHTING.fogDensity);
  scene.add(new T.HemisphereLight(0xcfdeeb, 0x8f7c62, 1.26));

  const sun = new T.DirectionalLight(0xffedda, 1.72);
  sun.position.set(...LIGHTING.sun);
  const shadow = sun.shadow;
  shadow.camera.left = shadow.camera.bottom = -LIGHTING.shadowExtent;
  shadow.camera.right = shadow.camera.top = LIGHTING.shadowExtent;
  shadow.camera.near = 1;
  shadow.camera.far = 244;
  shadow.camera.updateProjectionMatrix();
  shadow.bias = -0.00035;
  shadow.normalBias = 0.075;
  shadow.radius = 2.6;
  shadow.autoUpdate = false;
  scene.add(sun, sun.target);

  return { sun, sky };
}

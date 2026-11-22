import * as T from 'three';

/** Direction from the carrier towards its star. The rear panorama window of the mess looks straight at it. */
export const CARRIER_SUN = new T.Vector3(.25, .35, 1).normalize();
/** Dev' Ault below the starboard hull: visible from the starboard rooms, the rear window and the hangar. */
export const CARRIER_PLANET = { position: new T.Vector3(268, -138, 112), radius: 218 } as const;

const NOISE = /* glsl */ `
  float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3. - 2. * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = .5, s = 0.;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; }
    return s;
  }
`;

interface BodyLook {
  ocean: number; land: number; shore: number; high: number; ice: number; night: number; atmosphere: number;
  sea: number; clouds: number; cities: number; scale: number;
}

function body(radius: number, look: BodyLook, uniforms: { time: T.IUniform<number> }): T.Mesh {
  const material = new T.ShaderMaterial({
    uniforms: {
      time: uniforms.time, sunDir: { value: CARRIER_SUN },
      oceanColor: { value: new T.Color(look.ocean) }, landColor: { value: new T.Color(look.land) },
      shoreColor: { value: new T.Color(look.shore) }, highColor: { value: new T.Color(look.high) },
      iceColor: { value: new T.Color(look.ice) }, nightColor: { value: new T.Color(look.night) },
      airColor: { value: new T.Color(look.atmosphere) },
      seaLevel: { value: look.sea }, cloudAmount: { value: look.clouds }, cityAmount: { value: look.cities }, scale: { value: look.scale },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vNormal; varying vec3 vWorld;
      void main() {
        vLocal = normalize(position);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time, seaLevel, cloudAmount, cityAmount, scale;
      uniform vec3 sunDir, oceanColor, landColor, shoreColor, highColor, iceColor, nightColor, airColor;
      varying vec3 vLocal; varying vec3 vNormal; varying vec3 vWorld;
      ${NOISE}
      void main() {
        vec3 p = vLocal * scale;
        float warp = fbm(p * .7 + 4.);
        float height = fbm(p + warp * 1.3);
        float lat = abs(vLocal.y);
        float land = smoothstep(seaLevel - .012, seaLevel + .012, height);
        vec3 ground = mix(shoreColor, landColor, smoothstep(seaLevel, seaLevel + .07, height));
        ground = mix(ground, highColor, smoothstep(seaLevel + .1, seaLevel + .22, height));
        float craters = smoothstep(.62, .7, noise(p * 6.)) * (1. - step(0., seaLevel));
        vec3 deep = oceanColor * (.55 + .7 * smoothstep(seaLevel - .25, seaLevel, height));
        vec3 albedo = mix(deep, ground, land) * (1. - craters * .25);
        albedo = mix(albedo, iceColor, smoothstep(.72, .86, lat + (height - .5) * .35));
        vec3 drift = vec3(time * .006, 0., time * .002);
        float cloud = smoothstep(.5, .78, fbm(p * 1.8 + drift + warp)) * cloudAmount;
        albedo = mix(albedo, vec3(.93, .95, .97), cloud);

        vec3 n = normalize(vNormal);
        vec3 view = normalize(cameraPosition - vWorld);
        float ndl = dot(n, sunDir);
        float day = smoothstep(-.08, .22, ndl);
        float lambert = max(ndl, 0.);
        vec3 terminator = vec3(1., .46, .22) * smoothstep(.18, 0., abs(ndl - .03)) * .55;
        vec3 color = albedo * (lambert * 2.3 + .012) + albedo * terminator * (1. - land * .3);
        vec3 h = normalize(view + sunDir);
        color += vec3(1., .93, .8) * pow(max(dot(n, h), 0.), 90.) * (1. - land) * (1. - cloud) * day * 1.6;
        float city = smoothstep(.8, .95, noise(p * 160.)) * smoothstep(.5, .75, noise(p * 9. + 3.)) * land * (1. - cloud);
        color += nightColor * city * cityAmount * (1. - day) * 1.8;
        float fresnel = pow(1. - max(dot(n, view), 0.), 2.6);
        color += airColor * fresnel * (smoothstep(-.25, .5, ndl) * 1.8 + .04);
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new T.Mesh(new T.SphereGeometry(radius, 96, 64), material);
}

/** Thin glowing shell outside the limb; the strength follows the closest approach of each view ray. */
function atmosphere(radius: number, color: number, center: T.Vector3): T.Mesh {
  const outer = radius * 1.055;
  const material = new T.ShaderMaterial({
    uniforms: { center: { value: center }, inner: { value: radius }, outer: { value: outer }, sunDir: { value: CARRIER_SUN },
      color: { value: new T.Color(color) } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() { vec4 world = modelMatrix * vec4(position, 1.); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 center, sunDir, color; uniform float inner, outer;
      varying vec3 vWorld;
      void main() {
        vec3 ray = normalize(vWorld - cameraPosition);
        vec3 toCenter = center - cameraPosition;
        vec3 closest = cameraPosition + ray * dot(toCenter, ray);
        float d = length(closest - center);
        float glow = pow(clamp((outer - d) / (outer - inner), 0., 1.), 2.2);
        float lit = dot(normalize(closest - center), sunDir);
        vec3 tint = mix(vec3(1., .52, .26), color, smoothstep(-.05, .35, lit));
        gl_FragColor = vec4(tint * glow * (smoothstep(-.35, .45, lit) * 2.6 + .05), 1.);
      }`,
    side: T.BackSide, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(outer, 96, 48), material);
  mesh.position.copy(center);
  return mesh;
}

function glowTexture(stops: [number, string][]): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export const glow = (stops: [number, string][], color = 0xffffff, opacity = 1) => new T.SpriteMaterial({
  map: glowTexture(stops), color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, fog: false,
});

function nebulaTexture(): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#000';
  context.fillRect(0, 0, 1024, 512);
  let seed = 0x51f3;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
  context.globalCompositeOperation = 'lighter';
  // A galactic band across the sky, coloured clouds along it.
  for (let i = 0; i < 260; i++) {
    const x = random() * 1024;
    const band = Math.sin(x / 1024 * Math.PI * 2) * 70 + 230;
    const y = band + (random() - .5) * (random() < .7 ? 90 : 260);
    const r = 20 + random() ** 2 * 110;
    const hue = random() < .5 ? 190 + random() * 30 : random() < .6 ? 280 + random() * 40 : 20 + random() * 20;
    const gradient = context.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `hsla(${hue}, 70%, 55%, ${.025 + random() * .05})`);
    gradient.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    context.fillStyle = gradient;
    context.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function stars(count: number, radius: number): T.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  let seed = 0x2c1b;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
  const color = new T.Color();
  for (let i = 0; i < count; i++) {
    let x = random() * 2 - 1, y = random() * 2 - 1, z = random() * 2 - 1;
    // Two thirds of the stars crowd into the galactic band (a tilted great circle).
    if (i % 3) y = y * .16 + x * .32;
    const length = Math.hypot(x, y, z) || 1;
    positions.set([x / length * radius, y / length * radius, z / length * radius], i * 3);
    const temperature = random();
    color.setHSL(temperature < .2 ? .07 : temperature < .55 ? .6 : .12, temperature < .55 ? .55 : .2, .75 + random() * .25);
    colors.set([color.r, color.g, color.b], i * 3);
    sizes[i] = random() < .03 ? 3.4 + random() * 2 : 1 + random() ** 3 * 2.2;
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new T.BufferAttribute(sizes, 1));
  const material = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size; varying vec3 vColor; uniform float time, pixelRatio;
      void main() {
        vColor = color * (.75 + .25 * sin(time * (1.3 + fract(position.x * .13) * 2.) + position.z));
        gl_PointSize = size * pixelRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - .5);
        gl_FragColor = vec4(vColor * smoothstep(.5, .05, d) * 1.6, 1.);
      }`,
    vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
  });
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/** Everything outside the hull: stars, nebula, Dev' Ault with atmosphere, its moon and the system's star. */
export class CarrierSpace {
  readonly root = new T.Group();
  private readonly time = { value: 0 };
  private readonly stars: T.Points;
  private readonly planet: T.Mesh;
  private readonly moon: T.Mesh;
  private readonly navigation: T.Sprite[] = [];

  constructor() {
    const sky = new T.Mesh(new T.SphereGeometry(415, 48, 24),
      new T.MeshBasicMaterial({ map: nebulaTexture(), side: T.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    sky.rotation.set(.3, 0, .45);
    sky.renderOrder = -10;
    this.stars = stars(3800, 400);
    this.stars.rotation.copy(sky.rotation);
    this.stars.renderOrder = -9;

    const { position, radius } = CARRIER_PLANET;
    this.planet = body(radius, { ocean: 0x0b3550, land: 0x4f6a3a, shore: 0x8c8a5c, high: 0x6b5a48, ice: 0xdfe8ef,
      night: 0xffa04a, atmosphere: 0x4fa6ff, sea: .5, clouds: 1, cities: .8, scale: 2.6 }, { time: this.time });
    this.planet.position.copy(position);
    this.planet.rotation.set(.35, 0, .2);
    const air = atmosphere(radius, 0x5cb0ff, position);

    this.moon = body(19, { ocean: 0x4a4a4c, land: 0x8d8a86, shore: 0x77736f, high: 0xb4afa8, ice: 0xc8c6c2,
      night: 0x000000, atmosphere: 0x000000, sea: -1, clouds: 0, cities: 0, scale: 3.4 }, { time: this.time });
    this.moon.position.set(-330, 46, -70);

    const sun = new T.Sprite(glow([[0, 'rgba(255,255,255,1)'], [.06, 'rgba(255,246,226,1)'], [.16, 'rgba(255,214,160,.45)'],
      [.45, 'rgba(255,170,110,.09)'], [1, 'rgba(0,0,0,0)']], 0xffffff, 1));
    sun.position.copy(CARRIER_SUN).multiplyScalar(380);
    sun.scale.setScalar(150);
    sun.renderOrder = -8;

    this.root.add(sky, this.stars, this.planet, air, this.moon, sun);
    // Distant escorts: navigation lamps far out in formation with the carrier.
    const lamp = glow([[0, 'rgba(255,255,255,1)'], [.2, 'rgba(255,255,255,.5)'], [1, 'rgba(0,0,0,0)']]);
    for (const [x, y, z, tint] of [[-150, 22, -210, 0xff4d3a], [-160, 18, -230, 0x5cff9c], [190, 40, -260, 0xffffff],
      [-90, -30, 260, 0xff4d3a], [120, 70, 300, 0x9fd0ff]] as const) {
      const sprite = new T.Sprite(lamp.clone());
      sprite.material.color.setHex(tint);
      sprite.position.set(x, y, z);
      sprite.scale.setScalar(4.5);
      this.navigation.push(sprite);
      this.root.add(sprite);
    }
    this.root.traverse((object) => { object.frustumCulled = object instanceof T.Points ? false : object.frustumCulled; });
  }

  update(now: number, pixelRatio: number): void {
    const seconds = now / 1000;
    this.time.value = seconds;
    (this.stars.material as T.ShaderMaterial).uniforms.pixelRatio.value = pixelRatio;
    (this.stars.material as T.ShaderMaterial).uniforms.time.value = seconds;
    this.planet.rotation.y = seconds * .004;
    this.moon.rotation.y = seconds * .01;
    this.navigation.forEach((sprite, i) => {
      sprite.material.opacity = (seconds * .7 + i * .37) % 1.3 < .12 ? 1 : .08;
    });
  }
}

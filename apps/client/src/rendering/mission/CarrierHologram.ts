import * as T from 'three';
import { glow } from './CarrierSpace.ts';

const TEAL = new T.Color(0x52f0dc);
const ALERT = new T.Color(0xff6a2c);

function mapTexture(): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(1024, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 1024; x++) {
    const i = (y * 1024 + x) * 4;
    const u = x * Math.PI / 512;
    const v = y * Math.PI / 512;
    const ridge = Math.sin(3 * u + Math.cos(9 * v)) + .51 * Math.sin(7 * u - 13 * v) +
      .35 * Math.cos(29 * u + 19 * v) + .18 * Math.sin(71 * u + 93 * v);
    const land = Math.max(0, Math.min(1, (ridge - .15) * 2.4));
    const coast = Math.max(0, 1 - Math.abs(ridge - .15) * 9);
    const contour = Math.abs(((ridge * 4) % 1 + 1) % 1 - .5) < .04 ? .5 * land : 0;
    const cap = Math.abs(Math.cos(v)) ** 30;
    // R: land mass, G: coastline and contour lines, B: polar caps.
    pixels.data[i] = land * 255;
    pixels.data[i + 1] = Math.min(255, (coast + contour) * 255);
    pixels.data[i + 2] = cap * 255;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = T.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function panelTexture(title: string, lines: string[]): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.strokeStyle = 'rgba(120,255,235,.9)';
  context.lineWidth = 3;
  context.strokeRect(6, 6, 500, 244);
  context.fillStyle = 'rgba(80,240,220,.12)';
  context.fillRect(6, 6, 500, 244);
  context.fillStyle = 'rgba(160,255,240,1)';
  context.fillRect(6, 6, 500, 44);
  context.fillStyle = '#04201d';
  context.font = '700 30px monospace';
  context.fillText(title, 20, 39, 470);
  context.fillStyle = 'rgba(170,255,240,.95)';
  context.font = '600 25px monospace';
  lines.forEach((line, i) => context.fillText(line, 22, 92 + i * 38, 470));
  for (let i = 0; i < 18; i++) context.fillRect(330 + i * 9, 230 - (i * 37 % 60), 5, i * 37 % 60);
  return new T.CanvasTexture(canvas);
}

const additive = (color: T.ColorRepresentation, opacity: number, side: T.Side = T.FrontSide) => new T.MeshBasicMaterial({
  color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side, fog: false, toneMapped: false,
});

/**
 * Projection of Dev' Ault above the mission console: scanned globe with coastlines, atmosphere halo, landing zone,
 * orbit lanes with the carrier and the Albatross, data panels, a projector beam with rising motes and a real light.
 */
export class CarrierHologram {
  readonly root = new T.Group();
  readonly light = new T.PointLight(TEAL, 16, 15, 1.6);
  private readonly extras = new T.Group();
  private readonly globe = new T.Group();
  private readonly orbits: T.Group[] = [];
  private readonly panels: T.Group;
  private readonly shader: T.ShaderMaterial;
  private readonly beam: T.ShaderMaterial;
  private readonly motes: T.ShaderMaterial;
  private readonly tinted: (T.MeshBasicMaterial | T.SpriteMaterial)[] = [];
  private readonly halo: T.Sprite;
  private readonly zone: T.Group;
  private readonly color = new T.Color();

  constructor() {
    const height = 2.48;
    this.shader = new T.ShaderMaterial({
      uniforms: { map: { value: mapTexture() }, time: { value: 0 }, tint: { value: TEAL.clone() } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; varying float vHeight;
        void main() {
          vUv = uv;
          vec4 view = modelViewMatrix * vec4(position, 1.);
          vView = -view.xyz;
          vNormal = normalize(normalMatrix * normal);
          vHeight = (modelMatrix * vec4(position, 1.)).y;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float time; uniform vec3 tint;
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; varying float vHeight;
        void main() {
          vec3 data = texture2D(map, vUv).rgb;
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float rim = pow(1. - facing, 2.2);
          vec2 grid = abs(fract(vUv * vec2(24., 12.)) - .5);
          float lines = smoothstep(.47, .5, max(grid.x, grid.y)) * .35;
          float scan = .65 + .35 * sin(vHeight * 140. - time * 9.);
          float sweep = smoothstep(.06, 0., abs(fract(vHeight * .45 - time * .22) - .5)) * 1.4;
          float flicker = .92 + .08 * sin(time * 47.) * sin(time * 13.);
          vec3 color = tint * (.03 + data.r * .3 * scan + data.g * 1.1 + data.b * .45 + lines * .6 + rim * .9 + sweep * (.15 + .5 * data.r));
          gl_FragColor = vec4(color * flicker * (.35 + .65 * (1. - facing * .6)), 1.);
        }`,
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
    });
    const sphere = new T.Mesh(new T.SphereGeometry(1.07, 64, 40), this.shader);
    this.globe.add(sphere);
    // Landing zone on the surface: pulsing ring and marker spike, turning with the globe.
    this.zone = new T.Group();
    const zoneMaterial = additive(ALERT, .95, T.DoubleSide);
    const ring = new T.Mesh(new T.RingGeometry(.07, .1, 32), zoneMaterial);
    const spike = new T.Mesh(new T.CylinderGeometry(.006, .006, .55, 6), zoneMaterial);
    spike.rotation.x = Math.PI / 2;
    spike.position.z = .27;
    this.zone.add(ring, spike);
    this.zone.position.setFromSphericalCoords(1.075, 1.05, .6);
    this.zone.lookAt(new T.Vector3().copy(this.zone.position).multiplyScalar(2));
    this.globe.add(this.zone);
    this.globe.position.y = height;
    this.globe.rotation.z = .24;

    this.halo = new T.Sprite(glow([[0, 'rgba(255,255,255,.55)'], [.3, 'rgba(255,255,255,.22)'], [.6, 'rgba(255,255,255,.06)'], [1, 'rgba(0,0,0,0)']], TEAL.getHex(), .9));
    this.halo.position.y = height;
    this.halo.scale.setScalar(4.4);
    this.tinted.push(this.halo.material);

    // Orbit lanes with the carrier (bright) and the Albatross drop corridor.
    for (const [radius, tilt, speed, count] of [[1.5, .38, .25, 1], [1.78, -.22, -.12, 3], [2.05, .1, .07, 2]] as const) {
      const lane = new T.Group();
      const material = additive(TEAL, .5);
      this.tinted.push(material);
      const torus = new T.Mesh(new T.TorusGeometry(radius, .006, 4, 128), material);
      torus.rotation.x = Math.PI / 2;
      lane.add(torus);
      for (let i = 0; i < count; i++) {
        const blip = new T.Sprite(glow([[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,255,255,.6)'], [1, 'rgba(0,0,0,0)']], i ? TEAL.getHex() : 0xffffff));
        const angle = i / count * Math.PI * 2;
        blip.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        blip.scale.setScalar(i ? .12 : .22);
        lane.add(blip);
      }
      lane.position.y = height;
      lane.rotation.set(tilt, 0, tilt * .6);
      lane.userData.speed = speed;
      this.orbits.push(lane);
      this.extras.add(lane);
    }
    // Floor rings of the projector (were the original reticle).
    for (const radius of [1.25, 1.43, 1.62]) {
      const material = additive(0xa3faec, .45);
      this.tinted.push(material);
      const ring = new T.Mesh(new T.TorusGeometry(radius, .011, 5, 96), material);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.18 + (radius - 1.25) * .08;
      this.orbits.push(Object.assign(new T.Group().add(ring), { userData: { speed: radius === 1.43 ? -.3 : .15 } }));
      this.root.add(this.orbits.at(-1)!);
    }

    // Projector beam: a soft cone from the emitter in the table to the globe.
    this.beam = new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, tint: { value: TEAL.clone() } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
        void main() {
          vUv = uv; vec4 view = modelViewMatrix * vec4(position, 1.);
          vView = -view.xyz; vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        uniform float time; uniform vec3 tint; varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
        void main() {
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float fall = pow(1. - vUv.y, 1.4);
          float streak = .7 + .3 * sin(vUv.x * 80. + time * 2.) * sin(vUv.x * 31. - time * 1.3);
          gl_FragColor = vec4(tint * facing * facing * fall * streak * .3, 1.);
        }`,
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
    });
    const cone = new T.Mesh(new T.CylinderGeometry(1.05, .34, 1.35, 48, 1, true), this.beam);
    cone.position.y = 1.8;
    // Rising motes inside the beam.
    const count = 220;
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) seeds.set([Math.random() * Math.PI * 2, Math.sqrt(Math.random()), Math.random()], i * 3);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(seeds, 3));
    this.motes = new T.ShaderMaterial({
      uniforms: { time: { value: 0 }, tint: { value: TEAL.clone() }, pixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float time, pixelRatio; varying float vFade;
        void main() {
          float t = fract(position.z + time * (.12 + position.z * .08));
          float radius = position.y * mix(.32, 1.05, t);
          vec3 p = vec3(cos(position.x + t * 2.) * radius, 1.12 + t * 1.9, sin(position.x + t * 2.) * radius);
          vFade = sin(t * 3.14159);
          vec4 view = modelViewMatrix * vec4(p, 1.);
          gl_PointSize = (2. + 3. * position.z) * pixelRatio * 4. / -view.z;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 tint; varying float vFade;
        void main() { float d = length(gl_PointCoord - .5); gl_FragColor = vec4(tint * smoothstep(.5, 0., d) * vFade * 1.6, 1.); }`,
      transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    });
    const motes = new T.Points(geometry, this.motes);
    motes.frustumCulled = false;
    this.extras.add(motes);

    // Floating mission panels around the globe.
    this.panels = new T.Group();
    this.panels.position.y = height + .1;
    const texts: [string, string[]][] = [
      ["DEV' AULT", ['ORBIT     412 KM', 'SCHWERKRAFT 1,08 G', 'ATMOSPHÄRE ATEMBAR']],
      ['OP. BODENBRUCH', ['LANDEZONE  ALPHA-3', 'SCHWARMAKTIVITÄT HOCH', 'RELAIS     OFFLINE']],
      ['ALBATROSS 02', ['STATUS    ANGEDOCKT', 'FALLZEIT  ~20 S', 'HÜLLE     100 %']],
    ];
    texts.forEach(([title, lines], i) => {
      const material = new T.MeshBasicMaterial({ map: panelTexture(title, lines), transparent: true, opacity: .85,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false, toneMapped: false });
      const panel = new T.Mesh(new T.PlaneGeometry(1.1, .55), material);
      const angle = i / texts.length * Math.PI * 2;
      panel.position.set(Math.sin(angle) * 2.45, (i - 1) * .22, Math.cos(angle) * 2.45);
      panel.rotation.y = angle;
      this.panels.add(panel);
    });
    this.extras.add(this.panels);

    const pool = new T.Mesh(new T.CircleGeometry(3.6, 48), additive(TEAL, .5));
    (pool.material as T.MeshBasicMaterial).map = glow([[0, 'rgba(255,255,255,.5)'], [.5, 'rgba(255,255,255,.12)'], [1, 'rgba(0,0,0,0)']]).map;
    this.tinted.push(pool.material as T.MeshBasicMaterial);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = .02;
    this.light.position.y = height;
    this.root.add(this.globe, this.halo, cone, this.extras, pool, this.light);
  }

  /** `alert` turns the projection orange while the drop alarm runs; `low` drops the optional layers. */
  update(now: number, alert: number, low: boolean, pixelRatio: number): void {
    const seconds = now / 1000;
    this.extras.visible = !low;
    this.color.copy(TEAL).lerp(ALERT, alert);
    for (const uniform of [this.shader.uniforms.tint, this.beam.uniforms.tint, this.motes.uniforms.tint]) uniform.value.copy(this.color);
    for (const material of this.tinted) material.color.copy(this.color);
    this.light.color.copy(this.color);
    this.shader.uniforms.time.value = this.beam.uniforms.time.value = this.motes.uniforms.time.value = seconds;
    this.motes.uniforms.pixelRatio.value = pixelRatio;
    this.globe.rotation.y = seconds * .2;
    this.globe.position.y = 2.46 + Math.sin(seconds * 1.3) * .05;
    this.halo.position.y = this.globe.position.y;
    const pulse = .5 + .5 * Math.sin(seconds * 4.2);
    this.zone.scale.setScalar(.8 + pulse * .6);
    this.halo.material.opacity = .32 + .08 * Math.sin(seconds * 2.1) + alert * .15 * pulse;
    this.light.intensity = 14 + 3 * Math.sin(seconds * 2.1) + Math.sin(seconds * 31) * .6 + alert * 8 * pulse;
    for (const lane of this.orbits) lane.rotation.y = seconds * lane.userData.speed;
    this.panels.rotation.y = -seconds * .09;
  }
}

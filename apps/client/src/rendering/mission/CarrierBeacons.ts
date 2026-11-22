import * as T from 'three';
import type { AlarmLevel } from '../../audio/CarrierAlarm.ts';
import { glow } from './CarrierSpace.ts';


const AMBER = new T.Color(0xffa21f);
const RED = new T.Color(0xff1e0e);

export interface BeaconMount {
  position: [number, number, number];
  /** Wall-mounted lamps sit on a bracket; their beams still sweep a full circle. */
  hanging?: boolean;
  /** One real spot light per lamp is expensive; only the lamps at the airlock carry one. */
  light?: boolean;
}

/**
 * Rotating warning lamps: a dome with a mirrored reflector, two opposed light cones that sweep the room and, on
 * selected lamps, a real spot light that follows the reflector.
 */
export class CarrierBeacons {
  readonly root = new T.Group();
  private readonly spinners: T.Group[] = [];
  private readonly spots: T.SpotLight[] = [];
  private readonly dome = new T.MeshStandardMaterial({ color: 0x3a0a05, emissive: RED, emissiveIntensity: 0, roughness: .2,
    transparent: true, opacity: .82 });
  private readonly beam: T.ShaderMaterial;
  private readonly flare: T.SpriteMaterial;
  private readonly color = new T.Color();
  private readonly mirror: T.MeshStandardMaterial;
  private angle = 0;
  private last = 0;
  private level: AlarmLevel = 0;
  private strength = 0;

  constructor(mounts: readonly BeaconMount[]) {
    const housing = new T.MeshStandardMaterial({ color: 0x1d2120, roughness: .5, metalness: .7 });
    const mirror = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0, roughness: .1, metalness: 1 });
    this.beam = new T.ShaderMaterial({
      uniforms: { tint: { value: RED.clone() }, strength: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
        void main() {
          vUv = uv; vec4 view = modelViewMatrix * vec4(position, 1.);
          vView = -view.xyz; vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 tint; uniform float strength; varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
        void main() {
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float along = pow(vUv.y, 2.2);
          gl_FragColor = vec4(tint * strength * facing * facing * along * .9, 1.);
        }`,
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
    });
    this.flare = glow([[0, 'rgba(255,255,255,1)'], [.18, 'rgba(255,255,255,.55)'], [.5, 'rgba(255,255,255,.12)'], [1, 'rgba(0,0,0,0)']], 0xff2a12, 0);
    // Cone with its apex at the lamp, opening along +x and tilted slightly down.
    const cone = new T.CylinderGeometry(.09, 1.9, 8, 28, 1, true);
    cone.translate(0, -4, 0);
    cone.rotateZ(Math.PI / 2);
    const base = new T.CylinderGeometry(.2, .23, .16, 20);
    const cap = new T.SphereGeometry(.19, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const reflector = new T.BoxGeometry(.03, .2, .2);
    const bracket = new T.BoxGeometry(.08, .08, .34);

    for (const { position, hanging, light } of mounts) {
      const lamp = new T.Group();
      lamp.position.set(...position);
      const flip = hanging ? -1 : 1;
      const foot = new T.Mesh(base, housing);
      foot.position.y = -.08 * flip;
      const dome = new T.Mesh(cap, this.dome);
      dome.scale.y = 1.25;
      if (hanging) dome.rotation.x = Math.PI;
      if (!hanging) {
        const arm = new T.Mesh(bracket, housing);
        arm.position.set(0, -.12, -.17);
        lamp.add(arm);
      }
      const spinner = new T.Group();
      spinner.position.y = .1 * flip;
      for (const side of [0, Math.PI]) {
        const blade = new T.Group();
        blade.rotation.y = side;
        const mirrorMesh = new T.Mesh(reflector, mirror);
        mirrorMesh.position.x = -.05;
        const ray = new T.Mesh(cone, this.beam);
        ray.rotation.z = -.16;
        blade.add(mirrorMesh, ray);
        spinner.add(blade);
      }
      if (light) {
        const spot = new T.SpotLight(RED, 0, 26, .42, .55, 1.4);
        spot.target.position.set(4, -.7, 0);
        spinner.add(spot, spot.target);
        this.spots.push(spot);
      }
      const flare = new T.Sprite(this.flare);
      flare.scale.setScalar(1.6);
      flare.position.y = .1 * flip;
      lamp.add(foot, dome, spinner, flare);
      this.spinners.push(spinner);
      this.root.add(lamp);
    }
    this.mirror = mirror;
  }

  get alarm(): AlarmLevel { return this.level; }

  /** Spins up and lights the lamps for the requested level; returns the current lamp strength (0–1). */
  update(now: number, level: AlarmLevel, low: boolean): number {
    const dt = Math.min(.1, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    this.level = level;
    // Lamps fade up over a quarter second and run down like a motor when switched off.
    this.strength += ((level ? 1 : 0) - this.strength) * Math.min(1, dt * (level ? 7 : 2.5));
    const speed = level === 2 ? 7.2 : level === 1 ? 3.6 : 3.6 * this.strength;
    this.angle = (this.angle + speed * dt) % (Math.PI * 2);
    this.color.copy(level === 1 ? AMBER : RED);
    this.spinners.forEach((spinner, i) => { spinner.rotation.y = this.angle + i * 1.3; });
    const s = this.strength;
    this.beam.uniforms.tint.value.copy(this.color);
    this.beam.uniforms.strength.value = s * (low ? .7 : 1);
    this.dome.emissive.copy(this.color);
    this.dome.emissiveIntensity = .15 + s * 3.2;
    this.mirror.emissive.copy(this.color);
    this.mirror.emissiveIntensity = s * 2;
    this.flare.color.copy(this.color);
    // The flare brightens whenever a reflector faces the viewer side; a cheap stand-in for the strobing glint.
    this.flare.opacity = s * (.55 + .45 * Math.abs(Math.cos(this.angle)));
    for (const spot of this.spots) {
      spot.visible = !low;
      spot.color.copy(this.color);
      spot.intensity = s * (level === 2 ? 95 : 60);
    }
    return s;
  }
}

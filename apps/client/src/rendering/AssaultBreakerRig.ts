import { ATTACK_CHARGE } from '@freefall/shared';
import { ASSAULT_HEAD_PIVOT, ASSAULT_JAW_PIVOT, ASSAULT_LEGS, ASSAULT_TAIL_PIVOT } from './AssaultBreakerModel.ts';
import type { Vec3 } from './SwarmOrganism.ts';
import { ROLE } from './WarriorKit.ts';
import { attackPhase } from './WarriorAttack.ts';
import type { AttackSample } from './WarriorAttack.ts';
import type { PoseContext, WarriorPose } from './WarriorVisualLOD.ts';

/*
 * Animation rig of the Assaultbreaker. The instance matrix only places and turns the body; everything else happens in
 * model space in the vertex shader, so the feet can stay planted while the body heaves, pitches and lunges:
 *
 * - legs: two-bone IK (hip, knee, ankle) in the sagittal plane plus a foot that stays level in stance. Each leg runs a
 *   stance/swing cycle; the stance stroke matches the ground covered, so planted feet do not slide. A lateral-sequence
 *   walk blends into a rotary gallop with speed (longer cycle, shorter ground contact, higher swing);
 * - body: pitch and roll about the centre of mass, heave, surge, a counter-rolling spine and breathing flanks;
 * - head (with the crest) pitches and turns about the neck, the jaw opens, the tail bends progressively and sways.
 *
 * Instance attributes: motion (gait phase, moving 0…1, clock offset, dead), action (hit flash, paw, head pitch, jaw),
 * body (pitch, roll, heave incl. crouch, surge) and gait (gallop 0…1, brace 0…1, tail raise, head yaw). Fallen bodies
 * have none of them (defaults 0, 0, 0, 1: dead) and fold their legs. Vertex attributes: limb (role, −1 fore / +1 hind
 * leg, bone coordinate, side). No \`pivot\` and no instance colour: the rig stays well inside 16 vertex attributes.
 */

/** Metres per gait cycle and ground-contact fraction of each foot: heavy walk and charging gallop. */
export const ASSAULT_GAIT = { walkCycle: 2.3, walkDuty: .62, runCycle: 5.4, runDuty: .3, walkLift: .32, runLift: .48 } as const;
/** Gallop blend from ground speed (m/s): walking pace up to 5 m/s, a full gallop from 11 m/s (charge 15 m/s). */
export const assaultGallop = (speed: number) => smooth01((speed - 5) / 6);
export const assaultCycle = (speed: number) => mix(ASSAULT_GAIT.walkCycle, ASSAULT_GAIT.runCycle, assaultGallop(speed));

function smooth01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = smooth01;

const glslVec = (p: Vec3) => `vec3(${p.map((v) => v.toFixed(4)).join(', ')})`;
const [FORE, HIND] = ASSAULT_LEGS;
/** Centre of mass: the body pitches and rolls about it. */
const CENTRE: Vec3 = [0, 1.75, .1];

/**
 * GLSL (declarations and `abPose`) inserted after `#include <common>`. `abPose(p, n, breath)` deforms a bind-pose
 * position and normal; `breath` is the vertex's breathing weight (tissue.x).
 */
export const ASSAULT_RIG_GLSL = `
  attribute vec4 limb;
  attribute vec4 motion;
  attribute vec4 action;
  attribute vec4 body;
  attribute vec4 gait;
  uniform float warriorClock;
  mat3 abRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 abRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 abRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
  // Body: pitch about the centre of mass, roll with a counter-rolling spine (shoulders against hips), heave and surge.
  void abBody(inout vec3 p, inout vec3 n, float twist, float live) {
    const vec3 centre = ${glslVec(CENTRE)};
    float k = clamp((p.z - centre.z) / 1.6, -1.0, 1.0);
    mat3 r = abRotX(body.x * live) * abRotZ((body.y + twist * k) * live);
    p = centre + r * (p - centre) + vec3(0.0, body.z * live, -body.w * live);
    n = r * n;
  }
  void abLeg(inout vec3 p, inout vec3 n, float twist, float live) {
    float side = limb.w;
    bool fore = limb.y < 0.0;
    vec3 mirrorX = vec3(side, 1.0, 1.0);
    vec3 hip = (fore ? ${glslVec(FORE[0])} : ${glslVec(HIND[0])}) * mirrorX;
    vec3 knee = (fore ? ${glslVec(FORE[1])} : ${glslVec(HIND[1])}) * mirrorX;
    vec3 ankle = (fore ? ${glslVec(FORE[2])} : ${glslVec(HIND[2])}) * mirrorX;
    float gallop = gait.x * live, moving = motion.y * live;
    // Lateral-sequence walk (LH, LF, RH, RF a quarter apart) blending into a rotary gallop (hinds, then fores).
    float walkOffset = fore ? (side < 0.0 ? .25 : .75) : (side < 0.0 ? 0.0 : .5);
    float runOffset = fore ? (side < 0.0 ? .62 : .5) : (side < 0.0 ? 0.0 : .1);
    float phase = fract(motion.x / 6.2831853 + mix(walkOffset, runOffset, gallop));
    float duty = mix(${ASSAULT_GAIT.walkDuty.toFixed(3)}, ${ASSAULT_GAIT.runDuty.toFixed(3)}, gallop);
    // Stance stroke = ground covered while the foot is down, at any speed: planted feet do not slide. Only the first
    // shuffling steps from a standstill are shorter.
    float stroke = duty * mix(${ASSAULT_GAIT.walkCycle.toFixed(3)}, ${ASSAULT_GAIT.runCycle.toFixed(3)}, gallop) * .5 * smoothstep(0.0, .35, moving);
    float lift = mix(${ASSAULT_GAIT.walkLift.toFixed(3)}, ${ASSAULT_GAIT.runLift.toFixed(3)}, gallop) * min(1.0, moving * 2.0);
    vec3 foot = vec3(0.0);
    float footPitch = 0.0;
    if (phase < duty) {
      foot.z = mix(-stroke, stroke, phase / duty);
    } else {
      float u = (phase - duty) / (1.0 - duty);
      foot.z = mix(stroke, -stroke, smoothstep(0.0, 1.0, u));
      foot.y = lift * pow(sin(3.14159 * u), .8);
      // Toes drop as the foot peels off, level again for the footfall.
      footPitch = -.5 * sin(3.14159 * min(1.0, u * 1.25)) * min(1.0, moving * 2.0);
    }
    // Brace (skidding stop): fore feet planted well ahead, hind feet under the body.
    foot.z -= gait.y * live * (fore ? .6 : -.12);
    // Paw (charge windup): the right fore scrapes the ground twice.
    float paw = action.y * live;
    if (fore && side > 0.0 && paw > 0.0) {
      float s = fract(paw * 2.0);
      bool raise = s < .45;
      float u = raise ? s / .45 : (s - .45) / .55;
      vec3 scrape = raise ? vec3(0.0, .55 * sin(3.14159 * u), mix(.45, -.65, smoothstep(0.0, 1.0, u)))
        : vec3(0.0, .02, mix(-.65, .45, smoothstep(0.0, 1.0, u)));
      float w = smoothstep(0.0, .06, paw) * (1.0 - smoothstep(.94, 1.0, paw));
      foot = mix(foot, scrape, w);
      footPitch = mix(footPitch, raise ? -.45 * sin(3.14159 * u) : -.2, w);
    }
    vec3 hipN = hip, up = vec3(0.0, 1.0, 0.0);
    abBody(hipN, up, twist, live);
    vec3 target = ankle + foot;
    // Fallen: the legs fold up toward the belly.
    target = mix(target, hipN + (ankle - hip) * .45 + vec3(0.0, .2, fore ? -.45 : .45), 1.0 - live);
    // Two-bone IK in the y-z plane; angles grow with abRotX (atan(z, y)).
    vec2 u0 = knee.yz - hip.yz, l0 = ankle.yz - knee.yz, d0 = ankle.yz - hip.yz;
    float l1 = length(u0), l2 = length(l0);
    vec2 d = target.yz - hipN.yz;
    float reach = clamp(length(d), abs(l1 - l2) + .02, l1 + l2 - .003);
    float bend = sign(d0.x * u0.y - d0.y * u0.x);
    float upper = atan(d.y, d.x) + bend * acos(clamp((l1 * l1 + reach * reach - l2 * l2) / (2.0 * l1 * reach), -1.0, 1.0));
    vec2 kneeYZ = hipN.yz + l1 * vec2(cos(upper), sin(upper));
    vec2 lower = target.yz - kneeYZ;
    mat3 r1 = abRotX(upper - atan(u0.y, u0.x));
    mat3 r2 = abRotX(atan(lower.y, lower.x) - atan(l0.y, l0.x));
    mat3 rf = abRotX(footPitch * live);
    vec3 kneeN = vec3(knee.x + hipN.x - hip.x, kneeYZ);
    vec3 ankleN = kneeN + r2 * (ankle - knee);
    vec3 pb = p, nb = n;
    abBody(pb, nb, twist, live);
    float s = limb.z;
    float wHip = smoothstep(.0, .3, s), wKnee = smoothstep(.85, 1.15, s), wAnkle = smoothstep(1.86, 2.1, s);
    p = mix(mix(mix(pb, hipN + r1 * (p - hip), wHip), kneeN + r2 * (p - knee), wKnee), ankleN + rf * (p - ankle), wAnkle);
    n = normalize(mix(mix(mix(nb, r1 * n, wHip), r2 * n, wKnee), rf * n, wAnkle));
  }
  void abPose(inout vec3 p, inout vec3 n, float breath) {
    float role = limb.x, live = 1.0 - motion.w;
    float walk = motion.y * (1.0 - gait.x) * live;
    float twist = sin(motion.x) * .04 * walk;
    if (abs(role - ${ROLE.leg.toFixed(1)}) < .5) {
      abLeg(p, n, twist, live);
      return;
    }
    if (abs(role - ${ROLE.head.toFixed(1)}) < .5 || abs(role - ${ROLE.jaw.toFixed(1)}) < .5) {
      if (abs(role - ${ROLE.jaw.toFixed(1)}) < .5) {
        const vec3 jawPivot = ${glslVec(ASSAULT_JAW_PIVOT)};
        mat3 j = abRotX(-.5 * action.w);
        p = jawPivot + j * (p - jawPivot);
        n = j * n;
      }
      const vec3 headPivot = ${glslVec(ASSAULT_HEAD_PIVOT)};
      mat3 h = abRotY(gait.w * live) * abRotX(action.z - .25 * (1.0 - live));
      p = headPivot + h * (p - headPivot);
      n = h * n;
    } else if (abs(role - ${ROLE.tail.toFixed(1)}) < .5) {
      // Progressive bend: the tail curls up when raised and sways against the hips.
      const vec3 tailPivot = ${glslVec(ASSAULT_TAIL_PIVOT)};
      float t = clamp((p.z - tailPivot.z) / 2.3, 0.0, 1.0);
      float sway = (sin(motion.x + 1.9) * .16 * walk + sin(warriorClock * 1.1 + motion.z) * .06) * live;
      mat3 r = abRotY(sway * t * 1.3) * abRotX(-(gait.z * live - .2 * (1.0 - live)) * t);
      p = tailPivot + r * (p - tailPivot);
      n = r * n;
    } else {
      // Breathing flanks.
      p += n * breath * .028 * sin(warriorClock * 1.6 + motion.z) * live;
    }
    abBody(p, n, twist, live);
  }
`;

/**
 * Pose of the Assaultbreaker. Walk: two heaves per cycle, a roll toward the stance side, a nodding, swaying head;
 * gallop: a rocking-horse bound with the head low. Idle: slow looks around and breathing. The charge rears and
 * roars, scrapes the ground with a forefoot, coils with the horns levelled, gallops, tosses the head as it skids to a
 * stop and shakes it off. The gore shifts back, hooks the horns up and across with a lunge, and settles.
 */
export function assaultBreakerPose(out: WarriorPose, moving: number, gait: number, attack: AttackSample | undefined, context: PoseContext): void {
  const gallop = assaultGallop(context.speed);
  const walk = moving * (1 - gallop);
  const idle = 1 - moving;
  const { time, seed } = context;
  out.gallop = gallop;
  out.lift = -.035 * Math.cos(gait * 2) * walk + gallop * (.1 * Math.sin(gait + 2.2) + .04);
  out.pitch = .014 * Math.sin(gait * 2 + .8) * walk + gallop * .055 * Math.sin(gait + .6);
  out.roll = .03 * Math.sin(gait) * walk;
  out.surge = 0;
  out.crouch = .02 + .1 * gallop;
  out.tuck = 0;
  out.strike = .05 * Math.sin(gait * 2 + .6) * walk - .38 * gallop + .04 * Math.sin(gait + 1.4) * gallop
    + idle * .05 * Math.sin(time * .53 + seed * 3);
  out.headYaw = .045 * Math.sin(gait) * walk + idle * (.16 * Math.sin(time * .41 + seed) + .05 * Math.sin(time * 1.13 + seed * 2));
  out.jaw = .35 * gallop + idle * .25 * Math.max(0, Math.sin(time * .7 + seed * 5)) ** 12;
  out.tail = .06 + .3 * gallop;
  out.brace = 0;
  out.paw = 0;
  const state = attack && attackPhase(attack);
  if (!state) return;
  const { phase, t } = state;
  if (attack!.kind === ATTACK_CHARGE) {
    if (phase === 'windup') {
      // Rear and roar (0–0.45), scrape the ground twice (0.3–0.8), coil with the horns levelled (0.7–1).
      const roar = Math.sin(Math.PI * Math.min(1, t / .45));
      const scrape = (t - .28) / .52;
      const coil = ease((t - .68) / .32);
      out.strike = .5 * roar - .48 * ease((t - .35) / .45);
      out.pitch = .09 * roar - .05 * coil;
      out.lift = .07 * roar;
      out.jaw = Math.max(roar, .4 * coil);
      out.paw = scrape > 0 && scrape < 1 ? scrape : 0;
      // Snorting head shakes while the forefoot scrapes; the shoulders dip toward the working leg.
      out.headYaw = scrape > 0 && scrape < 1 ? .12 * Math.sin(scrape * Math.PI * 4) : 0;
      out.roll = scrape > 0 && scrape < 1 ? -.035 * Math.sin(scrape * Math.PI) : 0;
      out.crouch = .02 + .42 * coil;
      out.tail = .06 + .3 * coil;
    } else if (phase === 'flight') {
      out.strike = -.48 + .05 * Math.sin(gait * 2);
      out.jaw = .5;
      out.tail = .38;
      out.headYaw = 0;
    } else if (phase === 'active') {
      // The run ends: skid with the fore feet braced and toss the horns.
      const toss = ease(t);
      out.strike = mix(-.48, .55, toss);
      out.pitch = mix(out.pitch, .1, toss);
      out.brace = 1;
      out.jaw = 1;
      out.crouch = .22;
      out.tail = .3;
    } else {
      const back = ease(t);
      out.brace = 1 - back;
      out.strike = mix(.55, out.strike, back);
      out.headYaw = .22 * Math.sin(t * Math.PI * 4) * (1 - back);
      out.pitch = mix(.1, out.pitch, back);
      out.jaw = 1 - back;
      out.crouch = mix(.22, out.crouch, back);
      out.tail = mix(.3, out.tail, back);
    }
    return;
  }
  if (phase === 'windup') {
    // Weight back, head down and cocked to one side.
    const k = ease(t);
    out.strike = -.42 * k;
    out.crouch = .02 + .22 * k;
    out.surge = -.2 * k;
    out.pitch = -.04 * k;
    out.headYaw = .16 * k;
    out.jaw = .4 * k;
  } else if (phase === 'active') {
    // Hook up and across with a lunge.
    const k = ease(Math.min(1, t * 1.3));
    out.strike = mix(-.42, .6, k);
    out.headYaw = mix(.16, -.2, k);
    out.surge = mix(-.2, .5, k);
    out.pitch = mix(-.04, .1, k);
    out.crouch = mix(.24, .1, k);
    out.jaw = 1;
  } else if (phase === 'recovery') {
    const k = ease(t);
    out.strike = mix(.6, out.strike, k);
    out.headYaw = mix(-.2, out.headYaw, k);
    out.surge = mix(.5, 0, k);
    out.pitch = mix(.1, out.pitch, k);
    out.crouch = mix(.1, out.crouch, k);
    out.jaw = 1 - k;
  }
}

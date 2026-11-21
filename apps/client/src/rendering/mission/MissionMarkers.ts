import * as T from 'three';
import { NET, NEST_HIT_HEIGHT, clearGroundLine, distanceSquared, groundHeight, missionObjectives } from '@freefall/shared';
import type { HordeFrame, MissionDefinition, MissionSnapshot, NestSnapshot, PositionXZ } from '@freefall/shared';

interface Marker {
  node: HTMLDivElement;
  caption: HTMLSpanElement;
  icon: HTMLSpanElement;
  meter: HTMLSpanElement;
  shown: boolean;
  px?: number;
  py?: number;
  width?: number;
  arrow?: number;
  progress?: number;
}

export class MissionMarkers {
  readonly root = document.createElement('div');
  private readonly slots: Marker[] = [];
  private readonly p = new T.Vector3();
  private readonly local = new T.Vector3();
  private used = 0;
  private width = 1;
  private height = 1;

  constructor() {
    this.root.className = 'world-markers';
    this.root.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 16; i++) {
      const node = document.createElement('div');
      const icon = document.createElement('span');
      const caption = document.createElement('span');
      const meter = document.createElement('span');
      icon.className = 'marker-icon';
      meter.className = 'marker-meter';
      node.hidden = true;
      node.append(icon, caption, meter);
      this.root.append(node);
      this.slots.push({ node, caption, icon, meter, shown: false });
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  private place(camera: T.Camera, x: number, y: number, z: number, kind: string, label: string, progress: number, offscreen: boolean): void {
    const marker = this.slots[this.used];
    if (!marker) return;
    this.p.set(x, y, z);
    this.local.copy(this.p).applyMatrix4(camera.matrixWorldInverse);
    const behind = this.local.z > 0;
    this.p.project(camera);
    const blocked = behind || Math.abs(this.p.x) > .9 || Math.abs(this.p.y) > .72;
    if (blocked && !offscreen) return;
    if (behind) this.p.multiplyScalar(-1);
    if (!Number.isFinite(this.p.x) || !Number.isFinite(this.p.y)) return;
    if (blocked) {
      const scale = Math.max(Math.abs(this.p.x) / .86, Math.abs(this.p.y) / .69);
      if (scale > .05) this.p.multiplyScalar(1 / scale);
      else this.p.y = -.69;
    }
    this.used++;
    if (!marker.shown) {
      marker.shown = true;
      marker.node.hidden = false;
    }
    const px = Math.round((T.MathUtils.clamp(this.p.x, -.86, .86) * .5 + .5) * this.width);
    const py = Math.round((.5 - T.MathUtils.clamp(this.p.y, -.69, .69) * .5) * this.height);
    const classes = 'world-marker ' + kind + (blocked ? ' at-edge' : '');
    if (marker.node.className !== classes) marker.node.className = classes;
    // Percentages refer to the caption's width. Keep long labels inside narrow viewports without a layout read.
    if (marker.px !== px || marker.py !== py || marker.width !== this.width) {
      const left = `clamp(6px, calc(${px}px - 50%), calc(${this.width - 6}px - 100%))`;
      marker.node.style.transform = `translate(${left},calc(${py}px - 50%))`;
      marker.px = px;
      marker.py = py;
      marker.width = this.width;
    }
    const angle = blocked ? Math.atan2(this.p.x * this.width, this.p.y * this.height) : undefined;
    if (marker.arrow !== angle) {
      marker.icon.style.transform = angle === undefined ? '' : `rotate(${angle}rad)`;
      marker.arrow = angle;
    }
    if (marker.caption.textContent !== label) marker.caption.textContent = label;
    const fraction = progress < 0 ? -1 : T.MathUtils.clamp(progress, 0, 1);
    if (marker.progress !== fraction) {
      marker.meter.hidden = fraction < 0;
      if (fraction >= 0) marker.meter.style.setProperty('--progress', String(fraction));
      marker.progress = fraction;
    }
  }

  update(definition: MissionDefinition, state: MissionSnapshot, camera: T.Camera, position: PositionXZ, tick: number,
    horde: HordeFrame | undefined, enabled: boolean): void {
    this.used = 0;
    if (this.root.hidden === enabled) this.root.hidden = !enabled;
    if (!enabled) return;
    const base = (x: number, z: number) => groundHeight(definition.world, x, z);
    for (const objective of missionObjectives(state)) {
      const target = objective.kind === 'activate' ? objective : objective.target;
      if (!target) continue;
      const entry = state.objectives.find((item) => item.id === objective.id);
      if (entry?.state !== 'available' && entry?.state !== 'defending') continue;
      const distance = Math.round(Math.sqrt(distanceSquared(position, target)));
      const label = objective.label.replace('Kommunikationsanlage ', '');
      this.place(camera, target.x, base(target.x, target.z) + 2.7, target.z, 'objective', `${label} · ${distance} m`, -1, true);
    }
    if (state.primaryObjectivesCompleted && (state.extraction || state.albatross?.extractionAvailable)) {
      const zone = state.extraction ?? state.albatross!;
      const distance = Math.round(Math.sqrt(distanceSquared(position, zone)));
      this.place(camera, zone.x, base(zone.x, zone.z) + (state.extraction?.method === 'balloon' ? 8.5 : 4.4), zone.z, 'extraction',
        `${state.extraction?.method === 'balloon' ? 'Rettungssignal' : 'Albatross 02'} · ${distance} m`, -1, true);
    }
    const pickup = state.plan?.extraction.balloon;
    if (pickup && state.state === 'EXTRACTION_AVAILABLE') {
      const distance = Math.round(Math.sqrt(distanceSquared(position, pickup)));
      this.place(camera, pickup.x, base(pickup.x, pickup.z) + 2.6, pickup.z, 'extraction', `Ballon · ${pickup.label} · ${distance} m`, -1, true);
    }
    if (horde) {
      for (const alarm of state.alarms) {
        const index = horde.byId.get(alarm.enemyId);
        if (index === undefined) continue;
        const x = horde.x[index];
        const z = horde.z[index];
        if ((x - position.x) ** 2 + (z - position.z) ** 2 > 83 ** 2) continue;
        const progress = (tick - alarm.startedAt) / (alarm.endsAt - alarm.startedAt);
        if (progress > 1.07 || !clearGroundLine(definition.world, position.x, position.z, x, z)) continue;
        this.place(camera, x, base(x, z) + 2.1, z, 'alarm', 'Verstärkungsruf', 1 - progress, false);
      }
    }
    let markedBreach = false;
    let selectedNest: NestSnapshot | undefined;
    let bestScore = Infinity;
    for (const nest of state.nests) {
      if (nest.hp === 0 || distanceSquared(nest, position) > 90 ** 2) continue;
      if (nest.state === 'EMERGING') {
        if (!markedBreach) this.place(camera, nest.x, base(nest.x, nest.z) + 1.9, nest.z, 'alarm', 'Schwarmdurchbruch', -1, true);
        markedBreach = true;
        continue;
      }
      this.p.set(nest.x, base(nest.x, nest.z) + NEST_HIT_HEIGHT, nest.z).project(camera);
      const alignment = (this.p.x / .15) ** 2 + (this.p.y / .20) ** 2;
      const aimed = this.p.z > -1 && this.p.z < 1 && alignment < 1;
      const hit = tick - nest.lastHitAt < NET.tickHz * 3;
      const score = aimed ? alignment : 1 + (tick - nest.lastHitAt) / NET.tickHz;
      if (!(aimed || hit) || score >= bestScore || !clearGroundLine(definition.world, position.x, position.z, nest.x, nest.z)) continue;
      selectedNest = nest;
      bestScore = score;
    }
    if (selectedNest) {
      const { x, z, hp, maxHp } = selectedNest;
      this.place(camera, x, base(x, z) + 4, z, 'nest', 'Schwarmnest', hp / maxHp, false);
    }
    for (let i = this.used; i < this.slots.length; i++) {
      const marker = this.slots[i];
      if (!marker.shown) continue;
      marker.shown = false;
      marker.node.hidden = true;
    }
  }
}

import { wrapAngle } from '@freefall/shared';
import type { PositionXZ } from '@freefall/shared';

const LIFETIME = 625;
export const DAMAGE_DIRECTIONS = [0, 1, 2] as const;
const CAPACITY = DAMAGE_DIRECTIONS.length;

export class DamageFeedback {
  private readonly hits: { bearing: number; until: number }[] = [];

  add(direction: PositionXZ | undefined, now: number): void {
    if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.z) ||
        direction.x ** 2 + direction.z ** 2 < .01) return;
    this.trim(now);
    const bearing = Math.atan2(direction.x, -direction.z);
    const nearby = this.hits.find((hit) => Math.abs(wrapAngle(hit.bearing - bearing)) < Math.PI / 6);
    if (nearby) {
      nearby.until = now + LIFETIME;
      nearby.bearing = bearing;
    } else {
      if (this.hits.length >= CAPACITY) {
        let earliest = 0;
        for (let i = 1; i < this.hits.length; i++) if (this.hits[i].until < this.hits[earliest].until) earliest = i;
        this.hits[earliest] = { bearing, until: now + LIFETIME };
      } else this.hits.push({ bearing, until: now + LIFETIME });
    }
  }

  private trim(now: number): void {
    for (let i = this.hits.length - 1; i >= 0; i--) if (now >= this.hits[i].until) this.hits.splice(i, 1);
  }

  draw(element: HTMLElement | null | undefined, yaw: number, now: number): void {
    this.trim(now);
    if (!element) return;
    for (let i = 0; i < CAPACITY; i++) {
      const marker = element.children[i] as HTMLElement;
      const hit = this.hits[i];
      if (marker.hidden === Boolean(hit)) marker.hidden = !hit;
      if (!hit) continue;
      marker.style.transform = `rotate(${wrapAngle(hit.bearing - yaw)}rad)`;
      marker.style.opacity = String(Math.min(1, (hit.until - now) / 260));
    }
  }

  clear(): void { this.hits.length = 0; }
}

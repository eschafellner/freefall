import * as T from 'three';
import { combineParts, paintedPart } from './AgentMeshes.ts';

export class ModelParts {
  private readonly parts: T.BufferGeometry[] = [];

  box(color: number, x: number, y: number, z: number, w: number, h: number, d: number, bevel = 0, pitch = 0, roll = 0): void {
    let part: T.BufferGeometry;
    if (bevel > 0) {
      const a = w / 2 - bevel;
      const b = h / 2 - bevel;
      const outline = new T.Shape().moveTo(-a, -b).lineTo(a, -b).lineTo(a, b).lineTo(-a, b).closePath();
      part = new T.ExtrudeGeometry(outline, {
        depth: d - 2 * bevel, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 1, steps: 1,
      }).translate(0, 0, -d / 2 + bevel);
    } else {
      part = new T.BoxGeometry(w, h, d);
    }
    this.add(part.rotateX(pitch).rotateZ(roll).translate(x, y, z), color);
  }

  oval(color: number, x: number, y: number, z: number, w: number, h: number, d: number): void {
    this.add(new T.SphereGeometry(1, 12, 8).scale(w / 2, h / 2, d / 2).translate(x, y, z), color);
  }

  tube(color: number, x: number, y: number, z: number, top: number, bottom: number, length: number, pitch = 0): void {
    this.add(new T.CylinderGeometry(top, bottom, length, 10).rotateX(pitch).translate(x, y, z), color);
  }

  mesh(material: T.Material): T.Mesh<T.BufferGeometry, T.Material> {
    return new T.Mesh(combineParts(this.parts), material);
  }

  private add(geometry: T.BufferGeometry, color: number): void {
    geometry.deleteAttribute('uv');
    this.parts.push(paintedPart(geometry, color));
  }
}

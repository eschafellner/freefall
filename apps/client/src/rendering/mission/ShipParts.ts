import * as T from 'three';

const cube = new T.BoxGeometry(1, 1, 1);

export const metal = (color: number, roughness = .76, metalness = .38) =>
  new T.MeshStandardMaterial({ color, roughness, metalness });
export const emitter = (color: number, intensity = 1) =>
  new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .48 });

export function plate(parent: T.Object3D, material: T.Material, x: number, y: number, z: number,
  w: number, h: number, d: number): T.Mesh {
  const mesh = new T.Mesh(cube, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  parent.add(mesh);
  return mesh;
}

export class PanelBatch {
  private readonly panels = new Map<T.Material, T.Matrix4[]>();
  private readonly dummy = new T.Object3D();

  add(material: T.Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0): void {
    const { dummy } = this;
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.y = yaw;
    dummy.updateMatrix();
    if (!this.panels.has(material)) this.panels.set(material, []);
    this.panels.get(material)!.push(dummy.matrix.clone());
  }

  finish(parent: T.Object3D): void {
    for (const [material, panels] of this.panels) {
      const mesh = new T.InstancedMesh(cube, material, panels.length);
      panels.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.computeBoundingSphere();
      parent.add(mesh);
    }
  }
}

export function stencil(parent: T.Object3D, title: string, subtitle: string, position: [number, number, number],
  width: number, angle = 0, tint = '#e2e3d8'): void {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#141b1a';
  context.fillRect(0, 0, 768, 192);
  context.fillStyle = tint;
  context.fillRect(22, 28, 6, 134);
  context.font = '700 63px monospace';
  context.fillText(title, 50, 91, 687);
  context.font = '600 25px monospace';
  context.fillText(subtitle, 53, 139, 680);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const sign = new T.Mesh(new T.PlaneGeometry(width, width / 4), new T.MeshBasicMaterial({ map, toneMapped: false }));
  sign.position.set(...position);
  sign.rotation.y = angle;
  parent.add(sign);
}

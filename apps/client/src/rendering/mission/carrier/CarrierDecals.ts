import * as T from 'three';

let seed = 0x51ed27;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/**
 * Painted marking (floor or wall): stencil text on a transparent canvas, worn by scuffs, lit like the surface under it.
 * The plane faces +z in its local frame; floor decals are laid flat with the top of the text towards -z, turned by yaw.
 */
export function paint(lines: { text: string; size: number }[], width: number, height: number, color: string, opacity = .85): T.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.max(64, Math.round(1024 * height / width));
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = lines.reduce((sum, line) => sum + line.size, 0);
  let y = (canvas.height - total * canvas.height) / 2;
  for (const line of lines) {
    const px = line.size * canvas.height;
    g.font = `900 ${Math.round(px * .82)}px "Arial Black", Impact, sans-serif`;
    g.fillText(line.text, 512, y + px / 2, 1000);
    y += px;
  }
  // Stencil bridges and wear: thin gaps through the letters and scuffed patches.
  g.globalCompositeOperation = 'destination-out';
  for (let x = 30; x < 1024; x += 64 + random() * 40) {
    g.fillStyle = 'rgba(0,0,0,.9)';
    g.fillRect(x, 0, 3 + random() * 3, canvas.height);
  }
  for (let i = 0; i < 380; i++) {
    g.fillStyle = `rgba(0,0,0,${.25 + random() * .6})`;
    const r = 2 + random() ** 3 * 26;
    g.beginPath();
    g.ellipse(random() * 1024, random() * canvas.height, r * (1 + random() * 2), r, random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  const material = new T.MeshStandardMaterial({ map, transparent: true, opacity, roughness: .75, metalness: .15, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new T.Mesh(new T.PlaneGeometry(width, height), material);
  mesh.renderOrder = 2;
  return mesh;
}

export function floorPaint(parent: T.Object3D, lines: { text: string; size: number }[], x: number, z: number, width: number, height: number,
  yaw: number, color: string, opacity = .8): void {
  const mesh = paint(lines, width, height, color, opacity);
  mesh.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
  mesh.position.set(x, .022, z);
  parent.add(mesh);
}

export function wallPaint(parent: T.Object3D, lines: { text: string; size: number }[], x: number, y: number, z: number, width: number,
  height: number, yaw: number, color: string, opacity = .85): void {
  const mesh = paint(lines, width, height, color, opacity);
  mesh.rotation.y = yaw;
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

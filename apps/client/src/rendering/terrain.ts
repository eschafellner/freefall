import * as T from 'three';
import { ARENA_ROAD_PLATES as roadPlates } from '@freefall/shared';
import { ENVIRONMENT } from './environment/EnvironmentConfig.ts';
import { landscapeNoise, noise, randomSource, smoothstep } from './environment/noise.ts';
import type { SurfaceMaterials } from './environment/SurfaceMaterials.ts';

const { pad, colors, extent, roadX } = ENVIRONMENT;
export function landHeight(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge <= 77) return 0;
  const angle = Math.atan2(z, x);
  const radius = Math.hypot(x, z);
  const range = 150 + Math.sin(angle * 5 + 0.7) * 15 + Math.sin(angle * 9) * 10;
  const slope = Math.max(0, 1 - Math.abs(radius - range) / 63);
  const folded = landscapeNoise(x * 0.027 + 9, z * 0.027, 23);
  const ridges = 0.56 + 0.26 * Math.sin(angle * 7 + 1.9) + 0.18 * Math.sin(angle * 13 - 1);
  return smoothstep(77, 103, edge) * (folded * 5 + slope ** 1.35 * (12 + 70 * ridges * folded));
}

function groundGeometry(): T.BufferGeometry {
  const coords = [
    ...Array.from({ length: 26 }, (_, i) => -extent + (extent - 65) * i / 26),
    ...Array.from({ length: 81 }, (_, i) => -65 + 130 * i / 80),
    ...Array.from({ length: 26 }, (_, i) => 65 + (extent - 65) * (i + 1) / 26),
  ];
  const side = coords.length;
  const geometry = new T.PlaneGeometry(1, 1, side - 1, side - 1).rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const colorData = new Float32Array(position.count * 3);
  const soil = new T.Color(colors.soil);
  const silt = new T.Color(colors.silt);
  const slate = new T.Color(colors.slate);
  const track = new T.Color(0x595548);
  const dust = new T.Color(0x998670);
  const color = new T.Color();
  for (let row = 0; row < side; row++) {
    const z = coords[row];
    for (let col = 0; col < side; col++) {
      const x = coords[col];
      const index = row * side + col;
      const h = landHeight(x, z);
      position.setXYZ(index, x, h, z);
      uv.setXY(index, (x + z * 0.14) / 7, (-z + x * 0.11) / 7);
      const field = landscapeNoise(x * 0.056, z * 0.056, 64);
      const weather = landscapeNoise(x * 0.12, z * 0.12, 19);
      const serviceRoad = 1 - smoothstep(2.9, 5.25, Math.abs(x - roadX - Math.sin(z * 0.06) * 1.5));
      const crossRoad = 1 - smoothstep(2.0, 4.8, Math.abs(z + 34 + Math.sin(x * 0.065) * 2));
      const damp = smoothstep(0.48, 0.76, field);
      const seam = Math.max(serviceRoad, crossRoad * 0.85);
      color.copy(soil).lerp(silt, damp * 0.86).lerp(slate, smoothstep(3.5, 22, h));
      color.lerp(dust, weather * 0.37).lerp(track, seam * (0.55 + weather * 0.38)).toArray(colorData, index * 3);
    }
  }
  geometry.setAttribute('color', new T.BufferAttribute(colorData, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function canvasTexture(size: number, paint: (context: CanvasRenderingContext2D) => void): T.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Die Bodenmarkierungen konnten nicht erzeugt werden.');
  paint(context);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function padMarkings(): T.CanvasTexture {
  return canvasTexture(512, (c) => {
    const random = randomSource(93582);
    c.translate(256, 256);
    c.strokeStyle = '#d0c6a7';
    c.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const start = i * Math.PI / 4 + 0.037;
      c.beginPath();
      c.arc(0, 0, 206, start, start + Math.PI / 4 - 0.074);
      c.stroke();
    }
    c.fillStyle = '#d3c9ae';
    c.fillRect(-49, -56, 18, 112);
    c.fillRect(31, -56, 18, 112);
    c.fillRect(-42, -9, 84, 18);
    c.textAlign = 'center';
    c.font = 'bold 24px monospace';
    c.fillText('EXTRACTION', 0, 97);
    c.fillText('BRL / 02', 0, 125);
    c.fillStyle = '#bfa05c';
    for (let i = 0; i < 4; i++) {
      c.save();
      c.rotate(i * Math.PI / 2);
      c.fillRect(-25, -234, 50, 5);
      c.fillRect(-19, -244, 38, 5);
      c.restore();
    }
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 12500; i++) {
      c.globalAlpha = 0.13 + random() * 0.69;
      c.fillRect(random() * 512 - 256, random() * 512 - 256, 0.6 + random() * 5, 0.55 + random() * 1.65);
    }
    c.globalAlpha = 0.45;
    for (let i = -192; i < 256; i += 128) {
      c.fillRect(i, -256, 2, 512);
      c.fillRect(-256, i, 512, 2);
    }
  });
}

function trackTexture(): T.CanvasTexture {
  return canvasTexture(128, (c) => {
    const random = randomSource(8619);
    for (let j = 0; j < 128; j++) {
      for (let i = 0; i < 128; i++) {
        const cross = Math.min(Math.abs(i - 24), Math.abs(i - 104));
        const shoulder = 1 - smoothstep(7, 23, cross);
        const diagonal = (j + (i < 64 ? i : -i) * 0.72 + 256) % 16;
        const value = shoulder * (0.08 + noise(i / 7, j / 8, 15, undefined, 16) * 0.24 +
          (diagonal < 5 ? 0.14 : 0)) * (0.47 + random() * 0.53);
        c.fillStyle = `rgba(48,42,35,${value})`;
        c.fillRect(i, j, 1, 1);
      }
    }
  });
}

export function createTerrain(scene: T.Object3D, materials: SurfaceMaterials) {
  const simpleSoil = new T.MeshLambertMaterial({ map: materials.soil.map, vertexColors: true });
  const floor = new T.Mesh<T.BufferGeometry, T.Material>(groundGeometry(), materials.soil);
  floor.receiveShadow = true;
  scene.add(floor);

  const slabGeometry = new T.CircleGeometry(pad.radius, 48).rotateX(-Math.PI / 2);
  const slabUv = slabGeometry.getAttribute('uv');
  for (let i = 0; i < slabUv.count; i++) slabUv.setXY(i, slabUv.getX(i) * 4, slabUv.getY(i) * 4);
  const slabMaterial = materials.concrete.clone();
  slabMaterial.color.setHex(colors.concrete);
  const simplePad = new T.MeshLambertMaterial({ map: slabMaterial.map, color: colors.concrete });
  const slab = new T.Mesh<T.BufferGeometry, T.Material>(slabGeometry, slabMaterial);
  slab.position.set(pad.x, 0.006, pad.z);
  slab.receiveShadow = true;
  scene.add(slab);

  const marking = new T.Mesh(
    new T.PlaneGeometry(pad.radius * 2, pad.radius * 2).rotateX(-Math.PI / 2),
    new T.MeshStandardMaterial({ map: padMarkings(), transparent: true, depthWrite: false, roughness: 0.95 }),
  );
  marking.position.set(pad.x, 0.013, pad.z);
  marking.receiveShadow = true;
  scene.add(marking);

  const lamp = new T.InstancedMesh(new T.BoxGeometry(0.27, 0.017, 0.1), materials.lamps, 32);
  const dummy = new T.Object3D();
  for (let i = 0; i < lamp.count; i++) {
    const a = i * Math.PI * 2 / lamp.count;
    dummy.position.set(pad.x + Math.sin(a) * 9.92, 0.014, pad.z + Math.cos(a) * 9.92);
    dummy.rotation.y = a;
    dummy.updateMatrix();
    lamp.setMatrixAt(i, dummy.matrix);
  }
  scene.add(lamp);

  const tire = trackTexture();
  tire.wrapT = T.RepeatWrapping;
  const tracks = new T.PlaneGeometry(3.6, 131, 1, 48).rotateX(-Math.PI / 2);
  const trackPositions = tracks.getAttribute('position');
  const trackUvs = tracks.getAttribute('uv');
  for (let i = 0; i < trackPositions.count; i++) {
    const z = trackPositions.getZ(i);
    trackPositions.setX(i, trackPositions.getX(i) + roadX + Math.sin(z * 0.06) * 1.5);
    trackUvs.setY(i, trackUvs.getY(i) * 63);
  }
  const tireMarks = new T.Mesh(tracks, new T.MeshBasicMaterial({ map: tire, transparent: true, depthWrite: false }));
  tireMarks.position.y = 0.008;
  // Transparent paint renders above the treads where the road meets the landing zone.
  tireMarks.renderOrder = -1;
  scene.add(tireMarks);

  const plateMaterial = materials.painted.clone();
  plateMaterial.color.setHex(0x585955);
  const panel = new T.BoxGeometry(3.2, 0.018, 0.48);
  const plates = new T.InstancedMesh(panel, plateMaterial, 12 * roadPlates.length);
  dummy.rotation.set(0, 0, 0);
  const plateColor = new T.Color();
  for (const [row, plate] of roadPlates.entries()) {
    for (let i = 0; i < 12; i++) {
      dummy.position.set(plate.x, 0.013, plate.z + (i - 5.5) * 0.5);
      dummy.updateMatrix();
      plates.setMatrixAt(row * 12 + i, dummy.matrix);
      plates.setColorAt(row * 12 + i, plateColor.setScalar(i % 3 === 0 ? 0.77 : 1));
    }
  }
  plates.receiveShadow = true;
  scene.add(plates);

  return {
    materials: [materials.soil, slabMaterial, simpleSoil, simplePad],
    simplify(enabled: boolean) {
      floor.material = enabled ? simpleSoil : materials.soil;
      slab.material = enabled ? simplePad : slabMaterial;
    },
  };
}

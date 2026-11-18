import * as T from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { ASSETS } from './AssetRegistry.ts';

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}

export function disposeModel(root: T.Object3D): void {
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  root.traverse((node) => {
    if (node instanceof T.SkinnedMesh) node.skeleton.dispose();
    if (!(node instanceof T.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

export class AssetLoader {
  private readonly models = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, Promise<T.Texture>>();
  private readonly renderer: T.WebGLRenderer;
  private gltf?: Promise<GLTFLoader>;
  private ktx2?: Promise<KTX2Loader>;
  private closed = false;

  constructor(renderer: T.WebGLRenderer) {
    this.renderer = renderer;
  }

  model(path: string): Promise<GLTF> {
    return this.load(this.models, path, path, async () => {
      if (!this.gltf) {
        this.gltf = import('three/addons/loaders/GLTFLoader.js').then(async ({ GLTFLoader }) => {
          const loader = new GLTFLoader();
          if (ASSETS.ktx2Transcoder) loader.setKTX2Loader(await this.compressedLoader());
          return loader;
        });
      }
      return (await this.gltf).loadAsync(assetUrl(path));
    });
  }

  texture(path: string, colorSpace: string = T.NoColorSpace): Promise<T.Texture> {
    return this.load(this.textures, path + '|' + colorSpace, path, async () => {
      const loader = path.toLowerCase().endsWith('.ktx2') ? await this.compressedLoader() : new T.TextureLoader();
      const texture = await loader.loadAsync(assetUrl(path));
      texture.colorSpace = colorSpace;
      return texture;
    });
  }

  private compressedLoader(): Promise<KTX2Loader> {
    const path = ASSETS.ktx2Transcoder;
    if (!path) return Promise.reject(new Error('KTX2-Transcoderpfad fehlt in der Asset-Registry.'));
    this.ktx2 ??= import('three/addons/loaders/KTX2Loader.js').then(({ KTX2Loader }) =>
      new KTX2Loader().setTranscoderPath(assetUrl(path)).detectSupport(this.renderer));
    return this.ktx2;
  }

  private load<V>(cache: Map<string, Promise<V>>, key: string, path: string, fetchAsset: () => Promise<V>): Promise<V> {
    if (this.closed) return Promise.reject(new Error('Die Asset-Verwaltung wurde geschlossen.'));
    const existing = cache.get(key);
    if (existing) return existing;
    console.info(`[Freefall] Lade ${path}`);
    const result = fetchAsset().catch((error: unknown) => {
      cache.delete(key);
      throw new Error(`Asset „${path}“ konnte nicht geladen werden.`, { cause: error });
    });
    cache.set(key, result);
    return result;
  }

  dispose(): void {
    this.closed = true;
    const pending = [
      ...Array.from(this.models.values(), (asset) => asset.then((loaded) => loaded.scenes.forEach(disposeModel))),
      ...Array.from(this.textures.values(), (asset) => asset.then((texture) => texture.dispose())),
    ];
    void Promise.allSettled(pending).then(() => this.ktx2?.then((loader) => loader.dispose(), () => {}));
    this.models.clear();
    this.textures.clear();
  }
}

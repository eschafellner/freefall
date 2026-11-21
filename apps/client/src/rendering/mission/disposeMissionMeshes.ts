import * as T from 'three';

/** Mission-built meshes own their geometry, but can share scene materials and their maps. */
export function disposeMissionMeshes(root: T.Object3D, shared: ReadonlySet<T.Material>,
  extraMaterials: readonly T.Material[], ownedTextures: readonly T.Texture[]): void {
  root.removeFromParent();
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set(extraMaterials);
  const textures = new Set(ownedTextures);
  root.traverse((object) => {
    if (object instanceof T.InstancedMesh) object.dispose();
    if (!(object instanceof T.Mesh || object instanceof T.Points || object instanceof T.Line)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!shared.has(material)) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    if ('map' in material && material.map instanceof T.CanvasTexture) textures.add(material.map);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

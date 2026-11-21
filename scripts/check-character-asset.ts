/**
 * Offline check of character and animation assets against the FREEFALL animation contract.
 *
 *   npm run assets:check -- character.glb [animation-pack.glb ...] [--skeleton mixamo] [--clip reload=Rifle_Reload]
 *
 * Reads only the glTF JSON (no rendering): node names, skins and animation names. Reports the detected humanoid
 * preset, missing humanoid roles, which contract clips are present, which are missing and what falls back.
 * Exit code 1 when the minimum (Idle and Walk or Run, PrimaryWeapon node) is not met.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CLIP_REQUIREMENTS, clipCoverage } from '../apps/client/src/rendering/characters/animation/ClipLibrary.ts';
import { matchHumanoid } from '../apps/client/src/rendering/characters/animation/HumanoidSkeleton.ts';
import type { SkeletonPreset } from '../apps/client/src/rendering/characters/animation/HumanoidSkeleton.ts';
import type { CharacterClip } from '../apps/client/src/rendering/characters/CharacterAnimation.ts';

interface GltfJson {
  nodes?: { name?: string }[];
  skins?: { joints: number[] }[];
  animations?: { name?: string; channels?: unknown[] }[];
}

export function readGltfJson(file: string): GltfJson {
  const data = readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) return JSON.parse(data.toString('utf8')) as GltfJson;
  const length = data.readUInt32LE(12);
  if (data.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${file}: erster GLB-Chunk ist kein JSON`);
  return JSON.parse(data.subarray(20, 20 + length).toString('utf8')) as GltfJson;
}

function main(argv: string[]): number {
  const files: string[] = [];
  const names: Partial<Record<CharacterClip, string>> = {};
  let preset: SkeletonPreset | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--skeleton') preset = argv[++i] as SkeletonPreset;
    else if (argv[i] === '--clip') {
      const [id, name] = argv[++i].split('=');
      names[id as CharacterClip] = name;
    } else files.push(argv[i]);
  }
  if (!files.length) {
    console.error('Aufruf: npm run assets:check -- character.glb [pack.glb ...] [--skeleton freefall|mixamo|unreal] [--clip id=Clipname]');
    return 2;
  }
  const [character, ...packs] = files.map((file) => ({ file, json: readGltfJson(file) }));
  const nodeNames = (json: GltfJson) => (json.nodes ?? []).map((node) => node.name ?? '').filter(Boolean);
  const humanoid = matchHumanoid(nodeNames(character.json), { preset });
  console.log(`Charakter ${basename(character.file)}: ${character.json.nodes?.length ?? 0} Knoten, ${character.json.skins?.length ?? 0} Skins`);
  console.log(`  Skelett: ${humanoid.preset ?? 'unbekannt'}${humanoid.complete ? ', vollständig' : `, fehlende Rollen: ${humanoid.missing.join(', ')}`}`);
  const weapon = nodeNames(character.json).includes('PrimaryWeapon');
  if (!character.json.skins?.length) console.log('  Warnung: kein Skin gefunden. Ein geskinntes Modell ist für Produktionsqualität nötig.');
  console.log(`  PrimaryWeapon-Knoten: ${weapon ? 'vorhanden' : 'FEHLT (Pflicht, oder equipmentNodes.PrimaryWeapon in der Registry setzen)'}`);
  for (const pack of packs) {
    const match = matchHumanoid(nodeNames(pack.json));
    console.log(`Paket ${basename(pack.file)}: Skelett ${match.preset ?? 'unbekannt'}${match.complete ? '' : `, fehlend: ${match.missing.join(', ')}`}, ${pack.json.animations?.length ?? 0} Clips`);
  }
  const clipNames = [character, ...packs].flatMap(({ json }) => (json.animations ?? []).map((clip) => (clip.name ?? '').toLowerCase()));
  const present = CLIP_REQUIREMENTS.filter(({ id }) => clipNames.includes((names[id] ?? id).toLowerCase())).map(({ id }) => id);
  const coverage = clipCoverage(present);
  console.log(`Clips: ${present.length} von ${CLIP_REQUIREMENTS.length} Vertragsclips gefunden`);
  for (const entry of CLIP_REQUIREMENTS) {
    const gap = Object.values(coverage.missingCore).some((ids) => ids?.includes(entry.id));
    const mark = present.includes(entry.id) ? 'ok  ' : gap ? 'FEHLT' : '–   ';
    console.log(`  ${mark} ${entry.id.padEnd(18)} ${entry.group.padEnd(10)} ${entry.layer.padEnd(5)} ${entry.timing.padEnd(6)} ${entry.priority.padEnd(8)}${present.includes(entry.id) ? '' : ' → ' + entry.fallback}`);
  }
  const unknown = clipNames.filter((name) => !CLIP_REQUIREMENTS.some(({ id }) => (names[id] ?? id).toLowerCase() === name));
  if (unknown.length) console.log(`Nicht zugeordnete Clips (Registry-Mapping \`clips\` prüfen): ${unknown.join(', ')}`);
  const ok = coverage.usable && weapon;
  console.log(ok ? 'Mindestanforderung erfüllt.' : 'Mindestanforderung NICHT erfüllt: Idle, Walk oder Run und PrimaryWeapon werden benötigt.');
  return ok ? 0 : 1;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));

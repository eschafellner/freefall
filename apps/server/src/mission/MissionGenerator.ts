import { isDeepStrictEqual } from 'node:util';
import {
  ALBATROSS, BALANCE, MAX_ENEMIES, MISSION_GENERATOR_VERSION, MISSION_MODIFIERS, MISSION_PLAN_VERSION, MISSION_REGISTRY,
  MISSION_TEMPLATES, OBJECTIVE_TEMPLATES, PLANET_MISSION_PROFILES, PLANET_REGISTRY, SWARM_FACTION_ID, WORLD_REGISTRY,
  WORLD_PROFILES, balanceHash, deepFreeze, distanceSquared, generateWorld, inAlbatross, isOptionalObjective, isTimeOfDay,
  landingShip, objectiveDependencies, resolveMissionBalance, restoreWorld, worldMissionProfile,
} from '@freefall/shared';
import type {
  BalanceRegistry, MissionBalance, MissionDefinition, MissionLocation, MissionPlan, MissionTemplate,
  ObjectiveDefinition, ObjectiveTemplateId, PlanetMissionProfile, PlannedObjective, TimeOfDay, WorldDefinition, WorldPlan,
} from '@freefall/shared';
import { seededRandom } from '../simulation/Battlefield.ts';
import { landingOperatorPosition, nestFits, separated, staticMissionGeometry, validDeployment } from './MissionLocations.ts';
import type { MissionLocationGeometry } from './MissionLocations.ts';

const MAX_ATTEMPTS = 12;
const defaultContent = { profiles: PLANET_MISSION_PROFILES, templates: MISSION_TEMPLATES, worlds: WORLD_REGISTRY };
type Content = typeof defaultContent;

export interface GenerationRequest {
  readonly planetId: string;
  readonly difficultyId: string;
  readonly seed: number;
  readonly templateId?: string;
  readonly worldSeed?: number;
  readonly timeOfDay?: TimeOfDay;
}

interface GenerationDiagnostics {
  attempts: number;
  rejected: string[];
  validationMs: number;
  generationMs: number;
}

export type GenerationResult =
  | { readonly status: 'generated'; readonly diagnostics: GenerationDiagnostics; readonly plan: MissionPlan;
      readonly definition: MissionDefinition; readonly balance: MissionBalance }
  | { readonly status: 'failed'; readonly diagnostics: GenerationDiagnostics; readonly reason: string;
      readonly fallback?: MissionDefinition };

interface Context {
  readonly profile: PlanetMissionProfile;
  readonly world: WorldDefinition;
  readonly template: MissionTemplate;
}

function buildObjective(type: ObjectiveTemplateId, location: MissionLocation, optional: boolean, previous: string | undefined,
  registry: BalanceRegistry): PlannedObjective {
  const base = { id: location.id, optional, ...(previous ? { requires: [previous] } : {}) };
  const rule = OBJECTIVE_TEMPLATES[type];
  const definition: ObjectiveDefinition = rule.kind === 'activate'
    ? { ...base, kind: rule.kind, x: location.x, z: location.z, radius: location.radius,
      label: type === 'defend-relay' ? location.label + ' verteidigen' : location.label + ' aktivieren',
      ...(type === 'defend-relay' ? { defenseSeconds: registry.swarm.missionGeneration.relayDefenseSeconds, defenseRequiresPresence: true } : {}) }
    : { ...base, kind: rule.kind, label: location.label + ' zerstören', count: 1, target: { x: location.x, z: location.z } };
  return { type, locationId: location.id, definition };
}

export function validateObjectiveGraph(objectives: readonly ObjectiveDefinition[]): string | undefined {
  const entries = new Map(objectives.map((item) => [item.id, item]));
  if (!objectives.some((item) => !isOptionalObjective(item))) return 'missing-primary';
  if (entries.size !== objectives.length || entries.has('')) return 'duplicate-objective-id';
  const ready = new Set<string>();
  while (ready.size < objectives.length) {
    const before = ready.size;
    for (const objective of objectives) {
      const dependencies = objectiveDependencies(objective);
      if (new Set(dependencies).size !== dependencies.length) return 'duplicate-dependency';
      for (const id of dependencies) {
        const dependency = entries.get(id);
        if (!dependency || (!isOptionalObjective(objective) && isOptionalObjective(dependency))) return 'invalid-dependency';
      }
      if (dependencies.every((id) => ready.has(id))) ready.add(objective.id);
    }
    if (before === ready.size) return 'cyclic-objectives';
  }
}

function modifierBalance(ids: readonly string[], { profile, template }: Context, difficultyId: string, registry: BalanceRegistry) {
  if (!registry.difficultyById.has(difficultyId) || !profile.difficultyIds.includes(difficultyId)) return;
  if (new Set(ids).size !== ids.length) return;
  const modifiers = ids.map((id) => MISSION_MODIFIERS.get(id));
  if (modifiers.some((modifier) => !modifier || !profile.modifierIds.includes(modifier.id) ||
    !modifier.planetIds.includes(profile.id) || !modifier.templateIds.includes(template.id) ||
    modifier.conflicts.some((id) => ids.includes(id)) ||
    (modifier.requires === 'extraction-reinforcements' && registry.difficulty(difficultyId).reinforcementBudget < 1))) return;
  try {
    return resolveMissionBalance(registry, difficultyId, modifiers.flatMap((modifier) => modifier!.resolve(registry)));
  } catch {
    return undefined;
  }
}

function encounter(balance: MissionBalance, breachRegionIds: readonly string[]): MissionPlan['encounter'] {
  const { maxActiveEnemies, maxSpawnsPerTick, reinforcementBudget } = balance.limits;
  return { maxActiveEnemies, maxSpawnsPerTick, reinforcementBudget, breachRegionIds,
    firstExtractionPressureTicks: balance.extraction.initialPressureTicks };
}

function missionDefinition(plan: MissionPlan, world: WorldDefinition): MissionDefinition {
  return {
    id: plan.id, displayName: plan.displayName, briefing: plan.briefing,
    objectives: plan.objectives.map(({ definition }) => definition),
    world: { ...world, breachRegions: world.breachRegions.filter(({ id }) => plan.encounter.breachRegionIds.includes(id)) },
  };
}

function briefingFor(template: MissionTemplate, objectives: readonly PlannedObjective[], balloon: MissionLocation): string {
  const primary = objectives.filter(({ definition }) => !isOptionalObjective(definition)).map(({ definition }) => definition.label);
  const optional = objectives.filter(({ definition }) => isOptionalObjective(definition)).map(({ definition }) => definition.label);
  return `${template.displayName}. ${primary.join(' → ')}.${optional.length ? ' Optional · ' + optional.join(', ') + '.' : ''} Extraktion per Albatross oder Ballon am Sammelpunkt ${balloon.label}.`;
}

export class MissionGenerator {
  private readonly content: Content;
  private readonly createGeometry: typeof staticMissionGeometry;
  private readonly geometry = new WeakMap<BalanceRegistry, WeakMap<WorldDefinition, MissionLocationGeometry>>();

  constructor(content: Content = defaultContent, createGeometry = staticMissionGeometry) {
    this.content = content;
    this.createGeometry = createGeometry;
  }

  private geometryFor(world: WorldDefinition, registry: BalanceRegistry, balance: MissionBalance): MissionLocationGeometry {
    let worlds = this.geometry.get(registry);
    if (!worlds) this.geometry.set(registry, worlds = new WeakMap());
    let geometry = worlds.get(world);
    if (!geometry) worlds.set(world, geometry = this.createGeometry(world, balance));
    return geometry;
  }

  private context(planetId: string, templateId: string, generated?: WorldPlan): Context | undefined {
    const profile = generated ? worldMissionProfile(generated) : this.content.profiles.get(planetId);
    const world = generated?.world ?? (profile && this.content.worlds.get(profile.worldId));
    const template = this.content.templates.get(templateId);
    if (!profile || profile.id !== planetId || !world || world.id !== profile.worldId || !template || template.id !== templateId || !profile.templateIds.includes(templateId) ||
        !profile.enemyFactions.includes(SWARM_FACTION_ID)) return;
    return { profile, world, template };
  }

  validate(input: unknown, registry: BalanceRegistry = BALANCE): string | undefined {
    if (!input || typeof input !== 'object') return 'invalid-plan-format';
    const plan = input as MissionPlan;
    if (!Array.isArray(plan.modifiers) || !Array.isArray(plan.objectives) ||
        !Array.isArray(plan.encounter?.breachRegionIds) || plan.objectives.some((item) =>
          !item?.definition || typeof item.definition.id !== 'string' ||
          (item.definition.requires !== undefined && typeof item.definition.requires !== 'string' &&
            !Array.isArray(item.definition.requires)))) return 'invalid-plan-format';
    const generated = plan.world && restoreWorld(plan.world);
    if (plan.world && !generated) return 'invalid-world';
    const context = this.context(plan.planetId, plan.templateId, generated);
    if (!context) return 'incompatible-content';
    const { profile, world, template } = context;
    if (plan.generatorVersion !== MISSION_GENERATOR_VERSION || plan.formatVersion !== MISSION_PLAN_VERSION ||
        plan.templateVersion !== template.version || plan.planetVersion !== profile.version || plan.worldId !== profile.worldId ||
        (plan.requestedTemplateId !== undefined && plan.requestedTemplateId !== plan.templateId) ||
        (plan.timeOfDay !== undefined && (!generated || !isTimeOfDay(plan.timeOfDay))) ||
        !isMissionSeed(plan.seed)) return 'invalid-version-or-seed';
    const balance = modifierBalance(plan.modifiers, context, plan.difficultyId, registry);
    if (!balance) return 'invalid-balance-or-modifier';
    return this.validateCandidate(plan, context, registry, balance);
  }

  private validateCandidate(plan: MissionPlan, context: Context, registry: BalanceRegistry, balance: MissionBalance): string | undefined {
    const { profile, template, world } = context;
    if (!isDeepStrictEqual(plan.balance, { release: registry.version.release, hash: registry.version.hash }) ||
        plan.resupply !== 'albatross') return 'invalid-balance-reference';
    const locations = new Map(profile.locations.map((location) => [location.id, location]));
    if (locations.size !== profile.locations.length) return 'duplicate-location-id';
    const authored = (location: MissionLocation | undefined, tag: MissionLocation['tag']): location is MissionLocation =>
      !!location && location.tag === tag && isDeepStrictEqual(locations.get(location.id), location);
    const extraction = plan.extraction;
    if (!extraction || !authored(extraction.albatross, 'albatross') || !authored(extraction.balloon, 'balloon') ||
        !isDeepStrictEqual(extraction.methods, ['albatross', 'balloon'])) return 'missing-extraction';
    if (!authored(plan.deployment, 'deployment')) return 'missing-deployment';
    const geometry = this.geometryFor(world, registry, balance);
    const { albatross, balloon } = extraction;
    if (!validDeployment(plan.deployment, albatross, geometry)) return 'invalid-deployment';
    const origin = landingOperatorPosition(albatross, 0);
    if (!geometry.open(balloon, balloon.radius + 1.1) || !geometry.reachable(origin, balloon) ||
        inAlbatross(balloon, albatross) || !separated(balloon, albatross)) return 'unreachable-extraction';

    const objectives = plan.objectives.map(({ definition }) => definition);
    const graphError = validateObjectiveGraph(objectives);
    if (graphError) return graphError;
    const primary = plan.objectives.filter(({ definition }) => !isOptionalObjective(definition));
    const optional = plan.objectives.filter(({ definition }) => isOptionalObjective(definition));
    if (!isDeepStrictEqual(primary.map(({ type }) => type), template.primary) ||
        optional.some(({ type }, index) => template.optional[index] !== type)) return 'template-objectives';
    const definition = missionDefinition(plan, geometry.ground);
    const objectiveLocations: MissionLocation[] = [];
    let previous: string | undefined;
    for (const objective of plan.objectives) {
      const type = objective.type;
      const rules = OBJECTIVE_TEMPLATES[type];
      const location = locations.get(objective.locationId);
      if (!rules || !profile.objectiveTypes.includes(type) || !location || location.tag !== rules.locationTag) return 'invalid-objective-location';
      const optional = isOptionalObjective(objective.definition);
      const expected = buildObjective(type, location, optional, optional ? undefined : previous, registry);
      if (!isDeepStrictEqual(objective, expected)) return 'invalid-objective-rules';
      if (!geometry.open(location, location.radius) || !geometry.reachable(origin, location) ||
          !separated(location, plan.deployment) || !separated(location, balloon) ||
          objectiveLocations.some((other) => !separated(location, other))) return 'unreachable-objective';
      if (rules.kind === 'destroy-nests' && (!world.initialNests.slice(0, balance.limits.maxActiveNests)
        .some((nest) => distanceSquared(nest, location) === 0) || !nestFits(definition, balance, location))) return 'missing-start-nest';
      objectiveLocations.push(location);
      if (!optional) previous = objective.definition.id;
    }
    const ids = plan.encounter.breachRegionIds;
    const regions = new Map(world.breachRegions.map((region) => [region.id, region]));
    if (ids.length < 1 || ids.length !== profile.breachRegionCount || ids.length !== new Set(ids).size ||
        ids.some((id) => !profile.breachRegionIds.includes(id) || !regions.has(id)) ||
        !world.patrolRegions.length) return 'missing-spawn-region';
    if (ids.some((id) => {
      const region = regions.get(id)!;
      return !Number.isFinite(region.radius) || region.radius <= 0 ||
        !geometry.open(region, balance.nest.exitRadius + 1) || !geometry.reachable(origin, region);
    })) return 'unreachable-spawn-region';
    if (balance.limits.maxActiveEnemies < 1 || balance.limits.maxActiveEnemies > MAX_ENEMIES ||
        balance.limits.maxSpawnsPerTick < 1 || !isDeepStrictEqual(plan.encounter, encounter(balance, ids))) return 'invalid-encounter';
    if (plan.displayName !== template.displayName || plan.briefing !== briefingFor(template, plan.objectives, balloon)) return 'invalid-briefing';
    const { id, ...body } = plan;
    if (id !== 'generated.' + balanceHash(body)) return 'invalid-plan-id';
  }

  private fallbackReady(mission: MissionDefinition, registry: BalanceRegistry, difficultyId: string): boolean {
    if (validateObjectiveGraph(mission.objectives) || !mission.world.patrolRegions.length || !mission.world.breachRegions.length) return false;
    const balance = resolveMissionBalance(registry, difficultyId);
    const geometry = this.geometryFor(mission.world, registry, balance);
    const ship = { ...landingShip(mission.world.deployment), id: 'albatross', tag: 'albatross' as const, label: 'Albatross 02', radius: 1 };
    const deployment = { ...mission.world.deployment, id: 'landing-zone', tag: 'deployment' as const, label: 'Landepunkt' };
    const origin = landingOperatorPosition(ship, 0);
    const recovery = { x: ship.x, z: ship.z + ALBATROSS.halfLength + 3 };
    return validDeployment(deployment, ship, geometry) && geometry.open(recovery, 1.1) && geometry.reachable(origin, recovery) &&
      mission.objectives.every((objective) => isOptionalObjective(objective) ||
        (objective.kind === 'activate' && geometry.open(objective, objective.radius) && geometry.reachable(origin, objective)));
  }

  generate(request: GenerationRequest, registry: BalanceRegistry = BALANCE): GenerationResult {
    const start = performance.now();
    const diagnostics: GenerationDiagnostics = { attempts: 0, rejected: [], validationMs: 0, generationMs: 0 };
    const generated = WORLD_PROFILES.has(request.planetId) && request.worldSeed !== undefined
      ? generateWorld(request.planetId, request.worldSeed) : undefined;
    const profile = generated ? worldMissionProfile(generated) : this.content.profiles.get(request.planetId);
    const world = generated?.world ?? (profile && this.content.worlds.get(profile.worldId));
    const failure = (reason: string, allowFallback = false): GenerationResult => {
      const fallback = profile?.fallbackMissionId && MISSION_REGISTRY.get(profile.fallbackMissionId);
      diagnostics.generationMs = performance.now() - start;
      return { status: 'failed', diagnostics, reason, fallback: allowFallback && fallback && fallback.world === world &&
        PLANET_REGISTRY.get(request.planetId)?.missions.includes(fallback.id) && this.fallbackReady(fallback, registry, request.difficultyId) ? fallback : undefined };
    };
    if (!isMissionSeed(request.seed)) return failure('invalid-seed');
    if (request.timeOfDay !== undefined && (!generated || !isTimeOfDay(request.timeOfDay))) return failure('invalid-time-of-day');
    if ((WORLD_PROFILES.has(request.planetId) || request.worldSeed !== undefined) && !generated) return failure('invalid-world-seed');
    if (!profile) return failure('unknown-planet');
    if (!world) return failure('missing-world');
    if (!registry.difficultyById.has(request.difficultyId) || !profile.difficultyIds.includes(request.difficultyId)) return failure('invalid-difficulty');
    const ids = request.templateId === undefined ? profile.templateIds : [request.templateId];
    const options = ids.flatMap((id) => {
      const context = this.context(request.planetId, id, generated);
      return context ? [context] : [];
    });
    if (!options.length) return failure('missing-template', request.templateId === undefined);

    const salt = balanceHash([request.planetId, profile.version, MISSION_GENERATOR_VERSION, registry.version.hash, request.difficultyId]);
    const random = seededRandom(mixSeed(request.seed ^ Number.parseInt(salt.slice(-8), 16)));
    const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(random() * list.length)];
    for (; diagnostics.attempts < MAX_ATTEMPTS;) {
      diagnostics.attempts++;
      const context = pick(options)!;
      const { template } = context;
      const validationStart = performance.now();
      const reject = (reason: string) => {
        diagnostics.rejected.push(reason);
        diagnostics.validationMs += performance.now() - validationStart;
      };
      const deployment = pick(profile.locations.filter(({ tag }) => tag === 'deployment'));
      const albatross = pick(profile.locations.filter(({ tag }) => tag === 'albatross'));
      const balloon = pick(profile.locations.filter(({ tag }) => tag === 'balloon'));
      if (!deployment || !albatross || !balloon) {
        reject(!deployment ? 'missing-deployment' : 'missing-extraction');
        continue;
      }
      const objectives: PlannedObjective[] = [];
      const steps = [...template.primary, ...(random() < .5 ? template.optional : [])];
      for (const [index, type] of steps.entries()) {
        const rules = OBJECTIVE_TEMPLATES[type];
        const location = rules && pick(profile.locations.filter(({ tag, id }) =>
          tag === rules.locationTag && !objectives.some(({ locationId }) => locationId === id)));
        if (!location) break;
        const optional = index >= template.primary.length;
        objectives.push(buildObjective(type, location, optional, optional ? undefined : objectives.at(-1)?.definition.id, registry));
      }
      if (objectives.length !== steps.length) {
        reject('insufficient-objective-locations');
        continue;
      }
      const supported = profile.modifierIds.filter((id) => MISSION_MODIFIERS.get(id)?.templateIds.includes(template.id));
      const modifier = random() < .5 ? pick(supported) : undefined;
      const modifiers = modifier ? [modifier] : [];
      const balance = modifierBalance(modifiers, context, request.difficultyId, registry);
      if (!balance) {
        reject('invalid-balance-or-modifier');
        continue;
      }
      const pool = [...profile.breachRegionIds];
      const breachIds: string[] = [];
      while (pool.length && breachIds.length < profile.breachRegionCount) {
        breachIds.push(...pool.splice(Math.floor(random() * pool.length), 1));
      }
      const body: Omit<MissionPlan, 'id'> = {
        formatVersion: MISSION_PLAN_VERSION, generatorVersion: MISSION_GENERATOR_VERSION,
        planetId: profile.id, planetVersion: profile.version, worldId: world.id, seed: request.seed,
        ...(generated && { world: generated.identity }),
        ...(request.timeOfDay && { timeOfDay: request.timeOfDay }),
        templateId: template.id, templateVersion: template.version, displayName: template.displayName,
        briefing: briefingFor(template, objectives, balloon), difficultyId: request.difficultyId,
        ...(request.templateId ? { requestedTemplateId: request.templateId } : {}),
        deployment, objectives, encounter: encounter(balance, breachIds.sort()),
        extraction: { methods: ['albatross', 'balloon'], albatross, balloon },
        resupply: 'albatross', modifiers, balance: { release: balance.release, hash: balance.configHash },
      };
      const plan = { id: 'generated.' + balanceHash(body), ...body };
      const validateAt = performance.now();
      const reason = this.validateCandidate(plan, context, registry, balance);
      diagnostics.validationMs += performance.now() - validateAt;
      if (reason) {
        diagnostics.rejected.push(reason);
        continue;
      }
      diagnostics.generationMs = performance.now() - start;
      return { status: 'generated', diagnostics, plan: deepFreeze(structuredClone(plan)), definition: deepFreeze(missionDefinition(plan, structuredClone(world))), balance };
    }
    return failure('attempts-exhausted', true);
  }
}

// Avalanche adjacent request seeds before entering the shared 32-bit LCG stream.
function mixSeed(seed: number): number {
  seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
  seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35);
  return (seed ^ (seed >>> 16)) >>> 0;
}

export function isMissionSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 0x100000000;
}

export const missionGenerator = new MissionGenerator();

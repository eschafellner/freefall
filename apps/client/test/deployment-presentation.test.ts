import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { BALLOON, BOARDING_TICKS, DEPLOYMENT_PHASES, LANDING_STAGE_TICKS, NET } from '@freefall/shared';
import type { MissionSnapshot } from '@freefall/shared';
import { MUSIC_TRACKS, musicCue } from '../src/audio/Music.ts';
import { DROP, dropPose } from '../src/rendering/mission/DropChoreography.ts';

const here = import.meta.url;
const snapshot = (patch: Partial<MissionSnapshot>) => ({
  state: 'CARRIER_HUB', phase: 'DOCKED', phaseAt: 0, phaseUntil: 0, boardingUntil: 0, ...patch,
}) as MissionSnapshot;

test('the drop lasts about twenty seconds and keeps its phase order', () => {
  assert.deepEqual(DEPLOYMENT_PHASES.map(([phase]) => phase), ['LOCKED', 'DROPPING', 'ATMOSPHERIC_ENTRY', 'BRAKING', 'TOUCHDOWN']);
  assert.ok(LANDING_STAGE_TICKS / NET.tickHz >= 18 && LANDING_STAGE_TICKS / NET.tickHz <= 24);
});

test('drop score starts once every operator is ready and follows the flight for late joiners', () => {
  assert.equal(musicCue(snapshot({ state: 'BOARDING' }), 10), undefined, 'not before everyone reported ready');
  const countdown = musicCue(snapshot({ state: 'BOARDING', boardingUntil: 100 + BOARDING_TICKS }), 100);
  assert.deepEqual(countdown, { track: 'drop', offset: 0 });
  // Mid re-entry: countdown + LOCKED + DROPPING + 30 ticks.
  const phaseAt = 500;
  const entry = musicCue(snapshot({ state: 'DEPLOYMENT', phase: 'ATMOSPHERIC_ENTRY', phaseAt, phaseUntil: phaseAt + 180 }), phaseAt + 30)!;
  assert.equal(entry.track, 'drop');
  assert.ok(Math.abs(entry.offset - (BOARDING_TICKS + 75 + 105 + 30) / NET.tickHz) < 1e-9);
  // After touchdown the score only continues for its tail when it is already playing.
  const deployed = snapshot({ state: 'ACTIVE_MISSION', phase: 'DEPLOYED', phaseAt: 1000 });
  assert.equal(musicCue(deployed, 1010), undefined);
  assert.equal(musicCue(deployed, 1010, 'drop')?.track, 'drop');
  // Touchdown happened one TOUCHDOWN phase before DEPLOYED; the fade starts 15 s after it.
  const touchdown = 1000 - DEPLOYMENT_PHASES.find(([phase]) => phase === 'TOUCHDOWN')![1];
  assert.equal(MUSIC_TRACKS.drop.tail, 15);
  assert.equal(musicCue(deployed, touchdown + 15 * NET.tickHz - 1, 'drop')?.track, 'drop');
  assert.equal(musicCue(deployed, touchdown + 15 * NET.tickHz, 'drop'), undefined, 'fades 15 s after touchdown');
});

test('balloon extraction plays Last Stand from activation until the result', () => {
  const extraction = (phase: 'COUNTDOWN' | 'APPROACH' | 'LIFT') => ({ method: 'balloon', phase, phaseAt: 2000 });
  const state = (phase: 'COUNTDOWN' | 'APPROACH' | 'LIFT') => snapshot({ state: 'EXTRACTION_IN_PROGRESS', phase: 'DEPLOYED',
    extraction: extraction(phase) as MissionSnapshot['extraction'] });
  assert.deepEqual(musicCue(state('COUNTDOWN'), 2000), { track: 'balloon', offset: 0 });
  assert.equal(musicCue(state('APPROACH'), 2030)!.offset, (BALLOON.countdownTicks + 30) / NET.tickHz);
  assert.equal(musicCue(state('LIFT'), 2000)!.offset, (BALLOON.countdownTicks + BALLOON.approachTicks) / NET.tickHz);
  assert.equal(musicCue(snapshot({ state: 'EXTRACTION_IN_PROGRESS', extraction: { ...extraction('LIFT'), method: 'albatross' } as MissionSnapshot['extraction'] }), 2000), undefined,
    'Albatross extraction keeps the regular mix');
  assert.equal(musicCue({ ...state('LIFT'), result: {} } as MissionSnapshot, 2100), undefined, 'fades with the result');
});

test('the score files are the documented, project-owned masters', () => {
  const dir = new URL('../public/music/', here);
  const manifest = JSON.parse(readFileSync(new URL('../../../docs/music-sources.json', here), 'utf8')) as
    { id: string; sha256: Record<string, string>; rights: string }[];
  const expected: string[] = [];
  for (const { id, sha256, rights } of manifest) {
    assert.ok(rights.length > 0);
    for (const extension of ['ogg', 'mp3']) {
      expected.push(id + '.' + extension);
      assert.equal(createHash('sha256').update(readFileSync(new URL(id + '.' + extension, dir))).digest('hex'), sha256[extension]);
    }
  }
  assert.deepEqual(readdirSync(dir).sort(), expected.sort());
  assert.deepEqual(Object.values(MUSIC_TRACKS).map(({ file }) => file).sort(), manifest.map(({ id }) => id).sort());
});

test('the lander brakes from altitude, slams onto its gear and settles', () => {
  const at = (phase: 'BRAKING' | 'TOUCHDOWN' | 'ATMOSPHERIC_ENTRY' | 'DROPPING', e: number, s = 0) => dropPose(phase, e, s, 0);
  assert.equal(at('BRAKING', 0).height, DROP.brakeHeight);
  let previous = Infinity;
  for (let e = 0; e <= 1.0001; e += .02) {
    const { height } = at('BRAKING', e);
    assert.ok(height <= previous + 1e-9, 'never climbs while braking');
    previous = height;
  }
  assert.ok(Math.abs(at('BRAKING', 1).height) < 1e-9, 'touches down exactly when the server phase changes');
  assert.ok(at('BRAKING', .7).gear > .8 && at('DROPPING', .6).gear === 0, 'gear deploys late in the burn');
  const slam = at('TOUCHDOWN', 0, 0);
  assert.ok(slam.compression > .4 && slam.shake > 1.3, 'hard impact');
  const settled = at('TOUCHDOWN', 1, 3);
  assert.ok(Math.abs(settled.compression) < .01 && settled.shake < .01, 'suspension settles');
  assert.ok(at('ATMOSPHERIC_ENTRY', .5).heat > .9, 'heat peaks in re-entry');
});

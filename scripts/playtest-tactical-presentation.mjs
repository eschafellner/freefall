/** Local Chromium + three SDK peers. Debug fixtures stage positions and shorten the balloon wait. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { preview, build } from 'vite';
import { CARRIER_CONSOLE, NET, PROCEDURAL_CONTRACT_ID, groundHeight, missionGround } from '@freefall/shared';
import { startServer } from '../apps/server/src/server.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = await mkdtemp(join(tmpdir(), 'freefall-78d-'));
const output = process.argv[2] ?? directory + '-evidence';
await mkdir(output, { recursive: true });
process.env.FREEFALL_MISSION_DEBUG = '1';
const server = await startServer(0, '127.0.0.1', false);
const url = 'http://127.0.0.1:' + server.transport.server.address().port;
const sdk = new Client(url);
let web, browser;

async function until(check, name, timeout = 12000) {
  const end = performance.now() + timeout;
  do {
    const value = await check();
    if (value) return value;
    await delay(40);
  } while (performance.now() < end);
  throw new Error(name + ' timed out');
}

const report = {};
try {
  process.env.VITE_FREEFALL_SERVER = url;
  const config = { root: fileURLToPath(new URL('../apps/client', import.meta.url)),
    build: { outDir: join(directory, 'dist') }, logLevel: 'error' };
  await build(config);
  web = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
  const address = 'http://127.0.0.1:' + web.httpServer.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, chromiumSandbox: false,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [method, planetId] of [['albatross', 'green-plains'], ['balloon', 'desert'], ['failure', 'ice']]) {
    const page = await browser.newPage({ viewport: { width: 900, height: 540 }, reducedMotion: method === 'balloon' ? 'reduce' : 'no-preference' });
    const quality = method === 'albatross' ? 'low' : method === 'balloon' ? 'medium' : 'high';
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const peers = [];
    try {
      await page.goto(address);
      await page.getByLabel('Grafikqualität').selectOption(quality);
      await page.getByRole('button', { name: 'Raum erstellen', exact: true }).click();
      const enter = page.getByRole('button', { name: 'Carrier betreten' });
      await enter.waitFor();
      const id = await page.locator('.room strong').innerText();
      const room = matchMaker.getLocalRoomById(id), mission = room.arena, own = mission.players[0];
      const network = [];
      for (let i = 0; i < 3; i++) {
        const peer = await sdk.joinById(id);
        peers.push(peer);
        peer.onMessage('*', () => {});
        const record = { events: [], state: undefined };
        network.push(record);
        peer.onMessage('mission-events', (events) => record.events.push(...events));
        peer.onMessage('mission-state', (state) => { record.state = state; });
      }
      const events = [], combat = [], shots = [], movement = [];
      const broadcast = room.broadcast.bind(room);
      room.broadcast = (type, payload, options) => {
        if (type === 'combat') combat.push(...payload);
        if (type === 'shot') shots.push(payload);
        if (type === 'mission-events') {
          events.push(...payload);
          for (const event of payload.filter(({ type }) => type === 'SwarmNestDestroyed')) {
            setTimeout(() => broadcast(type, [event], options), 450);
          }
        }
        broadcast(type, payload, options);
      };
      await enter.click();
      await page.locator('.in-game').waitFor();
      const reducedMotion = await page.locator('main').getAttribute('data-reduced-motion');
      assert.equal(reducedMotion, String(method === 'balloon'));

      Object.assign(own, CARRIER_CONSOLE);
      assert.ok(mission.select(own.id, { planetId, missionId: PROCEDURAL_CONTRACT_ID, templateId: 'relay-defense',
        difficultyId: 'normal', seed: 0, worldSeed: 76 }, true));
      assert.ok(mission.start(own.id));
      assert.ok(mission.debug(own.id, 'deploy'));
      await page.locator('.deployment-brief').getByText('Bremsschub', { exact: true }).waitFor();
      if (method === 'albatross') await page.screenshot({ path: join(output, 'deployment.jpg') });
      await page.locator('.deployment-brief').getByText('Aufsetzen', { exact: true }).waitFor();
      if (method === 'albatross') await page.screenshot({ path: join(output, 'touchdown.jpg') });
      await page.locator('.field-objectives').waitFor({ state: 'attached' });
      const world = missionGround(mission.definition.world);
      const place = (player, x, z) => {
        mission.place(player, x, z, 0);
        player.y = groundHeight(world, x, z);
        player.protectedUntil = Infinity;
      };
      mission.horde.spawn = () => -1;
      while (mission.horde.count) mission.horde.despawn(mission.horde.active[mission.horde.count - 1]);

      if (method === 'albatross') {
        const pickup = mission.plan.extraction.balloon;
        place(own, pickup.x, pickup.z);
        await until(() => own.activeInput, 'input after camera test placement');
        await page.keyboard.press('KeyC');
        await until(() => own.posture.current === 'CROUCHING', 'crouch');
        await page.keyboard.press('KeyC');
        await until(() => own.posture.current === 'STANDING', 'stand from crouch');
        for (const [key, posture] of [['KeyW', 'PRONE'], ['KeyS', 'SUPINE']]) {
          place(own, pickup.x, pickup.z);
          await until(() => own.activeInput, 'input after dive placement');
          await page.keyboard.down(key);
          const sentAt = performance.now();
          await page.keyboard.press('KeyX');
          await until(() => own.posture.current === 'DIVING', 'authoritative dive');
          const serverObservedMs = performance.now() - sentAt;
          const startedTick = own.posture.started;
          await page.keyboard.up(key);
          await until(() => own.posture.current === posture, posture);
          const ticksToLand = own.posture.started - startedTick;
          await page.getByText(posture === 'PRONE' ? 'Bauchlage' : 'Rückenlage', { exact: true }).waitFor();
          const hudObservedMs = performance.now() - sentAt;
          await page.screenshot({ path: join(output, posture.toLowerCase() + '.jpg') });
          const offset = shots.length;
          await page.mouse.down({ button: 'right' });
          await page.mouse.down();
          try {
            const shot = await until(() => shots.slice(offset).find(({ shooter }) => shooter === own.id), `confirmed ${posture} shot`);
            assert.ok(Math.abs(shot.fromY - own.y - mission.movementBalance.colliders[posture].muzzleHeight) < 1e-8);
          } finally {
            await page.mouse.up();
            await page.mouse.up({ button: 'right' });
          }
          await page.keyboard.press('Space');
          await until(() => own.posture.current === 'STANDING', 'get-up from ' + posture);
          movement.push({ posture, serverObservedMs, hudObservedMs, ticksToLand, stoodAt: own.posture.started, serverShot: true });
          const cooldown = Math.ceil(mission.movementBalance.diveCooldownSeconds * NET.tickHz);
          await until(() => mission.tick >= (own.posture.lastDive ?? 0) + cooldown, 'dive cooldown');
        }
        const mag = own.equipment.magazines.primary;
        own.ammo = 6;
        await page.getByLabel(/^6 von/).waitFor();
        await page.keyboard.press('KeyR');
        await page.getByText('Beim Magazinwechsel gehen 6 Schuss verloren.').waitFor();
        const change = await until(() => combat.find((event) => event.type === 'reload' &&
          event.operator === own.id && event.phase === 'MAGAZINE_INSERTION'), 'confirmed insertion');
        assert.equal(change.discarded, 6);
        assert.equal(own.equipment.magazines.primary, mag - 1);
        await until(() => own.reload.phase === 'READY', 'reload settles');

        const ship = mission.snapshot(false).albatross;
        const left = ship.supply.find(({ side }) => side === 'left');
        place(own, left.x - .4, left.z);
        await page.locator('.interact-hint').getByText(/Nachschub aufnehmen/).waitFor();
        await until(() => own.activeInput, 'resupply input after placement');
        await page.keyboard.press('KeyE');
        const grant = await until(() => combat.find((event) => event.type === 'resupply' && event.operator === own.id), 'authorized resupply');
        assert.ok(grant.granted.primaryMagazines > 0);
        await page.locator('.combat-notice').getByText(/Nachschub aufgenommen/).waitFor();
        await page.screenshot({ path: join(output, 'resupply.jpg') });

        const ally = mission.players[1];
        place(own, pickup.x, pickup.z);
        place(ally, pickup.x + 1.05, pickup.z);
        own.protectedUntil = 0;
        await until(() => own.activeInput, 'input after placement for confirmed damage');
        peers[0].send('input', { forward: 0, strafe: 0, yaw: -Math.PI / 2, pitch: 0, seq: 1, life: ally.life,
          aim: false, sprint: false, fire: false, equipment: 'melee' });
        const damage = await until(() => combat.find((event) => event.type === 'friendly-fire' &&
          event.source === 'melee' && event.target === own.id), 'authorized friendly melee');
        assert.ok(damage.amount > 0 && damage.direction.x > 0);
        await page.locator('.damage-directions span:not([hidden])').first().waitFor();
        await page.getByText('Getroffen von OP 02', { exact: true }).waitFor();
        await page.screenshot({ path: join(output, 'damage.jpg') });

        const prior = events.length;
        assert.ok(mission.debug(own.id, 'destroy-nest'));
        const nest = await until(() => events.slice(prior).find(({ type }) => type === 'SwarmNestDestroyed'), 'nest event');
        assert.ok(nest.instanceId && Number.isSafeInteger(nest.sequence));
        await page.locator('.combat-notice').getByText('Schwarmnest zerstört').waitFor();
        const before = own.z;
        await page.keyboard.down('KeyW');
        await until(() => Math.abs(own.z - before) > .3, 'movement during the nest cue');
        await page.keyboard.up('KeyW');
        const old = room.clients.find(({ sessionId }) => sessionId === own.id);
        old.ref.terminate();
        await until(() => room.clients.some((client) => client.sessionId === own.id && client !== old), 'browser reconnect');
        const resume = page.getByRole('button', { name: 'Einsatz betreten' });
        if (await resume.isVisible()) await resume.click();
        await page.locator('.field-objectives').waitFor({ state: 'attached' });
        broadcast('mission-events', [nest, nest]);
        await delay(700);
        assert.equal(await page.locator('.combat-notice').getByText('Schwarmnest zerstört').count(), 0);
      }

      if (method === 'failure') {
        for (const player of mission.players) if (player) player.hp = 0;
        await page.getByRole('heading', { name: 'Einsatz gescheitert' }).waitFor();
        await until(() => network.every(({ state }) => state?.result?.outcome === 'team-lost'), 'shared failed result');
        assert.equal(await page.locator('.reticle, footer.bottom').count(), 0);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: join(output, 'failure-result.jpg') });
        report[method] = { planetId, quality, operators: 4, result: network[0].state.result, errors };
        await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(method, planetId, 'verified with', peers.length + 1, 'connections');
        continue;
      }

      assert.ok(mission.debug(own.id, 'objectives'));
      await until(() => mission.state === 'EXTRACTION_AVAILABLE', 'authorized extraction availability');
      await page.locator('.extraction-orders').getByText('Hauptziele erfüllt').waitFor();
      const site = method === 'albatross' ? mission.snapshot(false).albatross : mission.plan.extraction.balloon;
      for (const player of mission.players) if (player) place(player, site.x, site.z + .5 + player.slot * .4);
      assert.ok(mission.action(own.id, method));
      for (const peer of peers) assert.ok(mission.action(peer.sessionId, 'secure'));
      if (method === 'balloon') {
        assert.ok(mission.debug(own.id, 'fighter'));
        await page.getByText('Rettungsjäger im Anflug', { exact: true }).waitFor();
      }
      await page.locator('.mission-result').getByText(/Extraktion bestätigt · 4 Operator/).waitFor();
      assert.equal(await page.locator('.reticle, footer.bottom').count(), 0);
      await until(() => network.every(({ state }) => state?.result?.extractionSucceeded), 'shared result');
      assert.ok(network.every(({ state }) => state.result.extractionMethod === method && state.result.extractedOperatorIds.length === 4));
      assert.ok(network.every(({ events }) => events.filter(({ type }) => type === 'MissionCompleted').length === 1));
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(output, method + '-result.jpg') });
      report[method] = { planetId, quality, operators: 4, reducedMotion, result: network[0].state.result,
        sharedPhases: events.filter(({ type }) => ['MissionStarted', 'AlbatrossTouchdown', 'ExtractionStarted', 'MissionCompleted'].includes(type)),
        resupply: combat.filter(({ type }) => type === 'resupply'), damage: combat.filter(({ type }) => type === 'friendly-fire'),
        ...(movement.length && { movement }), errors };
      await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(method, planetId, 'deployment and extraction verified with', peers.length + 1, 'connections');
    } finally {
      await page.close();
      await Promise.allSettled(peers.map((peer) => peer.leave()));
    }
  }
} finally {
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false);
  await rm(directory, { recursive: true, force: true });
}

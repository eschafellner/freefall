import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { BODENBRUCH, MAX_ENEMIES, SCHABE_TYPE, openGround } from '@freefall/shared';
import { preview } from 'vite';
import { startServer } from '../apps/server/src/server.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const peers = [];
const root = fileURLToPath(new URL('../', import.meta.url));
process.env.FREEFALL_MISSION_DEBUG = '1';
const server = await startServer(2567, '127.0.0.1', false);
let web, browser;
const errors = [];
const output = join(await mkdtemp(join(tmpdir(), 'freefall-playtest-')), 'ms6');
console.log('Aufnahmen', dirname(output));
try {
  web = await preview({ root: join(root, 'apps/client'), preview: { host: '127.0.0.1', port: 4185, strictPort: true } });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    chromiumSandbox: false,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  await page.goto('http://127.0.0.1:4185/');
  await page.getByLabel('Grafikqualität').selectOption('medium');
  await page.getByRole('button', { name: 'Raum erstellen' }).click();
  const launch = page.getByRole('button', { name: 'Carrier betreten' });
  await launch.waitFor();
  const room = matchMaker.getLocalRoomById(await page.locator('.room strong').innerText());
  const mission = room.arena;
  const operator = mission.players[0];
  const state = (predicate, timeout = 15000) => until(() => predicate(mission.snapshot()), timeout);
  async function until(predicate, timeout = 9000) {
    const date = performance.now() + timeout;
    while (!predicate()) {
      if (performance.now() > date) throw new Error('Timed out ' + JSON.stringify({ state: mission.state, x: operator.x, z: operator.z }));
      await delay(30);
    }
  }
  async function walk(key, predicate) {
    await page.keyboard.down(key);
    try { await until(() => predicate(operator)); }
    finally { await page.keyboard.up(key); }
    await delay(100);
  }
  async function face(yaw) {
    await delay(850);
    const angle = Math.atan2(Math.sin(yaw - operator.yaw), Math.cos(yaw - operator.yaw));
    const dx = Math.round(angle / .00235);
    if (!dx) return;
    await page.evaluate((dx) => {
      const canvas = document.querySelector('canvas');
      const steps = Math.ceil(Math.abs(dx) / 45);
      for (let i = 0; i < steps; i++) {
        const movementX = Math.round((i + 1) * dx / steps) - Math.round(i * dx / steps);
        canvas.dispatchEvent(new MouseEvent('mousemove', { movementX }));
      }
    }, dx);
    await until(() => Math.abs(Math.sin((operator.yaw - yaw) / 2)) < .006);
  }
  const screenshot = (suffix) => page.screenshot({ path: output + '-' + suffix + '.png' });
  async function captureTelemetry(name, ms = 2200) {
    await page.keyboard.press('F2');
    const samples = [];
    for (let start = performance.now(); performance.now() - start < ms;) {
      await delay(270);
      samples.push(await page.locator('.telemetry .metrics dt').evaluateAll((items) =>
        Object.fromEntries(items.map((item) => [item.textContent, item.nextElementSibling.textContent]))));
    }
    await page.keyboard.press('F2');
    const values = (key) => samples.map((sample) => Number.parseFloat(sample[key])).filter(Number.isFinite).sort((a, b) => a - b);
    const middle = (key) => { const list = values(key); return list[Math.floor(list.length / 2)]; };
    console.log(name, JSON.stringify({ fpsMedian: middle('FPS / Frame'), drawCallsMedian: middle('Draw Calls / Dreiecke'),
      activeEnemies: mission.horde.count, server: samples.at(-1)['Tick · Ø / P95'] }));
  }

  await page.mouse.move(640, 400);
  await launch.focus();
  await page.keyboard.press('Enter');
  await page.locator('.in-game').waitFor();
  await face(0);
  await screenshot('carrier');
  await captureTelemetry('carrier');
  await page.evaluate(() => document.exitPointerLock());
  for (const profile of ['low','high','medium']) {
    await page.getByLabel('Grafikqualität').selectOption(profile);
    await delay(300);
    assert.ok(await page.locator('canvas').isVisible());
  }
  await launch.focus();
  await page.keyboard.press('Enter');
  await page.locator('.in-game').waitFor();
  const sdk = new Client('http://127.0.0.1:2567');
  for (let i = 0; i < 3; i++) {
    const guest = await sdk.joinById(room.roomId);
    guest.onMessage('*', () => {});
    peers.push(guest);
  }
  await walk('KeyW', ({ z }) => z < 2.8);
  console.log('at console', operator.x, operator.z, operator.yaw);
  await page.getByText('Missionskonsole öffnen').waitFor({ timeout: 4200 });
  await page.keyboard.press('KeyE');
  await page.getByText('Einsatzplanung', { exact: true }).waitFor();
  await page.getByLabel('Schwierigkeit').selectOption('freefall');
  await state(({ selection }) => selection?.difficultyId === 'freefall');
  await screenshot('console');
  await page.getByRole('button', { name: 'Boarding freigeben' }).click();
  await state(({ state }) => state === 'BOARDING');
  await page.mouse.move(640, 400);
  await launch.focus();
  await page.keyboard.press('Enter');
  await page.locator('.in-game').waitFor();
  await face(0);
  if (Math.abs(operator.x) < 2.6) {
    if (operator.z < 3.2) await walk('KeyS', ({ z }) => z > 3.2);
    await walk('KeyD', ({ x }) => x > 3.6);
  }
  await walk('KeyW', ({ z }) => z < -7.5);
  if (operator.x < -.15) await walk('KeyD', ({ x }) => x > -.15);
  if (operator.x > .15) await walk('KeyA', ({ x }) => x < .15);
  await walk('KeyW', ({ z }) => z < -28.6);
  await page.getByText('Bereit melden', { exact: false }).last().waitFor();
  await screenshot('cabin');
  for (const peer of peers) {
    const p = mission.players.find((v) => v.id === peer.sessionId);
    Object.assign(p, {x: operator.x + .5, z: operator.z});
    peer.send('mission-action', 'ready');
  }
  await page.keyboard.press('KeyE');
  await state(({ phase }) => phase === 'ATMOSPHERIC_ENTRY');
  await delay(350);
  await screenshot('descent');
  await state(({ phase }) => phase === 'TOUCHDOWN');
  await delay(700);
  await screenshot('landing');
  await state(({ state }) => state === 'ACTIVE_MISSION');
  await face(Math.PI);
  await walk('KeyW', ({ z }) => z > 175);
  assert.equal(mission.snapshot().convicts.length, 4);
  operator.protectedUntil = Infinity;
  await page.keyboard.press('Digit2');
  await until(() => operator.equipment.slot === 'secondary');
  await page.locator('.readout').getByText('P-01 Dienstpistole', {exact: false}).waitFor();
  await page.mouse.down({button:'right'});
  await page.keyboard.down('KeyA');
  await delay(330);
  await screenshot('strafe-aim');
  await page.keyboard.up('KeyA');
  await page.mouse.down();
  await delay(330);
  await page.mouse.up();
  await until(() => operator.ammo < 12);
  await page.mouse.up({button:'right'});
  await page.keyboard.press('KeyR');
  await page.getByRole('progressbar', {name: 'Nachladen'}).waitFor();
  await screenshot('reload');
  await until(() => operator.ammo === 12);
  operator.hp = 31;
  await page.getByText('Kritisch', {exact:true}).waitFor();
  await page.keyboard.press('KeyH');
  await page.getByRole('progressbar', {name:'Stim anwenden'}).waitFor();
  await screenshot('stim');
  await until(() => operator.equipment.stims === 4 && operator.hp === 71);
  for (let i=0; i<2; i++) {
    await page.keyboard.press('KeyG');
    await until(() => operator.equipment.grenades === 1-i);
    await until(() => !operator.equipment.action);
  }
  await page.setViewportSize({width:760,height:460});
  await page.locator('.readout').getByText('0/2', {exact:true}).waitFor();
  for (const selector of ['.vitals','.readout','.squad','.field-orders']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && box.x>=0 && box.y>=0 && box.x+box.width<=761 && box.y+box.height<=461, selector);
  }
  await screenshot('compact');
  await page.setViewportSize({width:390,height:844});
  await screenshot('narrow');
  const labels = await page.locator('.world-marker:visible').evaluateAll((items) =>
    items.map((item) => ({ left: item.getBoundingClientRect().left, right: item.getBoundingClientRect().right })));
  assert.ok(labels.length && labels.every(({ left, right }) => left >= 0 && right <= 391));
  await page.setViewportSize({width:1280,height:800});
  const remote = mission.players.find((v) => v.id === peers[0].sessionId);
  Object.assign(remote, {x:operator.x + .5, z:operator.z + 3.8, hp:45, protectedUntil:Infinity});
  let seq = 1;
  const remoteInput = (extra) => peers[0].send('input', { seq: seq++, life: remote.life, yaw: 0, pitch: -.12,
    forward: 0, strafe: 0, sprint: false, fire: false, ...extra });
  remoteInput({equipment:'secondary'});
  await until(() => remote.equipment.slot==='secondary');
  remoteInput({aim:true,fire:true,strafe:1});
  await until(() => remote.ammo<12);
  remoteInput({reload:true});
  await until(() => remote.reloadUntil>0);
  await screenshot('remote-reload');
  await until(() => !remote.reloadUntil);
  remoteInput({equipment:'stim'});
  await until(() => remote.equipment.action==='stim');
  await delay(350);
  await screenshot('remote-stim');
  await until(() => remote.equipment.stims===4);
  remoteInput({equipment:'grenade'});
  await until(() => remote.equipment.grenades===1);
  await page.evaluate(() => document.exitPointerLock());
  await page.getByRole('button', {name:'Albatross zerstören'}).click();
  await page.getByRole('button', { name: 'Relais abschließen' }).click();
  await state(({ state }) => state === 'EXTRACTION_AVAILABLE');
  await page.getByRole('button', { name: 'Einsatz betreten' }).click();
  await page.locator('.in-game').waitFor();
  await page.getByText(/Zerstört.*Düsen/).waitFor();
  await page.keyboard.press('KeyB');
  await state(({ extraction }) => extraction?.method === 'balloon');
  operator.protectedUntil = Infinity;
  await captureTelemetry('balloon-freefall');
  if (process.argv.includes('stress')) {
    const regions = BODENBRUCH.world.patrolRegions;
    const seeded = regions.map((region) => mission.director.patrols.create(region, 0, 0));
    for (let i = 0; mission.horde.count < MAX_ENEMIES; i++) {
      const group = seeded[i % seeded.length];
      const center = group.region.route.waypoints[Math.floor(i / regions.length) % 4];
      const x = center.x + 11 * Math.cos(i * 2.39996);
      const z = center.z + 11 * Math.sin(i * 2.39996);
      if (openGround(BODENBRUCH.world, x, z, 1)) mission.director.patrols.attach(group, mission.horde.spawn(x, z, SCHABE_TYPE));
    }
    await captureTelemetry('balloon-freefall-at-cap', 2800);
  }
  await screenshot('balloon');
  await page.evaluate(() => document.exitPointerLock());
  await page.getByRole('button', { name: 'Rettungsjäger rufen' }).click();
  await state(({ extraction }) => extraction?.phase === 'APPROACH');
  await page.getByRole('button', { name: 'Einsatz betreten' }).click();
  await state(({ extraction }) => extraction?.phase === 'LIFT');
  await delay(550);
  await screenshot('fighter');
  await page.getByText('Einsatz erfolgreich', { exact: true }).waitFor();
  assert.deepEqual(mission.snapshot().result?.extractedOperatorIds, [operator.id]);
  await page.getByRole('button', { name: 'Rückkehr bestätigen' }).click();
  for (const peer of peers) peer.send('mission-action','return-vote');
  await launch.waitFor();
  await state(({ state }) => state === 'CARRIER_HUB');
  assert.equal(mission.horde.count, 0);
  assert.deepEqual(errors, []);
  console.log('Chromium', browser.version(), 'Carrier → flight → touchdown → Balloon → fighter → results → Carrier verified');
} finally {
  await Promise.allSettled(peers.map((r) => r.leave()));
  await browser?.close();
  await web?.close();
  await server.gracefullyShutdown(false);
}

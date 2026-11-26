import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { ARENA_ROOM, BALANCE, BODENBRUCH, BODENBRUCH_ROOM, ENEMY_TYPES, HordeFrame, MAX_ENEMIES, PLAYER_MOTION, PROCEDURAL_CONTRACT_ID, SCHABE_TYPE, TEST_RIFLE, WIDE_POSITION_SCALE, decodeHorde, groundHeight, restoreWorld, missionGround, newPosture, openGround } from '@freefall/shared';
import type { AtmosphereState, CombatEvent, MissionEvent, MissionPlan, MissionSnapshot, PlayersSnapshot, ServerMetrics, ShotEvent } from '@freefall/shared';
import { startServer } from '../src/server.ts';
import { MissionInstance } from '../src/mission/MissionInstance.ts';
import { LocalMissionDebugRoom } from '../src/rooms/FreefallRoom.ts';
import { seededRandom } from '../src/simulation/Battlefield.ts';

function waitFor<T>(room: Room, type: string, matches: (data: T) => boolean, timeoutMs = 4500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unbind();
      reject(new Error(`Timed out waiting for ${type} in ${room.roomId}`));
    }, timeoutMs);
    const unbind = room.onMessage<T>(type, (payload) => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      unbind();
      resolve(payload);
    });
  });
}

test('four real connections share state, reject a fifth, and transfer host on disconnect', { timeout: 15_000 }, async () => {
  const server = await startServer(0, '127.0.0.1', false);
  const rooms: Room[] = [];
  try {
    const address = server.transport.server?.address();
    assert.ok(address && typeof address === 'object');
    const client = new Client(`http://127.0.0.1:${address.port}`);
    const host = await client.create(ARENA_ROOM);
    rooms.push(host);
    // Subscribers are installed before the next simulation packet.
    const listeners = (room: Room) => room.onMessage('*', () => {});
    listeners(host);
    for (let i = 0; i < 3; i++) {
      const member = await client.joinById(host.roomId);
      listeners(member);
      rooms.push(member);
    }
    await assert.rejects(() => client.joinById(host.roomId));
    const rosters = await Promise.all(rooms.map((room) =>
      waitFor<PlayersSnapshot>(room, 'players', (p) => p.players.length === 4),
    ));
    const expected = rooms.map((room) => room.sessionId).sort();
    for (const roster of rosters) {
      assert.deepEqual(roster.players.map((p) => p.id).sort(), expected);
      assert.equal(roster.host, host.sessionId);
    }

    await waitFor<ServerMetrics>(host, 'metrics', (p) => p.tickHz >= 24 && p.tickHz <= 36);
    const forbidden = waitFor<ServerMetrics>(host, 'metrics', () => true);
    rooms[1].send('horde-size', 0);
    assert.equal((await forbidden).hordeSize, 100);

    const hordePackets = rooms.map((room) =>
      waitFor<Uint8Array>(room, 'horde', (p) => p.length >= MAX_ENEMIES * 10),
    );
    host.send('horde-size', MAX_ENEMIES);
    const packed = await Promise.all(hordePackets);
    for (const packet of packed) assert.deepEqual(packet, packed[0]);
    const frame = new HordeFrame();
    assert.equal(decodeHorde(packed[0], frame), true);
    assert.equal(frame.count, MAX_ENEMIES);
    assert.equal(frame.byId.size, MAX_ENEMIES);

    const firstHost = rosters[0].players.find((player) => player.id === host.sessionId);
    assert.ok(firstHost);
    const moved = waitFor<PlayersSnapshot>(rooms[3], 'players', (p) => p.players.some((player) =>
      player.id === host.sessionId && player.z < firstHost.z && player.ack === 10 && player.motion === PLAYER_MOTION.sprint));
    host.send('input', { seq: 10, forward: 1, strafe: 0, sprint: true, yaw: 0, pitch: -0.1, fire: false });
    await moved;
    const remoteShot = waitFor<ShotEvent>(rooms[3], 'shot', (p) => p.shooter === host.sessionId);
    host.send('input', { seq: 11, forward: 0, strafe: 0, sprint: false, aim: true, yaw: 0, pitch: -.2, fire: true });
    await remoteShot;
    const reloading = waitFor<PlayersSnapshot>(rooms[3], 'players', (p) => p.players.some((player) =>
      player.id === host.sessionId && player.motion === PLAYER_MOTION.aim && player.pitch === -.2 &&
      (player.reloadUntil ?? 0) > p.tick && (player.ammo ?? TEST_RIFLE.magazineSize) < TEST_RIFLE.magazineSize));
    host.send('input', { seq: 12, forward: 0, strafe: 0, sprint: false, yaw: 0, pitch: -.2, aim: true, fire: false, reload: true });
    await reloading;

    rooms[0].reconnection.enabled = false;
    const transferred = waitFor<PlayersSnapshot>(rooms[1], 'players', (p) => p.players.length === 3);
    await host.leave(false);
    assert.equal((await transferred).host, rooms[1].sessionId);
    const emptyHorde = waitFor<Uint8Array>(rooms[3], 'horde', (p) => p.byteLength === 6);
    rooms[1].send('horde-size', 0);
    await emptyHorde;

    const replacement = await client.joinById(host.roomId);
    listeners(replacement);
    rooms.push(replacement);
    const restored = await waitFor<PlayersSnapshot>(replacement, 'players', (p) => p.players.length === 4);
    assert.equal(restored.host, rooms[1].sessionId);
    assert.ok(restored.players.some((p) => p.id === replacement.sessionId && p.slot === firstHost.slot));

    const activeRooms = [...rooms.slice(1, 4), replacement];
    const crouched = waitFor<PlayersSnapshot>(activeRooms[0], 'players', (s) =>
      s.players.length === 4 && s.players.every((p) => p.posture?.current === 'CROUCHING'));
    for (const room of activeRooms) {
      const { life } = restored.players.find((p) => p.id === room.sessionId)!;
      room.send('input', { seq: 12, life, posture: 'crouch', yaw: 0, forward: 0, strafe: 0,
        pitch: 0, sprint: false, fire: false });
    }
    await crouched;
    const airborne = waitFor<PlayersSnapshot>(activeRooms[1], 'players', (s) =>
      s.players.length === 4 && s.players.every((p) => p.posture?.current === 'DIVING' && (p.y ?? 0) > 0));
    const landed = activeRooms.map((room) => waitFor<PlayersSnapshot>(room, 'players', (s) =>
      s.players.length === 4 && s.players.every((p) => p.posture?.current === (p.slot % 2 ? 'SUPINE' : 'PRONE'))));
    for (const room of activeRooms) {
      const { life, slot } = restored.players.find((p) => p.id === room.sessionId)!;
      room.send('input', { seq: 13, life, posture: 'dive', yaw: 0, forward: slot % 2 ? -1 : 1, strafe: slot * .27,
        pitch: 0, sprint: false, fire: false });
    }
    const inFlight = await airborne;
    assert.equal(new Set(inFlight.players.map((p) => p.posture?.dive?.x)).size, 4);
    const grounded = await Promise.all(landed);
    for (const ground of grounded) assert.ok(ground.players.every((p) => (p.y ?? 0) === 0));
    const crew = grounded[0].players;
    const shots = crew.map(({ id }) => waitFor<ShotEvent>(activeRooms[0], 'shot', (event) => event.shooter === id));
    const crawl = waitFor<PlayersSnapshot>(activeRooms[0], 'players', (s) =>
      s.players.length === 4 && s.players.every((p) => p.ack === 14 &&
        Math.hypot(p.x - crew.find((first) => first.id === p.id)!.x, p.z - crew.find((first) => first.id === p.id)!.z) > .001));
    const fire = { yaw: 0, pitch: 0, forward: .65, strafe: .4, sprint: false, aim: true, fire: true };
    for (const room of activeRooms) {
      room.send('input', { ...fire, seq: 14, life: crew.find((p) => p.id === room.sessionId)!.life });
    }
    for (const shot of await Promise.all(shots)) {
      assert.ok(shot.tactical && shot.fromY <= .48);
      assert.ok(shot.tick !== undefined && shot.tick >= grounded[0].tick);
      assert.equal(shot.life, crew.find((p) => p.id === shot.shooter)?.life);
    }
    await crawl;
    const reloaded = waitFor<PlayersSnapshot>(activeRooms[0], 'players', (s) =>
      s.players.every((p) => p.ack === 15 && p.ammo === TEST_RIFLE.magazineSize && !p.reloadUntil &&
        p.equipment?.magazines.primary === crew.find((first) => first.id === p.id)!.equipment!.magazines.primary - 1));
    for (const room of activeRooms) {
      const tap = { ...fire, seq: 15, fire: false, reload: true, forward: 0, strafe: 0,
        life: crew.find((p) => p.id === room.sessionId)!.life };
      room.send('input', tap);
      room.send('input', tap);
    }
    await reloaded;

    const rising = waitFor<PlayersSnapshot>(activeRooms[0], 'players', (s) =>
      s.players.length === 4 && s.players.every((p) => p.posture?.current === 'GETTING_UP' && p.posture.getUpId === 16));
    const stood = waitFor<PlayersSnapshot>(activeRooms[0], 'players', (s) =>
      s.players.length === 4 && s.players.every((p) => (p.posture?.current ?? 'STANDING') === 'STANDING' && p.ack === 17));
    for (const room of activeRooms) {
      const stand = { ...fire, fire: false, posture: 'stand', life: crew.find((p) => p.id === room.sessionId)!.life };
      room.send('input', { ...stand, seq: 16 });
      room.send('input', { ...stand, seq: 17 });
    }
    await rising;
    await stood;

  } finally {
    await Promise.allSettled(rooms.map((room) => room.leave()));
    await server.gracefullyShutdown(false);
  }
});

test('mission reconnect restores prone and an in-progress supine get-up on its original clock', { timeout: 12_000 }, async () => {
  const server = await startServer(0, '127.0.0.1', false);
  const { port } = server.transport.server?.address() as { port: number };
  const client = new Client('http://127.0.0.1:' + port);
  const rooms: Room[] = [];
  const watch = (room: Room) => {
    rooms.push(room);
    room.reconnection.enabled = false;
    room.onMessage('*', () => {});
    return room;
  };
  try {
    const host = watch(await client.create(BODENBRUCH_ROOM));
    let member = watch(await client.joinById(host.roomId));
    const id = member.sessionId;
    const memberAt = (room: Room, matches: (p: PlayersSnapshot['players'][number]) => boolean) =>
      waitFor<PlayersSnapshot>(room, 'players', (s) => s.players.some((p) => p.id === id && matches(p)));
    const lobby = await memberAt(host, () => true);
    const life = lobby.players.find((p) => p.id === id)!.life;
    const send = (seq: number, posture: 'dive' | 'stand', forward = 0) => member.send('input',
      { seq, life, posture, yaw: 0, forward, strafe: 0, pitch: 0, sprint: false, fire: false });
    const reconnect = async () => {
      const token = member.reconnectionToken;
      await member.leave(false);
      member = watch(await client.reconnect(token));
      assert.equal(member.sessionId, id);
    };
    const prone = memberAt(host, (p) => p.posture?.current === 'PRONE');
    send(1, 'dive', 1);
    await prone;
    await reconnect();
    await memberAt(member, (p) => p.life === life && p.posture?.current === 'PRONE');
    const upright = memberAt(host, (p) => p.ack === 2 && (p.posture?.current ?? 'STANDING') === 'STANDING');
    send(2, 'stand');
    await upright;
    const supine = memberAt(host, (p) => p.posture?.current === 'SUPINE');
    send(3, 'dive', -1);
    await supine;

    const rising = memberAt(host, (p) => p.posture?.current === 'GETTING_UP' && p.posture.getUpId === 4);
    send(4, 'stand');
    const started = (await rising).players.find((p) => p.id === id)!.posture!;
    await reconnect();
    const restored = await memberAt(member, (p) => p.life === life && p.posture?.getUpId === 4);
    assert.equal(restored.players.find((p) => p.id === id)?.posture?.until, started.until);
    const completed = await memberAt(member, (p) => (p.posture?.current ?? 'STANDING') === 'STANDING');
    assert.ok(completed.tick >= started.until && completed.tick <= started.until + 2);
  } finally {
    await Promise.allSettled(rooms.filter((room) => room.connection.isOpen).map((room) => room.leave()));
    await server.gracefullyShutdown(false);
  }
});

test('four networked operators share mission selection, deployment and a reconnectable rescue state', { timeout: 25_000 }, async () => {
  const debug = process.env.FREEFALL_MISSION_DEBUG;
  process.env.FREEFALL_MISSION_DEBUG = '1';
  const serverStart = startServer(0, '127.0.0.1', false);
  if (debug === undefined) delete process.env.FREEFALL_MISSION_DEBUG;
  else process.env.FREEFALL_MISSION_DEBUG = debug;
  const server = await serverStart;
  const rooms: Room[] = [];
  const { port } = server.transport.server?.address() as { port: number };
  const client = new Client('http://127.0.0.1:' + port);
  const watch = (room: Room) => {
    room.onMessage('*', () => {});
    room.reconnection.enabled = false;
    rooms.push(room);
    return room;
  };
  const states = (room: Room, accept: (s: MissionSnapshot) => boolean) => waitFor(room, 'mission-state', accept);
  const selection = { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'freefall' };

  try {
    const host = watch(await client.create(BODENBRUCH_ROOM));
    for (let i = 0; i < 3; i++) watch(await client.joinById(host.roomId));
    const [, guest, wing, peek] = rooms;
    guest.send('mission-start');
    guest.send('mission-selection', selection);
    const lobby = await states(host, (s) => s.operators.length === 4);
    assert.equal(lobby.state, 'CARRIER_HUB');
    assert.equal(lobby.selection, undefined);

    // Walk the host into the in-world console range using ordinary input.
    const walk = setInterval(() => host.send('input', { seq: ++sequence, forward: 1, strafe: 0,
      yaw: .42, pitch: 0, sprint: true, fire: false }), 32);
    let sequence = 0;
    try {
      await waitFor<PlayersSnapshot>(host, 'players', ({ players }) => players.some(({ id, x, z }) =>
        id === host.sessionId && x * x + z * z < 4.5 ** 2));
    } finally {
      clearInterval(walk);
      host.send('input', { seq: ++sequence, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, fire: false });
    }
    const selected = rooms.map((room) => states(room, (s) => s.selection?.difficultyId === 'freefall'));
    host.send('mission-selection', selection);
    const copies = await Promise.all(selected);
    for (const copy of copies) assert.deepEqual(copy.selection, selection);
    host.send('mission-start');
    const boarding = await states(host, ({ state }) => state === 'BOARDING');
    guest.send('mission-debug', 'deploy');
    assert.equal((await states(host, (s) => s.tick > boarding.tick + 10)).state, 'BOARDING');

    const stages = rooms.map((room) => waitFor<MissionEvent[]>(room, 'mission-events',
      (events) => events.some((event) => event.type === 'AlbatrossTouchdown')));
    host.send('mission-debug', 'land');
    const batches = await Promise.all(stages);
    for (const batch of batches) assert.deepEqual(batch, batches[0]);
    const active = await states(wing, (s) => s.state === 'ACTIVE_MISSION');
    assert.equal(active.albatross?.id, boarding.albatross?.id);
    assert.deepEqual(active.convicts.map(({ id }) => id), boarding.convicts.map(({ id }) => id));
    const loadouts = await waitFor<PlayersSnapshot>(host, 'players', (s) => s.players.every((p) => p.equipment?.stims === 5));
    const switches = rooms.map((room) => waitFor<PlayersSnapshot>(room, 'players',
      (s) => s.players.length === 4 && s.players.every((p) => p.equipment?.slot === 'secondary')));
    for (const room of rooms) {
      const member = loadouts.players.find((p) => p.id === room.sessionId)!;
      room.send('input', { seq: room === host ? ++sequence : 1, forward: 0, strafe: 0, yaw: 0, pitch: 0,
        sprint: false, fire: false, equipment: 'secondary', life: member.life });
    }
    await Promise.all(switches);
    const wide = await waitFor<Uint8Array>(wing, 'horde-wide', (packet) => packet.byteLength > 2_000);
    const frame = new HordeFrame();
    assert.ok(decodeHorde(wide, frame, WIDE_POSITION_SCALE));
    assert.ok(frame.x.subarray(0, frame.count).some((x) => x < -128));
    const diagnostics = await waitFor<ServerMetrics>(wing, 'metrics', (metrics) => !!metrics.enemyAI?.samples.length);
    assert.ok(diagnostics.enemyAI!.samples.length <= 4);
    assert.ok(diagnostics.enemyAI!.samples.every(({ id, cooldownTicks }) => id > 0 && cooldownTicks >= 0));
    assert.ok(diagnostics.enemyAI!.navigationMs >= 0);
    host.send('mission-debug', 'objectives');
    await states(host, ({ state }) => state === 'EXTRACTION_AVAILABLE');
    const walkingOut = setInterval(() => host.send('input', { seq: ++sequence, forward: 1, strafe: 0,
      yaw: Math.PI, pitch: 0, sprint: true, fire: false }), 32);
    try {
      await waitFor<PlayersSnapshot>(host, 'players', ({ players }) => players.some(({ id, z }) =>
        id === host.sessionId && z > 165));
    } finally {
      clearInterval(walkingOut);
      host.send('input', { seq: ++sequence, forward: 0, strafe: 0, yaw: Math.PI, pitch: 0, sprint: false, fire: false });
    }
    host.send('mission-action', 'balloon');
    const beacon = await states(peek, (s) => s.extraction?.method === 'balloon');
    assert.ok(beacon.extraction);
    guest.send('mission-action', 'secure');
    await states(host, (s) => s.extraction?.securedIds.includes(guest.sessionId) ?? false);

    const guestLanded = waitFor<PlayersSnapshot>(host, 'players', ({ players }) =>
      players.some((p) => p.id === guest.sessionId && p.posture?.current === 'SUPINE'));
    const guestLife = loadouts.players.find((p) => p.id === guest.sessionId)!.life;
    guest.send('input', { seq: 2, life: guestLife, posture: 'dive', yaw: 0, forward: -1, strafe: 0,
      pitch: 0, sprint: false, fire: false });
    await guestLanded;

    const token = guest.reconnectionToken;
    const hordeTick = (packet: Uint8Array) => new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(0, true);
    const hostHordes = new Map<number, Uint8Array>();
    const stopHordes = host.onMessage<Uint8Array>('horde-wide', (packet) => {
      const tick = hordeTick(packet);
      hostHordes.set(tick, packet);
      hostHordes.delete(tick - 30);
    });
    await guest.leave(false);
    await states(host, (s) => s.operators.some(({ id, connected }) => id === guest.sessionId && !connected));
    const rejoined = watch(await client.reconnect(token));
    const restored = await states(rejoined, (s) => s.extraction?.method === 'balloon');
    const cohort = new HordeFrame();
    const packet = await waitFor<Uint8Array>(rejoined, 'horde-wide', (data) =>
      decodeHorde(data, cohort, WIDE_POSITION_SCALE) && cohort.count > 0);
    const reference = hostHordes.get(cohort.tick) ??
      await waitFor<Uint8Array>(host, 'horde-wide', (data) => hordeTick(data) === cohort.tick);
    assert.deepEqual(packet, reference);
    assert.ok(new Set(cohort.id.subarray(0, cohort.count)).size === cohort.count);
    stopHordes();
    assert.equal(rejoined.sessionId, guest.sessionId);
    await waitFor<PlayersSnapshot>(rejoined, 'players', (s) =>
      s.players.some((p) => p.id === guest.sessionId && p.equipment?.slot === 'secondary' && p.ammo === 12 && p.posture?.current === 'SUPINE'));
    assert.ok(restored.primaryObjectivesCompleted);
    assert.equal(restored.instanceId, active.instanceId);
    assert.deepEqual(restored.convicts.map(({ id }) => id), active.convicts.map(({ id }) => id));
    assert.equal(restored.extraction?.startedAt, beacon.extraction.startedAt);
    assert.equal(restored.extraction?.securedIds.includes(guest.sessionId), false);
    await peek.leave();
    await assert.rejects(() => client.joinById(host.roomId));
    host.send('mission-debug', 'fighter');
    await states(host, (s) => s.extraction?.phase === 'LIFT');
    // The fighter tows the line for BALLOON.liftTicks before the result.
    const finished = await waitFor<MissionSnapshot>(host, 'mission-state', (s) => !!s.result, 8000);
    assert.deepEqual(finished.result?.extractedOperatorIds, [host.sessionId]);
    assert.equal(finished.result?.primaryObjectivesCompleted, true);
    for (const member of [host, wing, rejoined]) member.send('mission-action', 'return-vote');
    const returned = await states(host, (s) => s.state === 'CARRIER_HUB');
    assert.equal(returned.instanceId, undefined);
    assert.equal(returned.convicts.length, 0);
    const nextOperator = watch(await client.joinById(host.roomId));
    const arrived = await states(nextOperator, (s) => s.operators.length === 4);
    assert.equal(arrived.state, 'CARRIER_HUB');
  } finally {
    await Promise.allSettled(rooms.filter((room) => room.connection.isOpen).map((room) => room.leave()));
    await server.gracefullyShutdown(false);
  }
});

test('four Colyseus peers share authoritative enemy timing at 140 ms simulated RTT and recover an in-flight attack', { timeout: 12_000 }, async () => {
  const server = await startServer(0, '127.0.0.1', false);
  const { port } = server.transport.server?.address() as { port: number };
  const client = new Client(`http://127.0.0.1:${port}`);
  const rooms: Room[] = [];
  type Hit = Extract<CombatEvent, { type: 'enemy-hit' }>;
  const watch = (room: Room) => {
    rooms.push(room);
    room.reconnection.enabled = false;
    room.onMessage('*', () => {});
    return room;
  };
  try {
    const host = watch(await client.create(BODENBRUCH_ROOM));
    for (let i = 1; i < 4; i++) watch(await client.joinById(host.roomId));
    const local = matchMaker.getLocalRoomById(host.roomId);
    assert.ok(local);
    const mission: MissionInstance = Reflect.get(local, 'arena');
    const horde = mission.horde;
    assert.ok(mission.debug(host.sessionId, 'land'));
    while (horde.count) horde.despawn(horde.active[horde.count - 1]);
    const startsAfter = mission.tick;
    const enemies = rooms.map((room, i) => {
      const player = mission.players.find((p) => p?.id === room.sessionId)!;
      const posture = (['STANDING', 'CROUCHING', 'PRONE', 'SUPINE'] as const)[i];
      Object.assign(player, { x: -75 + i * 23, z: 5, protectedUntil: 0, posture: { ...newPosture(), current: posture } });
      const point = { x: player.x, z: player.z };
      const group = mission.director.patrols.create({ ...point, id: 'enemy-combat-' + i, radius: 4, route: { waypoints: [point] } }, 0);
      const slot = horde.spawn(player.x, player.z + 1, SCHABE_TYPE);
      mission.director.patrols.attach(group, slot);
      mission.director.patrols.forceAlert(group, player, mission.tick);
      group.nextCall = Infinity;
      horde.yaw[slot] = 0;
      return horde.id[slot];
    });
    server.simulateLatency(140);
    const hits = new Map<Room, Hit[]>();
    for (const room of rooms) {
      const observed: Hit[] = [];
      hits.set(room, observed);
      room.onMessage<CombatEvent[]>('combat', (events) => {
        for (const event of events) {
          if (event.type === 'enemy-hit' && enemies.includes(event.enemy)) observed.push(event);
        }
      });
    }
    const timings = BALANCE.swarm.meleeAttack;
    const read = (room: Room, matches: (frame: HordeFrame) => boolean) => {
      const frame = new HordeFrame();
      return waitFor<Uint8Array>(room, 'horde-wide', (packet) => decodeHorde(packet, frame, WIDE_POSITION_SCALE) && matches(frame))
        .then(() => frame);
    };
    const attackStart = (frame: HordeFrame, id: number): number => {
      const index = frame.byId.get(id);
      const age = index === undefined ? 0 : frame.attackAge[index];
      return age ? frame.tick + 1 - age : -1;
    };
    const frameForAll = rooms.map((room) => read(room, (frame) => frame.tick > startsAfter &&
      enemies.every((id) => attackStart(frame, id) > startsAfter) &&
      frame.tick - Math.min(...enemies.map((id) => attackStart(frame, id))) < timings.windupTicks));
    const damage = ENEMY_TYPES[SCHABE_TYPE].meleeDamage;
    const hp = mission.players[0]!.hp;
    const healthSeen = rooms.map((room) => waitFor<PlayersSnapshot>(room, 'players',
      (snapshot) => snapshot.players.length === 4 && snapshot.players.every((p) => p.hp === hp - damage)));
    const frames = await Promise.all(frameForAll);
    await Promise.all(healthSeen);
    for (const frame of frames) {
      assert.deepEqual(enemies.map((id) => attackStart(frame, id)), enemies.map((id) => attackStart(frames[0], id)));
      assert.equal(frame.windupTicks, timings.windupTicks);
    }
    for (const room of rooms) {
      const observed = hits.get(room)!;
      assert.equal(observed.length, 4);
      assert.equal(new Set(observed.map((hit) => hit.attack)).size, 4);
      assert.deepEqual(new Set(observed.map((hit) => hit.target)), new Set(rooms.map(({ sessionId }) => sessionId)));
      for (const hit of observed) {
        const activeAt = attackStart(frames[0], hit.enemy) + timings.windupTicks;
        assert.ok(hit.tick >= activeAt && hit.tick < activeAt + timings.activeTicks);
      }
    }

    server.simulateLatency(0);
    const first = attackStart(frames[0], enemies[0]);
    const next = await read(host, (frame) => attackStart(frame, enemies[0]) > first &&
      frame.tick - attackStart(frame, enemies[0]) < timings.windupTicks);
    const nextStart = attackStart(next, enemies[0]);
    const observer = rooms[3];
    const id = observer.sessionId;
    const oldLife = mission.players.find((p) => p?.id === id)!.life;
    const token = observer.reconnectionToken;
    await observer.leave(false);
    const rejoined = watch(await client.reconnect(token));
    assert.equal(rejoined.sessionId, id);
    assert.equal(mission.players.find((p) => p?.id === id)!.life, oldLife);
    const restored = await read(rejoined, (frame) => attackStart(frame, enemies[0]) === nextStart);
    assert.ok(restored.tick >= next.tick);
    const observedByHost = hits.get(host)!;
    assert.equal(observedByHost.filter(({ enemy, attack }) => enemy === enemies[0] && attack === `${enemy}:${first}`).length, 1);
  } finally {
    server.simulateLatency(0);
    await Promise.allSettled(rooms.filter((room) => room.connection.isOpen).map((room) => room.leave()));
    await server.gracefullyShutdown(false);
  }
});

test('four clients receive one authoritative wave and reconnect twice at the 1,000-enemy cap', { timeout: 20_000 }, async () => {
  const server = await startServer(0, '127.0.0.1', false);
  const roomName = 'seeded-wave-test';
  // Keep candidate visibility and wave placement repeatable while exercising the real room and transport.
  server.define(roomName, class extends LocalMissionDebugRoom {
    protected override createSimulation(): MissionInstance { return new MissionInstance(77, BODENBRUCH); }
  });
  const rooms: Room[] = [];
  const address = server.transport.server?.address();
  assert.ok(address && typeof address === 'object');
  const client = new Client('http://127.0.0.1:' + address.port);
  function watch(room: Room) {
    rooms.push(room);
    room.onMessage('*', () => {});
    room.reconnection.enabled = false;
    return room;
  }
  const snapshots = (room: Room, accept: (s: MissionSnapshot) => boolean) => waitFor(room, 'mission-state', accept);
  const waveEvents = (room: Room, type: 'HordeWaveStarted' | 'HordeWaveEnded') =>
    waitFor<MissionEvent[]>(room, 'mission-events', (events) => events.some((event) => event.type === type));

  let stage = 'deployment';
  try {
    const host = watch(await client.create(roomName));
    const startedWaves: number[] = [];
    host.onMessage<MissionEvent[]>('mission-events', (batch) => {
      for (const event of batch) if (event.type === 'HordeWaveStarted') startedWaves.push(event.waveId);
    });
    for (let i = 1; i < 4; i++) watch(await client.joinById(host.roomId));
    const guest = rooms[1];
    const local = matchMaker.getLocalRoomById(host.roomId);
    assert.ok(local);
    const mission: MissionInstance = Reflect.get(local, 'arena');
    Object.assign(mission.players[0]!, { x: 0, z: 3 });
    assert.ok(mission.select(host.sessionId, { planetId: 'dev-ault', missionId: BODENBRUCH.id, difficultyId: 'freefall' }));
    assert.ok(mission.debug(host.sessionId, 'land'));
    for (const player of mission.players) if (player) {
      Object.assign(player, { x: -155 + (player.slot % 2) * 2, z: -45 + (player.slot >> 1) * 2,
        yaw: -Math.PI / 2, protectedUntil: Infinity });
    }
    await snapshots(guest, (s) => s.encounter?.state === 'CALM');
    await assert.rejects(() => client.joinById(host.roomId));
    stage = 'wave start';
    const starts = Promise.all([
      Promise.all(rooms.map((room) => waveEvents(room, 'HordeWaveStarted'))),
      Promise.all(rooms.map((room) => snapshots(room, (s) => s.encounter?.state === 'BUILDUP'))),
    ]);
    host.send('mission-debug', 'horde-wave');
    host.send('mission-debug', 'horde-wave');
    const [events, states] = await starts;
    for (const batch of events) assert.deepEqual(batch, events[0]);
    const start = events[0].find((event) => event.type === 'HordeWaveStarted')!;
    for (const state of states) assert.equal(state.encounter?.waveId, start.waveId);
    stage = 'initial cohort';
    await waitFor<ServerMetrics>(host, 'metrics', () => mission.director.spawns.totals.waveSpawned > 0);
    const group = [...mission.director.patrols.groups.values()].find((candidate) => !candidate.canReinforce);
    assert.ok(group?.members.size);
    const ids = [...group.members.values()];
    const cohortIds = new Set(ids);
    function receivesCohort(room: Room) {
      const frame = new HordeFrame();
      return waitFor<Uint8Array>(room, 'horde-wide', (packet) =>
        decodeHorde(packet, frame, WIDE_POSITION_SCALE) && frame.count >= cohortIds.size &&
          [...cohortIds].every((id) => frame.byId.has(id)))
        .then(() => assert.equal(frame.byId.size, frame.count));
    }
    await Promise.all(rooms.map(receivesCohort));

    stage = 'full population';
    const surface = missionGround(BODENBRUCH.world);
    const random = seededRandom(421337);
    const regions = surface.patrolRegions.map((region) => mission.director.patrols.create(region, 0, 0));
    for (let i = 0; i < MAX_ENEMIES * 20 && mission.horde.count < MAX_ENEMIES; i++) {
      const group = regions[i % regions.length];
      const x = group.region.x + (random() * 2 - 1) * group.region.radius;
      const z = group.region.z + (random() * 2 - 1) * group.region.radius;
      if (!openGround(surface, x, z, .5)) continue;
      mission.director.patrols.attach(group, mission.horde.spawn(x, z, SCHABE_TYPE));
    }
    assert.equal(mission.horde.count, MAX_ENEMIES);
    for (const slot of mission.horde.active.subarray(0, MAX_ENEMIES)) cohortIds.add(mission.horde.id[slot]);
    assert.equal(cohortIds.size, MAX_ENEMIES);
    await Promise.all(rooms.map(receivesCohort));

    stage = 'reconnect';
    let resumed = guest;
    for (let drop = 0; drop < 2; drop++) {
      const token = resumed.reconnectionToken;
      await resumed.leave(false);
      await snapshots(host, (s) => s.operators.some(({ id, connected }) => id === guest.sessionId && !connected));
      resumed = watch(await client.reconnect(token));
      const current = await snapshots(resumed, (s) => s.encounter?.waveId === start.waveId);
      assert.equal(current.instanceId, mission.snapshot().instanceId);
      assert.equal(resumed.sessionId, guest.sessionId);
      await receivesCohort(resumed);
    }

    stage = 'resupply';
    const activePeers = [host, resumed, ...rooms.slice(2, 4)];
    const ship = mission.snapshot().albatross!;
    const container = ship.supply!.find(({ side }) => side === 'left')!;
    const operator = mission.players.find((player) => player?.id === host.sessionId)!;
    Object.assign(operator, { x: ship.x - 4.1, z: ship.z });
    operator.equipment.stims--;
    const resupply = Promise.all([
      Promise.all(activePeers.map((room) => waveEvents(room, 'HordeWaveEnded'))),
      Promise.all(activePeers.map((room) => snapshots(room, (snapshot) =>
        snapshot.albatross?.supply?.some(({ id, charges }) => id === container.id && charges === container.charges - 1) ?? false))),
    ]);
    let sequence = 0;
    const idle = () => host.send('input', { seq: ++sequence, life: operator.life, yaw: operator.yaw, pitch: 0,
      forward: 0, strafe: 0, sprint: false, fire: false });
    idle();
    const keepAlive = setInterval(idle, 33);
    host.send('mission-interact');
    const [finished, supplies] = await resupply.finally(() => clearInterval(keepAlive));
    for (const batch of finished) {
      const end = batch.find((event) => event.type === 'HordeWaveEnded');
      assert.ok(end && end.spawned >= ids.length);
      assert.equal(end.waveId, start.waveId);
      assert.equal(end.reason, 'resupply');
    }
    for (const snapshot of supplies) assert.equal(snapshot.encounter?.state, 'RECOVERY');
    assert.equal(operator.equipment.stims, operator.loadout.medical.maxCharges);
    assert.equal(mission.director.spawns.reserved, 0);
    assert.deepEqual(startedWaves, [start.waveId]);
  } catch (error) {
    throw new Error('Horde multiplayer test failed at ' + stage, { cause: error });
  } finally {
    await Promise.allSettled(rooms.map((room) => room.leave()));
    await server.gracefullyShutdown(false);
  }
});

test('production mission room rejects host debug actions even if local debug is requested', { timeout: 8_000 }, async () => {
  const { NODE_ENV, FREEFALL_MISSION_DEBUG } = process.env;
  process.env.NODE_ENV = 'production';
  process.env.FREEFALL_MISSION_DEBUG = '1';
  const starting = startServer(0, '127.0.0.1', false);
  if (NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = NODE_ENV;
  if (FREEFALL_MISSION_DEBUG === undefined) delete process.env.FREEFALL_MISSION_DEBUG;
  else process.env.FREEFALL_MISSION_DEBUG = FREEFALL_MISSION_DEBUG;
  const server = await starting;
  let room: Room | undefined;
  try {
    const address = server.transport.server?.address();
    assert.ok(address && typeof address === 'object');
    room = await new Client('http://127.0.0.1:' + address.port).create(BODENBRUCH_ROOM);
    room.onMessage('*', () => {});
    const before = await waitFor<MissionSnapshot>(room, 'mission-state', () => true);
    const after = waitFor<MissionSnapshot>(room, 'mission-state', (snapshot) => snapshot.tick > before.tick);
    room.send('mission-debug', 'land');
    room.send('mission-debug', 'horde-wave');
    const snapshot = await after;
    assert.equal(snapshot.state, 'CARRIER_HUB');
    assert.equal(snapshot.encounter, undefined);
    const metrics = await waitFor<ServerMetrics>(room, 'metrics', () => true);
    assert.equal(metrics.activeEnemies, 0);
    assert.equal(metrics.enemyAI, undefined);
    assert.equal(metrics.hordeDirector, undefined);
  } finally {
    await room?.leave();
    await server.gracefullyShutdown(false);
  }
});

for (const worldSeed of [undefined, 76]) test(`${worldSeed === undefined ? 'Fixed world' : 'Green Plains'} generated contract replicates to four WebSocket peers across contested relay, reconnect and result`, { timeout: 20_000 }, async (t) => {
  const debug = process.env.FREEFALL_MISSION_DEBUG;
  process.env.FREEFALL_MISSION_DEBUG = '1';
  const starting = startServer(0, '127.0.0.1', false);
  if (debug === undefined) delete process.env.FREEFALL_MISSION_DEBUG;
  else process.env.FREEFALL_MISSION_DEBUG = debug;
  const server = await starting;
  const { port } = server.transport.server?.address() as { port: number };
  const client = new Client('http://127.0.0.1:' + port);
  const rooms: Room[] = [];
  const snapshots = (room: Room, accept: (data: MissionSnapshot) => boolean, timeout?: number) => waitFor(room, 'mission-state', accept, timeout);
  const events = new Map<string, MissionEvent[]>();
  const watch = (room: Room) => {
    room.onMessage('*', () => {});
    room.reconnection.enabled = false;
    const list = events.get(room.sessionId) ?? [];
    events.set(room.sessionId, list);
    room.onMessage<MissionEvent[]>('mission-events', (batch) => list.push(...batch));
    rooms.push(room);
    return room;
  };
  const fetchPlan = (room: Room, id: string) => {
    const packet = waitFor<MissionPlan>(room, 'mission-plan', (plan) => plan.id === id);
    room.send('mission-plan', id);
    return packet;
  };
  try {
    const host = watch(await client.create(BODENBRUCH_ROOM));
    const guest = watch(await client.joinById(host.roomId));
    const mission: MissionInstance = Reflect.get(matchMaker.getLocalRoomById(host.roomId)!, 'arena');
    const operator = mission.players[0]!;
    Object.assign(operator, { x: 0, z: 3 });
    const request = { planetId: worldSeed === undefined ? 'dev-ault' : 'green-plains',
      missionId: PROCEDURAL_CONTRACT_ID, difficultyId: 'normal', seed: 0, templateId: 'relay-defense', worldSeed,
      ...(worldSeed !== undefined && { timeOfDay: 'dawn' }) };
    guest.send('mission-selection', request);
    assert.equal((await snapshots(host, ({ operators }) => operators.length === 2)).planId, undefined);
    const selection = snapshots(host, ({ planId }) => !!planId);
    host.send('mission-selection', request);
    const selected = await selection;
    assert.ok(selected.planId && !selected.plan);
    host.send('mission-start', 'generated.stale');
    assert.equal((await snapshots(host, ({ tick }) => tick > selected.tick + 2)).state, 'MISSION_SELECTION');
    // Two new peers joining at the briefing must receive the already selected plan.
    const wing = watch(await client.joinById(host.roomId));
    const peek = watch(await client.joinById(host.roomId));
    const peers = [host, guest, wing, peek];
    const plans = await Promise.all(peers.map((room) => fetchPlan(room, selected.planId!)));
    for (const plan of plans) assert.deepEqual(plan, plans[0]);
    const plan = plans[0];
    if (worldSeed !== undefined) {
      assert.equal(plan.world?.seed, worldSeed);
      for (const received of plans) {
        const restored = restoreWorld(received.world!);
        assert.equal(restored?.world.id, mission.definition.world.id);
        assert.deepEqual(restored?.world.terrain, mission.definition.world.terrain);
      }
    }
    const boarding = snapshots(host, ({ state }) => state === 'BOARDING');
    host.send('mission-start', plan.id);
    await boarding;
    const active = snapshots(host, ({ state }) => state === 'ACTIVE_MISSION');
    host.send('mission-debug', 'land');
    const first = await active;
    let transition: AtmosphereState | undefined;
    if (worldSeed !== undefined) {
      const waiting = peers.map((room) => waitFor<AtmosphereState>(room, 'atmosphere-state', (state) => !!state?.target));
      guest.send('mission-debug', 'weather:windy:::22');
      host.send('mission-debug', 'weather:light-mist:::22');
      const states = await Promise.all(waiting);
      transition = states[0];
      for (const state of states) assert.deepEqual(state, transition);
      assert.equal(transition.target?.weather, 'light-mist');
      assert.equal(transition.timeOfDay, 'dawn');
      assert.equal(transition.instanceId, first.instanceId);
    }
    const relay = plan.objectives[0].definition;
    assert.equal(relay.kind, 'activate');
    assert.ok(relay.defenseSeconds);
    for (const player of mission.players) if (player) {
      const x = relay.x + player.slot * .75, z = relay.z - 1;
      Object.assign(player, { x, y: groundHeight(mission.definition.world, x, z), z });
    }
    if (worldSeed !== undefined) {
      const packet = await waitFor<PlayersSnapshot>(guest, 'players', ({ players }) => players.some(({ y }) => !!y));
      assert.equal(new Set(packet.players.map(({ x }) => x)).size, 4);
      for (const player of packet.players) assert.equal(player.y ?? 0, groundHeight(mission.definition.world, player.x, player.z));
    }

    const defense = Promise.all(peers.map((room) => snapshots(room, ({ objectives }) => objectives[0].state === 'defending')));
    host.send('mission-interact');
    guest.send('mission-interact');
    const defending = await defense;
    for (const state of defending) {
      assert.equal(state.planId, plan.id);
      assert.equal(state.instanceId, first.instanceId);
      assert.deepEqual(state.objectives, defending[0].objectives);
    }
    const token = guest.reconnectionToken;
    const dropped = snapshots(host, (s) => s.operators.some((p) => p.id === guest.sessionId && !p.connected));
    await guest.leave(false);
    await dropped;
    await assert.rejects(() => client.joinById(host.roomId));
    const resumed = watch(await client.reconnect(token));
    const resumedState = await snapshots(resumed, ({ objectives }) => objectives[0].state === 'defending');
    assert.equal(resumed.sessionId, guest.sessionId);
    assert.equal(resumedState.instanceId, first.instanceId);
    assert.equal(resumedState.objectives[0].completeAt, defending[0].objectives[0].completeAt);
    assert.deepEqual(await fetchPlan(resumed, plan.id), plan);
    if (transition) {
      const state = waitFor<AtmosphereState>(resumed, 'atmosphere-state', (value) => !!value?.target);
      resumed.send('atmosphere-state');
      assert.deepEqual(await state, transition);
      assert.ok(resumedState.tick >= transition.startTick && resumedState.tick < transition.startTick + transition.durationTicks);
    }
    host.send('mission-selection', { ...request, seed: 1 });
    const available = await snapshots(host, ({ state, planId }) => state === 'EXTRACTION_AVAILABLE' && planId === plan.id, 10_000);
    assert.equal(available.objectives[0].state, 'complete');

    // Stage the crew at the existing boarding footprint to exercise production extraction messages.
    const ship = available.albatross!;
    for (const player of mission.players) if (player) Object.assign(player, { x: ship.x, y: 0, z: ship.z + 1 });
    const extraction = snapshots(host, ({ extraction }) => extraction?.method === 'albatross');
    host.send('mission-action', 'albatross');
    await extraction;
    const cleared = transition && waitFor<null>(host, 'atmosphere-state', (value) => value === null, 8_000);
    for (const room of [resumed, wing, peek]) room.send('mission-action', 'secure');
    const results = await Promise.all([host, resumed, wing, peek].map((room) => snapshots(room, ({ result }) => !!result, 8_000)));
    for (const [index, state] of results.entries()) {
      assert.deepEqual(state.result, results[0].result);
      assert.equal(state.result?.procedural?.planId, plan.id);
      assert.equal(state.result?.extractedOperatorIds.length, 4);
      const mine = events.get(peers[index].sessionId)!;
      assert.equal(mine.filter((event) => event.type === 'ObjectiveUpdated' && event.id === relay.id && event.state === 'defending').length, 1);
      assert.equal(mine.filter((event) => event.type === 'ObjectiveUpdated' && event.id === relay.id && event.state === 'complete').length, 1);
      assert.equal(mine.filter((event) => event.type === 'ExtractionStarted').length, 1);
      assert.equal(mine.filter((event) => event.type === 'MissionCompleted').length, 1);
    }
    if (cleared) assert.equal(await cleared, null);
    assert.equal(mission.atmosphere, undefined);
    t.diagnostic(JSON.stringify({ planId: plan.id, peers: 4, reconnectSessionRetained: true, extracted: 4 }));
  } finally {
    await Promise.allSettled(rooms.map((room) => room.leave()));
    await server.gracefullyShutdown(false);
  }
});

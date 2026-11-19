import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { ARENA_ROOM, BODENBRUCH, BODENBRUCH_ROOM, HordeFrame, MAX_ENEMIES, PLAYER_MOTION, TEST_RIFLE, WIDE_POSITION_SCALE, decodeHorde } from '@freefall/shared';
import type { MissionEvent, MissionSnapshot, PlayersSnapshot, ServerMetrics, ShotEvent } from '@freefall/shared';
import { startServer } from '../src/server.ts';

function waitFor<T>(room: Room, type: string, matches: (data: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unbind();
      reject(new Error(`Timed out waiting for ${type} in ${room.roomId}`));
    }, 4500);
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
    for (const ground of await Promise.all(landed)) assert.ok(ground.players.every((p) => (p.y ?? 0) === 0));

  } finally {
    await Promise.allSettled(rooms.map((room) => room.leave()));
    await server.gracefullyShutdown(false);
  }
});

test('four networked operators share mission selection, deployment and a reconnectable rescue state', { timeout: 20_000 }, async () => {
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
    await guest.leave(false);
    await states(host, (s) => s.operators.some(({ id, connected }) => id === guest.sessionId && !connected));
    const rejoined = watch(await client.reconnect(token));
    const restored = await states(rejoined, (s) => s.extraction?.method === 'balloon');
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
    const finished = await states(host, (s) => !!s.result);
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

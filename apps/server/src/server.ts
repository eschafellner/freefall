import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ARENA_ROOM, BODENBRUCH_ROOM } from '@freefall/shared';
import { BodenbruchRoom, FreefallRoom, LocalMissionDebugRoom } from './rooms/FreefallRoom.ts';

export async function startServer(port: number, host = '127.0.0.1', handleSignals = true) {
  const server = new Server({
    transport: new WebSocketTransport({ maxPayload: 4096, perMessageDeflate: false }),
    greet: false,
    gracefullyShutdown: handleSignals,
  });
  server.define(ARENA_ROOM, FreefallRoom);
  const localDebug = process.env.NODE_ENV !== 'production' && process.env.FREEFALL_MISSION_DEBUG === '1' && (host === '127.0.0.1' || host === '::1');
  server.define(BODENBRUCH_ROOM, localDebug ? LocalMissionDebugRoom : BodenbruchRoom);
  await server.listen(port, host);
  return server;
}

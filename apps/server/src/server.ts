import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ARENA_ROOM, BODENBRUCH_ROOM } from '@freefall/shared';
import { accountApi } from './accounts/AccountApi.ts';
import type { AccountService } from './accounts/AccountService.ts';
import { BodenbruchRoom, FreefallRoom, LocalMissionDebugRoom, withAccounts } from './rooms/FreefallRoom.ts';

export interface ServerOptions {
  /** Ohne Accountdienst laufen Räume im Gastmodus (Tests, Benchmarks). */
  accounts?: AccountService;
}

export async function startServer(port: number, host = '127.0.0.1', handleSignals = true, options: ServerOptions = {}) {
  const { accounts } = options;
  const server = new Server({
    transport: new WebSocketTransport({ maxPayload: 4096, perMessageDeflate: false }),
    greet: false,
    gracefullyShutdown: handleSignals,
    ...(accounts && { express: (app: { use(handler: ReturnType<typeof accountApi>): unknown }) => { app.use(accountApi(accounts)); } }),
  });
  server.define(ARENA_ROOM, withAccounts(FreefallRoom, accounts));
  const localDebug = process.env.NODE_ENV !== 'production' && process.env.FREEFALL_MISSION_DEBUG === '1' && (host === '127.0.0.1' || host === '::1');
  server.define(BODENBRUCH_ROOM, withAccounts(localDebug ? LocalMissionDebugRoom : BodenbruchRoom, accounts));
  await server.listen(port, host);
  return server;
}

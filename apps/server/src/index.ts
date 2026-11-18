import { startServer } from './server.ts';

const host = process.env.FREEFALL_HOST ?? '127.0.0.1';
const port = Number(process.env.FREEFALL_PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid FREEFALL_PORT');
await startServer(port, host);
console.log('FREEFALL game server listening on %s:%d', host, port);

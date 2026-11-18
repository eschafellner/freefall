import { spawn } from 'node:child_process';

const children = ['dev:server', 'dev:client'].map((script) =>
  spawn(process.execPath, [process.env.npm_execpath, 'run', script], {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
);
let closing = false;

function shutdown(code) {
  if (closing) return;
  closing = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') {
        const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        taskkill.on('error', () => child.kill());
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(error);
    }
  }
}

for (const child of children) {
  child.on('exit', (code) => shutdown(code ?? 1));
  child.on('error', (error) => {
    console.error(error);
    shutdown(1);
  });
}
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

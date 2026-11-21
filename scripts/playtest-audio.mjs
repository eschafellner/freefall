import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const verifyFormats = process.env.FREEFALL_AUDIO_FORMATS === '1';
const web = await createServer({
  root: fileURLToPath(new URL('../apps/client', import.meta.url)), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: true },
});
await web.listen();
const browser = await chromium.launch({ chromiumSandbox: false, executablePath: process.env.CHROMIUM_EXECUTABLE });
try {
  const page = await browser.newPage();
  const errors = [];
  const requests = new Map();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    requests.set(path, (requests.get(path) ?? 0) + 1);
  });
  // Force a real fallback to MP3 for one bed. The other files exercise the normal Ogg route.
  await page.route('**/audio/ice-bed.ogg', (route) => route.fulfill({ status: 404, body: 'test missing format' }));
  await page.addInitScript(() => {
    const original = AudioNode.prototype.connect;
    window.measureAudio = null;
    const createPanner = AudioContext.prototype.createPanner;
    AudioContext.prototype.createPanner = function () {
      const panner = createPanner.call(this);
      window.lastPanner = panner;
      return panner;
    };
    AudioNode.prototype.connect = function (destination, ...args) {
      const output = original.call(this, destination, ...args);
      if (destination !== this.context.destination) return output;
      const splitter = this.context.createChannelSplitter(2);
      const analyzers = [0, 1].map((channel) => {
        const analyzer = this.context.createAnalyser();
        analyzer.fftSize = 4096;
        original.call(splitter, analyzer, channel, 0);
        return analyzer;
      });
      original.call(this, splitter);
      window.measureAudio = () => analyzers.map((analyzer) => {
        const data = new Float32Array(analyzer.fftSize);
        analyzer.getFloatTimeDomainData(data);
        return Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length);
      });
      return output;
    };
  });
  await page.goto('http://127.0.0.1:' + web.httpServer.address().port + '/?audioLab');
  await page.getByRole('heading', { name: 'Audio-Test' }).waitFor();
  assert.equal(await page.evaluate(() => window.measureAudio), null);
  const metrics = [];
  for (const [planet, weather, prefix] of [
    ['ice', 'windy-snow', 'ice'], ['desert', 'light-dust-gusts', 'desert'],
    ['green-plains', 'windy', 'plains'], ['forest', 'windy-forest', 'forest'],
  ]) {
    await page.getByRole('combobox', { name: 'Planet' }).selectOption(planet);
    await page.getByRole('combobox', { name: 'Wetter' }).selectOption(weather);
    await page.getByRole('button', { name: 'Soundscape spielen' }).click();
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('running · 2/28'));
    const rms = await page.waitForFunction(() => {
      const levels = window.measureAudio?.();
      return levels?.every((n) => n > .001) ? levels : undefined;
    }).then((handle) => handle.jsonValue());
    assert.equal(requests.get('/audio/' + prefix + '-wind.ogg'), 1);
    assert.equal(requests.get('/audio/' + prefix + '-bed.' + (planet === 'ice' ? 'mp3' : 'ogg')), 1);
    metrics.push({ planet, weather, rms, status: await page.locator('output').textContent() });
    await page.getByRole('button', { name: 'Stoppen', exact: true }).click();
    await delay(120);
  }
  const ratio = async (side) => {
    const position = page.getByRole('slider', { name: 'Position (m)' });
    await position.press('Home');
    for (let n = -34; n < side; n++) await position.press('ArrowRight');
    assert.equal(await position.inputValue(), String(side));
    await page.getByRole('button', { name: '3D-Quelle spielen' }).click();
    const samples = await page.evaluate(async () => {
      const levels = [];
      for (let i = 0; i < 50; i++) {
        levels.push(window.measureAudio());
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return levels;
    });
    const totals = [0, 1].map((channel) => Math.sqrt(samples.reduce((sum, rms) => sum + rms[channel] ** 2, 0) / samples.length));
    const actual = await page.evaluate(() => {
      const panner = window.lastPanner;
      return panner && { x: panner.positionX.value, y: panner.positionY.value, z: panner.positionZ.value, model: panner.panningModel };
    });
    assert.equal(actual?.x, side, JSON.stringify({ side, actual, totals }));
    const direct = side < 0 ? 0 : 1;
    assert.ok(totals[direct] > totals[1 - direct] * 1.08, JSON.stringify({ side, actual, totals }));
    return totals;
  };
  const left = await ratio(-8);
  await delay(1450);
  const right = await ratio(8);
  await delay(1450);
  const fartherRight = await ratio(29);
  assert.ok(fartherRight[1] < right[1] * .55, JSON.stringify({ right, fartherRight }));
  await page.getByRole('button', { name: 'Soundscape spielen' }).click();
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('running · 2/28'));
  await page.getByRole('button', { name: 'Windup spielen' }).click();
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('Ducking'));
  await page.waitForFunction(() => {
    const status = document.querySelector('output')?.textContent ?? '';
    return status.includes('MiB') && !status.includes('Ducking');
  });
  await page.getByRole('button', { name: 'Stoppen', exact: true }).click();
  await page.getByRole('button', { name: '1.000 Audioereignisse testen' }).click();
  await page.waitForFunction(() => /9[0-9]{2} verworfen/.test(document.querySelector('output')?.textContent ?? ''));
  const stress = await page.locator('output').textContent();
  assert.match(stress, /9[0-9]{2} verworfen/);
  assert.deepEqual(errors, []);
  let files;
  if (verifyFormats) {
    await page.unroute('**/audio/ice-bed.ogg');
    const catalog = JSON.parse(await readFile(new URL('../docs/audio-masters.json', import.meta.url), 'utf8'));
    files = await page.evaluate(async (masters) => {
      const decoder = new OfflineAudioContext(2, 1, 48000);
      const files = [];
      for (const { id, crossfade } of masters) for (const format of ['ogg', 'mp3']) {
        const file = `${id}.${format}`;
        const response = await fetch('/audio/' + file);
        if (!response.ok) throw new Error(`${file}: ${response.status}`);
        const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
        let peak = 0, sumSquares = 0, seam = 0, localDelta = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const samples = buffer.getChannelData(channel);
          for (const value of samples) {
            peak = Math.max(peak, Math.abs(value));
            sumSquares += value ** 2;
          }
          if (!crossfade) continue;
          seam = Math.max(seam, Math.abs(samples[0] - samples.at(-1)));
          const count = Math.round(buffer.sampleRate * .05);
          for (let i = 1; i < count; i++) localDelta = Math.max(localDelta,
            Math.abs(samples[i] - samples[i - 1]), Math.abs(samples.at(-i) - samples.at(-i - 1)));
        }
        files.push({ file, seconds: buffer.duration, channels: buffer.numberOfChannels, peak,
          rms: Math.sqrt(sumSquares / (buffer.length * buffer.numberOfChannels)), ...(crossfade && { seam, localDelta }) });
      }
      return files;
    }, catalog);
    assert.equal(files.length, catalog.length * 2);
    assert.ok(files.every(({ seconds, peak, rms }) => seconds > 0 && peak < 1 && rms > 0));
    assert.deepEqual(errors, []);
  }
  console.log(JSON.stringify({ chromium: browser.version(), metrics, spatial: { left, right, fartherRight },
    ducking: true, stress, files, errors }, null, 2));
} finally {
  await browser.close();
  await web.close();
}

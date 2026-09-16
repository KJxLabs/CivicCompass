import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
for (const script of scripts) {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: script, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

// Exercise the real early-viewport code without a browser or external packages.
// These are lifecycle regressions, not a substitute for on-device visual QA.
const listeners = new Map();
const frames = new Map();
const values = new Map();
let nextFrame = 0;
const on = (target) => (name, callback) => listeners.set(`${target}:${name}`, callback);
const viewport = { height: 640, scale: 1, addEventListener: on('viewport') };
const environment = {
  window: { visualViewport: viewport, innerHeight: 800, matchMedia: () => ({ matches: true }), addEventListener: on('window') },
  document: { documentElement: { style: { setProperty: (key, value) => values.set(key, value) } } },
  history: { scrollRestoration: 'auto' },
  requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
  cancelAnimationFrame: (id) => frames.delete(id)
};
runInNewContext(scripts[0], environment);
const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); };
const height = () => values.get('--mcc-viewport-height');
assert.equal(height(), '640px', 'Cold load must use the visible height with browser chrome expanded');
assert.equal(environment.history.scrollRestoration, 'manual');
viewport.height = 724;
listeners.get('viewport:resize')();
listeners.get('window:resize')();
assert.equal(frames.size, 1, 'Coalesce duplicate resize events into a single layout update');
flush();
assert.equal(height(), '724px', 'Browser-toolbar collapse must update without scrolling the page');
viewport.height = 610;
listeners.get('window:pageshow')();
flush();
assert.equal(height(), '610px', 'Back/forward cache restoration must resync the visible height');
viewport.scale = 2;
viewport.height = 305;
listeners.get('viewport:resize')();
flush();
assert.equal(height(), '610px', 'Pinch zoom must not shrink the layout');
viewport.scale = 1;
viewport.height = 390;
listeners.get('viewport:resize')();
flush();
assert.equal(height(), '390px', 'Orientation changes must use the new visible height');
environment.window.visualViewport = undefined;
runInNewContext(scripts[0], environment);
assert.equal(height(), '800px', 'Fallback browsers must use innerHeight');

const cameraStart = html.indexOf('function cameraFrameForPoints(');
const cameraEnd = html.indexOf('let siteBuildingFramePoints', cameraStart);
assert(cameraStart > 0 && cameraEnd > cameraStart);
const cameraFrame = new Function(`${html.slice(cameraStart, cameraEnd)}; return cameraFrameForPoints;`)();
const yaw = Math.PI + 78.1 * Math.PI / 180;
const points = [];
// Full footprint, roof and markers of two angled wings, rather than just the
// three arch centers. This catches the previous hard camera-distance cap.
for (const [length, angle] of [[28, Math.PI], [42.2, -.727]]) {
  for (const distance of [0, length]) for (const lateral of [-5.5, 5.5]) for (const y of [-2, 18]) {
    points.push({ x: Math.cos(angle) * distance + Math.sin(angle) * lateral, y, z: Math.sin(angle) * distance - Math.cos(angle) * lateral });
  }
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
let cases = 0;
for (const [width, height] of [[320, 235], [375, 280], [390, 360], [430, 420], [440, 220], [844, 265], [1440, 800], [180, 700]]) {
  for (const pitch of [.58, .96, 1.02]) {
    const frame = cameraFrame(points, yaw, pitch, width / height, 42, 1.14, 40);
    assert(Number.isFinite(frame.distance) && frame.distance > 0);
    const direction = { x: Math.cos(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.sin(yaw) * Math.cos(pitch) };
    const right = { x: Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    const up = { x: -Math.cos(yaw) * Math.sin(pitch), y: Math.cos(pitch), z: -Math.sin(yaw) * Math.sin(pitch) };
    for (const point of points) {
      const relative = { x: point.x - frame.target.x, y: point.y - frame.target.y, z: point.z - frame.target.z };
      const depth = frame.distance - dot(relative, direction);
      assert(depth > 0);
      const halfHeight = depth * Math.tan(42 * Math.PI / 360);
      assert(Math.abs(dot(relative, right)) / (halfHeight * width / height) <= 1 / 1.14 + 1e-9, `${width}×${height}: clipped horizontal bounds`);
      assert(Math.abs(dot(relative, up)) / halfHeight <= 1 / 1.14 + 1e-9, `${width}×${height}: clipped vertical bounds`);
    }
    cases++;
  }
}

const mobileShell = html.slice(html.indexOf('/* One viewport owner'), html.indexOf('@media (prefers-reduced-motion: reduce)', html.indexOf('/* One viewport owner')));
for (const rule of [
  'grid-template-rows: auto auto minmax(0, 1fr) minmax(0, auto) auto',
  'grid-area: 1 / 1', 'grid-area: 2 / 1', 'grid-area: 3 / 1', 'grid-area: 4 / 1', 'grid-area: 5 / 1',
  'grid-template-rows: auto 0 minmax(0, .38fr) minmax(0, .62fr) auto',
  'white-space: normal', 'object-fit: contain', '(orientation: landscape)'
]) assert(mobileShell.includes(rule), `Missing mobile layout protection: ${rule}`);
assert(!mobileShell.includes('height: 61%') && !mobileShell.includes('height: 38%'), 'Guide panels must share remaining grid space, not overlap using full-screen percentages');
assert(!mobileShell.includes('text-overflow: ellipsis'), 'Essential instructions must wrap');
assert(!html.includes('focusInitialMobileMap'), 'Do not restore the delayed scroll workaround');
const initialization = html.slice(html.indexOf('document.fonts?.ready.then(scheduleViewerLayout)'));
const ordered = ['buildRoute();', 'await new Promise(', 'resizeViewer();', 'fitSiteStartOverview({ instant: true });', 'renderer.render(scene, camera);', "root.dataset.state = 'ready'"];
let position = 0;
for (const part of ordered) {
  position = initialization.indexOf(part, position);
  assert(position >= 0, `First frame is exposed before layout is ready: ${part}`);
  position += part.length;
}
console.log(`Civic Compass layout validation passed: viewport lifecycle, ${cases} camera projections, first-frame sequencing, JavaScript syntax.`);

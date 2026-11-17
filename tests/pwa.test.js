import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('FEV PWA manifest uses the GitHub Pages subpath and app icons', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/guild-member-manager/');
  assert.equal(manifest.scope, '/guild-member-manager/');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192','512x512']);
  assert.match(read('index.html'), /apple-touch-icon\.png/);
  assert.match(read('index.html'), /viewport-fit=cover/);
});

test('FEV logo only contains lettering; baseball visuals are a separate background', () => {
  const logo = read('public/fev-logo.svg');
  assert.match(logo, /aria-label="FEV"/);
  assert.doesNotMatch(logo, /baseball|shield|bat|circle|<image/i);
  assert.match(read('public/baseball-field.svg'), /<path/);
  assert.match(read('src/App.jsx'), /baseball-field\.svg/);
});

test('offline service worker and update controls are present', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /__FEV_PRECACHE__/);
  assert.match(sw, /cache\.addAll/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(read('scripts/finalize-sw.mjs'), /assets/);
  assert.match(read('src/PwaControls.jsx'), /serviceWorker\.register/);
});

test('iPhone installation help and local-only data warning are visible', () => {
  const control = read('src/PwaControls.jsx');
  assert.match(control, /加入主畫面/);
  assert.match(control, /JSON 備份/);
});

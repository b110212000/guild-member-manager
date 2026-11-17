import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('FEV logo, favicon and dark baseball branding are wired', () => {
 const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
 const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
 const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
 const crest = readFileSync(new URL('../public/fev-logo.svg', import.meta.url), 'utf8');
 assert.match(app, /fev-logo\.svg/g);
 assert.match(app, /OWN THE/);
 assert.match(app, /GROUPS\.map/);
 assert.match(html, /FEV \| 公會成員管理/);
 assert.match(styles, /#080d16/);
 assert.match(styles, /\.modal-backdrop/);
 assert.match(crest, /FEV/);
});

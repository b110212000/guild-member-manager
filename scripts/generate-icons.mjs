import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const svg = await readFile(new URL('../public/fev-logo.svg', import.meta.url));
for (const [size, filename] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  const inner = await sharp(svg).resize({ width: Math.round(size * .78) }).png().toBuffer();
  await sharp({create:{width:size,height:size,channels:4,background:'#081421'}})
    .composite([{input:inner,gravity:'centre'}]).png().toFile(new URL('../public/' + filename, import.meta.url).pathname);
}
console.log('Generated iPhone/PWA icons using the FEV wordmark');

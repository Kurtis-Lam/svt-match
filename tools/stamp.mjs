// Cache-busting: rewrites ?v=... on every /gameplay/css|js link in game.html to a hash of that file.
// Run after editing any file under public/gameplay/{css,js}:   node tools/stamp.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'gameplay');
const htmlPath = join(dir, 'game.html');
let html = readFileSync(htmlPath, 'utf8');
let changed = 0;
html = html.replace(/((?:src|href)=")(?:\/gameplay\/)?((?:js|css)\/[^"?]+)\?v=[^"]*(")/g, (_, a, file, c) => {
  const hash = createHash('md5').update(readFileSync(join(dir, file))).digest('hex').slice(0, 8);
  changed++;
  return `${a}/gameplay/${file}?v=${hash}${c}`;
});
writeFileSync(htmlPath, html);
console.log(`stamped ${changed} asset links`);

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(repoDir, 'public');
const htmlPath = join(publicDir, 'gameplay', 'game.html');
let html = readFileSync(htmlPath, 'utf8');
let changed = 0;
html = html.replace(/((?:src|href)=")(\/(?:js|css|shared)\/[^"?]+)\?v=[^"]*(")/g, (_, before, urlPath, after) => {
  const filePath = join(publicDir, urlPath.slice(1));
  const hash = createHash('md5').update(readFileSync(filePath)).digest('hex').slice(0, 8);
  changed++;
  return `${before}${urlPath}?v=${hash}${after}`;
});
writeFileSync(htmlPath, html);
console.log(`stamped ${changed} asset links`);

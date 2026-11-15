// Stamps index.html and workshop.html with a new version so browsers always load the
// latest code after an update (GitHub Pages lets browsers cache files for 10 minutes).
// Run before committing a release:  node tools/stamp-version.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const d = new Date();
const ver = `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}-${d.getUTCHours().toString().padStart(2, '0')}${d.getUTCMinutes().toString().padStart(2, '0')}`;
const modules = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).sort();

for (const [page, css, entry] of [['index.html', 'css/style.css', 'js/main.js'], ['workshop.html', 'css/workshop.css', 'js/workshop.js']]) {
  const file = path.join(root, page);
  let html = fs.readFileSync(file, 'utf8');
  // every module (including ones imported by other modules) is loaded with ?v=<version>
  const map = { imports: Object.fromEntries(modules.map(m => [`./js/${m}`, `./js/${m}?v=${ver}`])) };
  const block = `<!--version:start-->\n  <meta name="game-version" content="${ver}">\n  <link rel="stylesheet" href="${css}?v=${ver}">\n  <script type="importmap">${JSON.stringify(map)}</script>\n  <!--version:end-->`;
  if (html.includes('<!--version:start-->')) html = html.replace(/<!--version:start-->[\s\S]*?<!--version:end-->/, block);
  else html = html.replace(new RegExp(`<link rel="stylesheet" href="${css.replace('.', '\\.')}">`), block);
  html = html.replace(new RegExp(`<script type="module" src="${entry.replace('.', '\\.')}(\\?v=[^"]*)?"></script>`), `<script type="module" src="${entry}?v=${ver}"></script>`);
  fs.writeFileSync(file, html);
}
console.log(`stamped version ${ver} (${modules.length} modules)`);

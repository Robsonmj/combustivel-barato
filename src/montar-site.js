// Monta a pasta _site (telas + dados JSON) para o GitHub Pages. Roda no GitHub Actions.
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const SAIDA = path.join(raiz, '_site');
fs.rmSync(SAIDA, { recursive: true, force: true });
fs.cpSync(path.join(raiz, 'public'), SAIDA, { recursive: true });
fs.cpSync(path.join(raiz, 'publicado', 'api'), path.join(SAIDA, 'api'), { recursive: true });

const index = path.join(SAIDA, 'index.html');
fs.writeFileSync(index, fs.readFileSync(index, 'utf8')
  .replace('<script src="app.js">', '<script>window.MODO_ESTATICO = true;</script>\n  <script src="app.js">'));
fs.writeFileSync(path.join(SAIDA, '.nojekyll'), '');
console.log('Site montado em _site.');

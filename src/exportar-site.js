// Gera a versão estática do site (pasta _site) para publicar no GitHub Pages.
// Uso: node src/exportar-site.js
// Copia a pasta public e grava os dados do banco em arquivos JSON (api/*.json).
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('./db');

const SAIDA = path.join(__dirname, '..', '_site');
const repo = db.abrir(config.arquivoBanco);
const desde = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

fs.rmSync(SAIDA, { recursive: true, force: true });
fs.cpSync(path.join(__dirname, '..', 'public'), SAIDA, { recursive: true });
fs.mkdirSync(path.join(SAIDA, 'api'));
const gravar = (nome, dados) => fs.writeFileSync(path.join(SAIDA, 'api', nome), JSON.stringify(dados));

// Marca o index.html como versão estática
const index = path.join(SAIDA, 'index.html');
fs.writeFileSync(index, fs.readFileSync(index, 'utf8')
  .replace('<script src="app.js">', '<script>window.MODO_ESTATICO = true;</script>\n  <script src="app.js">'));

gravar('config.json', {
  cidade: config.cidade,
  combustiveis: db.COMBUSTIVEIS,
  avisoDesatualizadoHoras: config.avisoDesatualizadoHoras,
  // Sem servidor, o envio de preços por motoristas fica desligado na versão publicada
  fontes: { menor_preco: config.fontes.menor_preco.ativa, usuario: false, posto: false },
});

const resumo = repo.resumoCidade(desde(config.idadeMaximaPrecoDias));
const status = repo.statusFontes();
for (const c of db.COMBUSTIVEIS) {
  gravar(`postos-${c}.json`, { combustivel: c, postos: repo.postosComPreco(c, desde(config.idadeMaximaPrecoDias)), resumo, status });
}
const postos = repo.db.prepare('SELECT id FROM postos').all();
for (const { id } of postos) {
  gravar(`posto-${id}.json`, {
    posto: repo.posto(id),
    precos: repo.precosAtuaisDoPosto(id, desde(config.idadeMaximaPrecoDias)),
    historico: repo.historicoDoPosto(id, desde(30)),
  });
}
fs.writeFileSync(path.join(SAIDA, '.nojekyll'), '');
console.log(`Site gerado em _site: ${postos.length} postos.`);

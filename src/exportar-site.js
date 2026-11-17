// Grava os dados do banco em arquivos JSON na pasta publicado/api (vão para o GitHub).
// Uso: node src/exportar-site.js
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('./db');

const SAIDA = path.join(__dirname, '..', 'publicado', 'api');
const repo = db.abrir(config.arquivoBanco);
const desde = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(SAIDA, { recursive: true });
const gravar = (nome, dados) => fs.writeFileSync(path.join(SAIDA, nome), JSON.stringify(dados));

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
console.log(`Dados exportados em publicado/api: ${postos.length} postos.`);

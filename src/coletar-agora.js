// Executa uma coleta imediatamente (npm run coletar).
const config = require('../config');
const db = require('./db');
const { coletarMenorPreco } = require('./coletor');

const repo = db.abrir(config.arquivoBanco);
coletarMenorPreco(repo, config).then((r) => {
  console.log(r);
  process.exit(r.erro ? 1 : 0);
});

// Coleta os preços NESTE PC e envia os dados ao GitHub, que publica o site.
// (O Menor Preço não aceita conexões dos servidores do GitHub, que ficam fora do Brasil.)
// Uso: node src/publicar-do-pc.js   — ou dois cliques em publicar.bat
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const config = require('../config');
const db = require('./db');
const { coletarMenorPreco } = require('./coletor');

const raiz = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();

(async () => {
  const repo = db.abrir(config.arquivoBanco);
  const st = repo.statusFontes().find((s) => s.fonte === 'menor_preco');
  const minutos = st?.ultima_execucao ? (Date.now() - Date.parse(st.ultima_execucao)) / 60000 : Infinity;

  // Evita consulta dupla se o servidor local (iniciar.bat) já coletou há pouco
  if (minutos >= 50) await coletarMenorPreco(repo, config);
  else console.log(`Última coleta há ${Math.round(minutos)} min — usando os dados atuais.`);

  require('./exportar-site');

  git('add', 'publicado');
  if (!git('status', '--porcelain', 'publicado')) {
    console.log('Nada mudou desde a última publicação.');
    return;
  }
  git('commit', '-q', '-m', `Preços atualizados em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  git('push', '-q');
  console.log('Dados enviados. O site será atualizado em 1 a 2 minutos.');
})().catch((e) => {
  console.error('Falha ao publicar:', e.message);
  process.exit(1);
});

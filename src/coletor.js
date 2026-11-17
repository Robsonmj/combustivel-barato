// Coletor de preços: roda os adapters automáticos ativos e grava no banco.
const menorPreco = require('./adapters/menorPreco');

let emAndamento = false;

async function coletarMenorPreco(repo, config, log = console.log) {
  const cfg = config.fontes.menor_preco;
  if (!cfg.ativa) {
    log('[coletor] Menor Preço desligado na configuração.');
    return { pulou: true };
  }
  if (emAndamento) return { pulou: true };
  emAndamento = true;
  log(`[coletor] Coletando preços do Menor Preço para ${config.cidade.nome}-${config.cidade.uf}...`);
  try {
    const itens = await menorPreco.coletar(config.cidade, cfg, log);
    let novos = 0;
    const postos = new Set();
    repo.db.exec('BEGIN');
    try {
      for (const { posto, preco } of itens) {
        const posto_id = repo.salvarPosto(posto);
        postos.add(posto_id);
        if (repo.salvarPreco({ ...preco, posto_id })) novos++;
      }
      repo.db.exec('COMMIT');
    } catch (e) {
      repo.db.exec('ROLLBACK');
      throw e;
    }
    repo.registrarStatus(menorPreco.FONTE, { sucesso: true, precos: novos });
    log(`[coletor] OK: ${itens.length} preços lidos, ${novos} novos, ${postos.size} postos.`);
    return { itens: itens.length, novos, postos: postos.size };
  } catch (e) {
    repo.registrarStatus(menorPreco.FONTE, { sucesso: false, mensagem: e.message });
    log('[coletor] ERRO: ' + e.message);
    return { erro: e.message };
  } finally {
    emAndamento = false;
  }
}

/** Agenda a coleta periódica. Roda logo ao iniciar se a última coleta for antiga. */
function agendar(repo, config, log = console.log) {
  const cfg = config.fontes.menor_preco;
  const intervaloMs = cfg.intervaloMinutos * 60 * 1000;
  const status = repo.statusFontes().find((s) => s.fonte === menorPreco.FONTE);
  const ultima = status?.ultima_execucao ? Date.parse(status.ultima_execucao) : 0;
  const espera = Math.max(0, ultima + intervaloMs - Date.now());

  setTimeout(() => {
    coletarMenorPreco(repo, config, log);
    setInterval(() => coletarMenorPreco(repo, config, log), intervaloMs).unref();
  }, espera).unref();

  if (cfg.ativa) log(`[coletor] Próxima coleta em ${Math.round(espera / 60000)} min (depois, a cada ${cfg.intervaloMinutos} min).`);
}

module.exports = { coletarMenorPreco, agendar };

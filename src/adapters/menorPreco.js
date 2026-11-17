// Adapter da fonte "Menor Preço" (Nota Paraná / Sefa-PR).
//
// ATENÇÃO: fonte NÃO OFICIAL e instável, usada em modo protótipo.
// - Usa o mesmo endpoint público que o site menorpreco.notaparana.pr.gov.br usa no navegador.
// - Baixo volume: poucas consultas por hora, com pausa entre elas e limite de páginas.
// - Não contorna bloqueios, captchas, login ou qualquer proteção: se o serviço
//   recusar (403, 429, erro), a coleta para e o erro é registrado em fontes_status.
// - Para desligar: config.fontes.menor_preco.ativa = false (ou iniciar com MENOR_PRECO=0).
// - Ao obter autorização oficial da Sefa-PR, troque este adapter pelo canal autorizado.

const geohash = require('../geohash');

const FONTE = 'menor_preco';

// Códigos de combustível usados pelo Menor Preço (parâmetro tp_comb)
const TIPOS = [
  { tp: 1, nome: 'Gasolina' },
  { tp: 2, nome: 'Gasolina Aditivada' },
  { tp: 3, nome: 'Etanol' },
  { tp: 4, nome: 'Diesel' },
];

const BANDEIRAS = [
  ['SHELL', 'Shell'], ['RAIZEN', 'Shell'], ['IPIRANGA', 'Ipiranga'], ['PETROBRAS', 'Petrobras'],
  ['VIBRA', 'Petrobras'], ['POSTO BR ', 'Petrobras'], [' ALE ', 'Ale'], ['ALESAT', 'Ale'],
  ['SIM REDE', 'Rede Sim'], ['CHARRUA', 'Charrua'], ['RODOIL', 'Rodoil'], ['TAURUS', 'Taurus'],
];

const RE_ADITIVADA = /ADIT|\bADT\b|V[\s-]?POWER|PODIUM|PREMIUM|\bGRID\b|SUPRA|EVOLUTION|DT\s?CLEAN|ACTIVE/;

/** Converte a descrição do produto no tipo de combustível padronizado do app. */
function classificar(desc, tpComb) {
  const d = ` ${String(desc || '').toUpperCase()} `;
  switch (tpComb) {
    case 3:
      return 'etanol';
    case 4:
      return /S[\s-]?10\b/.test(d) ? 'diesel_s10' : 'diesel';
    case 5:
      return 'gnv';
    case 1:
    case 2:
      if (/ETANOL|DIESEL/.test(d)) return null; // item fora do esperado: ignora
      return RE_ADITIVADA.test(d) ? 'gasolina_aditivada' : 'gasolina';
    default:
      return null;
  }
}

function bandeiraPorNome(nome) {
  const n = ` ${String(nome || '').toUpperCase()} `;
  for (const [chave, bandeira] of BANDEIRAS) if (n.includes(chave)) return bandeira;
  return null;
}

/** Separa "SHELL - COSTA & TORRES LTDA" em bandeira + nome limpo. */
function separarNome(nomeBruto) {
  let nome = String(nomeBruto || '').trim();
  let bandeira = bandeiraPorNome(nome);
  const m = nome.match(/^(.{1,20}?)\s+-\s+(.+)$/);
  if (m) {
    const prefixo = m[1].toUpperCase();
    if (/^B\.?\s*BRANCA|^BANDEIRA BRANCA/.test(prefixo)) bandeira = 'Bandeira branca';
    else bandeira = bandeiraPorNome(prefixo) || bandeira;
    nome = m[2];
  }
  nome = nome.replace(/\s+(LTDA|EIRELI|EPP|ME|S\/?A)\.?$/i, '').trim();
  return { nome: titulo(nome) || 'Posto', bandeira };
}

function titulo(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/(^|\s|-|\/)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Ltda|Me|Epp|Eireli|S\/a)\b/g, (m) => m.toUpperCase())
    .trim();
}

/** Converte um item da resposta da API em { posto, preco }. */
function normalizarItem(item, tpComb) {
  const combustivel = classificar(item.desc, tpComb);
  const valor = Number(item.valor);
  const e = item.estabelecimento || {};
  if (!combustivel || !(valor > 0) || !item.local || !e.codigo || !item.datahora) return null;
  if (valor < 1 || valor > 20) return null; // descarta valores absurdos (erro de digitação na nota)

  const { lat, lng } = geohash.decode(item.local);
  const { nome, bandeira } = separarNome(e.nm_fan || e.nm_emp);
  const endereco = [e.tp_logr, e.nm_logr].filter(Boolean).join(' ') + (e.nr_logr ? ', ' + e.nr_logr : '');
  return {
    posto: {
      origem: FONTE,
      codigo_origem: e.codigo,
      nome,
      bandeira,
      endereco: titulo(endereco),
      bairro: titulo(e.bairro),
      cidade: titulo(e.mun),
      uf: e.uf || null,
      lat,
      lng,
      municipioFonte: String(e.mun || '').toUpperCase(),
    },
    preco: {
      combustivel,
      valor,
      coletado_em: new Date(item.datahora).toISOString(),
      fonte: FONTE,
      descricao: String(item.desc || '').trim(),
    },
  };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function buscarPagina(cfg, local, tp, offset) {
  const url = `${cfg.baseUrl}/produtos?local=${local}&tp_comb=${tp}&raio=${cfg.raioKm}&data=-1` +
    (offset ? `&offset=${offset}` : '');
  const resp = await fetch(url, {
    headers: { 'User-Agent': cfg.userAgent, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (resp.status === 403 || resp.status === 429) {
    throw new Error(`Acesso recusado pelo Menor Preço (HTTP ${resp.status}). Coleta interrompida; não haverá nova tentativa até o próximo ciclo.`);
  }
  if (!resp.ok) throw new Error(`Menor Preço respondeu HTTP ${resp.status}`);
  let json;
  try {
    json = await resp.json();
  } catch {
    throw new Error('Resposta do Menor Preço não é JSON — o formato pode ter mudado.');
  }
  if (!json || !Array.isArray(json.produtos)) {
    throw new Error('Resposta do Menor Preço sem a lista "produtos" — o formato pode ter mudado.');
  }
  return json;
}

/**
 * Coleta os preços da cidade. Retorna uma lista de { posto, preco }.
 * @param {object} cidade  config.cidade
 * @param {object} cfgFonte config.fontes.menor_preco
 */
async function coletar(cidade, cfgFonte, log = console.log) {
  const cfg = { ...cfgFonte, raioKm: cidade.raioKm };
  const local = geohash.encode(cidade.centro.lat, cidade.centro.lng, 7);
  const resultado = [];
  let primeira = true;

  for (const { tp, nome } of TIPOS) {
    const vistos = new Set();
    let offset = 0;
    for (let pagina = 0; pagina < cfg.maxPaginasPorCombustivel; pagina++) {
      if (!primeira) await esperar(cfg.pausaEntreRequisicoesMs);
      primeira = false;
      const json = await buscarPagina(cfg, local, tp, offset);
      let novos = 0;
      for (const item of json.produtos) {
        if (vistos.has(item.id)) continue;
        vistos.add(item.id);
        novos++;
        const n = normalizarItem(item, tp);
        if (n && n.posto.municipioFonte === cidade.nomeFonte) resultado.push(n);
      }
      log(`  [menor_preco] ${nome}: página ${pagina + 1}, ${json.produtos.length} itens (total informado: ${json.total ?? '?'})`);
      offset += json.produtos.length;
      if (novos === 0 || json.produtos.length === 0 || (json.total && vistos.size >= json.total)) break;
    }
  }
  return resultado;
}

module.exports = { FONTE, coletar, classificar, normalizarItem, bandeiraPorNome, separarNome };

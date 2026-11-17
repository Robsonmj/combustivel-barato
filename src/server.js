// Servidor do app: entrega as telas (pasta public) e a API de preços.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('./db');
const coletor = require('./coletor');
const manual = require('./adapters/manual');

const repo = db.abrir(config.arquivoBanco);
const PUBLICO = path.join(__dirname, '..', 'public');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const desde = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

function json(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dados));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.on('data', (c) => {
      corpo += c;
      if (corpo.length > 10000) reject(new Error('Requisição muito grande'));
    });
    req.on('end', () => {
      try {
        resolve(corpo ? JSON.parse(corpo) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
  });
}

// Limite simples para envio de preços manuais: 20 por hora por IP.
const envios = new Map();
function podeEnviar(ip) {
  const agora = Date.now();
  const lista = (envios.get(ip) || []).filter((t) => agora - t < 3600000);
  if (lista.length >= 20) return false;
  lista.push(agora);
  envios.set(ip, lista);
  return true;
}

async function api(req, res, url) {
  const rota = url.pathname;

  if (req.method === 'GET' && rota === '/api/config') {
    return json(res, 200, {
      cidade: config.cidade,
      combustiveis: db.COMBUSTIVEIS,
      avisoDesatualizadoHoras: config.avisoDesatualizadoHoras,
      fontes: Object.fromEntries(Object.entries(config.fontes).map(([k, v]) => [k, v.ativa])),
    });
  }

  if (req.method === 'GET' && rota === '/api/postos') {
    const combustivel = url.searchParams.get('combustivel') || 'gasolina';
    if (!db.COMBUSTIVEIS.includes(combustivel)) return json(res, 400, { erro: 'Combustível inválido' });
    return json(res, 200, {
      combustivel,
      postos: repo.postosComPreco(combustivel, desde(config.idadeMaximaPrecoDias)),
      resumo: repo.resumoCidade(desde(config.idadeMaximaPrecoDias)),
      status: repo.statusFontes(),
    });
  }

  const m = rota.match(/^\/api\/postos\/(\d+)$/);
  if (req.method === 'GET' && m) {
    const posto = repo.posto(Number(m[1]));
    if (!posto) return json(res, 404, { erro: 'Posto não encontrado' });
    return json(res, 200, {
      posto,
      precos: repo.precosAtuaisDoPosto(posto.id, desde(config.idadeMaximaPrecoDias)),
      historico: repo.historicoDoPosto(posto.id, desde(30)),
    });
  }

  if (req.method === 'POST' && rota === '/api/precos') {
    if (!podeEnviar(req.socket.remoteAddress)) return json(res, 429, { erro: 'Muitos envios. Tente mais tarde.' });
    const body = await lerCorpo(req);
    const v = manual.validarEntrada(body, config.fontes);
    if (!v.ok) return json(res, 400, { erro: v.erro });
    if (!repo.posto(v.dados.posto_id)) return json(res, 404, { erro: 'Posto não encontrado' });
    repo.salvarPreco(v.dados);
    return json(res, 201, { ok: true });
  }

  if (req.method === 'GET' && rota === '/api/status') {
    return json(res, 200, { postos: repo.totalPostos(), fontes: repo.statusFontes() });
  }

  return json(res, 404, { erro: 'Rota não encontrada' });
}

function estatico(req, res, url) {
  let arquivo = path.normalize(path.join(PUBLICO, decodeURIComponent(url.pathname)));
  if (!arquivo.startsWith(PUBLICO)) {
    res.writeHead(403);
    return res.end();
  }
  if (url.pathname === '/' || !path.extname(arquivo)) arquivo = path.join(PUBLICO, 'index.html');
  fs.readFile(arquivo, (err, dados) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
    res.end(dados);
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return estatico(req, res, url);
  } catch (e) {
    console.error(e);
    json(res, 500, { erro: e.message });
  }
});

servidor.listen(config.porta, () => {
  console.log(`\n  App de preços de combustível — ${config.cidade.nome}-${config.cidade.uf}`);
  console.log(`  Abra no navegador: http://localhost:${config.porta}\n`);
  coletor.agendar(repo, config);
});

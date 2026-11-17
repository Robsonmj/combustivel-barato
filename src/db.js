// Banco de dados (SQLite embutido no Node.js — não precisa instalar nada).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const COMBUSTIVEIS = ['gasolina', 'gasolina_aditivada', 'etanol', 'diesel', 'diesel_s10', 'gnv'];
const FONTES = ['menor_preco', 'anp', 'usuario', 'posto'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS postos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cnpj          TEXT,
  nome          TEXT NOT NULL,
  bandeira      TEXT,
  endereco      TEXT,
  bairro        TEXT,
  cidade        TEXT,
  uf            TEXT,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  origem        TEXT NOT NULL,       -- de onde o cadastro veio (menor_preco, manual...)
  codigo_origem TEXT,                -- identificador do posto na fonte de origem
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (origem, codigo_origem)
);

CREATE TABLE IF NOT EXISTS precos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  posto_id     INTEGER NOT NULL REFERENCES postos(id),
  combustivel  TEXT NOT NULL,
  valor        REAL NOT NULL,
  coletado_em  TEXT NOT NULL,        -- quando o preço foi praticado (ex.: hora da venda na NFC-e)
  registrado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  fonte        TEXT NOT NULL,
  descricao    TEXT,                 -- descrição original do produto na fonte
  UNIQUE (posto_id, combustivel, coletado_em, fonte, valor)
);
CREATE INDEX IF NOT EXISTS idx_precos_busca ON precos (combustivel, coletado_em);
CREATE INDEX IF NOT EXISTS idx_precos_posto ON precos (posto_id, combustivel, coletado_em);

CREATE TABLE IF NOT EXISTS fontes_status (
  fonte            TEXT PRIMARY KEY,
  ultima_execucao  TEXT,
  sucesso          INTEGER,
  mensagem_erro    TEXT,
  precos_coletados INTEGER
);
`;

function abrir(arquivo) {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return criarRepositorio(db);
}

function criarRepositorio(db) {
  const st = {
    buscaPostoOrigem: db.prepare('SELECT id FROM postos WHERE origem = ? AND codigo_origem = ?'),
    inserePosto: db.prepare(`INSERT INTO postos (cnpj, nome, bandeira, endereco, bairro, cidade, uf, lat, lng, origem, codigo_origem)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    atualizaPosto: db.prepare(`UPDATE postos SET nome = ?, bandeira = ?, endereco = ?, bairro = ?, lat = ?, lng = ? WHERE id = ?`),
    inserePreco: db.prepare(`INSERT OR IGNORE INTO precos (posto_id, combustivel, valor, coletado_em, fonte, descricao)
                             VALUES (?, ?, ?, ?, ?, ?)`),
    postoPorId: db.prepare('SELECT * FROM postos WHERE id = ?'),
    status: db.prepare(`INSERT INTO fontes_status (fonte, ultima_execucao, sucesso, mensagem_erro, precos_coletados)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(fonte) DO UPDATE SET ultima_execucao = excluded.ultima_execucao,
                          sucesso = excluded.sucesso, mensagem_erro = excluded.mensagem_erro,
                          precos_coletados = excluded.precos_coletados`),
  };

  return {
    db,

    /** Cria ou atualiza um posto identificado pela fonte de origem. Retorna o id. */
    salvarPosto(p) {
      const existente = st.buscaPostoOrigem.get(p.origem, p.codigo_origem);
      if (existente) {
        st.atualizaPosto.run(p.nome, p.bandeira ?? null, p.endereco ?? null, p.bairro ?? null, p.lat, p.lng, existente.id);
        return existente.id;
      }
      const r = st.inserePosto.run(p.cnpj ?? null, p.nome, p.bandeira ?? null, p.endereco ?? null, p.bairro ?? null,
        p.cidade ?? null, p.uf ?? null, p.lat, p.lng, p.origem, p.codigo_origem ?? null);
      return Number(r.lastInsertRowid);
    },

    /** Grava um preço. Retorna true se era novo (não duplicado). */
    salvarPreco({ posto_id, combustivel, valor, coletado_em, fonte, descricao }) {
      if (!COMBUSTIVEIS.includes(combustivel)) throw new Error('Combustível inválido: ' + combustivel);
      if (!FONTES.includes(fonte)) throw new Error('Fonte inválida: ' + fonte);
      const r = st.inserePreco.run(posto_id, combustivel, valor, coletado_em, fonte, descricao ?? null);
      return r.changes > 0;
    },

    posto(id) {
      return st.postoPorId.get(id);
    },

    /**
     * Lista todos os postos, cada um com o preço mais recente do combustível escolhido
     * (ou preco = null se não houver preço recente).
     */
    postosComPreco(combustivel, desdeIso) {
      return db.prepare(`
        WITH ultimos AS (
          SELECT posto_id, valor, coletado_em, fonte,
                 ROW_NUMBER() OVER (PARTITION BY posto_id ORDER BY coletado_em DESC, valor ASC) AS n
          FROM precos
          WHERE combustivel = ? AND coletado_em >= ?
        )
        SELECT p.id, p.nome, p.bandeira, p.endereco, p.bairro, p.lat, p.lng,
               u.valor AS preco, u.coletado_em, u.fonte
        FROM postos p
        LEFT JOIN ultimos u ON u.posto_id = p.id AND u.n = 1
        ORDER BY p.nome`).all(combustivel, desdeIso);
    },

    /** Preço mais recente de cada combustível de um posto. */
    precosAtuaisDoPosto(postoId, desdeIso) {
      return db.prepare(`
        WITH ultimos AS (
          SELECT combustivel, valor, coletado_em, fonte, descricao,
                 ROW_NUMBER() OVER (PARTITION BY combustivel ORDER BY coletado_em DESC, valor ASC) AS n
          FROM precos WHERE posto_id = ? AND coletado_em >= ?
        )
        SELECT combustivel, valor, coletado_em, fonte, descricao FROM ultimos WHERE n = 1`).all(postoId, desdeIso);
    },

    /** Histórico (um preço por dia: o menor do dia) para gráficos. */
    historicoDoPosto(postoId, desdeIso) {
      return db.prepare(`
        SELECT combustivel, substr(coletado_em, 1, 10) AS dia, MIN(valor) AS valor
        FROM precos WHERE posto_id = ? AND coletado_em >= ?
        GROUP BY combustivel, dia ORDER BY dia`).all(postoId, desdeIso);
    },

    /** Menor preço da cidade por combustível (usado na dica etanol x gasolina). */
    resumoCidade(desdeIso) {
      return db.prepare(`
        WITH ultimos AS (
          SELECT posto_id, combustivel, valor,
                 ROW_NUMBER() OVER (PARTITION BY posto_id, combustivel ORDER BY coletado_em DESC, valor ASC) AS n
          FROM precos WHERE coletado_em >= ?
        )
        SELECT combustivel, MIN(valor) AS minimo, MAX(valor) AS maximo, ROUND(AVG(valor), 3) AS media, COUNT(*) AS postos
        FROM ultimos WHERE n = 1 GROUP BY combustivel`).all(desdeIso);
    },

    registrarStatus(fonte, { sucesso, mensagem = null, precos = 0 }) {
      st.status.run(fonte, new Date().toISOString(), sucesso ? 1 : 0, mensagem, precos);
    },

    statusFontes() {
      return db.prepare('SELECT * FROM fontes_status ORDER BY fonte').all();
    },

    totalPostos() {
      return db.prepare('SELECT COUNT(*) AS n FROM postos').get().n;
    },
  };
}

module.exports = { abrir, COMBUSTIVEIS, FONTES };

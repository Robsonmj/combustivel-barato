// Testes automáticos (npm run teste)
const test = require('node:test');
const assert = require('node:assert/strict');
const geohash = require('../src/geohash');
const mp = require('../src/adapters/menorPreco');
const manual = require('../src/adapters/manual');
const db = require('../src/db');

test('geohash ida e volta', () => {
  const h = geohash.encode(-24.7246, -53.7412, 9);
  const p = geohash.decode(h);
  assert.ok(Math.abs(p.lat + 24.7246) < 0.0001 && Math.abs(p.lng + 53.7412) < 0.0001);
});

test('classifica combustíveis pela descrição', () => {
  assert.equal(mp.classificar('GASOLINA COMUM', 1), 'gasolina');
  assert.equal(mp.classificar('GASOLINA ADIT.', 1), 'gasolina_aditivada');
  assert.equal(mp.classificar('GASOLINA V POWER', 1), 'gasolina_aditivada');
  assert.equal(mp.classificar('GASOLINA ORIG ADT.', 2), 'gasolina_aditivada');
  assert.equal(mp.classificar('DIESEL S 10', 4), 'diesel_s10');
  assert.equal(mp.classificar('OLEO DIESEL B S500', 4), 'diesel');
  assert.equal(mp.classificar('ETANOL HIDRATADO', 3), 'etanol');
});

test('separa bandeira e nome do posto', () => {
  assert.deepEqual(mp.separarNome('SHELL - COSTA & TORRES LTDA'), { nome: 'Costa & Torres', bandeira: 'Shell' });
  assert.deepEqual(mp.separarNome('B. BRANCA - REDE STOP'), { nome: 'Rede Stop', bandeira: 'Bandeira branca' });
});

test('normaliza item da API e descarta valor absurdo', () => {
  const item = {
    id: 'x', local: '6g9g31m3550', desc: 'GASOLINA COMUM', valor: '6.19', datahora: '2026-11-17T17:02:39.957Z',
    estabelecimento: { codigo: 'abc', nm_emp: 'IPIRANGA - POSTO X LTDA', tp_logr: 'AV', nm_logr: 'MARIPA', nr_logr: '10', bairro: 'CENTRO', mun: 'TOLEDO', uf: 'PR' },
  };
  const n = mp.normalizarItem(item, 1);
  assert.equal(n.posto.bandeira, 'Ipiranga');
  assert.equal(n.posto.endereco, 'Av Maripa, 10');
  assert.equal(n.preco.valor, 6.19);
  assert.equal(mp.normalizarItem({ ...item, valor: '61.90' }, 1), null);
});

test('valida chave de NFC-e', () => {
  // Monta uma chave válida: UF 41, 2611, CNPJ, modelo 65 e calcula o DV
  const base = '41' + '2611' + '12345678000195' + '65' + '001' + '000012345' + '1' + '12345678';
  let soma = 0, peso = 2;
  for (let i = base.length - 1; i >= 0; i--) { soma += Number(base[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  const v = manual.validarChaveNfce(base + dv);
  assert.equal(v.ok, true);
  assert.equal(v.cnpj, '12345678000195');
  assert.equal(manual.validarChaveNfce(base + ((dv + 1) % 10)).ok, false);
  assert.equal(manual.validarChaveNfce('123').ok, false);
});

test('validação de preço manual', () => {
  const fontes = { usuario: { ativa: true }, posto: { ativa: false } };
  assert.equal(manual.validarEntrada({ posto_id: 1, combustivel: 'etanol', valor: '3,99' }, fontes).ok, true);
  assert.equal(manual.validarEntrada({ posto_id: 1, combustivel: 'etanol', valor: '39,9' }, fontes).ok, false);
  assert.equal(manual.validarEntrada({ posto_id: 1, combustivel: 'querosene', valor: '3' }, fontes).ok, false);
  assert.equal(manual.validarEntrada({ posto_id: 1, combustivel: 'etanol', valor: '3', fonte: 'posto' }, fontes).ok, false);
});

test('banco: preço mais recente por posto e sem duplicar', () => {
  const r = db.abrir(':memory:');
  const id = r.salvarPosto({ origem: 'menor_preco', codigo_origem: 'a', nome: 'A', lat: -24.7, lng: -53.7 });
  assert.equal(r.salvarPosto({ origem: 'menor_preco', codigo_origem: 'a', nome: 'A2', lat: -24.7, lng: -53.7 }), id);
  r.salvarPreco({ posto_id: id, combustivel: 'gasolina', valor: 6.5, coletado_em: '2026-11-16T10:00:00.000Z', fonte: 'menor_preco' });
  r.salvarPreco({ posto_id: id, combustivel: 'gasolina', valor: 6.2, coletado_em: '2026-11-17T10:00:00.000Z', fonte: 'menor_preco' });
  assert.equal(r.salvarPreco({ posto_id: id, combustivel: 'gasolina', valor: 6.2, coletado_em: '2026-11-17T10:00:00.000Z', fonte: 'menor_preco' }), false);
  const [p] = r.postosComPreco('gasolina', '2026-11-01');
  assert.equal(p.preco, 6.2);
  assert.equal(p.nome, 'A2');
  assert.equal(r.postosComPreco('etanol', '2026-11-01')[0].preco, null);
});

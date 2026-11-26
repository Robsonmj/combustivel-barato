// Monta a fila de e-mails do Conector AbasteceR para os postos (texto aprovado em divulgacao/emails-conector.md).
// Uso: node ferramentas/fila-emails-postos.js <cidades separadas por vírgula | todas> [limite]
//   -> grava documentos/contatos/fila.json com os próximos e-mails (ainda não enviados)
// Depois de enviar um: node ferramentas/fila-emails-postos.js --enviado <email> <messageId>
// Dados (contatos, situação, enviados) ficam em documentos/contatos, fora do Git.
const fs = require('node:fs');
const path = require('node:path');

const PASTA = path.join(__dirname, '..', 'documentos', 'contatos');
const ENVIADOS = path.join(PASTA, 'enviados.csv');

if (process.argv[2] === '--enviado') {
  if (!fs.existsSync(ENVIADOS)) fs.writeFileSync(ENVIADOS, 'email;quando;message_id\n');
  fs.appendFileSync(ENVIADOS, `${process.argv[3].toLowerCase()};${new Date().toISOString()};${process.argv[4] || ''}\n`);
  console.log('registrado', process.argv[3]);
  process.exit(0);
}

const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, '').trim();
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'publicado', 'api', 'config.json'), 'utf8'));
const nomeCidade = Object.fromEntries(cfg.cidades.map((c) => [sem(c.nome), c.nome]));

// situação de cada posto no app (CNPJ -> fonte:data); quem não está na lista aparece sem preço
const arqSit = fs.readdirSync(PASTA).filter((f) => f.startsWith('situacao_')).sort().pop();
const situacao = Object.fromEntries(fs.readFileSync(path.join(PASTA, arqSit), 'utf8').trim().split(',')
  .map((x) => x.split(':')).map(([c, f, d]) => [c, { fonte: f, data: d }]));

const enviados = new Set(fs.existsSync(ENVIADOS)
  ? fs.readFileSync(ENVIADOS, 'utf8').trim().split('\n').slice(1).map((l) => l.split(';')[0]) : []);

const linhas = fs.readFileSync(path.join(PASTA, 'postos_contatos.csv'), 'utf8').trim().split('\n').slice(1)
  .map((l) => l.split(';')).map(([cnpj, municipio, razao, fantasia, email, tel1, tel2, sit]) =>
    ({ cnpj, municipio, razao, fantasia, email: (email || '').trim().toLowerCase(), sit }));

const validos = linhas.filter((p) => p.sit === 'ATIVA' && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(p.email));

// agrupa por e-mail: mesmo e-mail em empresas diferentes (raiz do CNPJ diferente) = provável contador -> não envia
const porEmail = new Map();
for (const p of validos) porEmail.set(p.email, [...(porEmail.get(p.email) || []), p]);
const fila = [];
const ignorados = [];
const pedidas = (process.argv[2] || 'todas').split(',').map(sem);
for (const [email, ps] of porEmail) {
  if (enviados.has(email)) continue;
  // escritório de contabilidade (domínio de contador ou caixa 'contabilidade' em e-mail gratuito)
  if (/contab|contador|audicon/.test(email.split('@')[1]) || (/contab/.test(email.split('@')[0]) && /hotmail|gmail|outlook|yahoo|uol|bol|terra/.test(email.split('@')[1]))) { ignorados.push({ email, motivo: 'contador' }); continue; }
  // escritório, advocacia, software ou caixa de contabilidade de pessoa (ex.: cont_alvorada, ivan.contabil) e domínio digitado errado
  if (/escritorio|advoca|contasul|softsys|netsof|^cont_|.contabil|^esc/.test(email) || /@hotmal./.test(email)) { ignorados.push({ email, motivo: 'provável escritório' }); continue; }
  if (new Set(ps.map((p) => p.cnpj.slice(0, 8))).size > 1) { ignorados.push({ email, motivo: 'provável contador', postos: ps.length }); continue; }
  if (!pedidas.includes('TODAS') && !ps.some((p) => pedidas.includes(sem(p.municipio)))) continue;
  fila.push(montar(email, ps));
}
const limite = Number(process.argv[3] || 0);
const saida = limite ? fila.slice(0, limite) : fila;
fs.writeFileSync(path.join(PASTA, 'fila.json'), JSON.stringify(saida, null, 1));
console.log(JSON.stringify({ na_fila: fila.length, gravados: saida.length, ignorados: ignorados.length, ja_enviados: enviados.size }));

function titulo(t) {
  const minus = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ')
    .map((w, i) => (/^(ltda|me|epp|eireli|s\/?a)\.?$/.test(w) || /^(ii|iii|iv|vi|vii|viii|ix)$/.test(w) ? w.toUpperCase() : i && minus.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

function frase(p) {
  const s = situacao[p.cnpj];
  if (!s) return 'ainda está sem preço (com um traço no lugar do valor)';
  if (s.fonte === 'anp') return `o preço que aparece é o da pesquisa semanal da ANP, de ${s.data}, que pode estar desatualizado`;
  return 'o preço depende de alguém atualizar à mão';
}

function montar(email, ps) {
  const nome = (p) => titulo(p.fantasia && p.fantasia !== '********' ? p.fantasia : p.razao).replace(/\s*\b(LTDA|ME|EPP|EIRELI)\.?$/i, '').replace(/[.\s]+$/, '').trim();
  const comPosto = (n) => (/^(auto\s+)?posto\b/i.test(n) ? n : 'posto ' + n);
  const cidades = [...new Set(ps.map((p) => nomeCidade[sem(p.municipio)] || titulo(p.municipio)))];
  const cidade = cidades.join(' e ');
  const um = ps.length === 1;
  const nomePosto = um ? comPosto(nome(ps[0])) : 'seus postos';
  const situacaoTxt = um
    ? `O ${comPosto(nome(ps[0]))} já aparece no mapa, mas ${frase(ps[0])}.`
    : `Os seus postos já aparecem no mapa:\n${ps.map((p) => `- ${nome(p)} (${nomeCidade[sem(p.municipio)] || titulo(p.municipio)}): ${frase(p)}`).join('\n')}`;
  const assunto = `${um ? nome(ps[0]) : 'Seus postos'} no AbasteceR: deixe o preço ${um ? 'do seu posto' : 'dos seus postos'} sempre certo, de graça`;
  const corpo = `Olá, tudo bem?

Meu nome é Robson e criei o AbasteceR, um app gratuito que mostra aos motoristas de ${cidade}, no mapa, o preço dos combustíveis em cada posto, com rota até lá. Está na Google Play e no navegador: https://robsonmj.github.io/combustivel-barato/

${situacaoTxt}${um ? ' ' : '\n\n'}Quando o motorista compara os postos, ele vai em quem mostra o preço.

Com o Conector AbasteceR, gratuito, o preço ${um ? 'do seu posto' : 'dos seus postos'} aparece sempre certo e sozinho:

1. Você entra na Área do posto (https://robsonmj.github.io/combustivel-barato/painel.html) com o seu e-mail. Não tem senha.
2. Baixa o conector e instala no computador do posto, em uns 5 minutos.
3. Ele lê as notas fiscais (NFC-e) que o posto já emite e envia a cada 15 minutos só o preço por litro. O preço aparece no app com o selo "Confirmado pelo posto".

Nada além do preço sai do posto: nem a nota, nem dados de clientes, nem faturamento. Funciona com qualquer sistema e você desliga quando quiser.

Se preferir, eu faço a instalação junto com você por acesso remoto. É só responder este e-mail.

Um abraço,
Robson Magalhães Jorge
AbasteceR

Você recebeu este e-mail porque ${um ? `o ${nomePosto} está` : 'os seus postos estão'} no cadastro público de postos da ANP. Se não quiser receber outros, responda "remover" e não escrevo mais.`;
  return { email, assunto, corpo, cnpjs: ps.map((p) => p.cnpj), cidades, cidade, situacaoTxt, nomePosto, um };
}

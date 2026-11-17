// Adapter de entrada manual: preços informados por motoristas ("usuario") ou pelo posto ("posto").
// É o "plano B" do app: continua funcionando mesmo se o Menor Preço ficar indisponível.
//
// Próxima fase: validar o preço lendo o QR Code da NFC-e (a chave de acesso de 44 dígitos
// traz o CNPJ do emitente e a data de emissão). A função validarChaveNfce já faz a checagem.

const { COMBUSTIVEIS } = require('../db');

/** Valida os dados de um preço informado manualmente. Retorna { ok, erro, dados }. */
function validarEntrada(body, fontesAtivas) {
  const posto_id = Number(body.posto_id);
  const combustivel = String(body.combustivel || '');
  const valor = Number(String(body.valor || '').replace(',', '.'));
  const fonte = body.fonte === 'posto' ? 'posto' : 'usuario';

  if (!fontesAtivas[fonte]?.ativa) return { ok: false, erro: 'Esta fonte de preços está desligada.' };
  if (!Number.isInteger(posto_id) || posto_id <= 0) return { ok: false, erro: 'Posto inválido.' };
  if (!COMBUSTIVEIS.includes(combustivel)) return { ok: false, erro: 'Combustível inválido.' };
  if (!(valor >= 1 && valor <= 20)) return { ok: false, erro: 'Informe um preço entre R$ 1,00 e R$ 20,00.' };

  let chave = null;
  if (body.chave_nfce) {
    const v = validarChaveNfce(body.chave_nfce);
    if (!v.ok) return { ok: false, erro: v.erro };
    chave = v;
  }

  return {
    ok: true,
    dados: {
      posto_id,
      combustivel,
      valor: Math.round(valor * 1000) / 1000,
      coletado_em: new Date().toISOString(),
      fonte,
      descricao: chave ? `Informado com NFC-e (CNPJ ${chave.cnpj})` : 'Informado manualmente',
    },
  };
}

/**
 * Confere a chave de acesso de 44 dígitos de uma NFC-e (dígito verificador módulo 11)
 * e extrai UF, ano/mês, CNPJ do emitente e modelo.
 */
function validarChaveNfce(chaveBruta) {
  const chave = String(chaveBruta).replace(/\D/g, '');
  if (chave.length !== 44) return { ok: false, erro: 'A chave da NFC-e deve ter 44 dígitos.' };
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  if (dv !== Number(chave[43])) return { ok: false, erro: 'Chave da NFC-e inválida (dígito verificador não confere).' };
  const modelo = chave.slice(20, 22);
  if (modelo !== '65') return { ok: false, erro: 'Esta chave não é de uma NFC-e (modelo 65).' };
  return {
    ok: true,
    uf: chave.slice(0, 2),       // 41 = Paraná
    anoMes: '20' + chave.slice(2, 4) + '-' + chave.slice(4, 6),
    cnpj: chave.slice(6, 20),
    modelo,
  };
}

module.exports = { validarEntrada, validarChaveNfce };

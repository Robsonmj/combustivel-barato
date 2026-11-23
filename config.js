// Configurações gerais do app. Altere aqui para trocar a cidade ou ligar/desligar fontes.

module.exports = {
  // Porta do servidor local (abra http://localhost:3000 no navegador)
  porta: Number(process.env.PORTA || 3000),

  // Arquivo do banco de dados (SQLite)
  arquivoBanco: process.env.BANCO || __dirname + '/dados/combustivel.db',

  // Cidade piloto
  cidade: {
    nome: 'Toledo',
    uf: 'PR',
    nomeFonte: 'TOLEDO', // como o município aparece nos dados do Menor Preço
    centro: { lat: -24.7246, lng: -53.7412 },
    raioKm: 15, // raio de busca a partir do centro
    zoom: 13,
  },

  // Fontes de preço. Cada uma pode ser ligada/desligada (feature flag).
  fontes: {
    menor_preco: {
      // Fonte NÃO OFICIAL, em modo protótipo. Desligue com MENOR_PRECO=0 ao iniciar,
      // ou mudando para false aqui.
      // DESLIGADA de vez em 23/11/2026: a SEFA-PR indeferiu o acesso e não autoriza coleta automatizada desses dados.
      ativa: false,
      intervaloMinutos: 60,          // 1 coleta por hora
      pausaEntreRequisicoesMs: 4000, // espera entre uma consulta e outra
      maxPaginasPorCombustivel: 4,   // limite de segurança de volume
      baseUrl: 'https://menorpreco.notaparana.pr.gov.br/api/v1',
      userAgent: 'PrototipoPrecosCombustivel/0.1 (projeto sem fins comerciais)',
    },
    usuario: { ativa: true }, // preços informados por motoristas
    posto: { ativa: true },   // preços informados pelo próprio posto
  },

  // Preços mais antigos que isso não aparecem no mapa
  idadeMaximaPrecoDias: 7,
  // Acima disso o preço aparece com aviso de "desatualizado"
  avisoDesatualizadoHoras: 48,
};

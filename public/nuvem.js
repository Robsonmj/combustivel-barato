// Conexão com o Supabase (painel do posto, destaques, patrocinadores).
// Se o Supabase não estiver configurado em ajustes.js, tudo continua funcionando sem esses recursos.
(function () {
  'use strict';
  const A = window.AJUSTES || {};
  const configurado = Boolean(A.supabaseUrl && A.supabaseChave);
  let clientePromessa = null;

  function cliente() {
    if (!configurado) return Promise.resolve(null);
    if (!clientePromessa) {
      clientePromessa = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
        s.onload = () => resolve(window.supabase.createClient(A.supabaseUrl, A.supabaseChave));
        s.onerror = () => reject(new Error('Não foi possível carregar o Supabase'));
        document.head.appendChild(s);
      });
    }
    return clientePromessa;
  }

  const hoje = () => new Date().toISOString().slice(0, 10);

  /** Dados extras para o mapa: preços dos postos, destaques ativos, promoções e patrocinadores. */
  async function extras() {
    const vazio = { precos: new Map(), destaques: new Set(), promocoes: new Map(), patrocinios: [] };
    try {
      const sb = await cliente();
      if (!sb) return vazio;
      const [p, d, pr, pat] = await Promise.all([
        sb.from('precos_posto_atuais').select('*'),
        sb.from('destaques').select('posto_id').gte('ativo_ate', hoje()),
        sb.from('promocoes').select('posto_id, texto'),
        sb.from('patrocinios').select('nome, texto, link').gte('ativo_ate', hoje()).order('ordem'),
      ]);
      for (const x of p.data || []) {
        if (!vazio.precos.has(x.posto_id)) vazio.precos.set(x.posto_id, {});
        vazio.precos.get(x.posto_id)[x.combustivel] = { valor: Number(x.valor), informado_em: x.informado_em };
      }
      for (const x of d.data || []) vazio.destaques.add(x.posto_id);
      for (const x of pr.data || []) if (x.texto) vazio.promocoes.set(x.posto_id, x.texto);
      vazio.patrocinios = pat.data || [];
    } catch (e) {
      console.warn('Recursos da nuvem indisponíveis:', e.message);
    }
    return vazio;
  }

  /** Lista de todos os postos (id, nome, bairro), da versão publicada ou do servidor local. */
  async function listaPostos() {
    for (const url of ['api/postos-gasolina.json', '/api/postos?combustivel=gasolina']) {
      try {
        const r = await fetch(url);
        if (r.ok) return (await r.json()).postos.map((p) => ({ id: p.id, nome: p.nome, bairro: p.bairro, bandeira: p.bandeira }));
      } catch { /* tenta a próxima */ }
    }
    return [];
  }

  window.Nuvem = { configurado, cliente, extras, listaPostos, hoje };
})();

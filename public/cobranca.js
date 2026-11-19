// Assinatura Premium pela Google Play (Digital Goods API + Payment Request), só dentro do app da Play Store.
// Cada compra é conferida e confirmada no servidor (Supabase Edge Function "verificar-compra"),
// senão a Google estorna em 3 dias. No navegador comum a compra não existe: o site manda para a Play Store.
(function () {
  'use strict';
  const PLAY = 'https://play.google.com/billing';
  const PRODUTOS = ['premium_mensal', 'premium_anual'];
  const LOJA = 'https://play.google.com/store/apps/details?id=io.github.robsonmj.combustivelbarato';
  const A = window.AJUSTES || {};

  let servicoPromessa = null;
  /** Serviço de cobrança da Play, ou null fora do app da Play Store. */
  function servico() {
    if (!servicoPromessa) {
      servicoPromessa = ('getDigitalGoodsService' in window)
        ? window.getDigitalGoodsService(PLAY).catch(() => null)
        : Promise.resolve(null);
    }
    return servicoPromessa;
  }

  async function verificar(token, produto) {
    const r = await fetch(`${A.supabaseUrl}/functions/v1/verificar-compra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: A.supabaseChave },
      body: JSON.stringify({ token, produto }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok && !('ativo' in d)) throw new Error(d.erro || 'Não foi possível confirmar a compra.');
    return d; // { ativo, expira, produto }
  }

  /** Preços como aparecem na Play: { premium_mensal: 'R$ 4,90', ... }. */
  async function precos() {
    const s = await servico();
    if (!s) return {};
    try {
      const det = await s.getDetails(PRODUTOS);
      return Object.fromEntries(det.map((d) => [d.itemId,
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: d.price.currency }).format(Number(d.price.value))]));
    } catch {
      return {};
    }
  }

  /** Abre a tela de pagamento da Play. Devolve { ativo, expira, produto } ou null se a pessoa desistiu. */
  async function assinar(produto) {
    if (!(await servico())) throw new Error('A assinatura é feita pelo app da Google Play.');
    const pedido = new PaymentRequest(
      [{ supportedMethods: PLAY, data: { sku: produto } }],
      { total: { label: 'Total', amount: { currency: 'BRL', value: '0' } } },
    );
    let resposta;
    try {
      resposta = await pedido.show();
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
    try {
      const r = await verificar(resposta.details.purchaseToken, produto);
      await resposta.complete(r.ativo ? 'success' : 'fail');
      return r;
    } catch (e) {
      await resposta.complete('fail').catch(() => {});
      throw e;
    }
  }

  /**
   * Confere as assinaturas da conta Google do celular (também confirma compras pendentes).
   * Devolve { ativo, expira, produto }; null se não deu para conferir (fora da Play ou sem internet).
   */
  async function restaurar() {
    const s = await servico();
    if (!s) return null;
    try {
      const compras = (await s.listPurchases()).filter((c) => PRODUTOS.includes(c.itemId));
      for (const c of compras) {
        const r = await verificar(c.purchaseToken, c.itemId);
        if (r.ativo) return r;
      }
      return { ativo: false };
    } catch {
      return null;
    }
  }

  window.Cobranca = {
    PRODUTOS,
    LOJA,
    disponivel: async () => Boolean(await servico()),
    precos,
    assinar,
    restaurar,
  };
})();

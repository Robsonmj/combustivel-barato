// Combustível Barato Premium: Meu carro, Minha economia, Melhor dia, Cupons, Alertas de preço,
// Modo viagem (viagem.js) e Sem anúncios.
// Tudo fica guardado só neste aparelho (localStorage). Conversa com o app apenas pela interface window.App.
(function () {
  'use strict';
  if (!window.App) return;
  const { esc, reais, numero, decimal, lerNumero, pref, NOMES } = Util;
  const $ = (s) => document.querySelector(s);
  const DIAS_TESTE = 14;
  const NOMES_DIA = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

  // ---------- assinatura ----------
  // Por enquanto há o teste grátis. A cobrança pela Google Play entra depois e grava "pagoAte".
  const Premium = {
    dados: () => pref.lerJson('premium', {}),
    ativo() {
      const d = Premium.dados();
      const fim = Math.max(Date.parse(d.pagoAte || 0) || 0, Premium.fimTeste() || 0);
      return fim > Date.now();
    },
    fimTeste() {
      const d = Premium.dados();
      return d.testeInicio ? Date.parse(d.testeInicio) + DIAS_TESTE * 86400000 : null;
    },
    diasRestantes() {
      const fim = Premium.fimTeste();
      return fim ? Math.max(0, Math.ceil((fim - Date.now()) / 86400000)) : 0;
    },
    comecarTeste() {
      const d = Premium.dados();
      if (d.testeInicio) return false;
      pref.salvarJson('premium', { ...d, testeInicio: new Date().toISOString() });
      return true;
    },
  };
  window.Premium = Premium;

  // ---------- dados guardados no aparelho ----------
  const carro = () => pref.lerJson('carro', null);
  const abastecimentos = () => pref.lerJson('abastecimentos', []);
  const alertas = () => pref.lerJson('alertas', []);
  const favoritos = () => pref.lerJson('favoritos', []);
  const opcoes = () => pref.lerJson('opcoesPremium', { semAnuncios: true });

  /** Aplica no app o que depende da assinatura (carro e anúncios). */
  function aplicar() {
    const ativo = Premium.ativo();
    App.usarCarro(ativo ? carro() : null);
    App.usarSemAnuncios(ativo && opcoes().semAnuncios !== false);
    const b = $('#btn-premium');
    if (b) b.classList.toggle('ativo', ativo);
  }

  // ---------- tela do Premium ----------
  const dlg = document.createElement('dialog');
  dlg.className = 'detalhe premium-tela';
  dlg.innerHTML = '<div class="detalhe-conteudo" id="premium-conteudo"></div>';
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-fechar]') || ev.target === dlg) dlg.close();
  });

  const botao = document.createElement('button');
  botao.id = 'btn-premium';
  botao.className = 'btn-premium';
  botao.innerHTML = '★ Premium';
  botao.addEventListener('click', () => abrir());
  $('.topo .marca').after(botao);

  function abrir(secao) {
    desenharTela();
    if (!dlg.open) dlg.showModal();
    if (secao) dlg.querySelector(`[data-secao="${secao}"]`)?.setAttribute('open', '');
  }

  function cartaoAssinatura() {
    const d = Premium.dados();
    if (Premium.ativo() && d.pagoAte) return `<div class="assinatura ok">Você é Premium. Obrigado por apoiar o app!</div>`;
    if (Premium.ativo()) {
      const n = Premium.diasRestantes();
      return `<div class="assinatura ok">Teste grátis: falta${n === 1 ? '' : 'm'} <strong>${n} dia${n === 1 ? '' : 's'}</strong>.
        Aproveite todos os recursos abaixo.</div>`;
    }
    if (d.testeInicio) {
      return `<div class="assinatura">Seu teste grátis terminou. A assinatura pela Google Play chega em breve:
        você vai poder continuar com todos os recursos. Seus dados (carro, abastecimentos e alertas) continuam guardados.</div>`;
    }
    return `<div class="assinatura">
      <p>Economize mais com recursos feitos para quem abastece toda semana.</p>
      <button class="btn primario" data-teste>Experimentar grátis por ${DIAS_TESTE} dias</button>
      <small>Sem cadastro e sem cartão. Tudo fica guardado só no seu celular.</small></div>`;
  }

  function secao(id, titulo, resumo, corpo) {
    const bloqueado = !Premium.ativo();
    return `<details class="recurso${bloqueado ? ' bloqueado' : ''}" data-secao="${id}">
      <summary><strong>${titulo}</strong><span>${resumo}</span></summary>
      <div class="recurso-corpo">${bloqueado ? '<p class="cadeado">🔒 Disponível no Premium. Experimente grátis.</p>' : corpo()}</div>
    </details>`;
  }

  function desenharTela() {
    const caixa = $('#premium-conteudo');
    caixa.innerHTML = `
      <button class="fechar" aria-label="Fechar" data-fechar>×</button>
      <h2>★ Combustível Barato Premium</h2>
      ${cartaoAssinatura()}
      ${secao('alertas', '🔔 Alertas de preço', 'Aviso quando a gasolina baixar do seu preço ou quando o posto favorito baixar', corpoAlertas)}
      ${secao('economia', '💰 Minha economia', 'Quanto você economizou no mês e no ano', corpoEconomia)}
      ${secao('dia', '📅 Melhor dia para abastecer', 'Dia da semana mais barato e se o preço está subindo', () => '<div id="melhor-dia">Carregando…</div>')}
      ${secao('cupons', '🎟️ Cupons dos postos', 'Descontos exclusivos dos postos parceiros', () => '<div id="lista-cupons">Carregando…</div>')}
      ${secao('viagem', '🛣️ Modo viagem', 'Posto mais barato no caminho entre cidades', () => '<button class="btn primario" data-viagem>Planejar viagem</button>')}
      ${secao('carro', '🚗 Meu carro', 'Custo real por posto e etanol ou gasolina para o seu carro', corpoCarro)}
      ${secao('anuncios', '🚫 Sem anúncios', 'Sem faixa de patrocínio e sem cartões patrocinados', corpoAnuncios)}`;
    ligarTela(caixa);
    if (Premium.ativo()) {
      desenharMelhorDia();
      desenharCupons();
    }
  }

  function ligarTela(caixa) {
    caixa.querySelector('[data-teste]')?.addEventListener('click', () => {
      Premium.comecarTeste();
      aplicar();
      desenharTela();
      verificarAlertas();
    });
    caixa.querySelector('[data-viagem]')?.addEventListener('click', () => {
      dlg.close();
      window.Viagem?.abrir();
    });
    ligarCarro(caixa);
    ligarEconomia(caixa);
    ligarAlertas(caixa);
    caixa.querySelector('#op-anuncios')?.addEventListener('change', (ev) => {
      pref.salvarJson('opcoesPremium', { ...opcoes(), semAnuncios: ev.target.checked });
      aplicar();
    });
  }

  // ---------- Meu carro ----------
  function corpoCarro() {
    const c = carro() || {};
    return `<form class="form" id="form-carro">
      <label>Consumo com gasolina (km por litro) <input name="kmL" inputmode="decimal" value="${c.kmL ? decimal(c.kmL) : ''}" placeholder="Ex.: 11,5" required></label>
      <label>Consumo com etanol (km por litro) <input name="kmLEtanol" inputmode="decimal" value="${c.kmLEtanol ? decimal(c.kmLEtanol) : ''}" placeholder="Ex.: 8,0"></label>
      <label>Quantos litros você costuma abastecer <input name="litros" inputmode="numeric" value="${c.litros || ''}" placeholder="Ex.: 40" required></label>
      <button class="btn primario">Salvar meu carro</button>
      <p class="msg" id="msg-carro" role="status">${c.kmL ? 'O custo-benefício e a dica etanol × gasolina já usam o seu carro.' : 'Dica: o consumo aparece no painel do carro ou no manual.'}</p>
    </form>`;
  }
  function ligarCarro(caixa) {
    const f = caixa.querySelector('#form-carro');
    if (!f) return;
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const kmL = lerNumero(d.kmL);
      const kmLEtanol = lerNumero(d.kmLEtanol) || Math.round(kmL * 0.7 * 10) / 10;
      const litros = Math.round(lerNumero(d.litros));
      const msg = f.querySelector('#msg-carro');
      if (!(kmL > 2 && kmL < 40 && kmLEtanol > 1 && kmLEtanol < 40 && litros > 1 && litros < 200)) {
        msg.className = 'msg erro';
        msg.textContent = 'Confira os números: consumo entre 2 e 40 km/l e litros entre 1 e 200.';
        return;
      }
      pref.salvarJson('carro', { kmL, kmLEtanol, litros });
      aplicar();
      msg.className = 'msg ok';
      const limite = Math.round((kmLEtanol / kmL) * 100);
      msg.textContent = `Salvo. No seu carro o etanol compensa quando custa até ${limite}% da gasolina.`;
    });
  }

  // ---------- Minha economia ----------
  function corpoEconomia() {
    const lista = abastecimentos();
    const agora = new Date();
    const soma = (filtro) => lista.filter(filtro).reduce((t, a) => t + a.economia, 0);
    const mes = soma((a) => a.data.slice(0, 7) === agora.toISOString().slice(0, 7));
    const ano = soma((a) => a.data.slice(0, 4) === String(agora.getFullYear()));
    const ultimos = lista.slice(-5).reverse().map((a) => `<tr><td>${new Date(a.data).toLocaleDateString('pt-BR')} · ${esc(a.posto || NOMES[a.combustivel])}</td>
      <td>${numero(a.litros)} l a ${reais(a.preco)}</td><td class="${a.economia >= 0 ? 'eco-mais' : 'eco-menos'}">${a.economia >= 0 ? '+' : '−'}${reais(Math.abs(a.economia))}</td></tr>`).join('');
    return `<div class="economia-totais">
        <div><small>Este mês</small><strong>${reais(mes)}</strong></div>
        <div><small>Este ano</small><strong>${reais(ano)}</strong></div>
      </div>
      <p class="fonte-txt">Economia = (preço médio da cidade no dia − preço que você pagou) × litros.
        Para registrar, abra o posto onde abasteceu e toque em "Abasteci aqui".</p>
      ${ultimos ? `<table class="tabela economia"><tbody>${ultimos}</tbody></table>
      <button class="btn peq" data-limpar-economia>Apagar meus registros</button>` : ''}`;
  }
  function ligarEconomia(caixa) {
    caixa.querySelector('[data-limpar-economia]')?.addEventListener('click', () => {
      if (!confirm('Apagar todos os abastecimentos registrados neste celular?')) return;
      pref.salvarJson('abastecimentos', []);
      desenharTela();
      dlg.querySelector('[data-secao="economia"]').setAttribute('open', '');
    });
  }

  /** Bloco "Abasteci aqui" no detalhe do posto. */
  function formAbasteci(posto, precos) {
    const comb = App.combustivel();
    const atual = precos.find((x) => x.combustivel === comb);
    const div = document.createElement('div');
    div.className = 'abasteci';
    div.innerHTML = `<details><summary>⛽ Abasteci aqui (registrar economia)</summary>
      <form class="form">
        <label>Combustível <select name="combustivel">${Object.entries(NOMES).map(([k, v]) => `<option value="${k}" ${k === comb ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Preço que você pagou por litro <input name="preco" inputmode="decimal" value="${atual ? numero(atual.valor) : ''}" required></label>
        <label>Litros <input name="litros" inputmode="decimal" value="${carro()?.litros || ''}" required></label>
        <button class="btn primario">Registrar</button>
        <p class="msg" role="status"></p>
      </form></details>`;
    const f = div.querySelector('form');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const preco = lerNumero(d.preco);
      const litros = lerNumero(d.litros);
      const msg = f.querySelector('.msg');
      if (!(preco > 1 && preco < 20 && litros > 0 && litros < 500)) {
        msg.className = 'msg erro';
        msg.textContent = 'Confira o preço e os litros.';
        return;
      }
      const media = await mediaDaCidade(d.combustivel, posto.cidade || App.cidadeAtual()?.nome);
      if (!media) {
        msg.className = 'msg erro';
        msg.textContent = 'Sem preço médio da cidade para comparar agora. Tente mais tarde.';
        return;
      }
      const economia = Math.round((media - preco) * litros * 100) / 100;
      const lista = abastecimentos();
      lista.push({ data: new Date().toISOString(), posto: posto.nome, combustivel: d.combustivel, preco, litros, media, economia });
      pref.salvarJson('abastecimentos', lista.slice(-500));
      msg.className = 'msg ok';
      msg.textContent = economia >= 0
        ? `Registrado! Você economizou ${reais(economia)} em relação à média da cidade (${reais(media)}).`
        : `Registrado. Este abastecimento saiu ${reais(-economia)} acima da média da cidade (${reais(media)}).`;
    });
    return div;
  }

  async function mediaDaCidade(comb, cidade) {
    if (comb === App.combustivel() && cidade === App.cidadeAtual()?.nome) {
      const r = App.resumo().find((x) => x.combustivel === comb);
      if (r?.media) return Number(r.media);
    }
    const d = await Nuvem.rpc('api_postos', { comb, cid: cidade });
    const r = d?.resumo?.find((x) => x.combustivel === comb);
    return r?.media ? Number(r.media) : null;
  }

  // ---------- Melhor dia ----------
  async function desenharMelhorDia() {
    const el = $('#melhor-dia');
    if (!el) return;
    const comb = App.combustivel();
    const cidade = App.cidadeAtual()?.nome;
    const d = await Nuvem.rpc('api_tendencia', { comb, cid: cidade });
    if (!d || d.dias_com_dados < 14 || !d.semana?.length) {
      el.innerHTML = `<p>Ainda juntando dados de ${esc(NOMES[comb])} em ${esc(cidade)}. Com duas semanas de preços, aparece aqui o dia mais barato.</p>`;
      return;
    }
    const sem = d.semana.filter((x) => x.dias >= 2);
    const melhor = sem.reduce((a, b) => (Number(b.desvio) < Number(a.desvio) ? b : a));
    const pior = sem.reduce((a, b) => (Number(b.desvio) > Number(a.desvio) ? b : a));
    const max = Math.max(...sem.map((x) => Math.abs(Number(x.desvio))), 0.001);
    const barras = d.semana.map((x) => {
      const v = Number(x.desvio);
      const larg = Math.round((Math.abs(v) / max) * 50);
      return `<div class="dia-linha"><span>${NOMES_DIA[x.dow]}</span>
        <div class="dia-barra"><i class="${v <= 0 ? 'menos' : 'mais'}" style="width:${larg}%;${v <= 0 ? `right:50%` : 'left:50%'}"></i></div>
        <b>${v <= 0 ? '−' : '+'}${numero(Math.abs(v))}</b></div>`;
    }).join('');
    let tendencia = '';
    if (d.ultimos7 && d.anteriores7) {
      const dif = Number(d.ultimos7) - Number(d.anteriores7);
      tendencia = Math.abs(dif) < 0.02
        ? 'O preço está <strong>estável</strong> nas últimas duas semanas.'
        : `O preço médio <strong>${dif > 0 ? 'subiu' : 'caiu'} ${reais(Math.abs(dif))}</strong> nesta semana em relação à anterior.`;
    }
    el.innerHTML = `<p>Em ${esc(cidade)}, ${esc(NOMES[comb]).toLowerCase()} costuma sair mais barato na <strong>${NOMES_DIA[melhor.dow]}</strong>
      e mais caro na <strong>${NOMES_DIA[pior.dow]}</strong>. ${tendencia}</p>
      <div class="dias">${barras}</div>
      <p class="fonte-txt">Diferença média, em R$ por litro, de cada dia em relação à semana dele (últimos ${d.dias_com_dados} dias de notas fiscais). É tendência, não garantia.</p>`;
  }

  // ---------- Cupons ----------
  let cuponsCache = null;
  async function buscarCupons() {
    if (cuponsCache && Date.now() - cuponsCache.em < 5 * 60000) return cuponsCache.lista;
    let lista = [];
    try {
      const sb = await Nuvem.cliente();
      if (sb) {
        const r = await sb.from('cupons').select('id, posto_id, posto_nome, texto, codigo, ativo_ate').gte('ativo_ate', Nuvem.hoje()).order('ativo_ate');
        lista = r.data || [];
      }
    } catch { /* sem cupons */ }
    cuponsCache = { em: Date.now(), lista };
    return lista;
  }
  const htmlCupom = (c) => `<div class="cupom"><div><strong>${esc(c.texto)}</strong>
    <small>${esc(c.posto_nome || '')} · válido até ${new Date(c.ativo_ate + 'T12:00').toLocaleDateString('pt-BR')}</small></div>
    ${c.codigo ? `<code>${esc(c.codigo)}</code>` : '<span class="selo">Mostre no caixa</span>'}</div>`;

  async function desenharCupons() {
    const el = $('#lista-cupons');
    if (!el) return;
    const lista = await buscarCupons();
    el.innerHTML = lista.length
      ? lista.map((c) => `<a href="#" data-posto="${c.posto_id}">${htmlCupom(c)}</a>`).join('')
      : '<p>Nenhum cupom ativo agora. Os postos parceiros publicam descontos aqui. Volte em breve!</p>';
    el.querySelectorAll('[data-posto]').forEach((a) => a.addEventListener('click', (ev) => {
      ev.preventDefault();
      dlg.close();
      App.abrirPosto(Number(a.dataset.posto));
    }));
  }

  // ---------- Alertas de preço ----------
  function corpoAlertas() {
    const cid = App.cidadeAtual()?.nome || '';
    const lista = alertas();
    const favs = favoritos();
    const permissao = 'Notification' in window ? Notification.permission : 'indisponivel';
    return `<form class="form" id="form-alerta">
        <label>Combustível <select name="combustivel">${Object.entries(NOMES).map(([k, v]) => `<option value="${k}" ${k === App.combustivel() ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Cidade <select name="cidade">${App.cidades().map((c) => `<option ${c.nome === cid ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
        <label>Me avise quando ficar abaixo de (R$/litro) <input name="alvo" inputmode="decimal" placeholder="Ex.: 5,99" required></label>
        <button class="btn primario">Criar alerta</button>
        <p class="msg" id="msg-alerta" role="status"></p>
      </form>
      ${lista.length ? `<ul class="alertas">${lista.map((a, i) => `<li>${esc(NOMES[a.combustivel])} em ${esc(a.cidade)} abaixo de ${reais(a.alvo)}
        <button class="btn peq" data-tira-alerta="${i}">Excluir</button></li>`).join('')}</ul>` : ''}
      <p class="fonte-txt"><strong>Postos favoritos:</strong> ${favs.length ? favs.map((f) => esc(f.nome)).join(', ') : 'nenhum ainda'}.
        Toque em ☆ na tela de um posto para avisar quando ele baixar o preço.</p>
      ${permissao === 'default' ? '<button class="btn" data-permitir>Permitir notificações no celular</button>' : ''}
      ${permissao === 'denied' ? '<p class="fonte-txt">As notificações estão bloqueadas. Os avisos aparecem dentro do app.</p>' : ''}
      <p class="fonte-txt">O app confere os preços sempre que está aberto e a cada 15 minutos enquanto continuar aberto.</p>`;
  }
  function ligarAlertas(caixa) {
    const f = caixa.querySelector('#form-alerta');
    if (f) f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const alvo = lerNumero(d.alvo);
      const msg = f.querySelector('#msg-alerta');
      if (!(alvo > 1 && alvo < 20)) {
        msg.className = 'msg erro';
        msg.textContent = 'Digite um preço por litro, por exemplo 5,99.';
        return;
      }
      const lista = alertas().filter((a) => !(a.combustivel === d.combustivel && a.cidade === d.cidade));
      lista.push({ combustivel: d.combustivel, cidade: d.cidade, alvo, avisadoEm: null });
      pref.salvarJson('alertas', lista);
      pedirPermissao();
      desenharTela();
      dlg.querySelector('[data-secao="alertas"]').setAttribute('open', '');
      verificarAlertas();
    });
    caixa.querySelectorAll('[data-tira-alerta]').forEach((b) => b.addEventListener('click', () => {
      const lista = alertas();
      lista.splice(Number(b.dataset.tiraAlerta), 1);
      pref.salvarJson('alertas', lista);
      desenharTela();
      dlg.querySelector('[data-secao="alertas"]').setAttribute('open', '');
    }));
    caixa.querySelector('[data-permitir]')?.addEventListener('click', async () => {
      await pedirPermissao();
      desenharTela();
      dlg.querySelector('[data-secao="alertas"]').setAttribute('open', '');
    });
  }

  async function pedirPermissao() {
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* navegador antigo */ }
    }
  }

  async function notificar(titulo, texto, postoId) {
    mostrarAviso(titulo, texto, postoId);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(titulo, { body: texto, icon: 'icone-192.png', badge: 'icone-192.png', tag: 'preco-' + (postoId || titulo) });
      else new Notification(titulo, { body: texto, icon: 'icone-192.png' });
    } catch { /* fica só o aviso dentro do app */ }
  }

  function mostrarAviso(titulo, texto, postoId) {
    const el = document.createElement('div');
    el.className = 'aviso-preco';
    el.innerHTML = `<strong>${esc(titulo)}</strong><span>${esc(texto)}</span><button aria-label="Fechar">×</button>`;
    el.querySelector('button').addEventListener('click', (ev) => { ev.stopPropagation(); el.remove(); });
    if (postoId) el.addEventListener('click', () => { el.remove(); App.abrirPosto(postoId); });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 15000);
  }

  /** Confere alertas e favoritos. Busca uma vez cada par cidade + combustível necessário. */
  let verificando = false;
  async function verificarAlertas() {
    if (!Premium.ativo() || verificando) return;
    const lista = alertas();
    const favs = favoritos();
    if (!lista.length && !favs.length) return;
    verificando = true;
    try {
      const pares = new Map();
      for (const x of [...lista, ...favs]) pares.set(x.cidade + '|' + x.combustivel, { cid: x.cidade, comb: x.combustivel });
      const dados = new Map();
      for (const [k, p] of pares) dados.set(k, await Nuvem.rpc('api_postos', p));
      const hoje = new Date().toISOString().slice(0, 10);

      for (const a of lista) {
        const d = dados.get(a.cidade + '|' + a.combustivel);
        const barato = d?.postos?.filter((p) => p.preco).sort((x, y) => x.preco - y.preco)[0];
        if (barato && barato.preco <= a.alvo && a.avisadoEm !== hoje) {
          a.avisadoEm = hoje;
          notificar(`${NOMES[a.combustivel]} a ${reais(barato.preco)} em ${a.cidade}`,
            `${barato.nome} está abaixo do seu alerta de ${reais(a.alvo)}.`, barato.id);
        }
      }
      for (const f of favs) {
        const d = dados.get(f.cidade + '|' + f.combustivel);
        const p = d?.postos?.find((x) => x.id === f.id);
        if (!p?.preco) continue;
        if (f.ultimo && p.preco < f.ultimo - 0.005) {
          notificar(`${f.nome} baixou o preço`, `${NOMES[f.combustivel]}: de ${reais(f.ultimo)} para ${reais(p.preco)}.`, f.id);
        }
        f.ultimo = p.preco;
      }
      pref.salvarJson('alertas', lista);
      pref.salvarJson('favoritos', favs);
    } finally {
      verificando = false;
    }
  }

  /** Botão de favorito (☆/★) no detalhe do posto. */
  function botaoFavorito(posto, precos) {
    const comb = App.combustivel();
    const eh = () => favoritos().some((f) => f.id === posto.id);
    const b = document.createElement('button');
    b.className = 'btn favorito';
    const rotulo = () => { b.textContent = eh() ? '★ Favorito (avisar quando baixar)' : '☆ Favoritar e avisar quando baixar'; };
    rotulo();
    b.addEventListener('click', () => {
      let favs = favoritos();
      if (eh()) favs = favs.filter((f) => f.id !== posto.id);
      else {
        const atual = precos.find((x) => x.combustivel === comb);
        favs.push({ id: posto.id, nome: posto.nome, cidade: posto.cidade || App.cidadeAtual()?.nome, combustivel: comb, ultimo: atual?.valor || null });
        pedirPermissao();
      }
      pref.salvarJson('favoritos', favs);
      rotulo();
    });
    return b;
  }

  function corpoAnuncios() {
    return `<label class="opcao"><input type="checkbox" id="op-anuncios" ${opcoes().semAnuncios !== false ? 'checked' : ''}>
      Esconder patrocínios e cartões patrocinados</label>
      <p class="fonte-txt">Os preços e a ordem da lista nunca mudam por causa de patrocínio.</p>`;
  }

  // ---------- ligações com o app ----------
  App.ao('detalhe', async ({ posto, precos, caixa }) => {
    const lugar = caixa.querySelector('.botoes');
    if (!lugar) return;
    const extra = document.createElement('div');
    extra.className = 'premium-detalhe';
    lugar.after(extra);
    if (!Premium.ativo()) {
      const convite = document.createElement('button');
      convite.className = 'btn convite-premium';
      convite.textContent = '★ Premium: favoritar, alerta de preço, cupons e economia';
      convite.addEventListener('click', () => { $('#detalhe').close(); abrir(); });
      extra.appendChild(convite);
      return;
    }
    extra.appendChild(botaoFavorito(posto, precos));
    extra.appendChild(formAbasteci(posto, precos));
    const cupons = (await buscarCupons()).filter((c) => c.posto_id === posto.id);
    if (cupons.length) extra.insertAdjacentHTML('afterbegin', `<div class="cupons-posto">${cupons.map(htmlCupom).join('')}</div>`);
  });

  App.ao('postos', () => {
    if (dlg.open && Premium.ativo()) desenharMelhorDia();
  });

  aplicar();
  setTimeout(verificarAlertas, 4000);
  setInterval(verificarAlertas, 15 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarAlertas(); });
  window.Premium.abrir = abrir;
})();

// Telas do app: mapa, lista e detalhe do posto.
(function () {
  'use strict';

  // Aberto pelo app da Google Play (TWA)? Lá não mostramos a "Área do posto", que exige login por e-mail:
  // os donos de posto a usam pelo site, no navegador. Fica guardado na sessão para valer também ao navegar.
  const APP_PLAY = (() => {
    try {
      if (document.referrer.startsWith('android-app://')) sessionStorage.setItem('appPlay', '1');
      return sessionStorage.getItem('appPlay') === '1';
    } catch { return document.referrer.startsWith('android-app://'); }
  })();

  const { NOMES, esc, reais, numero, decimal, fmtKm, haQuanto, distanciaKm, pref } = Util;
  const lerPreferencia = pref.ler;
  const salvarPreferencia = pref.salvar;
  const CURTO = { ...NOMES, gasolina_aditivada: 'Aditivada' };
  const FONTES = {
    menor_preco: 'Nota Paraná / Menor Preço',
    anp: 'ANP',
    usuario: 'Informado por motorista',
    posto: 'Informado pelo posto',
  };
  const estado = {
    // carro usado no custo-benefício e na regra etanol × gasolina (o recurso "Meu carro" troca pelos dados do usuário)
    carro: { kmL: 10, kmLEtanol: 7, litros: 40, proprio: false },
    semAnuncios: false,
    config: null,
    combustivel: lerPreferencia('combustivel') || 'gasolina',
    ordem: 'preco',
    postos: [],
    resumo: [],
    status: [],
    origem: null, // posição do usuário (ou centro da cidade)
    usandoGps: false,
    marcadores: new Map(),
    ativo: null,
  };

  const $ = (s) => document.querySelector(s);
  const mapa = L.map('mapa', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);
  const camadaPostos = L.layerGroup().addTo(mapa);
  // Recalcula o tamanho do mapa sempre que a área muda (ex.: girar o celular, abrir a gaveta)
  new ResizeObserver(() => mapa.invalidateSize()).observe(document.getElementById('mapa'));
  let marcadorVoce = null;

  // ---------- utilidades ----------
  function velho(iso) {
    return Date.now() - Date.parse(iso) > (estado.config?.avisoDesatualizadoHoras || 48) * 3600000;
  }

  // Na versão publicada (GitHub Pages) os preços vêm do Supabase (apiSupabase, abaixo); como reserva,
  // as rotas da API são traduzidas para os arquivos JSON publicados no site.
  function rotaEstatica(url) {
    const u = new URL(url, 'http://x');
    if (u.pathname === '/api/config') return 'api/config.json';
    if (u.pathname === '/api/postos') return `api/postos-${u.searchParams.get('combustivel')}.json`;
    const m = u.pathname.match(/^\/api\/postos\/(\d+)$/);
    if (m) return `api/posto-${m[1]}.json`;
    return url;
  }

  // Preços atualizados direto do Supabase (coleta automática no servidor, supabase/coleta.sql).
  // Se o Supabase não responder, usa os arquivos JSON publicados como reserva.
  async function apiSupabase(url) {
    if (!window.Nuvem?.configurado) return null;
    const u = new URL(url, 'http://x');
    let rpc, corpo;
    const m = u.pathname.match(/^\/api\/postos\/(\d+)$/);
    if (u.pathname === '/api/postos') {
      rpc = 'api_postos';
      corpo = { comb: u.searchParams.get('combustivel'), cid: u.searchParams.get('cidade') || null };
    }
    else if (m) { rpc = 'api_posto'; corpo = { pid: Number(m[1]) }; }
    else return null;
    const dados = await Nuvem.rpc(rpc, corpo);
    if (dados && rpc === 'api_posto' && !dados.posto) throw new Error('Posto não encontrado');
    return dados;
  }

  async function api(url, opcoes) {
    if (window.MODO_ESTATICO) {
      const online = await apiSupabase(url);
      if (online) return online;
      url = rotaEstatica(url) + '?v=' + Math.floor(Date.now() / 300000);
    }
    const r = await fetch(url, opcoes);
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || 'Erro ' + r.status);
    return dados;
  }

  // ---------- carregamento ----------
  async function iniciar() {
    estado.config = await api('/api/config');
    estado.cidades = estado.config.cidades || [estado.config.cidade];
    const salva = lerPreferencia('cidade');
    const sel = $('#cidade');
    sel.innerHTML = estado.cidades.map((c) => `<option value="${esc(c.nome)}">${esc(c.nome)} · ${esc(c.uf)}</option>`).join('');
    sel.addEventListener('change', () => trocarCidade(sel.value, true));
    if (!estado.config.combustiveis.includes(estado.combustivel)) estado.combustivel = 'gasolina';
    montarChips();
    trocarCidade(estado.cidades.some((c) => c.nome === salva) ? salva : estado.cidades[0].nome, false);
    setInterval(carregar, 5 * 60 * 1000); // atualiza a cada 5 minutos
  }

  /** Muda a cidade mostrada: centraliza o mapa e carrega os postos dela. */
  function trocarCidade(nome, salvar) {
    const c = estado.cidades.find((x) => x.nome === nome) || estado.cidades[0];
    estado.cidade = c;
    $('#cidade').value = c.nome;
    $('#cidade-nome').textContent = `${c.nome} · ${c.uf}`;
    if (salvar) salvarPreferencia('cidade', c.nome);
    document.title = `Combustível Barato · ${c.nome}`;
    if (!estado.usandoGps) estado.origem = { ...c.centro };
    mapa.setView([c.centro.lat, c.centro.lng], c.zoom);
    estado.postos = [];
    $('#lista').innerHTML = '<li class="vazio">Carregando postos…</li>';
    return carregar();
  }

  /** Cidade atendida mais próxima de um ponto (até 40 km), ou null. */
  function cidadeMaisProxima(pt) {
    let melhor = null;
    for (const c of estado.cidades) {
      const d = distanciaKm(pt, c.centro);
      if (d <= 40 && (!melhor || d < melhor.d)) melhor = { c, d };
    }
    return melhor?.c || null;
  }

  // Dados da nuvem (preço informado pelo posto, destaques, patrocinadores), renovados a cada 5 min
  let extras = { precos: new Map(), destaques: new Set(), promocoes: new Map(), patrocinios: [] };
  let extrasEm = 0;
  async function carregarExtras() {
    if (!window.Nuvem || Date.now() - extrasEm < 4 * 60 * 1000) return;
    extras = await Nuvem.extras();
    extrasEm = Date.now();
  }

  /** Usa o preço informado pelo próprio posto quando ele é mais recente que o da nota fiscal. */
  function aplicarPrecoDoPosto(p, combustivel) {
    const doPosto = extras.precos.get(p.id)?.[combustivel];
    if (doPosto && (!p.coletado_em || Date.parse(doPosto.informado_em) >= Date.parse(p.coletado_em))) {
      return { ...p, preco: doPosto.valor, valor: doPosto.valor, coletado_em: doPosto.informado_em, fonte: 'posto' };
    }
    return p;
  }

  async function carregar() {
    try {
      const [d] = await Promise.all([api('/api/postos?combustivel=' + estado.combustivel + '&cidade=' + encodeURIComponent(estado.cidade.nome)), carregarExtras()]);
      if (d.cidade !== undefined && d.cidade !== estado.cidade.nome) return; // resposta de outra cidade (troca rápida)
      // reserva (arquivos JSON publicados, só de Toledo): fica só com os postos da cidade escolhida
      const reserva = d.cidade === undefined;
      const daCidade = d.postos.filter((p) => (p.cidade || 'Toledo') === estado.cidade.nome);
      estado.postos = daCidade.map((p) => ({
        ...aplicarPrecoDoPosto(p, estado.combustivel),
        destaque: !estado.semAnuncios && extras.destaques.has(p.id),
        promocao: !estado.semAnuncios && extras.destaques.has(p.id) ? extras.promocoes.get(p.id) : null,
      }));
      estado.resumo = reserva && estado.cidade.nome !== 'Toledo' ? [] : d.resumo;
      estado.status = d.status;
      desenhar();
      avisar('postos', { postos: estado.postos, resumo: estado.resumo, combustivel: estado.combustivel, cidade: estado.cidade });
    } catch (e) {
      $('#lista').innerHTML = `<li class="vazio">Não foi possível carregar os postos: ${esc(e.message)}</li>`;
    }
  }

  function montarChips() {
    const principais = ['gasolina', 'etanol', 'diesel_s10', 'diesel', 'gasolina_aditivada'];
    $('#chips').innerHTML = principais
      .map((k) => `<button class="chip" data-comb="${k}" aria-pressed="${k === estado.combustivel}">${CURTO[k]}</button>`)
      .join('');
    $('#chips').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-comb]');
      if (!b) return;
      estado.combustivel = b.dataset.comb;
      salvarPreferencia('combustivel', estado.combustivel);
      document.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
      carregar();
    });
  }

  // ---------- desenho ----------
  function calcular() {
    const lista = estado.postos.map((p) => {
      const dist = distanciaKm(estado.origem, p);
      // custo efetivo por litro = preço + combustível gasto ida e volta, diluído no abastecimento
      const c = estado.carro;
      const kmL = estado.combustivel === 'etanol' ? c.kmLEtanol : c.kmL;
      const custo = p.preco ? p.preco * (1 + (2 * dist) / kmL / c.litros) : null;
      return { ...p, dist, custo };
    });
    const comPreco = lista.filter((p) => p.preco).map((p) => p.preco).sort((a, b) => a - b);
    const min = comPreco[0];
    const t1 = comPreco[Math.floor(comPreco.length / 3)];
    const t2 = comPreco[Math.floor((comPreco.length * 2) / 3)];
    for (const p of lista) {
      if (!p.preco) p.faixa = 'sem';
      else if (p.preco <= t1) p.faixa = 'barato';
      else if (p.preco <= t2) p.faixa = 'medio';
      else p.faixa = 'caro';
      p.top = p.preco && p.preco === min;
    }
    const chave = { preco: 'preco', distancia: 'dist', custo: 'custo' }[estado.ordem];
    lista.sort((a, b) => {
      if (estado.ordem !== 'distancia') {
        if (!a[chave] && b[chave]) return 1;
        if (a[chave] && !b[chave]) return -1;
      }
      return (a[chave] ?? 0) - (b[chave] ?? 0) || a.dist - b.dist;
    });
    return lista;
  }

  function desenhar() {
    const lista = calcular();
    desenharDica();
    desenharLista(lista);
    desenharMapa(lista);
    desenharRodape();
  }

  function desenharDica() {
    const min = (k) => estado.resumo.find((r) => r.combustivel === k)?.minimo;
    const et = min('etanol');
    const ga = min('gasolina');
    const el = $('#dica');
    if (!et || !ga || !['gasolina', 'etanol', 'gasolina_aditivada'].includes(estado.combustivel)) {
      el.hidden = true;
      return;
    }
    const c = estado.carro;
    // Com "Meu carro", o limite é o rendimento real do carro (km/l etanol ÷ km/l gasolina); sem ele, a regra dos 70%.
    const limite = c.proprio ? c.kmLEtanol / c.kmL : 0.7;
    const pct = Math.round((et / ga) * 100);
    const compensa = et / ga <= limite;
    el.hidden = false;
    const regra = c.proprio
      ? `No seu carro (${decimal(c.kmLEtanol)} km/l no etanol e ${decimal(c.kmL)} km/l na gasolina), o etanol vale a pena abaixo de ${Math.round(limite * 100)}%.`
      : 'Regra dos 70%: abaixo de 70%, vale o etanol.';
    el.innerHTML = `<strong>${compensa ? 'Etanol compensa' : 'Gasolina compensa'}</strong> no seu carro flex.
      O etanol mais barato (${reais(et)}) custa <strong>${pct}%</strong> da gasolina mais barata (${reais(ga)}).
      ${regra}`;
  }

  function desenharLista(lista) {
    const ol = $('#lista');
    const comPreco = lista.filter((p) => p.preco).length;
    if (!lista.length) {
      ol.innerHTML = `<li class="vazio">Ainda não há postos de ${esc(estado.cidade.nome)}. A coleta de preços roda a cada hora; volte daqui a pouco.</li>`;
      return;
    }
    if (!comPreco) {
      ol.innerHTML = `<li class="vazio">Nenhum preço recente de ${esc(NOMES[estado.combustivel])} em ${esc(estado.cidade.nome)}.</li>`;
    }
    // Postos com destaque pago: cartão "Patrocinado" no topo (a ordem da lista abaixo não muda)
    const patrocinados = lista.filter((p) => p.destaque).map((p) => `
      <li class="item patrocinado" tabindex="0" data-id="${p.id}">
        ${p.preco ? `<div class="preco ${p.faixa}">${numero(p.preco)}<small>${haQuanto(p.coletado_em)}</small></div>` : '<div class="preco sem">—</div>'}
        <div><div class="nome">${esc(p.nome)}</div>
          <div class="sub"><span class="selo destaque">Patrocinado</span>${p.promocao ? esc(p.promocao) : esc(p.bairro || '')}</div></div>
        <div class="dist">${fmtKm(p.dist)}</div>
      </li>`).join('');
    ol.innerHTML = patrocinados + (comPreco ? '' : ol.innerHTML) + lista.map((p) => {
      const precoHtml = p.preco
        ? `<div class="preco ${p.faixa}">${numero(p.preco)}<small>${haQuanto(p.coletado_em)}</small></div>`
        : '<div class="preco sem">sem preço</div>';
      const selos = [
        p.top ? '<span class="selo top">Mais barato</span>' : '',
        p.fonte === 'posto' ? '<span class="selo confirmado">✓ Confirmado pelo posto</span>' : '',
        p.preco && velho(p.coletado_em) ? '<span class="selo velho">Desatualizado</span>' : '',
        p.bandeira ? `<span class="selo">${esc(p.bandeira)}</span>` : '',
      ].join('');
      const extra = estado.ordem === 'custo' && p.custo ? ` · efetivo ${reais(p.custo)}/l` : '';
      return `<li class="item" tabindex="0" data-id="${p.id}">
        ${precoHtml}
        <div><div class="nome">${esc(p.nome)}</div>
          <div class="sub">${selos}${esc(p.bairro || '')}${extra}</div></div>
        <div class="dist">${fmtKm(p.dist)}</div>
      </li>`;
    }).join('');
  }

  function desenharMapa(lista) {
    camadaPostos.clearLayers();
    estado.marcadores.clear();
    for (const p of lista) {
      const classe = ['pino', p.faixa, p.top ? 'top' : '', p.destaque ? 'destaque' : '', estado.ativo === p.id ? 'ativo' : ''].join(' ');
      const texto = (p.destaque ? '★ ' : '') + (p.preco ? numero(p.preco) : '—');
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: '', html: `<div class="${classe}">${texto}</div>`, iconSize: [0, 0] }),
        title: p.nome,
        zIndexOffset: p.destaque ? 1500 : p.top ? 1000 : p.preco ? 500 : 0,
        keyboard: true,
      });
      m.on('click', () => abrirDetalhe(p.id));
      m.addTo(camadaPostos);
      estado.marcadores.set(p.id, m);
    }
  }

  function desenharRodape() {
    const mp = estado.status.find((s) => s.fonte === 'menor_preco');
    let st = '';
    if (mp) {
      st = mp.sucesso
        ? `Última coleta ${haQuanto(mp.ultima_execucao)}.`
        : `Última coleta falhou ${haQuanto(mp.ultima_execucao)} — mostrando os últimos preços conhecidos.`;
    }
    const zap = window.AJUSTES?.whatsappContato;
    const anuncie = zap
      ? ` · <a target="_blank" rel="noopener" href="https://wa.me/${zap}?text=${encodeURIComponent('Olá! Quero anunciar no Combustível Barato.')}">Anuncie aqui</a>`
      : '';
    $('#rodape').innerHTML = `Dados: <strong>Nota Paraná / Menor Preço</strong> (preços das notas fiscais eletrônicas),
      postos e motoristas. ${st} Confira o preço na bomba.<br>
      App independente, sem vínculo com o Governo do Paraná ou com a Receita Estadual.<br>
      ${APP_PLAY ? anuncie.replace(/^ · /, '') : '<a href="painel.html">É dono de posto? Atualize seus preços</a>' + anuncie}<br>
      <a href="termos.html">Termos de uso</a> · <a href="privacidade.html">Privacidade</a>`;
    desenharPatrocinio();
  }

  function desenharPatrocinio() {
    const el = $('#patrocinio');
    const lista = extras.patrocinios;
    if (!lista.length || estado.semAnuncios) {
      el.hidden = true;
      return;
    }
    const p = lista[Math.floor(Date.now() / 300000) % lista.length]; // alterna a cada 5 min
    el.hidden = false;
    const corpo = `<span class="selo">Patrocínio</span><strong>${esc(p.nome)}</strong> ${esc(p.texto)}`;
    el.innerHTML = p.link && /^https?:\/\//.test(p.link)
      ? `<a target="_blank" rel="noopener sponsored" href="${esc(p.link)}">${corpo}</a>`
      : corpo;
  }

  // ---------- detalhe do posto ----------
  async function abrirDetalhe(id) {
    estado.ativo = id;
    const dlg = $('#detalhe');
    const caixa = $('#detalhe-conteudo');
    caixa.innerHTML = '<p>Carregando…</p>';
    if (!dlg.open) dlg.showModal();
    try {
      const d = await api('/api/postos/' + id);
      const p = d.posto;
      const ordemComb = Object.keys(NOMES);
      // junta os preços informados pelo posto (quando mais recentes)
      const porComb = new Map(d.precos.map((x) => [x.combustivel, x]));
      for (const [comb, x] of Object.entries(extras.precos.get(p.id) || {})) {
        const atual = porComb.get(comb);
        if (!atual || Date.parse(x.informado_em) >= Date.parse(atual.coletado_em)) {
          porComb.set(comb, { combustivel: comb, valor: x.valor, coletado_em: x.informado_em, fonte: 'posto' });
        }
      }
      const promocao = extras.destaques.has(p.id) ? extras.promocoes.get(p.id) : null;
      const precos = [...porComb.values()].sort((a, b) => ordemComb.indexOf(a.combustivel) - ordemComb.indexOf(b.combustivel));
      const linhas = precos.length
        ? precos.map((x) => `<tr class="${x.combustivel === estado.combustivel ? 'sel' : ''}">
            <td>${esc(NOMES[x.combustivel] || x.combustivel)}</td><td>${reais(x.valor)}</td>
            <td title="${esc(FONTES[x.fonte] || x.fonte)}">${haQuanto(x.coletado_em)}${velho(x.coletado_em) ? ' ⚠' : ''}</td></tr>`).join('')
        : '<tr><td colspan="3">Sem preços recentes.</td></tr>';
      const fontes = [...new Set(precos.map((x) => FONTES[x.fonte] || x.fonte))].join(', ');
      const dist = distanciaKm(estado.origem, p);
      const destino = `${p.lat},${p.lng}`;
      caixa.innerHTML = `
        <button class="fechar" aria-label="Fechar" data-fechar>×</button>
        <h2 id="detalhe-nome">${esc(p.nome)}</h2>
        <p class="end">${esc([p.bandeira, p.endereco, p.bairro].filter(Boolean).join(' · '))} · ${fmtKm(dist)}</p>
        ${promocao ? `<p class="promo"><span class="selo destaque">Promoção</span>${esc(promocao)}</p>` : ''}
        <table class="tabela"><tbody>${linhas}</tbody></table>
        <p class="fonte-txt">Fonte: ${esc(fontes || '—')}. Horário = última venda em nota fiscal ou atualização feita pelo posto.</p>
        ${grafico(d.historico)}
        <div class="botoes">
          <a class="btn primario" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${destino}">Rota no Google Maps</a>
          <a class="btn" target="_blank" rel="noopener" href="https://waze.com/ul?ll=${destino}&navigate=yes">Abrir no Waze</a>
        </div>
        ${estado.config.fontes.usuario ? formInformar(p.id) : ''}`;
      ligarForm(p.id);
      avisar('detalhe', { posto: p, precos, caixa });
    } catch (e) {
      caixa.innerHTML = `<button class="fechar" aria-label="Fechar" data-fechar>×</button><p>Erro: ${esc(e.message)}</p>`;
    }
    desenharMapa(calcular());
  }

  function grafico(historico) {
    const pts = historico.filter((h) => h.combustivel === estado.combustivel);
    if (pts.length < 2) return '';
    const vals = pts.map((h) => h.valor);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const W = 300;
    const H = 60;
    const xy = pts.map((h, i) => [
      (i / (pts.length - 1)) * (W - 8) + 4,
      max === min ? H / 2 : H - 6 - ((h.valor - min) / (max - min)) * (H - 12),
    ]);
    return `<div class="grafico"><p>${esc(NOMES[estado.combustivel])} nos últimos ${pts.length} dias: ${reais(min)} a ${reais(max)}</p>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" stroke="var(--marca)" stroke-width="2.5" stroke-linejoin="round" points="${xy.map((p) => p.join(',')).join(' ')}"/>
      </svg></div>`;
  }

  function formInformar(postoId) {
    const opcoes = Object.entries(NOMES).map(([k, v]) =>
      `<option value="${k}" ${k === estado.combustivel ? 'selected' : ''}>${v}</option>`).join('');
    return `<details class="informar"><summary>O preço mudou? Informe aqui</summary>
      <form class="form" id="form-preco" data-posto="${postoId}">
        <label>Combustível <select name="combustivel">${opcoes}</select></label>
        <label>Preço por litro (R$) <input name="valor" inputmode="decimal" placeholder="Ex.: 6,29" required /></label>
        <label>Chave da NFC-e (opcional, 44 dígitos do cupom — comprova o preço)
          <input name="chave_nfce" inputmode="numeric" placeholder="4125 1112 3456 ..." /></label>
        <button class="btn primario" type="submit">Enviar preço</button>
        <p class="msg" id="msg-preco" role="status"></p>
      </form></details>`;
  }

  function ligarForm(postoId) {
    const f = $('#form-preco');
    if (!f) return;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const dados = Object.fromEntries(new FormData(f));
      const msg = $('#msg-preco');
      msg.className = 'msg';
      msg.textContent = 'Enviando…';
      try {
        await api('/api/precos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...dados, posto_id: postoId, fonte: 'usuario' }),
        });
        msg.className = 'msg ok';
        msg.textContent = 'Obrigado! Preço registrado.';
        await carregar();
        setTimeout(() => abrirDetalhe(postoId), 900);
      } catch (e) {
        msg.className = 'msg erro';
        msg.textContent = e.message;
      }
    });
  }

  // ---------- eventos ----------
  $('#detalhe').addEventListener('click', (ev) => {
    if (ev.target.closest('[data-fechar]') || ev.target === ev.currentTarget) ev.currentTarget.close();
  });
  $('#detalhe').addEventListener('close', () => {
    estado.ativo = null;
    desenharMapa(calcular());
  });

  $('#lista').addEventListener('click', (ev) => {
    const li = ev.target.closest('.item');
    if (!li) return;
    const id = Number(li.dataset.id);
    const m = estado.marcadores.get(id);
    if (m) mapa.setView(m.getLatLng(), Math.max(mapa.getZoom(), 15));
    abrirDetalhe(id);
  });
  $('#lista').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.classList.contains('item')) ev.target.click();
  });

  document.querySelector('.ordem').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ordem]');
    if (!b) return;
    estado.ordem = b.dataset.ordem;
    document.querySelectorAll('.ordem button').forEach((x) => x.setAttribute('aria-selected', x === b));
    $('#info-custo').hidden = estado.ordem !== 'custo';
    if (estado.ordem !== 'preco' && !estado.usandoGps) pedirLocalizacao();
    desenhar();
  });

  $('#alca').addEventListener('click', () => $('#painel').classList.toggle('aberto'));
  $('#btn-local').addEventListener('click', () => pedirLocalizacao(true));

  function pedirLocalizacao(centralizar) {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        estado.origem = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        estado.usandoGps = true;
        if (marcadorVoce) marcadorVoce.remove();
        marcadorVoce = L.marker([estado.origem.lat, estado.origem.lng], {
          icon: L.divIcon({ className: '', html: '<div class="voce"></div>', iconSize: [16, 16] }),
          title: 'Você está aqui',
          zIndexOffset: 2000,
        }).addTo(mapa);
        const perto = cidadeMaisProxima(estado.origem);
        if (perto && perto !== estado.cidade) {
          trocarCidade(perto.nome, true).then(() => {
            if (centralizar) mapa.setView([estado.origem.lat, estado.origem.lng], 14);
          });
          return;
        }
        if (centralizar) mapa.setView([estado.origem.lat, estado.origem.lng], 14);
        desenhar();
      },
      () => {
        if (centralizar) alert('Não foi possível obter sua localização. As distâncias são calculadas a partir do centro da cidade.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  // Instalação no celular (Android/Chrome mostra o botão; no iPhone: Compartilhar > Adicionar à Tela de Início)
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  let pedidoInstalacao = null;
  // Já instalado (app da Play Store ou ícone na tela inicial): não oferece instalar de novo.
  const jaInstalado = matchMedia('(display-mode: standalone)').matches || document.referrer.startsWith('android-app://');
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    if (jaInstalado) return;
    pedidoInstalacao = ev;
    $('#instalar').hidden = false;
  });
  $('#instalar').addEventListener('click', async () => {
    if (!pedidoInstalacao) return;
    pedidoInstalacao.prompt();
    await pedidoInstalacao.userChoice;
    pedidoInstalacao = null;
    $('#instalar').hidden = true;
  });

  // ---------- ligação com os recursos extras (premium.js, viagem.js) ----------
  // Os recursos extras só conversam com o app por aqui: recebem avisos e pedem mudanças,
  // sem mexer no estado interno nem no HTML da lista.
  const ouvintes = { postos: [], detalhe: [] };
  function avisar(evento, dados) {
    for (const fn of ouvintes[evento]) {
      try { fn(dados); } catch (e) { console.warn('Recurso extra falhou:', e); }
    }
  }
  function textoCusto() {
    const c = estado.carro;
    $('#info-custo').textContent = `Custo-benefício soma ao preço o combustível gasto para ir e voltar até o posto
      (${c.proprio ? 'seu carro' : 'carro'} de ${decimal(c.kmL)} km/l, abastecendo ${c.litros} litros).`;
  }
  window.App = {
    NOMES,
    mapa,
    ao(evento, fn) { ouvintes[evento].push(fn); },
    abrirPosto: abrirDetalhe,
    cidades: () => estado.cidades || [],
    cidadeAtual: () => estado.cidade,
    combustivel: () => estado.combustivel,
    resumo: () => estado.resumo,
    origem: () => estado.origem,
    /** Troca o carro usado nas contas ({ kmL, kmLEtanol, litros }) e redesenha a lista. */
    usarCarro(c) {
      estado.carro = c ? { ...c, proprio: true } : { kmL: 10, kmLEtanol: 7, litros: 40, proprio: false };
      textoCusto();
      if (estado.postos.length) desenhar();
    },
    /** Esconde (ou volta a mostrar) patrocínio e cartões patrocinados. */
    usarSemAnuncios(sim) {
      if (estado.semAnuncios === sim) return;
      estado.semAnuncios = sim;
      if (estado.cidade) carregar();
    },
  };

  iniciar().catch((e) => {
    $('#lista').innerHTML = `<li class="vazio">Erro ao iniciar: ${esc(e.message)}</li>`;
  });
})();

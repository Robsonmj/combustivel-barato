// Telas do app: mapa, lista e detalhe do posto.
(function () {
  'use strict';

  const NOMES = {
    gasolina: 'Gasolina',
    gasolina_aditivada: 'Gasolina aditivada',
    etanol: 'Etanol',
    diesel: 'Diesel S500',
    diesel_s10: 'Diesel S10',
    gnv: 'GNV',
  };
  const CURTO = { ...NOMES, gasolina_aditivada: 'Aditivada' };
  const FONTES = {
    menor_preco: 'Nota Paraná / Menor Preço',
    anp: 'ANP',
    usuario: 'Informado por motorista',
    posto: 'Informado pelo posto',
  };
  const CONSUMO_KM_L = 10;
  const LITROS = 40;

  const estado = {
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
  function lerPreferencia(k) {
    try { return localStorage.getItem('pc.' + k); } catch { return null; }
  }
  function salvarPreferencia(k, v) {
    try { localStorage.setItem('pc.' + k, v); } catch { /* sem armazenamento: tudo bem */ }
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const reais = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  const numero = (v) => Number(v).toFixed(2).replace('.', ',');
  function haQuanto(iso) {
    const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'há 1 dia' : `há ${d} dias`;
  }
  function velho(iso) {
    return Date.now() - Date.parse(iso) > (estado.config?.avisoDesatualizadoHoras || 48) * 3600000;
  }
  function distanciaKm(a, b) {
    const R = 6371;
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`);

  // Na versão publicada (GitHub Pages) não há servidor: os dados vêm de arquivos JSON
  // gerados a cada hora. Aqui as rotas da API são traduzidas para esses arquivos.
  function rotaEstatica(url) {
    const u = new URL(url, 'http://x');
    if (u.pathname === '/api/config') return 'api/config.json';
    if (u.pathname === '/api/postos') return `api/postos-${u.searchParams.get('combustivel')}.json`;
    const m = u.pathname.match(/^\/api\/postos\/(\d+)$/);
    if (m) return `api/posto-${m[1]}.json`;
    return url;
  }

  async function api(url, opcoes) {
    if (window.MODO_ESTATICO) url = rotaEstatica(url) + '?v=' + Math.floor(Date.now() / 300000);
    const r = await fetch(url, opcoes);
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || 'Erro ' + r.status);
    return dados;
  }

  // ---------- carregamento ----------
  async function iniciar() {
    estado.config = await api('/api/config');
    const c = estado.config.cidade;
    $('#cidade').textContent = `${c.nome} · ${c.uf}`;
    document.title = `Combustível Barato · ${c.nome}`;
    estado.origem = { ...c.centro };
    mapa.setView([c.centro.lat, c.centro.lng], c.zoom);
    if (!estado.config.combustiveis.includes(estado.combustivel)) estado.combustivel = 'gasolina';
    montarChips();
    await carregar();
    setInterval(carregar, 5 * 60 * 1000); // atualiza a cada 5 minutos
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
      const [d] = await Promise.all([api('/api/postos?combustivel=' + estado.combustivel), carregarExtras()]);
      estado.postos = d.postos.map((p) => ({
        ...aplicarPrecoDoPosto(p, estado.combustivel),
        destaque: extras.destaques.has(p.id),
        promocao: extras.destaques.has(p.id) ? extras.promocoes.get(p.id) : null,
      }));
      estado.resumo = d.resumo;
      estado.status = d.status;
      desenhar();
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
      const custo = p.preco ? p.preco * (1 + (2 * dist) / CONSUMO_KM_L / LITROS) : null;
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
    const pct = Math.round((et / ga) * 100);
    const compensa = et / ga <= 0.7;
    el.hidden = false;
    el.innerHTML = `<strong>${compensa ? 'Etanol compensa' : 'Gasolina compensa'}</strong> no seu carro flex.
      O etanol mais barato (${reais(et)}) custa <strong>${pct}%</strong> da gasolina mais barata (${reais(ga)}).
      Regra dos 70%: abaixo de 70%, vale o etanol.`;
  }

  function desenharLista(lista) {
    const ol = $('#lista');
    const comPreco = lista.filter((p) => p.preco).length;
    if (!lista.length) {
      ol.innerHTML = '<li class="vazio">Nenhum posto cadastrado ainda. A primeira coleta de preços acontece ao iniciar o servidor.</li>';
      return;
    }
    if (!comPreco) {
      ol.innerHTML = `<li class="vazio">Nenhum preço recente de ${esc(NOMES[estado.combustivel])} na cidade.</li>`;
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
      <a href="painel.html">É dono de posto? Atualize seus preços</a>${anuncie}<br>
      <a href="termos.html">Termos de uso</a> · <a href="privacidade.html">Privacidade</a>`;
    desenharPatrocinio();
  }

  function desenharPatrocinio() {
    const el = $('#patrocinio');
    const lista = extras.patrocinios;
    if (!lista.length) {
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
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
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

  iniciar().catch((e) => {
    $('#lista').innerHTML = `<li class="vazio">Erro ao iniciar: ${esc(e.message)}</li>`;
  });
})();

// Modo viagem (Premium): traça a rota entre duas cidades atendidas e lista os postos mais baratos no caminho.
// Rota calculada pelo OSRM (router.project-osrm.org, serviço público e gratuito, com dados do OpenStreetMap).
(function () {
  'use strict';
  if (!window.App) return;
  const { esc, reais, numero, fmtKm, distanciaKm, NOMES } = Util;
  const $ = (s) => document.querySelector(s);
  const LARGURA_KM = 2; // distância máxima do posto até a rota

  const dlg = document.createElement('dialog');
  dlg.className = 'detalhe';
  dlg.innerHTML = '<div class="detalhe-conteudo" id="viagem-conteudo"></div>';
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-fechar]') || ev.target === dlg) dlg.close();
  });

  let camada = null;
  let ultimo = null; // { origem, destino, combustivel, postos, km }

  function abrir() {
    if (!window.Premium?.ativo()) { window.Premium?.abrir(); return; }
    const cidades = App.cidades();
    const atual = App.cidadeAtual()?.nome;
    const outra = cidades.find((c) => c.nome !== atual)?.nome;
    const op = (sel) => cidades.map((c) => `<option ${c.nome === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
    $('#viagem-conteudo').innerHTML = `
      <button class="fechar" aria-label="Fechar" data-fechar>×</button>
      <h2>🛣️ Modo viagem</h2>
      <p class="end">Os postos mais baratos perto da estrada, entre as cidades atendidas pelo app.</p>
      <form class="form" id="form-viagem">
        <label>Saindo de <select name="origem">${op(atual)}</select></label>
        <label>Indo para <select name="destino">${op(outra)}</select></label>
        <label>Combustível <select name="combustivel">${Object.entries(NOMES).map(([k, v]) => `<option value="${k}" ${k === App.combustivel() ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <button class="btn primario">Ver postos no caminho</button>
        <p class="msg" id="msg-viagem" role="status"></p>
      </form>
      <div id="resultado-viagem">${ultimo ? htmlResultado(ultimo) : ''}</div>`;
    $('#form-viagem').addEventListener('submit', (ev) => {
      ev.preventDefault();
      calcular(Object.fromEntries(new FormData(ev.target)));
    });
    ligarResultado();
    if (!dlg.open) dlg.showModal();
  }

  async function calcular({ origem, destino, combustivel }) {
    const msg = $('#msg-viagem');
    if (origem === destino) {
      msg.className = 'msg erro';
      msg.textContent = 'Escolha cidades diferentes.';
      return;
    }
    msg.className = 'msg';
    msg.textContent = 'Calculando a rota…';
    const cids = App.cidades();
    const a = cids.find((c) => c.nome === origem).centro;
    const b = cids.find((c) => c.nome === destino).centro;
    try {
      const [rota, dados] = await Promise.all([
        fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`).then((r) => r.json()),
        Nuvem.rpc('api_postos', { comb: combustivel }),
      ]);
      const linha = rota?.routes?.[0]?.geometry?.coordinates?.map(([lng, lat]) => ({ lat, lng }));
      if (!linha?.length) throw new Error('Não foi possível calcular a rota agora.');
      if (!dados?.postos) throw new Error('Não foi possível carregar os preços agora.');
      const acumulado = [0];
      for (let i = 1; i < linha.length; i++) acumulado.push(acumulado[i - 1] + distanciaKm(linha[i - 1], linha[i]));
      const postos = dados.postos
        .filter((p) => p.preco)
        .map((p) => ({ ...p, ...pertoDaRota(p, linha, acumulado) }))
        .filter((p) => p.desvio <= LARGURA_KM)
        .sort((x, y) => x.preco - y.preco);
      ultimo = { origem, destino, combustivel, postos, km: rota.routes[0].distance / 1000, linha };
      desenharNoMapa(ultimo);
      msg.textContent = '';
      $('#resultado-viagem').innerHTML = htmlResultado(ultimo);
      ligarResultado();
    } catch (e) {
      msg.className = 'msg erro';
      msg.textContent = e.message;
    }
  }

  /** Distância do posto até a rota (km) e em que km da viagem ele fica. */
  function pertoDaRota(p, linha, acumulado) {
    let melhor = { desvio: Infinity, km: 0 };
    // olha ponto a ponto; quando o posto está a mais de 30 km, pula 20 pontos para ficar rápido
    for (let i = 0; i < linha.length; i++) {
      const d = distanciaKm(p, linha[i]);
      if (d < melhor.desvio) melhor = { desvio: d, km: acumulado[i] };
      if (d > 30) i += 20;
    }
    return melhor;
  }

  function htmlResultado(r) {
    if (!r.postos.length) {
      return `<p>Nenhum posto com preço de ${esc(NOMES[r.combustivel])} a menos de ${LARGURA_KM} km da rota.</p>`;
    }
    const litros = Util.pref.lerJson('carro', null)?.litros || 40;
    const caro = Math.max(...r.postos.map((p) => p.preco));
    const top = r.postos.slice(0, 12);
    const economia = (caro - top[0].preco) * litros;
    return `<p><strong>${esc(r.origem)} → ${esc(r.destino)}</strong>: ${fmtKm(r.km)}. ${r.postos.length} postos perto da estrada.
      Abastecendo ${litros} litros no mais barato, você paga ${reais(economia)} a menos do que no mais caro do caminho.</p>
      <ol class="lista viagem">${top.map((p, i) => `<li class="item" tabindex="0" data-id="${p.id}">
        <div class="preco ${i < 3 ? 'barato' : 'medio'}">${numero(p.preco)}</div>
        <div><div class="nome">${esc(p.nome)}</div><div class="sub">${esc(p.cidade || '')} · km ${Math.round(p.km)} da viagem${p.desvio > 0.3 ? ` · ${fmtKm(p.desvio)} da estrada` : ''}</div></div></li>`).join('')}</ol>
      <button class="btn" data-ver-mapa>Ver a rota no mapa</button>
      <p class="fonte-txt">Só aparecem postos das cidades atendidas pelo app. Rota: OSRM / OpenStreetMap.</p>`;
  }

  function ligarResultado() {
    const caixa = $('#resultado-viagem');
    caixa.querySelectorAll('[data-id]').forEach((li) => li.addEventListener('click', () => {
      dlg.close();
      App.abrirPosto(Number(li.dataset.id));
    }));
    caixa.querySelector('[data-ver-mapa]')?.addEventListener('click', () => {
      dlg.close();
      if (camada) App.mapa.fitBounds(camada.getBounds(), { padding: [30, 30] });
    });
  }

  function desenharNoMapa(r) {
    if (camada) camada.remove();
    camada = L.featureGroup().addTo(App.mapa);
    L.polyline(r.linha.map((p) => [p.lat, p.lng]), { color: '#0f766e', weight: 5, opacity: 0.7 }).addTo(camada);
    for (const p of r.postos.slice(0, 3)) {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: '', html: `<div class="pino barato top">${numero(p.preco)}</div>`, iconSize: [0, 0] }),
        title: p.nome,
        zIndexOffset: 3000,
      }).on('click', () => App.abrirPosto(p.id)).addTo(camada);
    }
  }

  window.Viagem = { abrir };
})();

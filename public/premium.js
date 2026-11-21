// AbasteceR Premium: Média do meu carro (cálculo em consumo.js), Meu carro, Minha economia, Melhor dia, Cupons, Alertas de preço,
// Modo viagem (viagem.js) e Sem anúncios.
// Tudo fica guardado só neste aparelho (localStorage); a assinatura paga é conferida na Play (cobranca.js). Conversa com o app apenas pela interface window.App.
(function () {
  'use strict';
  if (!window.App) return;
  const { esc, reais, numero, decimal, lerNumero, pref, NOMES } = Util;
  const $ = (s) => document.querySelector(s);
  const DIAS_TESTE = 14;
  const NOMES_DIA = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

  // ---------- assinatura ----------
  // Teste grátis guardado no aparelho; assinatura paga pela Google Play (cobranca.js) grava "pagoAte".
  const Premium = {
    dados: () => pref.lerJson('premium', {}),
    pago: () => (Date.parse(Premium.dados().pagoAte || 0) || 0) > Date.now(),
    /** Guarda o resultado conferido na Play ({ ativo, expira, produto }). */
    registrarAssinatura(r) {
      const d = Premium.dados();
      if (r?.ativo) {
        // 1 dia de folga para quem fica sem internet perto da renovação
        const ate = new Date((Date.parse(r.expira) || Date.now() + 31 * 86400000) + 86400000).toISOString();
        pref.salvarJson('premium', { ...d, pagoAte: ate, produto: r.produto });
      } else {
        delete d.pagoAte;
        delete d.produto;
        pref.salvarJson('premium', d);
      }
    },
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
  const apelidos = () => pref.lerJson('apelidos', {});
  const opcoes = () => pref.lerJson('opcoesPremium', { semAnuncios: true });

  /** Aplica no app o que depende da assinatura (carro e anúncios). */
  function aplicar() {
    const ativo = Premium.ativo();
    App.usarCarro(ativo ? carro() : null);
    App.usarApelidos(ativo ? apelidos() : {});
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
    if (Premium.pago()) {
      const gerenciar = `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(d.produto || '')}&package=io.github.robsonmj.combustivelbarato`;
      return `<div class="assinatura ok">Você é Premium${d.produto === 'premium_anual' ? ' (plano anual)' : ''}. Obrigado por apoiar o app!
        <small><a href="${gerenciar}" target="_blank" rel="noopener">Gerenciar ou cancelar a assinatura na Google Play</a></small></div>`;
    }
    if (Premium.ativo()) {
      const n = Premium.diasRestantes();
      return `<div class="assinatura ok">Teste grátis: falta${n === 1 ? '' : 'm'} <strong>${n} dia${n === 1 ? '' : 's'}</strong>.
        Aproveite todos os recursos abaixo.<div id="planos"></div></div>`;
    }
    if (d.testeInicio) {
      return `<div class="assinatura"><p>Seu teste grátis terminou. Assine para continuar com todos os recursos.
        Seus dados (carro, abastecimentos e alertas) continuam guardados.</p><div id="planos"></div></div>`;
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
      <h2>★ AbasteceR Premium</h2>
      ${cartaoAssinatura()}
      ${secao('alertas', '🔔 Alertas de preço', 'Aviso quando a gasolina baixar do seu preço ou quando o posto favorito baixar', corpoAlertas)}
      ${secao('economia', '💰 Minha economia', 'Quanto você economizou no mês e no ano', corpoEconomia)}
      ${secao('dia', '📅 Melhor dia para abastecer', 'Dia da semana mais barato e se o preço está subindo', () => '<div id="melhor-dia">Carregando…</div>')}
      ${secao('cupons', '🎟️ Cupons dos postos', 'Descontos exclusivos dos postos parceiros', () => '<div id="lista-cupons">Carregando…</div>')}
      ${secao('viagem', '🛣️ Modo viagem', 'Posto mais barato no caminho entre cidades', () => '<button class="btn primario" data-viagem>Planejar viagem</button>')}
      ${secao('media', '📊 Média do meu carro', 'Quantos km por litro seu carro faz na cidade e na rodovia, e se etanol ou gasolina compensa', corpoMedia)}
      ${secao('carro', '🚗 Meu carro', 'Custo real por posto e etanol ou gasolina para o seu carro', corpoCarro)}
      ${secao('apelidos', '🏷️ Apelidos dos postos', 'Dê ao posto o nome que todo mundo usa, no lugar da razão social', corpoApelidos)}
      ${secao('anuncios', '🚫 Sem anúncios', 'Sem faixa de patrocínio e sem cartões patrocinados', corpoAnuncios)}`;
    ligarTela(caixa);
    desenharPlanos();
    if (Premium.ativo()) {
      desenharMelhorDia();
      desenharCupons();
    }
  }

  /** Botões de assinatura (dentro do app da Play) ou link para a Play Store (no navegador). */
  async function desenharPlanos() {
    const el = $('#planos');
    if (!el || !window.Cobranca) return;
    if (!(await Cobranca.disponivel())) {
      el.innerHTML = `<a class="btn primario" href="${Cobranca.LOJA}" target="_blank" rel="noopener">Assinar pelo app na Google Play</a>
        <small>A assinatura é feita no app AbasteceR da Google Play.</small>`;
      return;
    }
    const p = await Cobranca.precos();
    el.innerHTML = `<div class="planos">
        <button class="btn primario" data-assinar="premium_anual">Anual${p.premium_anual ? ' · ' + p.premium_anual : ''}<br><small>2 meses grátis</small></button>
        <button class="btn" data-assinar="premium_mensal">Mensal${p.premium_mensal ? ' · ' + p.premium_mensal : ''}</button>
      </div>
      <small>Pagamento pela Google Play. Cancele quando quiser em Play Store › Pagamentos e assinaturas.</small>
      <p class="msg" id="msg-assinar" role="status"></p>`;
    el.querySelectorAll('[data-assinar]').forEach((b) => b.addEventListener('click', async () => {
      const msg = $('#msg-assinar');
      msg.className = 'msg';
      msg.textContent = 'Abrindo a Google Play…';
      try {
        const r = await Cobranca.assinar(b.dataset.assinar);
        if (!r) { msg.textContent = ''; return; }
        if (!r.ativo) throw new Error(r.erro || 'A compra não foi confirmada. Nada foi cobrado.');
        Premium.registrarAssinatura(r);
        aplicar();
        desenharTela();
      } catch (e) {
        msg.className = 'msg erro';
        msg.textContent = e.message;
      }
    }));
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
    ligarMedia(caixa);
    ligarEconomia(caixa);
    ligarAlertas(caixa);
    caixa.querySelectorAll('[data-apagar-apelido]').forEach((bt) => bt.addEventListener('click', () => {
      const a = apelidos();
      delete a[bt.dataset.apagarApelido];
      pref.salvarJson('apelidos', a);
      aplicar();
      desenharTela();
      abrir('apelidos');
    }));
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
      <p class="msg" id="msg-carro" role="status">${c.medido ? 'Preenchido com as médias medidas em "Média do meu carro". Você pode mudar à mão.' : c.kmL ? 'O custo-benefício e a dica etanol × gasolina já usam o seu carro.' : 'Dica: o consumo aparece no painel do carro ou no manual. Ou registre os abastecimentos com a quilometragem e o app mede sozinho.'}</p>
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
      pref.salvarJson('carro', { kmL, kmLEtanol, litros, medido: false });
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
    const soma = (filtro) => lista.filter(filtro).reduce((t, a) => t + (a.economia || 0), 0);
    const mes = soma((a) => a.data.slice(0, 7) === agora.toISOString().slice(0, 7));
    const ano = soma((a) => a.data.slice(0, 4) === String(agora.getFullYear()));
    const ultimos = lista.slice(-5).reverse().map((a) => `<tr><td>${new Date(a.data).toLocaleDateString('pt-BR')} · ${esc(a.posto || NOMES[a.combustivel])}</td>
      <td>${numero(a.litros)} l a ${reais(a.preco)}</td>${a.economia == null ? '<td>—</td>' : `<td class="${a.economia >= 0 ? 'eco-mais' : 'eco-menos'}">${a.economia >= 0 ? '+' : '−'}${reais(Math.abs(a.economia))}</td>`}</tr>`).join('');
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

  /** Campos do abastecimento (usados no detalhe do posto e na "Média do meu carro"). */
  function camposAbastecimento(comb, preco) {
    const ult = [...abastecimentos()].reverse().find((a) => a.km);
    return `<label>Combustível <select name="combustivel">${Object.entries(NOMES).map(([k, v]) => `<option value="${k}" ${k === comb ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Preço que você pagou por litro <input name="preco" inputmode="decimal" value="${preco ? numero(preco) : ''}" required></label>
        <label>Litros <input name="litros" inputmode="decimal" value="${carro()?.litros || ''}" required></label>
        <label>Quilometragem do painel (opcional, para medir a média) <input name="km" inputmode="numeric" placeholder="${ult ? 'Último: ' + Math.round(ult.km).toLocaleString('pt-BR') + ' km' : 'Ex.: 45.230'}"></label>
        <label class="opcao"><input type="checkbox" name="cheio" checked> Enchi o tanque</label>
        <label>Desde o último abastecimento, rodei mais <select name="uso">
          <option value="cidade">na cidade</option><option value="rodovia">na rodovia</option><option value="misto" selected>misto (cidade e rodovia)</option></select></label>`;
  }

  /** Grava o abastecimento; devolve o texto de resposta. Economia só quando há preço médio da cidade. */
  async function registrarAbastecimento(d, postoNome, cidade) {
    const preco = lerNumero(d.preco);
    const litros = lerNumero(d.litros);
    const km = d.km ? Math.round(lerNumero(String(d.km).replace(/\./g, ''))) : null;
    if (!(preco > 1 && preco < 20 && litros > 0 && litros < 500)) throw new Error('Confira o preço e os litros.');
    if (d.km && !(km > 0 && km < 3000000)) throw new Error('Confira a quilometragem: só números, como 45230.');
    const antes = Consumo.medias(abastecimentos()).trechos.length;
    const media = await mediaDaCidade(d.combustivel, cidade).catch(() => null);
    const economia = media ? Math.round((media - preco) * litros * 100) / 100 : null;
    const lista = abastecimentos();
    lista.push({ data: new Date().toISOString(), posto: postoNome || null, combustivel: d.combustivel, preco, litros, media, economia,
      km, cheio: d.cheio === 'on', uso: d.uso || 'misto' });
    pref.salvarJson('abastecimentos', lista.slice(-500));
    const partes = [];
    if (economia != null) {
      partes.push(economia >= 0
        ? `Você economizou ${reais(economia)} em relação à média da cidade (${reais(media)}).`
        : `Este abastecimento saiu ${reais(-economia)} acima da média da cidade (${reais(media)}).`);
    }
    const m = Consumo.medias(lista);
    if (m.trechos.length > antes) {
      const t = m.trechos[m.trechos.length - 1];
      partes.push(t.combustivel === 'mistura'
        ? `Este tanque deu ${decimal(t.kmL)} km/l (gasolina e etanol misturados, fica fora das médias).`
        : `Este tanque de ${NOMES[t.combustivel].toLowerCase()} deu ${decimal(t.kmL)} km/l em ${decimal(t.km)} km.`);
      atualizarCarroComMedias(m);
    } else if (km && d.cheio === 'on') {
      partes.push('Na próxima vez que encher o tanque, informe a quilometragem de novo e o app calcula a média.');
    } else if (km) {
      partes.push('Abastecimento parcial guardado; a média sai quando você encher o tanque.');
    }
    return 'Registrado! ' + partes.join(' ');
  }

  /** "Meu carro" passa a usar as médias medidas (o que faltar continua como estava). */
  function atualizarCarroComMedias(m) {
    const g = m.porCombustivel.gasolina?.geral?.kmL;
    const e = m.porCombustivel.etanol?.geral?.kmL;
    if (!g && !e) return;
    const c = carro() || {};
    const kmL = g || c.kmL || Math.round((e / 0.7) * 10) / 10;
    const kmLEtanol = e || c.kmLEtanol || Math.round(kmL * 0.7 * 10) / 10;
    const ult = [...abastecimentos()].reverse().find((a) => a.cheio);
    pref.salvarJson('carro', { kmL, kmLEtanol, litros: c.litros || Math.round(ult?.litros || 40), medido: true });
    aplicar();
  }

  /** Bloco "Abasteci aqui" no detalhe do posto. */
  function formAbasteci(posto, precos) {
    const comb = App.combustivel();
    const atual = precos.find((x) => x.combustivel === comb);
    const div = document.createElement('div');
    div.className = 'abasteci';
    div.innerHTML = `<details><summary>⛽ Abasteci aqui (economia e média do carro)</summary>
      <form class="form">
        ${camposAbastecimento(comb, atual?.valor)}
        <button class="btn primario">Registrar</button>
        <p class="msg" role="status"></p>
      </form></details>`;
    const f = div.querySelector('form');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = f.querySelector('.msg');
      try {
        msg.className = 'msg ok';
        msg.textContent = await registrarAbastecimento(Object.fromEntries(new FormData(f)), posto.nome, posto.cidade || App.cidadeAtual()?.nome);
      } catch (e) {
        msg.className = 'msg erro';
        msg.textContent = e.message;
      }
    });
    return div;
  }

  // ---------- Média do meu carro ----------
  function corpoMedia() {
    const m = Consumo.medias(abastecimentos());
    const comb = App.combustivel();
    const precoAtual = App.resumo().find((r) => r.combustivel === comb)?.minimo;
    const form = `<details class="sub"${m.trechos.length ? '' : ' open'}><summary>➕ Registrar abastecimento</summary>
      <form class="form" id="form-media">
        ${camposAbastecimento(comb, precoAtual)}
        <button class="btn primario">Registrar</button>
        <p class="msg" id="msg-media" role="status"></p>
      </form>
      <p class="fonte-txt">Também dá para registrar pelo posto: toque nele e use "Abasteci aqui".</p></details>`;
    if (!m.trechos.length) {
      return `<p>Para medir a média real do seu carro:</p>
        <ol class="passos"><li>Encha o tanque e registre, com a quilometragem do painel.</li>
        <li>Rode normalmente. Se completar no meio, registre também, sem marcar "Enchi o tanque".</li>
        <li>Na próxima vez que encher o tanque, registre com a nova quilometragem.</li></ol>
        <p>O app divide os km rodados pelos litros e mostra a média na cidade, na rodovia e com cada combustível.</p>${form}`;
    }
    const linha = (rot, x) => (x ? `<tr><td>${rot}</td><td><strong>${decimal(x.kmL)} km/l</strong></td><td>${x.trechos} tanque${x.trechos > 1 ? 's' : ''} · ${Math.round(x.km).toLocaleString('pt-BR')} km</td></tr>` : '');
    const tabelas = Object.entries(m.porCombustivel).map(([c, g]) => `<h4>${esc(NOMES[c] || c)}</h4>
      <table class="tabela media"><tbody>${linha('Geral', g.geral)}${linha('🏙️ Cidade', g.cidade)}${linha('🛣️ Rodovia', g.rodovia)}${linha('🔀 Misto', g.misto)}</tbody></table>`).join('');
    return `${tabelas || '<p>Ainda sem tanque de um combustível só (gasolina e etanol misturados não entram na média).</p>'}
      ${comparacao(m)}
      ${avisoConsumo(m)}
      ${historico(m)}
      ${form}
      <p class="fonte-txt">Média pelo método do tanque cheio: km rodados entre dois tanques cheios ÷ litros colocados. Quanto mais tanques, mais precisa.
        As médias também preenchem o "Meu carro". Tudo fica só no seu celular.</p>`;
  }

  /** Etanol × gasolina com as médias medidas e os preços mais baratos da cidade agora. */
  function comparacao(m) {
    const r = App.resumo();
    const pg = Number(r.find((x) => x.combustivel === 'gasolina')?.minimo);
    const pe = Number(r.find((x) => x.combustivel === 'etanol')?.minimo);
    const cidade = esc(App.cidadeAtual()?.nome || '');
    const g = m.porCombustivel.gasolina;
    const e = m.porCombustivel.etanol;
    if (!g || !e) {
      const falta = g ? 'etanol' : e ? 'gasolina' : null;
      return falta ? `<div class="compara"><p>Para comparar etanol × gasolina com os números do seu carro, meça também um tanque de <strong>${falta}</strong>.</p></div>` : '';
    }
    if (!(pg > 0 && pe > 0)) return `<div class="compara"><p>Sem preço de etanol e gasolina em ${cidade} agora para comparar.</p></div>`;
    const tanque = carro()?.litros || 40;
    // economia num tanque: km que um tanque do combustível que compensa rende × diferença de custo por km
    const economiaTanque = (c) => Math.abs(c.rsKmG - c.rsKmE) * (c.melhor === 'etanol' ? c.kmLE : c.kmLG) * tanque;
    const empate = (c) => economiaTanque(c) < 1; // menos de R$ 1 por tanque: tanto faz
    const linhas = [null, 'cidade', 'rodovia'].map((uso) => {
      const c = Consumo.comparar(m, pg, pe, uso);
      if (!c || (uso && !c.uso)) return '';
      const veredito = empate(c) ? 'praticamente empate' : `<strong>${c.melhor === 'etanol' ? 'etanol' : 'gasolina'}</strong>, economia de ${reais(economiaTanque(c))} por tanque`;
      return `<li><b>${uso ? Consumo.USOS[uso] : 'Geral'}:</b> gasolina ${reais(c.rsKmG * 100)} × etanol ${reais(c.rsKmE * 100)} a cada 100 km → ${veredito}</li>`;
    }).join('');
    const geral = Consumo.comparar(m, pg, pe);
    const conclusao = empate(geral) ? 'tanto faz: os dois custam quase o mesmo por km' : `<strong>${geral.melhor === 'etanol' ? 'o etanol' : 'a gasolina'} compensa</strong>`;
    return `<div class="compara"><h4>Etanol ou gasolina, no seu carro?</h4>
      <p>Com o etanol a ${reais(pe)} e a gasolina a ${reais(pg)} (mais baratos em ${cidade} agora), ${conclusao}.
        No seu carro, o etanol vale a pena até <strong>${geral.limite}%</strong> do preço da gasolina (hoje está em ${Math.round((pe / pg) * 100)}%).</p>
      <ul class="compara-lista">${linhas}</ul>
      <p class="fonte-txt">Custo a cada 100 km rodados = preço do litro ÷ km por litro medido × 100. Economia calculada para um tanque de ${tanque} litros.</p></div>`;
  }

  function avisoConsumo(m) {
    const a = Consumo.alertaConsumo(m);
    return a ? `<div class="aviso-consumo">⚠️ O último tanque deu ${decimal(a.ultimo)} km/l, ${a.queda}% abaixo da sua média (${decimal(a.media)} km/l) no mesmo tipo de uso.
      Vale conferir a calibragem dos pneus, o filtro de ar e a revisão.</div>` : '';
  }

  /** Barras dos últimos tanques medidos (km/l de cada um). */
  function historico(m) {
    const ts = m.trechos.slice(-10);
    if (ts.length < 2) return '';
    const max = Math.max(...ts.map((t) => t.kmL));
    const barras = ts.map((t) => `<div class="hist-barra" title="${new Date(t.ate).toLocaleDateString('pt-BR')}: ${decimal(t.kmL)} km/l">
        <span>${decimal(t.kmL)}</span><i class="c-${t.combustivel}" style="height:${Math.round((t.kmL / max) * 100)}%"></i>
        <small>${new Date(t.ate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</small></div>`).join('');
    return `<h4>Últimos tanques</h4><div class="historico">${barras}</div>
      <p class="fonte-txt"><i class="leg c-gasolina"></i> gasolina <i class="leg c-etanol"></i> etanol <i class="leg c-mistura"></i> misturado</p>`;
  }

  function ligarMedia(caixa) {
    const f = caixa.querySelector('#form-media');
    if (!f) return;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = f.querySelector('#msg-media');
      try {
        const texto = await registrarAbastecimento(Object.fromEntries(new FormData(f)), null, App.cidadeAtual()?.nome);
        desenharTela();
        abrir('media');
        $('#premium-conteudo [data-secao="media"] .recurso-corpo')?.insertAdjacentHTML('afterbegin', `<p class="msg ok">${esc(texto)}</p>`);
      } catch (e) {
        msg.className = 'msg erro';
        msg.textContent = e.message;
      }
    });
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

  /** Lista dos apelidos dados, com botão para apagar cada um. */
  function corpoApelidos() {
    const a = apelidos();
    const orig = pref.lerJson('apelidosOrig', {});
    const ids = Object.keys(a);
    const itens = ids.length
      ? `<ul class="apelidos">${ids.map((id) => `<li><span><strong>${esc(a[id])}</strong><small>${esc(orig[id] || '')}</small></span>
          <button class="btn" data-apagar-apelido="${esc(id)}">Apagar</button></li>`).join('')}</ul>`
      : '<p class="fonte-txt">Nenhum apelido ainda.</p>';
    return `${itens}<p class="fonte-txt">Para dar um apelido, toque no posto no mapa ou na lista e use o campo
      "Apelido do posto". O apelido fica guardado só no seu celular.</p>`;
  }

  /** Campo "Apelido do posto" no detalhe. */
  function formApelido(posto) {
    const f = document.createElement('form');
    f.className = 'form-apelido';
    const atual = apelidos()[posto.id] || '';
    f.innerHTML = `<label for="apelido-posto">🏷️ Apelido do posto</label>
      <div class="linha"><input id="apelido-posto" maxlength="40" autocomplete="off"
        placeholder="Ex.: Posto do Trevo" value="${esc(atual)}">
      <button class="btn" type="submit">Salvar</button></div>
      <small>Aparece no lugar de "${esc(posto.nome)}". Deixe em branco para voltar ao nome original.</small>`;
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const texto = f.querySelector('input').value.replace(/\s+/g, ' ').trim().slice(0, 40);
      const a = apelidos();
      const orig = pref.lerJson('apelidosOrig', {});
      if (texto) { a[posto.id] = texto; orig[posto.id] = posto.nome; } else { delete a[posto.id]; delete orig[posto.id]; }
      pref.salvarJson('apelidos', a);
      pref.salvarJson('apelidosOrig', orig);
      App.usarApelidos(a);
      App.abrirPosto(posto.id);
    });
    return f;
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
      convite.textContent = '★ Premium: apelidar e favoritar o posto, alerta de preço e cupons';
      convite.addEventListener('click', () => { $('#detalhe').close(); abrir(); });
      extra.appendChild(convite);
      return;
    }
    extra.appendChild(formApelido(posto));
    extra.appendChild(botaoFavorito(posto, precos));
    extra.appendChild(formAbasteci(posto, precos));
    const cupons = (await buscarCupons()).filter((c) => c.posto_id === posto.id);
    if (cupons.length) extra.insertAdjacentHTML('afterbegin', `<div class="cupons-posto">${cupons.map(htmlCupom).join('')}</div>`);
  });

  App.ao('postos', () => {
    if (dlg.open && Premium.ativo()) desenharMelhorDia();
  });

  aplicar();
  // Confere na Play se a assinatura continua ativa (renovou, cancelou ou foi comprada em outro celular)
  window.Cobranca?.restaurar().then((r) => {
    if (!r) return;
    const antes = Premium.pago();
    Premium.registrarAssinatura(r);
    if (antes !== Premium.pago()) aplicar();
  });
  setTimeout(verificarAlertas, 4000);
  setInterval(verificarAlertas, 15 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarAlertas(); });
  window.Premium.abrir = abrir;
})();

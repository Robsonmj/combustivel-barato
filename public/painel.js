// Painel do dono do posto: entrar por e-mail, pedir acesso ao posto, atualizar preços e promoção.
(async function () {
  'use strict';
  const NOMES = {
    gasolina: 'Gasolina', gasolina_aditivada: 'Gasolina aditivada', etanol: 'Etanol',
    diesel: 'Diesel S500', diesel_s10: 'Diesel S10', gnv: 'GNV',
  };
  const $ = (s) => document.querySelector(s);
  const conteudo = $('#conteudo');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const zap = window.AJUSTES?.whatsappContato;

  if (!Nuvem.configurado) {
    conteudo.innerHTML = '<div class="aviso">O painel ainda não foi ativado. (Administrador: preencha o Supabase em <code>ajustes.js</code>.)</div>';
    return;
  }
  const sb = await Nuvem.cliente();

  $('#sair').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.reload();
  });

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return telaEntrar();
  $('#sair').hidden = false;
  return telaPrincipal(session.user);

  // ---------- entrar ----------
  function telaEntrar() {
    conteudo.innerHTML = `
      <h2>Área do posto</h2>
      <p>Mantenha os preços do seu posto sempre certos no app, com o selo <strong>"preço confirmado pelo posto"</strong>.
         Entre com seu e-mail: enviaremos um link de acesso (sem senha).</p>
      <form class="form cartao" id="f-entrar">
        <label>Seu e-mail <input type="email" name="email" required autocomplete="email" /></label>
        <button class="btn primario">Receber link de acesso</button>
        <p class="msg" id="msg" role="status"></p>
      </form>`;
    $('#f-entrar').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = new FormData(ev.target).get('email');
      const msg = $('#msg');
      msg.className = 'msg';
      msg.textContent = 'Enviando…';
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } });
      if (error) {
        msg.className = 'msg erro';
        msg.textContent = 'Erro: ' + error.message;
      } else {
        msg.className = 'msg ok';
        msg.textContent = 'Pronto! Abra seu e-mail e clique no link para entrar (veja também a caixa de spam).';
      }
    });
  }

  // ---------- principal ----------
  async function telaPrincipal(usuario) {
    const { data: pedidos, error } = await sb.from('postos_dono').select('*').order('criado_em');
    if (error) {
      conteudo.innerHTML = `<p class="msg erro">Erro: ${esc(error.message)}</p>`;
      return;
    }
    const aprovados = pedidos.filter((p) => p.status === 'aprovado');
    const outros = pedidos.filter((p) => p.status !== 'aprovado');

    conteudo.innerHTML = `<p>Conectado como <strong>${esc(usuario.email)}</strong>.</p>
      <div id="postos"></div><div id="pedidos"></div><div id="novo"></div>`;

    for (const p of aprovados) await cartaoPosto(p);

    if (outros.length) {
      $('#pedidos').innerHTML = `<div class="cartao"><h3>Pedidos de acesso</h3>${outros.map((p) => `
        <p>${esc(p.posto_nome)} — <span class="estado ${p.status}">${p.status === 'pendente' ? 'aguardando aprovação' : 'recusado'}</span></p>`).join('')}
        <p style="font-size:13px;color:var(--texto-2)">Conferimos se você é responsável pelo posto antes de liberar. Normalmente em até 1 dia útil.</p></div>`;
    }
    await formNovoPedido(pedidos);

    const exc = document.createElement('div');
    exc.className = 'cartao';
    exc.innerHTML = `<h3>Excluir minha conta</h3>
      <p style="font-size:14px">Apaga seu login, seus pedidos de acesso e os preços que você informou. Não dá para desfazer.</p>
      <button class="btn perigo" id="excluir">Excluir minha conta</button><p class="msg" role="status"></p>`;
    conteudo.appendChild(exc);
    exc.querySelector('#excluir').addEventListener('click', async () => {
      if (!confirm('Excluir sua conta e todos os seus dados? Isso não pode ser desfeito.')) return;
      const { error } = await sb.rpc('excluir_minha_conta');
      const msg = exc.querySelector('.msg');
      if (error) {
        msg.className = 'msg erro';
        msg.textContent = 'Erro: ' + error.message;
        return;
      }
      await sb.auth.signOut();
      conteudo.innerHTML = '<div class="cartao"><h3>Conta excluída</h3><p>Seus dados foram apagados.</p><a class="btn" href="./">Voltar ao mapa</a></div>';
      $('#sair').hidden = true;
    });
  }

  async function cartaoPosto(p) {
    const div = document.createElement('div');
    div.className = 'cartao';
    $('#postos').appendChild(div);
    const [{ data: atuais }, { data: promo }, { data: dest }] = await Promise.all([
      sb.from('precos_posto_atuais').select('*').eq('posto_id', p.posto_id),
      sb.from('promocoes').select('texto').eq('posto_id', p.posto_id).maybeSingle(),
      sb.from('destaques').select('ativo_ate').eq('posto_id', p.posto_id).maybeSingle(),
    ]);
    const atual = Object.fromEntries((atuais || []).map((x) => [x.combustivel, x]));
    const destaqueAtivo = dest && dest.ativo_ate >= Nuvem.hoje();
    const linkZap = zap ? `https://wa.me/${zap}?text=${encodeURIComponent('Olá! Quero o destaque no Combustível Barato para o posto ' + p.posto_nome)}` : '';

    div.innerHTML = `
      <h3>${esc(p.posto_nome)}</h3>
      <form class="form" data-f="precos">
        <p style="margin:0;font-size:14px">Informe só os combustíveis que você vende. Deixe em branco os demais.</p>
        <div class="grade-precos">${Object.entries(NOMES).map(([k, n]) => `
          <label>${n}<input name="${k}" inputmode="decimal" placeholder="${atual[k] ? String(atual[k].valor).replace('.', ',') : 'R$'}" /></label>`).join('')}
        </div>
        <button class="btn primario">Atualizar preços</button>
        <p class="msg" role="status"></p>
      </form>
      <h3>Destaque no app</h3>
      ${destaqueAtivo
        ? `<p><span class="estado aprovado">Ativo</span> até ${new Date(dest.ativo_ate + 'T12:00').toLocaleDateString('pt-BR')}. Seu posto aparece com o selo "Patrocinado" no topo da lista e com o pino em destaque.</p>
           <form class="form" data-f="promo">
             <label>Promoção exibida no app (até 140 caracteres)
               <input name="texto" maxlength="140" value="${esc(promo?.texto || '')}" placeholder="Ex.: Ducha grátis acima de R$ 100" /></label>
             <button class="btn">Salvar promoção</button>
             <p class="msg" role="status"></p>
           </form>`
        : `<p>Apareça em destaque no topo da lista, com pino especial no mapa e espaço para sua promoção.</p>
           ${linkZap ? `<a class="btn primario" target="_blank" rel="noopener" href="${linkZap}">Quero o destaque</a>` : ''}`}`;

    div.querySelector('[data-f="precos"]').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = ev.target.querySelector('.msg');
      const linhas = [];
      for (const [k, v] of new FormData(ev.target)) {
        if (!String(v).trim()) continue;
        const valor = Number(String(v).replace(',', '.'));
        if (!(valor >= 1 && valor <= 20)) {
          msg.className = 'msg erro';
          msg.textContent = `Preço inválido em ${NOMES[k]}.`;
          return;
        }
        linhas.push({ posto_id: p.posto_id, combustivel: k, valor });
      }
      if (!linhas.length) {
        msg.className = 'msg erro';
        msg.textContent = 'Preencha ao menos um preço.';
        return;
      }
      const { error } = await sb.from('precos_posto').insert(linhas);
      msg.className = error ? 'msg erro' : 'msg ok';
      msg.textContent = error ? 'Erro: ' + error.message : 'Preços atualizados! Já aparecem no app.';
      if (!error) ev.target.reset();
    });

    const fPromo = div.querySelector('[data-f="promo"]');
    if (fPromo) {
      fPromo.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const msg = ev.target.querySelector('.msg');
        const texto = new FormData(ev.target).get('texto').trim();
        const { error } = await sb.from('promocoes').upsert({ posto_id: p.posto_id, texto, atualizado_em: new Date().toISOString() });
        msg.className = error ? 'msg erro' : 'msg ok';
        msg.textContent = error ? 'Erro: ' + error.message : 'Promoção salva.';
      });
    }
  }

  async function formNovoPedido(pedidos) {
    const postos = await Nuvem.listaPostos();
    const jaPediu = new Set(pedidos.map((p) => p.posto_id));
    const opcoes = postos.filter((p) => !jaPediu.has(p.id))
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((p) => `<option value="${p.id}">${esc(p.nome)}${[p.bairro, p.cidade].filter(Boolean).length ? ' — ' + esc([p.bairro, p.cidade].filter(Boolean).join(', ')) : ''}</option>`).join('');
    $('#novo').innerHTML = `
      <form class="form cartao" id="f-pedido">
        <h3>${pedidos.length ? 'Pedir acesso a outro posto' : 'Pedir acesso ao seu posto'}</h3>
        <label>Posto <select name="posto_id" required><option value="">Escolha…</option>${opcoes}</select></label>
        <div class="linha-form">
          <label>Seu nome <input name="responsavel" required /></label>
          <label>Telefone / WhatsApp <input name="telefone" required inputmode="tel" /></label>
        </div>
        <label>CNPJ do posto <input name="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00" /></label>
        <p style="font-size:13px;color:var(--texto-2);margin:0">Ao enviar, você concorda com os <a href="termos.html">termos de uso</a>.</p>
        <button class="btn primario">Enviar pedido</button>
        <p class="msg" role="status"></p>
      </form>`;
    $('#f-pedido').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const posto = postos.find((p) => p.id === Number(f.posto_id));
      const msg = ev.target.querySelector('.msg');
      const { error } = await sb.from('postos_dono').insert({
        posto_id: Number(f.posto_id), posto_nome: posto?.nome, responsavel: f.responsavel.trim(),
        telefone: f.telefone.trim(), cnpj: f.cnpj.trim() || null,
      });
      if (error) {
        msg.className = 'msg erro';
        msg.textContent = 'Erro: ' + error.message;
      } else location.reload();
    });
  }
})();

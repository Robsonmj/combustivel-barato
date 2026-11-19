// Administração: aprovar donos de posto, controlar destaques pagos e patrocinadores.
(async function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const conteudo = $('#conteudo');
  const { esc } = Util;
  const data = (d) => new Date(d + (d.length === 10 ? 'T12:00' : '')).toLocaleDateString('pt-BR');
  const maisDias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  if (!Nuvem.configurado) {
    conteudo.innerHTML = '<div class="aviso">Preencha o Supabase em <code>ajustes.js</code> para ativar.</div>';
    return;
  }
  const sb = await Nuvem.cliente();
  $('#sair').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    conteudo.innerHTML = `<form class="form cartao" id="f"><h3>Entrar</h3>
      <label>E-mail de administrador <input type="email" name="email" required /></label>
      <button class="btn primario">Receber link de acesso</button><p class="msg" id="msg"></p></form>`;
    $('#f').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const { error } = await sb.auth.signInWithOtp({
        email: new FormData(ev.target).get('email'),
        options: { emailRedirectTo: location.href.split('#')[0] },
      });
      $('#msg').className = error ? 'msg erro' : 'msg ok';
      $('#msg').textContent = error ? 'Erro: ' + error.message : 'Link enviado. Confira seu e-mail.';
    });
    return;
  }
  $('#sair').hidden = false;
  const { data: admin } = await sb.rpc('is_admin');
  if (!admin) {
    conteudo.innerHTML = '<p class="msg erro">Este e-mail não é de administrador.</p>';
    return;
  }

  const postos = await Nuvem.listaPostos();
  const opcoesPostos = postos.sort((a, b) => a.nome.localeCompare(b.nome))
    .map((p) => `<option value="${p.id}">${esc(p.nome)}${[p.bairro, p.cidade].filter(Boolean).length ? ' — ' + esc([p.bairro, p.cidade].filter(Boolean).join(', ')) : ''}</option>`).join('');

  conteudo.innerHTML = '<div id="donos"></div><div id="destaques"></div><div id="cupons"></div><div id="patrocinios"></div>';
  await Promise.all([donos(), destaques(), cupons(), patrocinios()]);

  // ---------- donos de posto ----------
  async function donos() {
    const { data: lista } = await sb.from('postos_dono').select('*').order('criado_em', { ascending: false });
    $('#donos').innerHTML = `<div class="cartao"><h3>Donos de posto</h3>
      <p style="font-size:13px;color:var(--texto-2)">Antes de aprovar, confirme por telefone e confira se o CNPJ é do posto.</p>
      ${lista.length ? `<table class="tabela-admin"><thead><tr><th>Posto</th><th>Responsável</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((d) => `<tr>
        <td>${esc(d.posto_nome)}<br><small>${data(d.criado_em)}</small></td>
        <td>${esc(d.responsavel)}<br><small>${esc(d.telefone)} · ${esc(d.email)}${d.cnpj ? ' · CNPJ ' + esc(d.cnpj) : ''}</small></td>
        <td><span class="estado ${d.status}">${d.status}</span></td>
        <td class="acoes">
          ${d.status !== 'aprovado' ? `<button class="btn peq primario" data-id="${d.id}" data-st="aprovado">Aprovar</button>` : ''}
          ${d.status !== 'recusado' ? `<button class="btn peq perigo" data-id="${d.id}" data-st="recusado">${d.status === 'aprovado' ? 'Remover acesso' : 'Recusar'}</button>` : ''}
        </td></tr>`).join('')}</tbody></table>` : '<p>Nenhum pedido ainda.</p>'}</div>`;
    $('#donos').querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => {
      await sb.from('postos_dono').update({ status: b.dataset.st }).eq('id', b.dataset.id);
      donos();
    }));
  }

  // ---------- destaques pagos ----------
  async function destaques() {
    const { data: lista } = await sb.from('destaques').select('*').order('ativo_ate', { ascending: false });
    $('#destaques').innerHTML = `<div class="cartao"><h3>Destaques pagos</h3>
      ${lista.length ? `<table class="tabela-admin"><thead><tr><th>Posto</th><th>Ativo até</th><th></th></tr></thead><tbody>
      ${lista.map((d) => `<tr><td>${esc(d.posto_nome)}${d.observacao ? `<br><small>${esc(d.observacao)}</small>` : ''}</td>
        <td>${data(d.ativo_ate)} ${d.ativo_ate >= Nuvem.hoje() ? '<span class="estado aprovado">ativo</span>' : '<span class="estado recusado">vencido</span>'}</td>
        <td class="acoes"><button class="btn peq" data-renova="${d.posto_id}" data-ate="${d.ativo_ate}">+30 dias</button>
          <button class="btn peq perigo" data-tira="${d.posto_id}">Excluir</button></td></tr>`).join('')}</tbody></table>` : '<p>Nenhum destaque.</p>'}
      <form class="form" id="f-dest" style="margin-top:12px">
        <div class="linha-form">
          <label>Posto <select name="posto_id" required><option value="">Escolha…</option>${opcoesPostos}</select></label>
          <label>Ativo até <input type="date" name="ativo_ate" required value="${maisDias(30)}" /></label>
        </div>
        <label>Observação (ex.: valor e forma de pagamento) <input name="observacao" /></label>
        <button class="btn primario">Adicionar destaque</button>
      </form></div>`;
    $('#f-dest').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const posto = postos.find((p) => p.id === Number(f.posto_id));
      const { error } = await sb.from('destaques').upsert({
        posto_id: Number(f.posto_id), posto_nome: posto?.nome, ativo_ate: f.ativo_ate, observacao: f.observacao || null,
      });
      if (error) alert(error.message);
      destaques();
    });
    $('#destaques').querySelectorAll('[data-renova]').forEach((b) => b.addEventListener('click', async () => {
      const base = b.dataset.ate >= Nuvem.hoje() ? new Date(b.dataset.ate + 'T12:00') : new Date();
      const ate = new Date(base.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      await sb.from('destaques').update({ ativo_ate: ate }).eq('posto_id', b.dataset.renova);
      destaques();
    }));
    $('#destaques').querySelectorAll('[data-tira]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Excluir este destaque?')) return;
      await sb.from('destaques').delete().eq('posto_id', b.dataset.tira);
      destaques();
    }));
  }

  // ---------- cupons para assinantes Premium ----------
  async function cupons() {
    const { data: lista, error: erro } = await sb.from('cupons').select('*').order('ativo_ate', { ascending: false });
    if (erro) {
      $('#cupons').innerHTML = `<div class="cartao"><h3>Cupons Premium</h3><p class="msg erro">Tabela de cupons ainda não criada (rode supabase/premium.sql).</p></div>`;
      return;
    }
    $('#cupons').innerHTML = `<div class="cartao"><h3>Cupons Premium</h3>
      <p style="font-size:13px;color:var(--texto-2)">Aparecem só para assinantes, na tela do posto e na lista de cupons.</p>
      ${lista.length ? `<table class="tabela-admin"><thead><tr><th>Cupom</th><th>Válido até</th><th></th></tr></thead><tbody>
      ${lista.map((c) => `<tr><td>${esc(c.texto)}<br><small>${esc(c.posto_nome)}${c.codigo ? ' · código ' + esc(c.codigo) : ''}</small></td>
        <td>${data(c.ativo_ate)} ${c.ativo_ate >= Nuvem.hoje() ? '<span class="estado aprovado">ativo</span>' : '<span class="estado recusado">vencido</span>'}</td>
        <td class="acoes"><button class="btn peq perigo" data-tira="${c.id}">Excluir</button></td></tr>`).join('')}</tbody></table>` : '<p>Nenhum cupom.</p>'}
      <form class="form" id="f-cupom" style="margin-top:12px">
        <div class="linha-form">
          <label>Posto <select name="posto_id" required><option value="">Escolha…</option>${opcoesPostos}</select></label>
          <label>Válido até <input type="date" name="ativo_ate" required value="${maisDias(30)}" /></label>
        </div>
        <label>Desconto (ex.: "R$ 0,10 a menos no litro da gasolina") <input name="texto" required maxlength="120" /></label>
        <label>Código para mostrar no caixa (opcional) <input name="codigo" maxlength="20" /></label>
        <button class="btn primario">Adicionar cupom</button>
      </form></div>`;
    $('#f-cupom').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const posto = postos.find((p) => p.id === Number(f.posto_id));
      const { error } = await sb.from('cupons').insert({
        posto_id: Number(f.posto_id), posto_nome: posto?.nome, texto: f.texto, codigo: f.codigo || null, ativo_ate: f.ativo_ate,
      });
      if (error) alert(error.message);
      cupons();
    });
    $('#cupons').querySelectorAll('[data-tira]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Excluir este cupom?')) return;
      await sb.from('cupons').delete().eq('id', b.dataset.tira);
      cupons();
    }));
  }

  // ---------- patrocinadores ----------
  async function patrocinios() {
    const { data: lista } = await sb.from('patrocinios').select('*').order('ativo_ate', { ascending: false });
    $('#patrocinios').innerHTML = `<div class="cartao"><h3>Patrocinadores</h3>
      <p style="font-size:13px;color:var(--texto-2)">Aparecem numa faixa "Patrocínio" no app, um de cada vez.</p>
      ${lista.length ? `<table class="tabela-admin"><thead><tr><th>Patrocinador</th><th>Ativo até</th><th></th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td><strong>${esc(p.nome)}</strong><br><small>${esc(p.texto)}${p.link ? ' · ' + esc(p.link) : ''}</small></td>
        <td>${data(p.ativo_ate)}</td>
        <td class="acoes"><button class="btn peq perigo" data-tira="${p.id}">Excluir</button></td></tr>`).join('')}</tbody></table>` : '<p>Nenhum patrocinador.</p>'}
      <form class="form" id="f-pat" style="margin-top:12px">
        <div class="linha-form">
          <label>Nome <input name="nome" required /></label>
          <label>Ativo até <input type="date" name="ativo_ate" required value="${maisDias(30)}" /></label>
        </div>
        <label>Texto (até 120 caracteres) <input name="texto" maxlength="120" required placeholder="Ex.: Troca de óleo com 10% de desconto mostrando o app" /></label>
        <label>Link (site, Instagram ou WhatsApp) <input name="link" type="url" placeholder="https://" /></label>
        <button class="btn primario">Adicionar patrocinador</button>
      </form></div>`;
    $('#f-pat').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const { error } = await sb.from('patrocinios').insert({ nome: f.nome, texto: f.texto, link: f.link || null, ativo_ate: f.ativo_ate });
      if (error) alert(error.message);
      patrocinios();
    });
    $('#patrocinios').querySelectorAll('[data-tira]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Excluir este patrocinador?')) return;
      await sb.from('patrocinios').delete().eq('id', b.dataset.tira);
      patrocinios();
    }));
  }
})();

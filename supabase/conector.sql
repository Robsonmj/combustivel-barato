-- Conector AbasteceR: o programinha instalado no computador do posto lê os XML das NFC-e que o PRÓPRIO posto emitiu
-- e manda só o preço por litro de cada combustível (e a hora da venda). A nota inteira nunca sai do posto.
-- Os preços entram em precos_posto (os mesmos do painel), então aparecem no app com o selo "Confirmado pelo posto".
-- Pode rodar de novo sem problema.

create extension if not exists pgcrypto with schema extensions;

-- uma chave por posto; guardamos só o hash (a chave em si aparece uma vez, no painel)
create table if not exists conector_chaves (
  posto_id     int primary key,
  chave_hash   text not null unique,
  cnpj         text not null,           -- só aceita notas emitidas por este CNPJ (14 dígitos)
  user_id      uuid not null,           -- dono aprovado que gerou a chave (vai no precos_posto)
  criada_em    timestamptz not null default now(),
  ultimo_envio timestamptz,
  envios       int not null default 0,
  ativa        boolean not null default true
);
alter table conector_chaves enable row level security; -- ninguém lê pela internet

create or replace function so_digitos(t text) returns text language sql immutable as $$
  select regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g');
$$;

-- Dono aprovado (ou administrador) gera a chave do conector do posto. Gerar de novo invalida a anterior.
-- O CNPJ vem do cadastro da ANP do posto; se não houver, do CNPJ informado no pedido de acesso.
create or replace function gerar_chave_conector(p int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text; c text; u uuid;
begin
  if not (dono_aprovado(p) or is_admin()) then raise exception 'Sem permissão para este posto.'; end if;
  select so_digitos(cnpj) into c from anp_revendas where posto_id = p limit 1;
  if coalesce(c, '') = '' then
    select so_digitos(cnpj) into c from postos_dono where posto_id = p and status = 'aprovado' and so_digitos(cnpj) <> '' limit 1;
  end if;
  if length(coalesce(c, '')) <> 14 then
    raise exception 'Não encontrei o CNPJ deste posto. Fale com o AbasteceR para completar o cadastro.';
  end if;
  u := coalesce((select user_id from postos_dono where posto_id = p and user_id = auth.uid() and status = 'aprovado'),
                (select user_id from postos_dono where posto_id = p and status = 'aprovado' order by criado_em limit 1));
  if u is null then raise exception 'O posto precisa ter um responsável aprovado.'; end if;
  k := 'abr_' || encode(gen_random_bytes(24), 'hex');
  insert into conector_chaves (posto_id, chave_hash, cnpj, user_id)
  values (p, encode(digest(k, 'sha256'), 'hex'), c, u)
  on conflict (posto_id) do update set chave_hash = excluded.chave_hash, cnpj = excluded.cnpj, user_id = excluded.user_id,
    criada_em = now(), ativa = true;
  return jsonb_build_object('chave', k, 'cnpj', c);
end $$;
revoke all on function gerar_chave_conector(int) from public, anon;
grant execute on function gerar_chave_conector(int) to authenticated;

-- Situação do conector, para o painel (sem a chave)
create or replace function situacao_conector(p int) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when dono_aprovado(p) or is_admin() then
    (select jsonb_build_object('ativa', ativa, 'criada_em', criada_em, 'ultimo_envio', ultimo_envio, 'envios', envios)
     from conector_chaves where posto_id = p) end;
$$;
grant execute on function situacao_conector(int) to authenticated;

-- Chamado pelo conector. itens: [{"combustivel":"gasolina","valor":6.29,"vendido_em":"2026-11-23T10:15:00-03:00"}, ...]
create or replace function conector_enviar(chave text, cnpj text, itens jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  k conector_chaves;
  it jsonb;
  comb text; v numeric; quando timestamptz;
  ult record;
  gravados int := 0;
begin
  select * into k from conector_chaves where chave_hash = encode(digest(coalesce(chave, ''), 'sha256'), 'hex') and ativa;
  if k.posto_id is null then raise exception 'Chave do conector inválida ou desativada.'; end if;
  if so_digitos(cnpj) <> k.cnpj then raise exception 'As notas são de outro CNPJ (esperado %).', k.cnpj; end if;
  if jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) > 20 then raise exception 'Lista de preços inválida.'; end if;

  for it in select * from jsonb_array_elements(itens) loop
    comb := it ->> 'combustivel';
    v := round((it ->> 'valor')::numeric, 3);
    quando := (it ->> 'vendido_em')::timestamptz;
    continue when comb is null or comb not in ('gasolina','gasolina_aditivada','etanol','diesel','diesel_s10','gnv')
      or v is null or v < 1 or v > 20
      or quando is null or quando > now() + interval '10 minutes' or quando < now() - interval '2 days';
    -- só grava se o preço mudou ou se a última gravação tem mais de 1 hora (evita linhas repetidas)
    select valor, informado_em into ult from precos_posto
      where posto_id = k.posto_id and combustivel = comb order by informado_em desc limit 1;
    continue when ult.informado_em is not null and quando <= ult.informado_em;
    continue when ult.valor = v and quando < ult.informado_em + interval '1 hour';
    insert into precos_posto (posto_id, combustivel, valor, informado_em, user_id)
    values (k.posto_id, comb, v, quando, k.user_id);
    gravados := gravados + 1;
  end loop;

  update conector_chaves set ultimo_envio = now(), envios = envios + 1 where posto_id = k.posto_id;
  return jsonb_build_object('ok', true, 'posto_id', k.posto_id, 'gravados', gravados);
end $$;
grant execute on function conector_enviar(text, text, jsonb) to anon, authenticated;

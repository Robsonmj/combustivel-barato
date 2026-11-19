-- Coleta automática do Menor Preço DENTRO do Supabase (servidor em São Paulo), sem depender do PC.
-- Como funciona: o pg_cron chama mp_passo() a cada minuto. Cada chamada faz no máximo UMA consulta
-- ao Menor Preço (pausa de ~1 min entre consultas) e um ciclo completo roda de hora em hora.
-- Cidades: Toledo, Cascavel, Marechal Cândido Rondon, Guarapuava, Foz do Iguaçu e Umuarama. A API aceita raio de
-- no máximo 15 km, então cada cidade tem o ponto central (todo ciclo) e pontos em volta, a ~20 km,
-- para pegar os distritos (a cada 3 ciclos, para manter o volume baixo).
-- Mesmas regras do coletor do PC: baixo volume, User-Agent identificado, nada de contornar bloqueios:
-- se a fonte recusar (403/429/erro), o ciclo é interrompido e o erro fica em fontes_status.
-- Para desligar:  select cron.unschedule('mp_coleta');

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- dados públicos de postos e preços ----------
create table if not exists postos (
  id            int primary key,
  nome          text not null,
  bandeira      text,
  endereco      text,
  bairro        text,
  cidade        text,
  uf            text,
  lat           double precision not null,
  lng           double precision not null,
  origem        text not null,
  codigo_origem text,
  criado_em     timestamptz not null default now(),
  unique (origem, codigo_origem)
);
create sequence if not exists postos_id_seq owned by postos.id;

create table if not exists precos (
  id            bigint generated always as identity primary key,
  posto_id      int not null references postos(id),
  combustivel   text not null,
  valor         numeric(6,3) not null,
  coletado_em   timestamptz not null,
  registrado_em timestamptz not null default now(),
  fonte         text not null,
  descricao     text,
  unique (posto_id, combustivel, coletado_em, fonte, valor)
);
create index if not exists idx_precos_busca on precos (combustivel, coletado_em);
create index if not exists idx_precos_posto on precos (posto_id, combustivel, coletado_em);

create table if not exists fontes_status (
  fonte            text primary key,
  ultima_execucao  timestamptz,
  sucesso          int,
  mensagem_erro    text,
  precos_coletados int
);

alter table postos enable row level security;
alter table precos enable row level security;
alter table fontes_status enable row level security;
drop policy if exists "todos leem postos" on postos;
create policy "todos leem postos" on postos for select using (true);
drop policy if exists "todos leem precos" on precos;
create policy "todos leem precos" on precos for select using (true);
drop policy if exists "todos leem status" on fontes_status;
create policy "todos leem status" on fontes_status for select using (true);

-- ---------- estado da coleta (uma linha) ----------
create table if not exists mp_estado (
  id            int primary key default 1 check (id = 1),
  ciclo_inicio  timestamptz,
  pedido_id     bigint,          -- consulta enviada aguardando resposta
  pedido_em     timestamptz,
  tp            int,             -- combustível da consulta pendente/próxima (1..4)
  pagina        int,
  deslocamento  int,
  ha_proximo    boolean not null default false,
  precos_ciclo  int not null default 0
);
insert into mp_estado (id) values (1) on conflict do nothing;
alter table mp_estado add column if not exists ponto int not null default 0;      -- índice em mp_cfg()->'pontos'
alter table mp_estado add column if not exists ciclo_num int not null default 0;  -- conta os ciclos (pontos do anel a cada 3)
alter table mp_estado enable row level security; -- ninguém lê pela internet

-- ---------- configuração ----------
create or replace function mp_cfg() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'base', 'https://menorpreco.notaparana.pr.gov.br/api/v1',
    'raio', 15,                  -- máximo aceito pela API
    -- só entram postos destes municípios (como vêm no Menor Preço, sem acento)
    'municipios', jsonb_build_array('TOLEDO', 'CASCAVEL', 'MARECHAL CANDIDO RONDON', 'GUARAPUAVA', 'FOZ DO IGUACU', 'UMUARAMA'),
    -- pontos de consulta (geohash). anel = ponto em volta da cidade, para os distritos
    'pontos', '[
      {"c":"Toledo","g":"6g9g354"},
      {"c":"Cascavel","g":"6g9fp8g"},
      {"c":"Marechal Cândido Rondon","g":"6g9s3ct"},
      {"c":"Guarapuava","g":"6g7rscv"},
      {"c":"Foz do Iguaçu","g":"6g3nvfu"},
      {"c":"Umuarama","g":"6gf0f9t"},
      {"c":"Toledo N","g":"6g9u3p4","anel":true},
      {"c":"Toledo S","g":"6g9f1p4","anel":true},
      {"c":"Toledo L","g":"6g9gq51","anel":true},
      {"c":"Toledo O","g":"6g9ek5h","anel":true},
      {"c":"Cascavel N","g":"6g9gpsg","anel":true},
      {"c":"Cascavel S","g":"6g9bzt5","anel":true},
      {"c":"Cascavel L","g":"6gd4h8c","anel":true},
      {"c":"Cascavel O","g":"6g9f48u","anel":true},
      {"c":"Marechal Cândido Rondon N","g":"6g9t1zj","anel":true},
      {"c":"Marechal Cândido Rondon S","g":"6g9e3um","anel":true},
      {"c":"Marechal Cândido Rondon L","g":"6g9smcw","anel":true},
      {"c":"Guarapuava N","g":"6ge2uft","anel":true},
      {"c":"Guarapuava S","g":"6g7qkbv","anel":true},
      {"c":"Guarapuava L","g":"6g7xd9f","anel":true},
      {"c":"Guarapuava O","g":"6g7px3b","anel":true},
      {"c":"Foz do Iguaçu N","g":"6g3pvgs","anel":true},
      {"c":"Foz do Iguaçu L","g":"6g3qf6v","anel":true},
      {"c":"Umuarama N","g":"6gf1fdm","anel":true},
      {"c":"Umuarama S","g":"6gdpf8v","anel":true},
      {"c":"Umuarama L","g":"6gf0z1s","anel":true},
      {"c":"Umuarama O","g":"6gcby1w","anel":true}
    ]'::jsonb,
    'anel_cada', 3,
    'max_paginas', 6,
    'intervalo_ciclo_min', 55,
    'ua', 'PrototipoPrecosCombustivel/0.1 (projeto sem fins comerciais)'
  );
$$;

-- ---------- auxiliares ----------
create or replace function geohash_decode(h text, out lat double precision, out lng double precision)
language plpgsql immutable as $$
declare
  b32 constant text := '0123456789bcdefghjkmnpqrstuvwxyz';
  lat_min double precision := -90; lat_max double precision := 90;
  lng_min double precision := -180; lng_max double precision := 180;
  par boolean := true; v int; i int; bit int; meio double precision;
begin
  for i in 1..length(h) loop
    v := strpos(b32, substr(lower(h), i, 1)) - 1;
    for bit in reverse 4..0 loop
      if par then
        meio := (lng_min + lng_max) / 2;
        if (v >> bit) & 1 = 1 then lng_min := meio; else lng_max := meio; end if;
      else
        meio := (lat_min + lat_max) / 2;
        if (v >> bit) & 1 = 1 then lat_min := meio; else lat_max := meio; end if;
      end if;
      par := not par;
    end loop;
  end loop;
  lat := (lat_min + lat_max) / 2;
  lng := (lng_min + lng_max) / 2;
end $$;

create or replace function mp_classificar(descr text, tp int) returns text
language sql immutable as $$
  select case
    when tp = 3 then 'etanol'
    when tp = 4 then case when upper(descr) ~ 'S[ -]?10([^0-9]|$)' then 'diesel_s10' else 'diesel' end
    when tp in (1, 2) then case
      when upper(descr) ~ '(ETANOL|DIESEL)' then null
      when upper(descr) ~ '(ADIT|\mADT\M|V[ -]?POWER|PODIUM|PREMIUM|\mGRID\M|SUPRA|EVOLUTION|DT ?CLEAN|ACTIVE)' then 'gasolina_aditivada'
      else 'gasolina' end
    else null end;
$$;

create or replace function mp_bandeira(nome text) returns text language sql immutable as $$
  select case
    when n like '%SHELL%' or n like '%RAIZEN%' then 'Shell'
    when n like '%IPIRANGA%' then 'Ipiranga'
    when n like '%PETROBRAS%' or n like '%VIBRA%' or n like '%POSTO BR %' then 'Petrobras'
    when n like '% ALE %' or n like '%ALESAT%' then 'Ale'
    when n like '%SIM REDE%' then 'Rede Sim'
    when n like '%CHARRUA%' then 'Charrua'
    when n like '%RODOIL%' then 'Rodoil'
    when n like '%TAURUS%' then 'Taurus'
    end
  from (select ' ' || upper(coalesce(nome, '')) || ' ' as n) x;
$$;

create or replace function mp_separar_nome(bruto text, out nome text, out bandeira text)
language plpgsql immutable as $$
declare m text[]; prefixo text;
begin
  nome := trim(coalesce(bruto, ''));
  bandeira := mp_bandeira(nome);
  m := regexp_match(nome, '^(.{1,20}?)\s+-\s+(.+)$');
  if m is not null then
    prefixo := upper(m[1]);
    if prefixo ~ '^(B\.? ?BRANCA|BANDEIRA BRANCA)' then bandeira := 'Bandeira branca';
    else bandeira := coalesce(mp_bandeira(prefixo), bandeira); end if;
    nome := m[2];
  end if;
  nome := trim(regexp_replace(nome, '\s+(LTDA|EIRELI|EPP|ME|S/?A)\.?$', '', 'i'));
  nome := coalesce(nullif(initcap(lower(nome)), ''), 'Posto');
end $$;

-- nome da cidade como aparece no app (o Menor Preço manda em maiúsculas e sem acento)
create or replace function mp_nome_cidade(mun text) returns text language sql immutable as $$
  select case upper(coalesce(mun, ''))
    when 'MARECHAL CANDIDO RONDON' then 'Marechal Cândido Rondon'
    when 'FOZ DO IGUACU' then 'Foz do Iguaçu'
    else initcap(lower(mun)) end;
$$;

-- grava os itens de uma página; devolve quantos preços novos
create or replace function mp_gravar_pagina(js jsonb, tp int) returns int
language plpgsql as $$
declare
  it jsonb; e jsonb; comb text; v numeric; pos record; nm record; pid int; novos int := 0; n int;
begin
  for it in select * from jsonb_array_elements(js -> 'produtos') loop
    e := it -> 'estabelecimento';
    comb := mp_classificar(it ->> 'desc', tp);
    v := nullif(it ->> 'valor', '')::numeric;
    continue when comb is null or v is null or v < 1 or v > 20 or e is null
      or coalesce(it ->> 'local', '') = '' or coalesce(e ->> 'codigo', '') = '' or coalesce(it ->> 'datahora', '') = '';
    continue when not (mp_cfg() -> 'municipios') ? upper(coalesce(e ->> 'mun', ''));

    select * into pos from geohash_decode(it ->> 'local');
    select * into nm from mp_separar_nome(coalesce(nullif(e ->> 'nm_fan', ''), e ->> 'nm_emp'));

    select id into pid from postos where origem = 'menor_preco' and codigo_origem = e ->> 'codigo';
    if pid is null then
      insert into postos (id, nome, bandeira, endereco, bairro, cidade, uf, lat, lng, origem, codigo_origem)
      values (nextval('postos_id_seq'), nm.nome, nm.bandeira,
        initcap(lower(trim(concat_ws(' ', e ->> 'tp_logr', e ->> 'nm_logr')) || coalesce(', ' || nullif(e ->> 'nr_logr', ''), ''))),
        initcap(lower(e ->> 'bairro')), mp_nome_cidade(e ->> 'mun'), e ->> 'uf', pos.lat, pos.lng, 'menor_preco', e ->> 'codigo')
      returning id into pid;
    else
      update postos set lat = pos.lat, lng = pos.lng where id = pid;
    end if;

    insert into precos (posto_id, combustivel, valor, coletado_em, fonte, descricao)
    values (pid, comb, v, (it ->> 'datahora')::timestamptz, 'menor_preco', trim(it ->> 'desc'))
    on conflict do nothing;
    get diagnostics n = row_count;
    novos := novos + n;
  end loop;
  return novos;
end $$;

create or replace function mp_status(ok boolean, msg text, qtd int) returns void language sql as $$
  insert into fontes_status (fonte, ultima_execucao, sucesso, mensagem_erro, precos_coletados)
  values ('menor_preco', now(), case when ok then 1 else 0 end, msg, qtd)
  on conflict (fonte) do update set ultima_execucao = excluded.ultima_execucao, sucesso = excluded.sucesso,
    mensagem_erro = excluded.mensagem_erro, precos_coletados = excluded.precos_coletados;
$$;

-- próximo ponto de consulta a partir de "desde" (inclusive); pontos do anel só nos ciclos de anel
create or replace function mp_proximo_ponto(desde int, com_anel boolean) returns int language sql immutable as $$
  select min(i - 1)::int
  from jsonb_array_elements(mp_cfg() -> 'pontos') with ordinality as p(v, i)
  where i - 1 >= desde and (com_anel or not coalesce((v ->> 'anel')::boolean, false));
$$;

-- ---------- um passo da coleta (chamado a cada minuto) ----------
create or replace function mp_passo() returns text
language plpgsql security definer set search_path = public, net as $$
declare
  est mp_estado; cfg jsonb := mp_cfg(); r record; js jsonb; qtd int; total int; novos int; url text;
begin
  select * into est from mp_estado where id = 1 for update;

  -- 1) existe consulta pendente? processa a resposta
  if est.pedido_id is not null then
    select status_code, content, timed_out, error_msg into r from net._http_response where id = est.pedido_id;
    if not found then
      if now() - est.pedido_em < interval '3 minutes' then return 'aguardando resposta'; end if;
      perform mp_status(false, 'Sem resposta do Menor Preço (tempo esgotado). Coleta interrompida até o próximo ciclo.', est.precos_ciclo);
      update mp_estado set pedido_id = null, ha_proximo = false where id = 1;
      return 'sem resposta';
    end if;
    if r.timed_out or r.status_code is null then
      perform mp_status(false, 'Sem conexão com o Menor Preço: ' || coalesce(r.error_msg, 'tempo esgotado'), est.precos_ciclo);
      update mp_estado set pedido_id = null, ha_proximo = false where id = 1;
      return 'erro de conexão';
    end if;
    if r.status_code in (403, 429) then
      perform mp_status(false, format('Acesso recusado pelo Menor Preço (HTTP %s). Coleta interrompida; não haverá nova tentativa até o próximo ciclo.', r.status_code), est.precos_ciclo);
      update mp_estado set pedido_id = null, ha_proximo = false where id = 1;
      return 'recusado';
    end if;
    if r.status_code <> 200 then
      perform mp_status(false, format('Menor Preço respondeu HTTP %s', r.status_code), est.precos_ciclo);
      update mp_estado set pedido_id = null, ha_proximo = false where id = 1;
      return 'erro http';
    end if;
    begin
      js := r.content::jsonb;
    exception when others then
      perform mp_status(false, 'Resposta do Menor Preço não é JSON — o formato pode ter mudado.', est.precos_ciclo);
      update mp_estado set pedido_id = null, ha_proximo = false where id = 1;
      return 'formato';
    end;
    if jsonb_typeof(js -> 'produtos') <> 'array' then
      perform mp_status(false, 'Resposta do Menor Preço sem a lista "produtos" — o formato pode ter mudado.', est.precos_ciclo);
      update mp_estado set pedido_id = null, ha_proximo = false where id = 1;
      return 'formato';
    end if;

    novos := mp_gravar_pagina(js, est.tp);
    qtd := jsonb_array_length(js -> 'produtos');
    total := nullif(js ->> 'total', '')::int;

    -- próxima página do mesmo combustível ou próximo combustível
    if qtd > 0 and est.pagina + 1 < (cfg ->> 'max_paginas')::int
       and (total is null or est.deslocamento + qtd < total) then
      update mp_estado set pedido_id = null, pagina = est.pagina + 1, deslocamento = est.deslocamento + qtd,
        ha_proximo = true, precos_ciclo = est.precos_ciclo + novos where id = 1;
    elsif est.tp < 4 then
      update mp_estado set pedido_id = null, tp = est.tp + 1, pagina = 0, deslocamento = 0,
        ha_proximo = true, precos_ciclo = est.precos_ciclo + novos where id = 1;
    elsif mp_proximo_ponto(est.ponto + 1, est.ciclo_num % (cfg ->> 'anel_cada')::int = 1) is not null then
      update mp_estado set pedido_id = null, ponto = mp_proximo_ponto(est.ponto + 1, est.ciclo_num % (cfg ->> 'anel_cada')::int = 1),
        tp = 1, pagina = 0, deslocamento = 0, ha_proximo = true, precos_ciclo = est.precos_ciclo + novos where id = 1;
    else
      update mp_estado set pedido_id = null, ha_proximo = false, precos_ciclo = est.precos_ciclo + novos where id = 1;
      perform mp_status(true, null, est.precos_ciclo + novos);
      return 'ciclo concluído';
    end if;
    return 'página gravada';  -- a próxima consulta sai no minuto seguinte (pausa entre consultas)
  end if;

  -- 2) nada pendente: começa um ciclo novo se já passou o intervalo
  if not est.ha_proximo then
    if est.ciclo_inicio is not null and now() - est.ciclo_inicio < make_interval(mins => (cfg ->> 'intervalo_ciclo_min')::int) then
      return 'fora do horário';
    end if;
    update mp_estado set ciclo_inicio = now(), ciclo_num = est.ciclo_num + 1, ponto = 0,
      tp = 1, pagina = 0, deslocamento = 0, precos_ciclo = 0, ha_proximo = true where id = 1;
    select * into est from mp_estado where id = 1;
  end if;

  -- 3) envia a próxima consulta
  url := format('%s/produtos?local=%s&tp_comb=%s&raio=%s&data=-1%s', cfg ->> 'base',
    cfg -> 'pontos' -> coalesce(est.ponto, 0) ->> 'g', est.tp, cfg ->> 'raio',
    case when est.deslocamento > 0 then '&offset=' || est.deslocamento else '' end);
  update mp_estado set pedido_id = net.http_get(url := url,
      headers := jsonb_build_object('User-Agent', cfg ->> 'ua', 'Accept', 'application/json'),
      timeout_milliseconds := 20000),
    pedido_em = now(), ha_proximo = false where id = 1;
  return 'consulta enviada';
end $$;
revoke all on function mp_passo() from public, anon, authenticated;
revoke all on function mp_gravar_pagina(jsonb, int), mp_status(boolean, text, int), mp_proximo_ponto(int, boolean) from public, anon, authenticated;

-- ---------- leitura pelo app (mesmo formato dos arquivos JSON antigos) ----------
-- cid = nome da cidade (ex.: 'Cascavel'); sem cid devolve todas (versões antigas do app)
drop function if exists api_postos(text);
create or replace function api_postos(comb text, cid text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with daqui as (
    select * from postos where cid is null or cidade = cid
  ), ultimos as (
    select distinct on (posto_id) posto_id, valor, coletado_em, fonte
    from precos where combustivel = comb and coletado_em >= now() - interval '7 days'
      and posto_id in (select id from daqui)
    order by posto_id, coletado_em desc, valor asc
  ), resumo as (
    select combustivel, min(valor) minimo, max(valor) maximo, round(avg(valor), 3) media, count(*) postos
    from (select distinct on (posto_id, combustivel) posto_id, combustivel, valor
          from precos where coletado_em >= now() - interval '7 days' and posto_id in (select id from daqui)
          order by posto_id, combustivel, coletado_em desc, valor asc) x
    group by combustivel
  )
  select jsonb_build_object(
    'combustivel', comb,
    'cidade', cid,
    'postos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'bandeira', p.bandeira,
        'endereco', p.endereco, 'bairro', p.bairro, 'cidade', p.cidade, 'lat', p.lat, 'lng', p.lng,
        'preco', u.valor, 'coletado_em', u.coletado_em, 'fonte', u.fonte) order by p.nome)
      from daqui p left join ultimos u on u.posto_id = p.id), '[]'::jsonb),
    'resumo', coalesce((select jsonb_agg(to_jsonb(resumo)) from resumo), '[]'::jsonb),
    'status', coalesce((select jsonb_agg(to_jsonb(s)) from fontes_status s), '[]'::jsonb));
$$;

create or replace function api_posto(pid int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posto', (select to_jsonb(p) from postos p where p.id = pid),
    'precos', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select distinct on (combustivel) combustivel, valor, coletado_em, fonte, descricao
        from precos where posto_id = pid and coletado_em >= now() - interval '7 days'
        order by combustivel, coletado_em desc, valor asc) x), '[]'::jsonb),
    'historico', coalesce((select jsonb_agg(to_jsonb(h) order by h.dia) from (
        select combustivel, to_char(coletado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') dia, min(valor) valor
        from precos where posto_id = pid and coletado_em >= now() - interval '30 days'
        group by 1, 2) h), '[]'::jsonb));
$$;
grant execute on function api_postos(text, text), api_posto(int) to anon, authenticated;

-- ---------- agendamento: a cada minuto ----------
select cron.unschedule('mp_coleta') where exists (select 1 from cron.job where jobname = 'mp_coleta');
select cron.schedule('mp_coleta', '* * * * *', 'select mp_passo()');

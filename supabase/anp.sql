-- Preços da ANP (Levantamento de Preços de Combustíveis, dados abertos do Governo Federal).
-- Fonte de reserva, legal e gratuita: a ANP publica toda semana uma amostra de postos de 26 cidades do PR.
-- Tudo roda DENTRO do Supabase (pg_net + pg_cron), sem chave nova:
--   1) uma vez por dia baixa os 2 arquivos "últimas 4 semanas" e guarda as linhas das cidades do app;
--   2) a cada minuto liga UM posto da ANP ao mapa: primeiro procura um posto que já existe no mesmo
--      endereço; se não houver, busca a coordenada no OpenStreetMap (Nominatim), 1 consulta por minuto,
--      bem abaixo do limite de uso deles (1 por segundo), com User-Agent identificado;
--   3) copia os preços para a tabela "precos" com fonte = 'anp'.
-- O app mostra preço da ANP por até 21 dias (o levantamento é semanal e sai com ~1 semana de atraso).
-- Para desligar:  select cron.unschedule('anp_coleta');

-- ---------- configuração ----------
create or replace function anp_cfg() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'arquivos', jsonb_build_array(
      'https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/qus/ultimas-4-semanas-gasolina-etanol.csv',
      'https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/qus/ultimas-4-semanas-diesel-gnv.csv'),
    -- cidades importadas (como vêm na ANP: maiúsculas, sem acento)
    'municipios', jsonb_build_array('TOLEDO', 'CASCAVEL', 'MARECHAL CANDIDO RONDON', 'GUARAPUAVA', 'FOZ DO IGUACU', 'UMUARAMA',
      'CIANORTE', 'CAMPO MOURAO', 'PARANAVAI', 'FRANCISCO BELTRAO', 'PATO BRANCO', 'MARINGA', 'LONDRINA',
      -- cidades da rota Maringá–Guaíra e Alto Piquiri (a ANP não pesquisa preço nelas; entram pelo cadastro)
      'PAICANDU', 'DOUTOR CAMARGO', 'TERRA BOA', 'JUSSARA', 'TUNEIRAS DO OESTE', 'TAPEJARA', 'CRUZEIRO DO OESTE',
      'PEROBAL', 'CAFEZAL DO SUL', 'IPORA', 'FRANCISCO ALVES', 'TERRA ROXA', 'GUAIRA', 'ALTO PIQUIRI'),
    'intervalo_horas', 24,
    'ua', 'CombustivelBarato/1.0 (+https://robsonmj.github.io/combustivel-barato/)'
  );
$$;

-- ---------- tabelas ----------
create table if not exists anp_revendas (
  cnpj            text primary key,
  municipio       text not null,
  nome            text,
  bandeira        text,
  rua             text,
  numero          text,
  bairro          text,
  cep             text,
  posto_id        int references postos(id),
  geo_tentativas  int not null default 0,
  geo_pedido      bigint,
  geo_pedido_em   timestamptz,
  atualizado_em   timestamptz not null default now()
);
create table if not exists anp_precos (
  cnpj         text not null references anp_revendas(cnpj),
  combustivel  text not null,
  valor        numeric(6,3) not null,
  data         date not null,
  primary key (cnpj, combustivel, data)
);
create table if not exists anp_estado (
  id            int primary key default 1 check (id = 1),
  pedidos       bigint[],
  pedido_em     timestamptz,
  ultima_baixa  timestamptz,
  linhas        int
);
insert into anp_estado (id) values (1) on conflict do nothing;
-- coordenada do cadastro da ANP (API Revendedores) ou do OpenStreetMap, quando houver
alter table anp_revendas add column if not exists lat double precision;
alter table anp_revendas add column if not exists lng double precision;
alter table anp_revendas add column if not exists coord_fonte text;
alter table anp_revendas enable row level security;  -- ninguém lê pela internet
alter table anp_precos enable row level security;
alter table anp_estado enable row level security;

-- ---------- auxiliares ----------
create or replace function anp_sem_acento(t text) returns text language sql immutable as $$
  select translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

-- "AVENIDA MINISTRO CIRNE LIMA" e "Av. Ministro Cirne Lima" -> "ministro cirne lima"
create or replace function anp_rua_chave(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(anp_sem_acento(t),
    '^(rua|r|avenida|av|rodovia|rod|estrada|est|praca|pca|travessa|tv|alameda|al)\.?\s+', ''),
    '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- mesma rua mesmo com título a mais ou a menos ("Presidente Tancredo Neves" x "Tancredo Neves")
create or replace function anp_rua_parecida(a text, b text) returns boolean language sql immutable as $$
  select x = y or (least(length(x), length(y)) >= 6 and (x like '%' || y or y like '%' || x))
  from (select anp_rua_chave(a) x, anp_rua_chave(b) y) t;
$$;

create or replace function anp_numero(t text) returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function anp_url(t text) returns text language plpgsql immutable as $$
declare b bytea := convert_to(coalesce(t, ''), 'UTF8'); r text := ''; c int; i int;
begin
  for i in 0..length(b) - 1 loop
    c := get_byte(b, i);
    if (c between 48 and 57) or (c between 65 and 90) or (c between 97 and 122) or c in (45, 46, 95, 126) then
      r := r || chr(c);
    else
      r := r || '%' || upper(lpad(to_hex(c), 2, '0'));
    end if;
  end loop;
  return r;
end $$;

create or replace function anp_combustivel(p text) returns text language sql immutable as $$
  select case upper(trim(p))
    when 'GASOLINA' then 'gasolina'
    when 'GASOLINA ADITIVADA' then 'gasolina_aditivada'
    when 'ETANOL' then 'etanol'
    when 'DIESEL' then 'diesel'
    when 'DIESEL S10' then 'diesel_s10'
    when 'GNV' then 'gnv' end;
$$;

create or replace function anp_bandeira(b text) returns text language sql immutable as $$
  select case
    when u like 'BRANCA%' then 'Bandeira branca'
    when u like '%IPIRANGA%' then 'Ipiranga'
    when u like '%RAIZEN%' or u like '%SHELL%' then 'Shell'
    when u like '%VIBRA%' or u like '%PETROBRAS%' then 'Petrobras'
    when u like '%ALESAT%' or u = 'ALE' then 'Ale'
    when u = '' then null
    else initcap(lower(b)) end
  from (select upper(trim(coalesce(b, ''))) u) x;
$$;

-- separa uma linha do CSV da ANP (";" com campos entre aspas)
create or replace function anp_campos(linha text) returns text[] language sql immutable as $$
  select array_agg(case when m[1] like '"%' then replace(substr(m[1], 2, length(m[1]) - 2), '""', '"') else m[1] end order by n)
  from regexp_matches(rtrim(linha, E'\r') || ';', '("(?:[^"]|"")*"|[^;]*);', 'g') with ordinality as x(m, n);
$$;

-- grava o conteúdo de um arquivo; devolve quantas linhas das cidades do app
create or replace function anp_gravar(conteudo text) returns int language plpgsql as $$
declare l text; f text[]; comb text; v numeric; d date; n int := 0; v_cnpj text;
begin
  for l in select x from regexp_split_to_table(conteudo, E'\n') x where position(';PR;' in x) > 0 loop
    f := anp_campos(l);
    continue when coalesce(array_length(f, 1), 0) < 13 or f[2] <> 'PR';
    continue when not (anp_cfg() -> 'municipios') ? upper(trim(f[3]));
    comb := anp_combustivel(f[11]);
    v := nullif(replace(trim(f[13]), ',', '.'), '')::numeric;
    d := to_date(trim(f[12]), 'DD/MM/YYYY');
    v_cnpj := regexp_replace(f[5], '[^0-9]', '', 'g');
    continue when comb is null or v is null or v < 1 or v > 20 or d is null or v_cnpj = '';
    insert into anp_revendas (cnpj, municipio, nome, bandeira, rua, numero, bairro, cep)
    values (v_cnpj, upper(trim(f[3])), trim(f[4]), anp_bandeira(f[16]), trim(f[6]), trim(f[7]), trim(f[9]), trim(f[10]))
    on conflict (cnpj) do update set nome = excluded.nome, bandeira = excluded.bandeira, rua = excluded.rua,
      numero = excluded.numero, bairro = excluded.bairro, cep = excluded.cep, atualizado_em = now();
    insert into anp_precos (cnpj, combustivel, valor, data) values (v_cnpj, comb, v, d)
    on conflict (cnpj, combustivel, data) do update set valor = excluded.valor;
    n := n + 1;
  end loop;
  return n;
end $$;

-- copia para "precos" os preços dos postos da ANP que já estão no mapa
create or replace function anp_publicar() returns int language plpgsql as $$
declare n int;
begin
  insert into precos (posto_id, combustivel, valor, coletado_em, fonte, descricao)
  select r.posto_id, p.combustivel, p.valor, (p.data + time '12:00') at time zone 'America/Sao_Paulo', 'anp',
         'ANP – levantamento semanal de preços'
  from anp_precos p join anp_revendas r using (cnpj)
  where r.posto_id is not null and p.data >= current_date - 35
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function anp_status(ok boolean, msg text, qtd int) returns void language sql as $$
  insert into fontes_status (fonte, ultima_execucao, sucesso, mensagem_erro, precos_coletados)
  values ('anp', now(), case when ok then 1 else 0 end, msg, qtd)
  on conflict (fonte) do update set ultima_execucao = excluded.ultima_execucao, sucesso = excluded.sucesso,
    mensagem_erro = excluded.mensagem_erro, precos_coletados = excluded.precos_coletados;
$$;

-- posto do mapa que já é este (a menos de 80 m, ou mesma rua e número), ainda não ligado a outra revenda
create or replace function anp_posto_perto(cid text, plat double precision, plng double precision, prua text, pnum text)
returns int language sql stable as $$
  select p.id from postos p
  where p.cidade = cid
    and not exists (select 1 from anp_revendas r where r.posto_id = p.id)
    and ((plat is not null and abs(p.lat - plat) < 0.001 and abs(p.lng - plng) < 0.001
          and sqrt(power((p.lat - plat) * 111320, 2) + power((p.lng - plng) * 111320 * cos(radians(plat)), 2)) < 80)
      or (anp_numero(pnum) is not null and anp_numero(split_part(p.endereco, ',', 2)) = anp_numero(pnum)
          and anp_rua_parecida(split_part(p.endereco, ',', 1), prua)))
  order by case when plat is null then 0
    else power(p.lat - plat, 2) + power((p.lng - plng) * cos(radians(plat)), 2) end
  limit 1;
$$;

-- cria (ou liga) no mapa os postos do cadastro que já têm coordenada; devolve quantos
create or replace function anp_ligar_coordenadas() returns int language plpgsql as $$
declare rv anp_revendas; cid text; pid int; nm record; n int := 0;
begin
  -- postos criados antes pelo Nominatim ganham a coordenada do cadastro, que é mais precisa
  update postos p set lat = r.lat, lng = r.lng
  from anp_revendas r where p.origem = 'anp' and p.codigo_origem = r.cnpj and r.lat is not null
    and (p.lat, p.lng) is distinct from (r.lat, r.lng);
  for rv in select * from anp_revendas where posto_id is null and lat is not null order by municipio, cnpj loop
    cid := mp_nome_cidade(rv.municipio);
    pid := anp_posto_perto(cid, rv.lat, rv.lng, rv.rua, rv.numero);
    if pid is null then
      select * into nm from mp_separar_nome(rv.nome);
      insert into postos (id, nome, bandeira, endereco, bairro, cidade, uf, lat, lng, origem, codigo_origem)
      values (nextval('postos_id_seq'), nm.nome, coalesce(rv.bandeira, nm.bandeira),
        initcap(lower(rv.rua)) || coalesce(', ' || nullif(rv.numero, ''), ''), initcap(lower(rv.bairro)),
        cid, 'PR', rv.lat, rv.lng, 'anp', rv.cnpj)
      on conflict (origem, codigo_origem) do update set lat = excluded.lat, lng = excluded.lng
      returning id into pid;
    end if;
    update anp_revendas set posto_id = pid where cnpj = rv.cnpj;
    n := n + 1;
  end loop;
  perform anp_publicar();
  return n;
end $$;

-- ---------- um passo (chamado a cada minuto) ----------
create or replace function anp_passo() returns text
language plpgsql security definer set search_path = public, net as $$
declare
  est anp_estado; cfg jsonb := anp_cfg(); r record; rv anp_revendas; js jsonb; pid int; total int := 0;
  cid text; centro record; lat double precision; lng double precision; nm record; url text; i int;
begin
  select * into est from anp_estado where id = 1 for update;

  -- 1) arquivos pedidos: espera as respostas e grava
  if est.pedidos is not null then
    if (select count(*) from net._http_response where id = any(est.pedidos)) < array_length(est.pedidos, 1) then
      if now() - est.pedido_em < interval '10 minutes' then return 'aguardando arquivos'; end if;
      perform anp_status(false, 'A ANP não respondeu a tempo. Nova tentativa no próximo dia.', 0);
      update anp_estado set pedidos = null, ultima_baixa = now() where id = 1;
      return 'sem resposta';
    end if;
    for r in select status_code, content from net._http_response where id = any(est.pedidos) loop
      if r.status_code is distinct from 200 then
        perform anp_status(false, format('A ANP respondeu HTTP %s. Nova tentativa no próximo dia.', r.status_code), total);
        update anp_estado set pedidos = null, ultima_baixa = now() where id = 1;
        return 'erro http';
      end if;
      total := total + anp_gravar(r.content);
    end loop;
    total := anp_publicar();
    perform anp_status(true, null, total);
    update anp_estado set pedidos = null, ultima_baixa = now(), linhas = total where id = 1;
    return 'arquivos gravados';
  end if;

  -- 2) hora de baixar de novo?
  if est.ultima_baixa is null or now() - est.ultima_baixa > make_interval(hours => (cfg ->> 'intervalo_horas')::int) then
    update anp_estado set pedido_em = now(), pedidos = array(
      select net.http_get(url := a, headers := jsonb_build_object('User-Agent', cfg ->> 'ua'), timeout_milliseconds := 120000)
      from jsonb_array_elements_text(cfg -> 'arquivos') a) where id = 1;
    return 'arquivos pedidos';
  end if;

  -- 3) localização pendente no OpenStreetMap?
  select * into rv from anp_revendas where geo_pedido is not null limit 1;
  if found then
    select status_code, content into r from net._http_response where id = rv.geo_pedido;
    if not found then
      if now() - rv.geo_pedido_em < interval '3 minutes' then return 'aguardando mapa'; end if;
      update anp_revendas set geo_pedido = null where cnpj = rv.cnpj;
      return 'mapa sem resposta';
    end if;
    update anp_revendas set geo_pedido = null where cnpj = rv.cnpj;
    if r.status_code in (403, 429) then
      perform anp_status(false, format('OpenStreetMap recusou (HTTP %s); localização de postos pausada até amanhã.', r.status_code), 0);
      update anp_estado set ultima_baixa = now() where id = 1;
      return 'mapa recusou';
    end if;
    begin js := r.content::jsonb; exception when others then js := '[]'; end;
    cid := mp_nome_cidade(rv.municipio);
    if r.status_code = 200 and jsonb_typeof(js) = 'array' and jsonb_array_length(js) > 0 then
      lat := (js -> 0 ->> 'lat')::double precision;
      lng := (js -> 0 ->> 'lon')::double precision;
      -- só aceita se cair perto dos outros postos da cidade (ou, sem referência, se o endereço citar a cidade)
      select avg(p.lat) a_lat, avg(p.lng) a_lng, count(*) n into centro from postos p where p.cidade = cid;
      if (centro.n > 0 and abs(lat - centro.a_lat) < 0.2 and abs(lng - centro.a_lng) < 0.2)
         or (centro.n = 0 and position(anp_sem_acento(cid) in anp_sem_acento(js -> 0 ->> 'display_name')) > 0) then
        -- se já houver posto a menos de 80 m, é o mesmo: liga em vez de duplicar
        pid := anp_posto_perto(cid, lat, lng, null, null);
        if pid is null then
          select * into nm from mp_separar_nome(rv.nome);
          insert into postos (id, nome, bandeira, endereco, bairro, cidade, uf, lat, lng, origem, codigo_origem)
          values (nextval('postos_id_seq'), nm.nome, coalesce(rv.bandeira, nm.bandeira),
            initcap(lower(rv.rua)) || coalesce(', ' || nullif(rv.numero, ''), ''), initcap(lower(rv.bairro)),
            cid, 'PR', lat, lng, 'anp', rv.cnpj)
          on conflict (origem, codigo_origem) do update set lat = excluded.lat, lng = excluded.lng
          returning id into pid;
        end if;
        update anp_revendas set posto_id = pid where cnpj = rv.cnpj;
        perform anp_publicar();
        return 'posto localizado';
      end if;
    end if;
    update anp_revendas set geo_tentativas = geo_tentativas + 1 where cnpj = rv.cnpj;
    return 'endereço não encontrado';
  end if;

  -- 4) próximo posto da ANP ainda fora do mapa
  if exists (select 1 from anp_revendas a where a.posto_id is null and a.lat is not null) then
    return format('%s postos do cadastro ligados', anp_ligar_coordenadas());
  end if;
  -- primeiro os que têm preço da ANP, depois o resto do cadastro
  select * into rv from anp_revendas a where posto_id is null and geo_tentativas < 2
    order by geo_tentativas, not exists (select 1 from anp_precos p where p.cnpj = a.cnpj), municipio, cnpj limit 1;
  if not found then return 'nada a fazer'; end if;
  cid := mp_nome_cidade(rv.municipio);

  -- 4a) já existe posto no mesmo endereço (vindo do Menor Preço)? usa o mesmo
  pid := anp_posto_perto(cid, null, null, rv.rua, rv.numero);
  if pid is not null then
    update anp_revendas set posto_id = pid where cnpj = rv.cnpj;
    perform anp_publicar();
    return 'posto ligado ao existente';
  end if;

  -- 4b) busca no OpenStreetMap (2ª tentativa sem o número, para ruas sem numeração no mapa)
  url := 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br'
    || '&street=' || anp_url(trim(case when rv.geo_tentativas = 0 and anp_numero(rv.numero) is not null
                                       then anp_numero(rv.numero) || ' ' else '' end || rv.rua))
    || '&city=' || anp_url(cid) || '&state=' || anp_url('Paraná');
  update anp_revendas set geo_pedido_em = now(), geo_pedido = net.http_get(url := url,
    headers := jsonb_build_object('User-Agent', cfg ->> 'ua', 'Accept-Language', 'pt-BR'),
    timeout_milliseconds := 20000) where cnpj = rv.cnpj;
  return 'mapa pedido';
end $$;
revoke all on function anp_passo(), anp_gravar(text), anp_publicar(), anp_status(boolean, text, int), anp_ligar_coordenadas(),
  anp_posto_perto(text, double precision, double precision, text, text) from public, anon, authenticated;

-- ---------- leitura pelo app: preço da ANP vale por 21 dias, o do Menor Preço por 14 (com selo Desatualizado), os demais por 7 ----------
create or replace function api_postos(comb text, cid text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with daqui as (
    select * from postos where cid is null or cidade = cid
  ), validos as (
    select * from precos
    where coletado_em >= now() - case fonte when 'anp' then interval '21 days' when 'menor_preco' then interval '14 days' else interval '7 days' end
      and posto_id in (select id from daqui)
  ), ultimos as (
    select distinct on (posto_id) posto_id, valor, coletado_em, fonte
    from validos where combustivel = comb
    order by posto_id, coletado_em desc, valor asc
  ), resumo as (
    select combustivel, min(valor) minimo, max(valor) maximo, round(avg(valor), 3) media, count(*) postos
    from (select distinct on (posto_id, combustivel) posto_id, combustivel, valor
          from validos order by posto_id, combustivel, coletado_em desc, valor asc) x
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
        from precos where posto_id = pid
          and coletado_em >= now() - case fonte when 'anp' then interval '21 days' when 'menor_preco' then interval '14 days' else interval '7 days' end
        order by combustivel, coletado_em desc, valor asc) x), '[]'::jsonb),
    'historico', coalesce((select jsonb_agg(to_jsonb(h) order by h.dia) from (
        select combustivel, to_char(coletado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') dia, min(valor) valor
        from precos where posto_id = pid and coletado_em >= now() - interval '30 days'
        group by 1, 2) h), '[]'::jsonb));
$$;
grant execute on function api_postos(text, text), api_posto(int) to anon, authenticated;

-- ---------- agendamento: a cada minuto ----------
select cron.unschedule('anp_coleta') where exists (select 1 from cron.job where jobname = 'anp_coleta');
select cron.schedule('anp_coleta', '* * * * *', 'select anp_passo()');

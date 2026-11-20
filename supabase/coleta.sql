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
    'municipios', jsonb_build_array('TOLEDO', 'CASCAVEL', 'MARECHAL CANDIDO RONDON', 'GUARAPUAVA', 'FOZ DO IGUACU', 'UMUARAMA', 'CIANORTE', 'CAMPO MOURAO', 'PARANAVAI', 'FRANCISCO BELTRAO', 'PATO BRANCO', 'MARINGA', 'LONDRINA', 'PAICANDU', 'DOUTOR CAMARGO', 'TERRA BOA', 'JUSSARA', 'TUNEIRAS DO OESTE', 'TAPEJARA', 'CRUZEIRO DO OESTE', 'PEROBAL', 'CAFEZAL DO SUL', 'IPORA', 'FRANCISCO ALVES', 'TERRA ROXA', 'GUAIRA', 'ALTO PIQUIRI', 'ANAHY', 'ASSIS CHATEAUBRIAND', 'BOA VISTA DA APARECIDA', 'BRAGANEY', 'BRASILANDIA DO SUL', 'CAFELANDIA', 'CAMPO BONITO', 'CANTAGALO', 'CAPANEMA', 'CAPITAO LEONIDAS MARQUES', 'CATANDUVAS', 'CEU AZUL', 'CORBELIA', 'DIAMANTE D''OESTE', 'DIAMANTE DO SUL', 'ENTRE RIOS DO OESTE', 'FORMOSA DO OESTE', 'GUARANIACU', 'IBEMA', 'IGUATU', 'IRACEMA DO OESTE', 'ITAIPULANDIA', 'JESUITAS', 'LINDOESTE', 'MARIPA', 'MATELANDIA', 'MEDIANEIRA', 'MERCEDES', 'MISSAL', 'NOVA AURORA', 'NOVA SANTA ROSA', 'OURO VERDE DO OESTE', 'PALOTINA', 'PATO BRAGADO', 'QUATRO PONTES', 'QUEDAS DO IGUACU', 'RAMILANDIA', 'SANTA HELENA', 'SANTA LUCIA', 'SANTA TEREZA DO OESTE', 'SANTA TEREZINHA DE ITAIPU', 'SAO JOSE DAS PALMEIRAS', 'SAO MIGUEL DO IGUACU', 'SAO PEDRO DO IGUACU', 'SERRANOPOLIS DO IGUACU', 'TRES BARRAS DO PARANA', 'TUPASSI', 'UBIRATA', 'VERA CRUZ DO OESTE'),
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
      {"c":"Umuarama O","g":"6gcby1w","anel":true},
      {"c":"Maringá","g":"6gg4f0r"},
      {"c":"Londrina","g":"6gge7te"},
      {"c":"Cianorte","g":"6gf96un"},
      {"c":"Campo Mourão","g":"6gdz0ne"},
      {"c":"Paranavaí","g":"6gfswps"},
      {"c":"Francisco Beltrão","g":"6g678ez"},
      {"c":"Pato Branco","g":"6g6dc3n"},
      {"c":"Medianeira","g":"6g981h9"},
      {"c":"Palotina","g":"6g9tygs"},
      {"c":"Assis Chateaubriand","g":"6g9vjut"},
      {"c":"Guaíra","g":"6g9qvr7"},
      {"c":"Iguatu","g":"6gd5rur","anel":true},
      {"c":"Jesuítas","g":"6gdj31t","anel":true},
      {"c":"Cafelândia","g":"6gd5fww","anel":true},
      {"c":"Campo Bonito","g":"6gd3d4g","anel":true},
      {"c":"Capitão Leônidas Marques","g":"6g3zh3c","anel":true},
      {"c":"Céu Azul","g":"6g98yyy","anel":true},
      {"c":"Entre Rios do Oeste","g":"6g97mxk","anel":true},
      {"c":"Itaipulândia","g":"6g92ur7","anel":true},
      {"c":"Alto Piquiri","g":"6g9zrfs","anel":true},
      {"c":"Boa Vista da Aparecida","g":"6g6p2dv","anel":true},
      {"c":"Brasilândia do Sul","g":"6g9ymff","anel":true},
      {"c":"Cafezal do Sul","g":"6gcbn31","anel":true},
      {"c":"Cantagalo","g":"6g6ztu7","anel":true},
      {"c":"Capanema","g":"6g3tzx4","anel":true},
      {"c":"Catanduvas","g":"6gd0wkd","anel":true},
      {"c":"Corbélia","g":"6gd4gq9","anel":true},
      {"c":"Diamante D''Oeste","g":"6g9d0fg","anel":true},
      {"c":"Diamante do Sul","g":"6gd990z","anel":true},
      {"c":"Doutor Camargo","g":"6gfcgxr","anel":true},
      {"c":"Francisco Alves","g":"6g9xndr","anel":true},
      {"c":"Guaraniaçu","g":"6gd3jjp","anel":true},
      {"c":"Iporã","g":"6g9z3y1","anel":true},
      {"c":"Jussara","g":"6gf9w5c","anel":true},
      {"c":"Lindoeste","g":"6g9bkbs","anel":true},
      {"c":"Maripá","g":"6g9tnfw","anel":true},
      {"c":"Matelândia","g":"6g987ub","anel":true},
      {"c":"Mercedes","g":"6g9kzky","anel":true},
      {"c":"Nova Santa Rosa","g":"6g9su1x","anel":true},
      {"c":"Paiçandu","g":"6gffx9e","anel":true},
      {"c":"Quedas do Iguaçu","g":"6g6rhp4","anel":true},
      {"c":"Ramilândia","g":"6g994e0","anel":true},
      {"c":"Santa Helena","g":"6g96s5p","anel":true},
      {"c":"Santa Tereza do Oeste","g":"6g9ckp3","anel":true},
      {"c":"São José das Palmeiras","g":"6g9d9yc","anel":true},
      {"c":"São Miguel do Iguaçu","g":"6g3rv9z","anel":true},
      {"c":"Tapejara","g":"6gf2uzd","anel":true},
      {"c":"Terra Boa","g":"6gf8y91","anel":true},
      {"c":"Terra Roxa","g":"6g9w8bx","anel":true},
      {"c":"Três Barras do Paraná","g":"6g6pmu0","anel":true},
      {"c":"Tuneiras do Oeste","g":"6gf2hz1","anel":true},
      {"c":"Tupãssi","g":"6g9un7c","anel":true},
      {"c":"Ubiratã","g":"6gdk65x","anel":true}
    ]'::jsonb,
    'anel_cada', 3,
    'max_paginas', 6,
    'intervalo_ciclo_min', 55,
    'ua', 'CombustivelBarato/1.0 (+https://robsonmj.github.io/combustivel-barato/)'
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

-- nome da cidade como aparece no app (o Menor Preço e a ANP mandam em maiúsculas e sem acento)
create or replace function mp_nome_cidade(mun text) returns text language sql immutable as $$
  select case upper(coalesce(mun, ''))
    when 'ALTO PIQUIRI' then 'Alto Piquiri'
    when 'ANAHY' then 'Anahy'
    when 'ASSIS CHATEAUBRIAND' then 'Assis Chateaubriand'
    when 'BOA VISTA DA APARECIDA' then 'Boa Vista da Aparecida'
    when 'BRAGANEY' then 'Braganey'
    when 'BRASILANDIA DO SUL' then 'Brasilândia do Sul'
    when 'CAFELANDIA' then 'Cafelândia'
    when 'CAFEZAL DO SUL' then 'Cafezal do Sul'
    when 'CAMPO BONITO' then 'Campo Bonito'
    when 'CAMPO MOURAO' then 'Campo Mourão'
    when 'CANTAGALO' then 'Cantagalo'
    when 'CAPANEMA' then 'Capanema'
    when 'CAPITAO LEONIDAS MARQUES' then 'Capitão Leônidas Marques'
    when 'CASCAVEL' then 'Cascavel'
    when 'CATANDUVAS' then 'Catanduvas'
    when 'CEU AZUL' then 'Céu Azul'
    when 'CIANORTE' then 'Cianorte'
    when 'CORBELIA' then 'Corbélia'
    when 'CRUZEIRO DO OESTE' then 'Cruzeiro do Oeste'
    when 'DIAMANTE D''OESTE' then 'Diamante D''Oeste'
    when 'DIAMANTE DO SUL' then 'Diamante do Sul'
    when 'DOUTOR CAMARGO' then 'Doutor Camargo'
    when 'ENTRE RIOS DO OESTE' then 'Entre Rios do Oeste'
    when 'FORMOSA DO OESTE' then 'Formosa do Oeste'
    when 'FOZ DO IGUACU' then 'Foz do Iguaçu'
    when 'FRANCISCO ALVES' then 'Francisco Alves'
    when 'FRANCISCO BELTRAO' then 'Francisco Beltrão'
    when 'GUAIRA' then 'Guaíra'
    when 'GUARANIACU' then 'Guaraniaçu'
    when 'GUARAPUAVA' then 'Guarapuava'
    when 'IBEMA' then 'Ibema'
    when 'IGUATU' then 'Iguatu'
    when 'IPORA' then 'Iporã'
    when 'IRACEMA DO OESTE' then 'Iracema do Oeste'
    when 'ITAIPULANDIA' then 'Itaipulândia'
    when 'JESUITAS' then 'Jesuítas'
    when 'JUSSARA' then 'Jussara'
    when 'LINDOESTE' then 'Lindoeste'
    when 'LONDRINA' then 'Londrina'
    when 'MARECHAL CANDIDO RONDON' then 'Marechal Cândido Rondon'
    when 'MARINGA' then 'Maringá'
    when 'MARIPA' then 'Maripá'
    when 'MATELANDIA' then 'Matelândia'
    when 'MEDIANEIRA' then 'Medianeira'
    when 'MERCEDES' then 'Mercedes'
    when 'MISSAL' then 'Missal'
    when 'NOVA AURORA' then 'Nova Aurora'
    when 'NOVA SANTA ROSA' then 'Nova Santa Rosa'
    when 'OURO VERDE DO OESTE' then 'Ouro Verde do Oeste'
    when 'PAICANDU' then 'Paiçandu'
    when 'PALOTINA' then 'Palotina'
    when 'PARANAVAI' then 'Paranavaí'
    when 'PATO BRAGADO' then 'Pato Bragado'
    when 'PATO BRANCO' then 'Pato Branco'
    when 'PEROBAL' then 'Perobal'
    when 'QUATRO PONTES' then 'Quatro Pontes'
    when 'QUEDAS DO IGUACU' then 'Quedas do Iguaçu'
    when 'RAMILANDIA' then 'Ramilândia'
    when 'SANTA HELENA' then 'Santa Helena'
    when 'SANTA LUCIA' then 'Santa Lúcia'
    when 'SANTA TEREZA DO OESTE' then 'Santa Tereza do Oeste'
    when 'SANTA TEREZINHA DE ITAIPU' then 'Santa Terezinha de Itaipu'
    when 'SAO JOSE DAS PALMEIRAS' then 'São José das Palmeiras'
    when 'SAO MIGUEL DO IGUACU' then 'São Miguel do Iguaçu'
    when 'SAO PEDRO DO IGUACU' then 'São Pedro do Iguaçu'
    when 'SERRANOPOLIS DO IGUACU' then 'Serranópolis do Iguaçu'
    when 'TAPEJARA' then 'Tapejara'
    when 'TERRA BOA' then 'Terra Boa'
    when 'TERRA ROXA' then 'Terra Roxa'
    when 'TOLEDO' then 'Toledo'
    when 'TRES BARRAS DO PARANA' then 'Três Barras do Paraná'
    when 'TUNEIRAS DO OESTE' then 'Tuneiras do Oeste'
    when 'TUPASSI' then 'Tupãssi'
    when 'UBIRATA' then 'Ubiratã'
    when 'UMUARAMA' then 'Umuarama'
    when 'VERA CRUZ DO OESTE' then 'Vera Cruz do Oeste'
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

    select id into pid from postos
    where (origem = 'menor_preco' and codigo_origem = e ->> 'codigo') or codigo_mp = e ->> 'codigo' limit 1;
    if pid is null then
      -- posto que já veio da ANP no mesmo lugar (até 80 m) ou mesma rua e número: usa o mesmo, sem duplicar
      select p.id into pid from postos p
      where p.cidade = mp_nome_cidade(e ->> 'mun') and p.origem <> 'menor_preco' and p.codigo_mp is null
        and ((abs(p.lat - pos.lat) < 0.001 and abs(p.lng - pos.lng) < 0.001
              and sqrt(power((p.lat - pos.lat) * 111320, 2) + power((p.lng - pos.lng) * 111320 * cos(radians(pos.lat)), 2)) < 80)
          or (nullif(regexp_replace(coalesce(e ->> 'nr_logr', ''), '[^0-9]', '', 'g'), '') = anp_numero(split_part(p.endereco, ',', 2))
              and anp_rua_parecida(split_part(p.endereco, ',', 1), e ->> 'nm_logr')))
      order by power(p.lat - pos.lat, 2) + power(p.lng - pos.lng, 2) limit 1;
      if pid is not null then
        update postos set codigo_mp = e ->> 'codigo', bandeira = coalesce(bandeira, nm.bandeira) where id = pid;
      end if;
    end if;
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
language plpgsql security definer set search_path = public, net, cron as $$
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

    -- proteção da fonte: se a página vier com dados alterados (cidades inexistentes, valores absurdos), pausa a coleta
    if not mp_pagina_valida(js) then
      perform cron.unschedule('mp_coleta');
      perform mp_status(false, 'Coleta pausada: o Menor Preço voltou a devolver dados alterados para consultas automáticas. Uma verificação diária religa quando normalizar.', est.precos_ciclo);
      update mp_estado set pedido_id = null, ha_proximo = false where id = 1;
      return 'dados alterados - pausado';
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

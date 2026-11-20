-- Menor Preço: volta automática quando a fonte normalizar, cobrindo as 76 cidades do app, sem duplicar postos da ANP.
-- Desde 19/11/2026 o Menor Preço devolve dados alterados para consultas automáticas; a coleta (mp_coleta) foi pausada.
-- Este arquivo NÃO contorna nada: uma verificação por dia (mp_sentinela) faz 1 consulta comum, com o mesmo
-- User-Agent identificado; se os dados vierem normais, religa a coleta (1 consulta por minuto); se vierem alterados
-- durante a coleta, ela pausa sozinha na hora.
-- Rodar inteiro no Editor SQL do Supabase. As funções abaixo são as mesmas do coleta.sql (versão atual).

alter table postos add column if not exists codigo_mp text;
create index if not exists idx_postos_codigo_mp on postos (codigo_mp);

-- municípios do Paraná (IBGE), em maiúsculas e sem acento, para reconhecer dados alterados
create table if not exists pr_municipios (nome text primary key);
alter table pr_municipios enable row level security;
insert into pr_municipios (nome) values ('ABATIA'),('ADRIANOPOLIS'),('AGUDOS DO SUL'),('ALMIRANTE TAMANDARE'),('ALTAMIRA DO PARANA'),('ALTO PARAISO'),('ALTO PARANA'),('ALTO PIQUIRI'),('ALTONIA'),('ALVORADA DO SUL'),('AMAPORA'),('AMPERE'),('ANAHY'),('ANDIRA'),('ANGULO'),('ANTONINA'),('ANTONIO OLINTO'),('APUCARANA'),('ARAPONGAS'),('ARAPOTI'),('ARAPUA'),('ARARUNA'),('ARAUCARIA'),('ARIRANHA DO IVAI'),('ASSAI'),('ASSIS CHATEAUBRIAND'),('ASTORGA'),('ATALAIA'),('BALSA NOVA'),('BANDEIRANTES'),('BARBOSA FERRAZ'),('BARRA DO JACARE'),('BARRACAO'),('BELA VISTA DA CAROBA'),('BELA VISTA DO PARAISO'),('BITURUNA'),('BOA ESPERANCA'),('BOA ESPERANCA DO IGUACU'),('BOA VENTURA DE SAO ROQUE'),('BOA VISTA DA APARECIDA'),('BOCAIUVA DO SUL'),('BOM JESUS DO SUL'),('BOM SUCESSO'),('BOM SUCESSO DO SUL'),('BORRAZOPOLIS'),('BRAGANEY'),('BRASILANDIA DO SUL'),('CAFEARA'),('CAFELANDIA'),('CAFEZAL DO SUL'),('CALIFORNIA'),('CAMBARA'),('CAMBE'),('CAMBIRA'),('CAMPINA DA LAGOA'),('CAMPINA DO SIMAO'),('CAMPINA GRANDE DO SUL'),('CAMPO BONITO'),('CAMPO DO TENENTE'),('CAMPO LARGO'),('CAMPO MAGRO'),('CAMPO MOURAO'),('CANDIDO DE ABREU'),('CANDOI'),('CANTAGALO'),('CAPANEMA'),('CAPITAO LEONIDAS MARQUES'),('CARAMBEI'),('CARLOPOLIS'),('CASCAVEL'),('CASTRO'),('CATANDUVAS'),('CENTENARIO DO SUL'),('CERRO AZUL'),('CEU AZUL'),('CHOPINZINHO'),('CIANORTE'),('CIDADE GAUCHA'),('CLEVELANDIA'),('COLOMBO'),('COLORADO'),('CONGONHINHAS'),('CONSELHEIRO MAIRINCK'),('CONTENDA'),('CORBELIA'),('CORNELIO PROCOPIO'),('CORONEL DOMINGOS SOARES'),('CORONEL VIVIDA'),('CORUMBATAI DO SUL'),('CRUZ MACHADO'),('CRUZEIRO DO IGUACU'),('CRUZEIRO DO OESTE'),('CRUZEIRO DO SUL'),('CRUZMALTINA'),('CURITIBA'),('CURIUVA'),('DIAMANTE D''OESTE'),('DIAMANTE DO NORTE'),('DIAMANTE DO SUL'),('DOIS VIZINHOS'),('DOURADINA'),('DOUTOR CAMARGO'),('DOUTOR ULYSSES'),('ENEAS MARQUES'),('ENGENHEIRO BELTRAO'),('ENTRE RIOS DO OESTE'),('ESPERANCA NOVA'),('ESPIGAO ALTO DO IGUACU'),('FAROL'),('FAXINAL'),('FAZENDA RIO GRANDE'),('FENIX'),('FERNANDES PINHEIRO'),('FIGUEIRA'),('FLOR DA SERRA DO SUL'),('FLORAI'),('FLORESTA'),('FLORESTOPOLIS'),('FLORIDA'),('FORMOSA DO OESTE'),('FOZ DO IGUACU'),('FOZ DO JORDAO'),('FRANCISCO ALVES'),('FRANCISCO BELTRAO'),('GENERAL CARNEIRO'),('GODOY MOREIRA'),('GOIOERE'),('GOIOXIM'),('GRANDES RIOS'),('GUAIRA'),('GUAIRACA'),('GUAMIRANGA'),('GUAPIRAMA'),('GUAPOREMA'),('GUARACI'),('GUARANIACU'),('GUARAPUAVA'),('GUARAQUECABA'),('GUARATUBA'),('HONORIO SERPA'),('IBAITI'),('IBEMA'),('IBIPORA'),('ICARAIMA'),('IGUARACU'),('IGUATU'),('IMBAU'),('IMBITUVA'),('INACIO MARTINS'),('INAJA'),('INDIANOPOLIS'),('IPIRANGA'),('IPORA'),('IRACEMA DO OESTE'),('IRATI'),('IRETAMA'),('ITAGUAJE'),('ITAIPULANDIA'),('ITAMBARACA'),('ITAMBE'),('ITAPEJARA D''OESTE'),('ITAPERUCU'),('ITAUNA DO SUL'),('IVAI'),('IVAIPORA'),('IVATE'),('IVATUBA'),('JABOTI'),('JACAREZINHO'),('JAGUAPITA'),('JAGUARIAIVA'),('JANDAIA DO SUL'),('JANIOPOLIS'),('JAPIRA'),('JAPURA'),('JARDIM ALEGRE'),('JARDIM OLINDA'),('JATAIZINHO'),('JESUITAS'),('JOAQUIM TAVORA'),('JUNDIAI DO SUL'),('JURANDA'),('JUSSARA'),('KALORE'),('LAPA'),('LARANJAL'),('LARANJEIRAS DO SUL'),('LEOPOLIS'),('LIDIANOPOLIS'),('LINDOESTE'),('LOANDA'),('LOBATO'),('LONDRINA'),('LUIZIANA'),('LUNARDELLI'),('LUPIONOPOLIS'),('MALLET'),('MAMBORE'),('MANDAGUACU'),('MANDAGUARI'),('MANDIRITUBA'),('MANFRINOPOLIS'),('MANGUEIRINHA'),('MANOEL RIBAS'),('MARECHAL CANDIDO RONDON'),('MARIA HELENA'),('MARIALVA'),('MARILANDIA DO SUL'),('MARILENA'),('MARILUZ'),('MARINGA'),('MARIOPOLIS'),('MARIPA'),('MARMELEIRO'),('MARQUINHO'),('MARUMBI'),('MATELANDIA'),('MATINHOS'),('MATO RICO'),('MAUA DA SERRA'),('MEDIANEIRA'),('MERCEDES'),('MIRADOR'),('MIRASELVA'),('MISSAL'),('MOREIRA SALES'),('MORRETES'),('MUNHOZ DE MELO'),('NOSSA SENHORA DAS GRACAS'),('NOVA ALIANCA DO IVAI'),('NOVA AMERICA DA COLINA'),('NOVA AURORA'),('NOVA CANTU'),('NOVA ESPERANCA'),('NOVA ESPERANCA DO SUDOESTE'),('NOVA FATIMA'),('NOVA LARANJEIRAS'),('NOVA LONDRINA'),('NOVA OLIMPIA'),('NOVA PRATA DO IGUACU'),('NOVA SANTA BARBARA'),('NOVA SANTA ROSA'),('NOVA TEBAS'),('NOVO ITACOLOMI'),('ORTIGUEIRA'),('OURIZONA'),('OURO VERDE DO OESTE'),('PAICANDU'),('PALMAS'),('PALMEIRA'),('PALMITAL'),('PALOTINA'),('PARAISO DO NORTE'),('PARANACITY'),('PARANAGUA'),('PARANAPOEMA'),('PARANAVAI'),('PATO BRAGADO'),('PATO BRANCO'),('PAULA FREITAS'),('PAULO FRONTIN'),('PEABIRU'),('PEROBAL'),('PEROLA'),('PEROLA D''OESTE'),('PIEN'),('PINHAIS'),('PINHAL DE SAO BENTO'),('PINHALAO'),('PINHAO'),('PIRAI DO SUL'),('PIRAQUARA'),('PITANGA'),('PITANGUEIRAS'),('PLANALTINA DO PARANA'),('PLANALTO'),('PONTA GROSSA'),('PONTAL DO PARANA'),('PORECATU'),('PORTO AMAZONAS'),('PORTO BARREIRO'),('PORTO RICO'),('PORTO VITORIA'),('PRADO FERREIRA'),('PRANCHITA'),('PRESIDENTE CASTELO BRANCO'),('PRIMEIRO DE MAIO'),('PRUDENTOPOLIS'),('QUARTO CENTENARIO'),('QUATIGUA'),('QUATRO BARRAS'),('QUATRO PONTES'),('QUEDAS DO IGUACU'),('QUERENCIA DO NORTE'),('QUINTA DO SOL'),('QUITANDINHA'),('RAMILANDIA'),('RANCHO ALEGRE'),('RANCHO ALEGRE D''OESTE'),('REALEZA'),('REBOUCAS'),('RENASCENCA'),('RESERVA'),('RESERVA DO IGUACU'),('RIBEIRAO CLARO'),('RIBEIRAO DO PINHAL'),('RIO AZUL'),('RIO BOM'),('RIO BONITO DO IGUACU'),('RIO BRANCO DO IVAI'),('RIO BRANCO DO SUL'),('RIO NEGRO'),('ROLANDIA'),('RONCADOR'),('RONDON'),('ROSARIO DO IVAI'),('SABAUDIA'),('SALGADO FILHO'),('SALTO DO ITARARE'),('SALTO DO LONTRA'),('SANTA AMELIA'),('SANTA CECILIA DO PAVAO'),('SANTA CRUZ DE MONTE CASTELO'),('SANTA FE'),('SANTA HELENA'),('SANTA INES'),('SANTA ISABEL DO IVAI'),('SANTA IZABEL DO OESTE'),('SANTA LUCIA'),('SANTA MARIA DO OESTE'),('SANTA MARIANA'),('SANTA MONICA'),('SANTA TEREZA DO OESTE'),('SANTA TEREZINHA DE ITAIPU'),('SANTANA DO ITARARE'),('SANTO ANTONIO DA PLATINA'),('SANTO ANTONIO DO CAIUA'),('SANTO ANTONIO DO PARAISO'),('SANTO ANTONIO DO SUDOESTE'),('SANTO INACIO'),('SAO CARLOS DO IVAI'),('SAO JERONIMO DA SERRA'),('SAO JOAO'),('SAO JOAO DO CAIUA'),('SAO JOAO DO IVAI'),('SAO JOAO DO TRIUNFO'),('SAO JORGE D''OESTE'),('SAO JORGE DO IVAI'),('SAO JORGE DO PATROCINIO'),('SAO JOSE DA BOA VISTA'),('SAO JOSE DAS PALMEIRAS'),('SAO JOSE DOS PINHAIS'),('SAO MANOEL DO PARANA'),('SAO MATEUS DO SUL'),('SAO MIGUEL DO IGUACU'),('SAO PEDRO DO IGUACU'),('SAO PEDRO DO IVAI'),('SAO PEDRO DO PARANA'),('SAO SEBASTIAO DA AMOREIRA'),('SAO TOME'),('SAPOPEMA'),('SARANDI'),('SAUDADE DO IGUACU'),('SENGES'),('SERRANOPOLIS DO IGUACU'),('SERTANEJA'),('SERTANOPOLIS'),('SIQUEIRA CAMPOS'),('SULINA'),('TAMARANA'),('TAMBOARA'),('TAPEJARA'),('TAPIRA'),('TEIXEIRA SOARES'),('TELEMACO BORBA'),('TERRA BOA'),('TERRA RICA'),('TERRA ROXA'),('TIBAGI'),('TIJUCAS DO SUL'),('TOLEDO'),('TOMAZINA'),('TRES BARRAS DO PARANA'),('TUNAS DO PARANA'),('TUNEIRAS DO OESTE'),('TUPASSI'),('TURVO'),('UBIRATA'),('UMUARAMA'),('UNIAO DA VITORIA'),('UNIFLOR'),('URAI'),('VENTANIA'),('VERA CRUZ DO OESTE'),('VERE'),('VIRMOND'),('VITORINO'),('WENCESLAU BRAZ'),('XAMBRE') on conflict do nothing;

-- a página parece normal? (cidade do Paraná que existe e preço entre R$ 2 e R$ 15 em pelo menos `minimo` dos itens)
create or replace function mp_pagina_valida(js jsonb, minimo numeric default 0.5) returns boolean language sql stable as $$
  select case when n < 5 then true else ok::numeric / n >= minimo end from (
    select count(*) n, count(*) filter (where
      exists (select 1 from pr_municipios m where m.nome = upper(coalesce(it -> 'estabelecimento' ->> 'mun', '')))
      and case when (it ->> 'valor') ~ '^[0-9]+(\.[0-9]+)?$' then (it ->> 'valor')::numeric between 2 and 15 else false end) ok
    from jsonb_array_elements(coalesce(js -> 'produtos', '[]'::jsonb)) it) x;
$$;

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
revoke all on function mp_gravar_pagina(jsonb, int), mp_pagina_valida(jsonb, numeric) from public, anon, authenticated;

-- ---------- verificação diária ----------
create table if not exists mp_sentinela (
  id                 int primary key default 1 check (id = 1),
  pedido_id          bigint,
  pedido_em          timestamptz,
  ultima_verificacao timestamptz,
  resultado          text
);
insert into mp_sentinela (id) values (1) on conflict do nothing;
alter table mp_sentinela enable row level security;

create or replace function mp_sentinela_passo() returns text
language plpgsql security definer set search_path = public, net, cron as $$
declare st mp_sentinela; r record; js jsonb; ativo boolean; res text; cfg jsonb := mp_cfg();
begin
  select * into st from mp_sentinela where id = 1 for update;
  ativo := exists (select 1 from cron.job where jobname = 'mp_coleta');

  if st.pedido_id is not null then
    select status_code, content into r from net._http_response where id = st.pedido_id;
    if not found then
      if now() - st.pedido_em < interval '5 minutes' then return 'aguardando'; end if;
      update mp_sentinela set pedido_id = null, ultima_verificacao = now(), resultado = 'sem resposta' where id = 1;
      return 'sem resposta';
    end if;
    begin js := r.content::jsonb; exception when others then js := null; end;
    if r.status_code = 200 and jsonb_typeof(js -> 'produtos') = 'array' and jsonb_array_length(js -> 'produtos') >= 10
       and mp_pagina_valida(js, 0.8) then
      res := 'dados normais';
      if not ativo then
        perform cron.schedule('mp_coleta', '* * * * *', 'select mp_passo()');
        perform mp_status(true, null, 0);
        res := 'dados normais: coleta religada';
      end if;
    else
      res := format('dados alterados ou recusa (HTTP %s)', r.status_code);
      if ativo then
        perform cron.unschedule('mp_coleta');
        perform mp_status(false, 'Coleta pausada: o Menor Preço está devolvendo dados alterados para consultas automáticas. Uma verificação diária religa quando normalizar.', 0);
      end if;
    end if;
    update mp_sentinela set pedido_id = null, ultima_verificacao = now(), resultado = res where id = 1;
    return res;
  end if;

  -- 1 verificação por dia com a coleta parada; a cada 6 h com ela ligada (é só mais 1 consulta)
  if st.ultima_verificacao is null
     or now() - st.ultima_verificacao > case when ativo then interval '6 hours' else interval '23 hours' end then
    update mp_sentinela set pedido_em = now(), pedido_id = net.http_get(
      url := format('%s/produtos?local=%s&tp_comb=1&raio=%s&data=-1', cfg ->> 'base', cfg -> 'pontos' -> 0 ->> 'g', cfg ->> 'raio'),
      headers := jsonb_build_object('User-Agent', cfg ->> 'ua', 'Accept', 'application/json'),
      timeout_milliseconds := 20000) where id = 1;
    return 'verificação enviada';
  end if;
  return 'nada a fazer';
end $$;
revoke all on function mp_sentinela_passo() from public, anon, authenticated;

select cron.unschedule('mp_sentinela') where exists (select 1 from cron.job where jobname = 'mp_sentinela');
select cron.schedule('mp_sentinela', '*/10 * * * *', 'select mp_sentinela_passo()');

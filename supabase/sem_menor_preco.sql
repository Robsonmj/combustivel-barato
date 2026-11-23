-- 23/11/2026: a SEFA-PR indeferiu o pedido de acesso aos dados do Menor Preço (protocolo 215054/2026)
-- e informou que não autoriza coleta automatizada, replicação, armazenamento ou redistribuição desses dados.
-- Este arquivo: (1) desliga de vez a coleta e a checagem diária do Menor Preço;
-- (2) faz o app parar de mostrar qualquer preço com fonte 'menor_preco' (inclusive no histórico e no "Melhor dia").
-- NÃO rodar de novo coleta.sql nem menor_preco_volta.sql: eles religariam a coleta.

-- (1) tarefas automáticas
select cron.unschedule('mp_sentinela') where exists (select 1 from cron.job where jobname = 'mp_sentinela');
select cron.unschedule('mp_coleta') where exists (select 1 from cron.job where jobname = 'mp_coleta');

-- (2) leitura do app sem o Menor Preço
create or replace function api_postos(comb text, cid text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with daqui as (
    select * from postos where cid is null or cidade = cid
  ), validos as (
    select * from precos
    where fonte <> 'menor_preco'
      and coletado_em >= now() - case fonte when 'anp' then interval '21 days' else interval '7 days' end
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
    'status', coalesce((select jsonb_agg(to_jsonb(s)) from fontes_status s where s.fonte <> 'menor_preco'), '[]'::jsonb));
$$;

create or replace function api_posto(pid int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posto', (select to_jsonb(p) - 'codigo_origem' - 'codigo_mp' from postos p where p.id = pid),
    'precos', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select distinct on (combustivel) combustivel, valor, coletado_em, fonte, descricao
        from precos where posto_id = pid and fonte <> 'menor_preco'
          and coletado_em >= now() - case fonte when 'anp' then interval '21 days' else interval '7 days' end
        order by combustivel, coletado_em desc, valor asc) x), '[]'::jsonb),
    'historico', coalesce((select jsonb_agg(to_jsonb(h) order by h.dia) from (
        select combustivel, to_char(coletado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') dia, min(valor) valor
        from precos where posto_id = pid and fonte <> 'menor_preco' and coletado_em >= now() - interval '30 days'
        group by 1, 2) h), '[]'::jsonb));
$$;

-- "Melhor dia para abastecer", refeito sem o Menor Preço:
--  * dia da semana: só com preços informados por postos e motoristas (a ANP pesquisa postos diferentes em
--    dias diferentes, o que distorceria a comparação entre dias);
--  * semanas: média semanal da cidade (ANP + postos + motoristas) das últimas 8 semanas, para mostrar se subiu ou caiu.
create or replace function api_tendencia(comb text, cid text) returns jsonb
language sql stable security definer set search_path = public as $$
  with daqui as (
    select pr.coletado_em, pr.valor, pr.fonte
    from precos pr join postos p on p.id = pr.posto_id
    where pr.combustivel = comb and p.cidade = cid and pr.fonte <> 'menor_preco'
      and pr.coletado_em >= now() - interval '63 days'
  ), diario as (
    select (coletado_em at time zone 'America/Sao_Paulo')::date dia, avg(valor) media
    from daqui where fonte in ('usuario', 'posto')
    group by 1
  ), comparado as (
    select dia, media,
           media - avg(media) over (order by dia rows between 3 preceding and 3 following) desvio
    from diario
  ), semana as (
    select extract(isodow from dia)::int dow, round(avg(desvio), 3) desvio, count(*) dias
    from comparado group by 1
  ), semanas as (
    select date_trunc('week', coletado_em at time zone 'America/Sao_Paulo')::date inicio,
           round(avg(valor), 3) media, count(*) precos
    from daqui where coletado_em >= now() - interval '56 days'
    group by 1
  )
  select jsonb_build_object(
    'combustivel', comb,
    'cidade', cid,
    'dias_com_dados', (select count(*) from diario),
    'semana', coalesce((select jsonb_agg(to_jsonb(semana) order by dow) from semana), '[]'::jsonb),
    'semanas', coalesce((select jsonb_agg(to_jsonb(semanas) order by inicio) from semanas), '[]'::jsonb),
    'ultimos7', (select round(avg(media), 3) from diario where dia > current_date - 7),
    'anteriores7', (select round(avg(media), 3) from diario where dia <= current_date - 7 and dia > current_date - 14)
  );
$$;
grant execute on function api_postos(text, text), api_posto(int), api_tendencia(text, text) to anon, authenticated;

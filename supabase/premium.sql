-- Recursos premium do app: "Melhor dia para abastecer" e cupons dos postos parceiros.
-- Pode rodar de novo sem problema (tudo usa "if not exists" / "or replace").

-- ---------- melhor dia para abastecer ----------
-- Para cada dia, o preço médio das notas da cidade. Cada dia é comparado com a média da semana em volta
-- (3 dias antes e 3 depois), assim uma alta ou queda geral não distorce o resultado do dia da semana.
-- dow: 1 = segunda ... 7 = domingo. desvio em R$ por litro (negativo = mais barato que a semana).
create or replace function api_tendencia(comb text, cid text) returns jsonb
language sql stable security definer set search_path = public as $$
  with diario as (
    select (pr.coletado_em at time zone 'America/Sao_Paulo')::date dia, avg(pr.valor) media
    from precos pr join postos p on p.id = pr.posto_id
    where pr.combustivel = comb and p.cidade = cid
      and pr.coletado_em >= now() - interval '63 days'
    group by 1
  ), comparado as (
    select dia, media,
           media - avg(media) over (order by dia rows between 3 preceding and 3 following) desvio
    from diario
  ), semana as (
    select extract(isodow from dia)::int dow, round(avg(desvio), 3) desvio, count(*) dias
    from comparado group by 1
  )
  select jsonb_build_object(
    'combustivel', comb,
    'cidade', cid,
    'dias_com_dados', (select count(*) from diario),
    'semana', coalesce((select jsonb_agg(to_jsonb(semana) order by dow) from semana), '[]'::jsonb),
    'ultimos7', (select round(avg(media), 3) from diario where dia > current_date - 7),
    'anteriores7', (select round(avg(media), 3) from diario where dia <= current_date - 7 and dia > current_date - 14)
  );
$$;
grant execute on function api_tendencia(text, text) to anon, authenticated;

-- ---------- cupons dos postos parceiros ----------
create table if not exists cupons (
  id         bigint generated always as identity primary key,
  posto_id   int not null,
  posto_nome text,
  texto      text not null,
  codigo     text,
  ativo_ate  date not null,
  criado_em  timestamptz not null default now()
);
create index if not exists idx_cupons_posto on cupons (posto_id);
alter table cupons enable row level security;
drop policy if exists "todos leem cupons" on cupons;
create policy "todos leem cupons" on cupons for select using (true);
drop policy if exists "admin gerencia cupons" on cupons;
create policy "admin gerencia cupons" on cupons for all using (is_admin()) with check (is_admin());
grant select on cupons to anon, authenticated;
grant insert, update, delete on cupons to authenticated;

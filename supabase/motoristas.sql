-- Preço informado por motorista (botão "O preço mudou? Informe aqui" no app).
-- Ajuda a preencher os postos sem preço recente enquanto o Menor Preço está em pausa.
-- Travas: faixa de valor, até 25% de diferença da mediana da cidade, limite de envios por aparelho/rede
-- (o IP vira um código embaralhado com a data do dia e não é guardado), e o preço vale só 7 dias.
-- Rodar inteiro no Editor SQL do Supabase.

create table if not exists precos_informados (
  id           bigint generated always as identity primary key,
  posto_id     int not null references postos(id),
  combustivel  text not null,
  valor        numeric(6,3) not null,
  chave_nfce   text,
  origem_hash  text not null,
  criado_em    timestamptz not null default now()
);
create index if not exists idx_informados_origem on precos_informados (origem_hash, criado_em);
alter table precos_informados enable row level security;  -- ninguém lê pela internet

create or replace function informar_preco(pid int, comb text, valor numeric, chave text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  cid text; med numeric; ip text; h text; ch text := regexp_replace(coalesce(chave, ''), '[^0-9]', '', 'g');
begin
  select cidade into cid from postos where id = pid;
  if cid is null then raise exception 'Posto não encontrado.'; end if;
  if comb not in ('gasolina', 'gasolina_aditivada', 'etanol', 'diesel', 'diesel_s10', 'gnv') then
    raise exception 'Combustível inválido.'; end if;
  if valor is null or valor < 2 or valor > 15 then raise exception 'Confira o preço: use o valor por litro, por exemplo 6,29.'; end if;
  if ch <> '' and (length(ch) <> 44 or left(ch, 2) <> '41') then
    raise exception 'A chave da NFC-e tem 44 números e começa com 41 (Paraná). Deixe em branco se não tiver.'; end if;

  ip := trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', 'sem-ip'), ',', 1));
  h := encode(digest(ip || '|' || current_date::text || '|combustivel-barato', 'sha256'), 'hex');
  if (select count(*) from precos_informados where origem_hash = h and criado_em > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos envios em pouco tempo. Tente de novo mais tarde.'; end if;
  if exists (select 1 from precos_informados where origem_hash = h and posto_id = pid and combustivel = comb
             and criado_em > now() - interval '30 minutes') then
    raise exception 'Você já informou este preço há pouco. Obrigado!'; end if;

  -- compara com os outros postos da cidade (preços dos últimos 14 dias)
  select percentile_cont(0.5) within group (order by u.valor) into med from (
    select distinct on (p.posto_id) p.valor from precos p join postos o on o.id = p.posto_id
    where o.cidade = cid and p.combustivel = comb and p.coletado_em > now() - interval '14 days'
    order by p.posto_id, p.coletado_em desc) u;
  if med is not null and abs(valor - med) / med > 0.25 then
    raise exception 'Esse preço está muito diferente dos outros postos da cidade (perto de R$ %). Confira o valor.',
      replace(to_char(med, 'FM90.00'), '.', ','); end if;

  insert into precos_informados (posto_id, combustivel, valor, chave_nfce, origem_hash) values (pid, comb, valor, nullif(ch, ''), h);
  insert into precos (posto_id, combustivel, valor, coletado_em, fonte, descricao)
  values (pid, comb, round(valor, 3), now(), 'usuario',
          case when ch <> '' then 'Informado por motorista (com cupom NFC-e)' else 'Informado por motorista' end)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function informar_preco(int, text, numeric, text) from public;
grant execute on function informar_preco(int, text, numeric, text) to anon, authenticated;

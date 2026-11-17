-- Banco do painel do posto, destaques e patrocínios (Supabase / Postgres).
-- Como usar: Supabase > SQL Editor > cole este arquivo inteiro > Run.
-- Depois rode, trocando pelo SEU e-mail (o que você vai usar para entrar no painel de administração):
--   insert into admins (email) values ('seu-email@exemplo.com');

-- ---------- administradores ----------
create table if not exists admins (
  email text primary key
);
alter table admins enable row level security; -- ninguém lê pela internet

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- ---------- donos de posto (pedido de acesso, aprovado pelo administrador) ----------
create table if not exists postos_dono (
  id          bigint generated always as identity primary key,
  posto_id    int not null,
  posto_nome  text,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  email       text default (auth.jwt() ->> 'email'),
  responsavel text not null,
  telefone    text not null,
  cnpj        text,
  status      text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  criado_em   timestamptz not null default now(),
  unique (posto_id, user_id)
);
alter table postos_dono enable row level security;

create or replace function dono_aprovado(p int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from postos_dono where posto_id = p and user_id = auth.uid() and status = 'aprovado');
$$;

drop policy if exists "dono ve os seus" on postos_dono;
create policy "dono ve os seus" on postos_dono for select using (user_id = auth.uid() or is_admin());
drop policy if exists "dono pede acesso" on postos_dono;
create policy "dono pede acesso" on postos_dono for insert to authenticated
  with check (user_id = auth.uid() and status = 'pendente');
drop policy if exists "admin aprova" on postos_dono;
create policy "admin aprova" on postos_dono for update using (is_admin());
drop policy if exists "admin apaga" on postos_dono;
create policy "admin apaga" on postos_dono for delete using (is_admin());

-- ---------- preços informados pelo posto ----------
create table if not exists precos_posto (
  id           bigint generated always as identity primary key,
  posto_id     int not null,
  combustivel  text not null check (combustivel in ('gasolina','gasolina_aditivada','etanol','diesel','diesel_s10','gnv')),
  valor        numeric(6,3) not null check (valor between 1 and 20),
  informado_em timestamptz not null default now(),
  user_id      uuid not null default auth.uid()
);
create index if not exists idx_precos_posto on precos_posto (posto_id, combustivel, informado_em desc);
alter table precos_posto enable row level security;
drop policy if exists "todos leem precos" on precos_posto;
create policy "todos leem precos" on precos_posto for select using (true);
drop policy if exists "dono informa preco" on precos_posto;
create policy "dono informa preco" on precos_posto for insert to authenticated
  with check (user_id = auth.uid() and dono_aprovado(posto_id));

-- último preço de cada posto/combustível (últimos 7 dias)
create or replace view precos_posto_atuais with (security_invoker = on) as
  select distinct on (posto_id, combustivel) posto_id, combustivel, valor, informado_em
  from precos_posto
  where informado_em > now() - interval '7 days'
  order by posto_id, combustivel, informado_em desc;

-- ---------- promoção do posto (aparece só para postos com destaque ativo) ----------
create table if not exists promocoes (
  posto_id      int primary key,
  texto         text check (char_length(texto) <= 140),
  atualizado_em timestamptz not null default now()
);
alter table promocoes enable row level security;
drop policy if exists "todos leem promocoes" on promocoes;
create policy "todos leem promocoes" on promocoes for select using (true);
drop policy if exists "dono cria promocao" on promocoes;
create policy "dono cria promocao" on promocoes for insert to authenticated with check (dono_aprovado(posto_id));
drop policy if exists "dono edita promocao" on promocoes;
create policy "dono edita promocao" on promocoes for update to authenticated using (dono_aprovado(posto_id));

-- ---------- destaques pagos (controlados pelo administrador) ----------
create table if not exists destaques (
  posto_id   int primary key,
  posto_nome text,
  ativo_ate  date not null,
  observacao text
);
alter table destaques enable row level security;
drop policy if exists "todos leem destaques" on destaques;
create policy "todos leem destaques" on destaques for select using (true);
drop policy if exists "admin gerencia destaques" on destaques;
create policy "admin gerencia destaques" on destaques for all using (is_admin()) with check (is_admin());

-- ---------- patrocinadores (faixa no app) ----------
create table if not exists patrocinios (
  id        bigint generated always as identity primary key,
  nome      text not null,
  texto     text not null check (char_length(texto) <= 120),
  link      text,
  ativo_ate date not null,
  ordem     int not null default 0
);
alter table patrocinios enable row level security;
drop policy if exists "todos leem patrocinios" on patrocinios;
create policy "todos leem patrocinios" on patrocinios for select using (true);
drop policy if exists "admin gerencia patrocinios" on patrocinios;
create policy "admin gerencia patrocinios" on patrocinios for all using (is_admin()) with check (is_admin());

-- ---------- exclusão da própria conta (exigência da Google Play) ----------
create or replace function excluir_minha_conta() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  delete from precos_posto where user_id = auth.uid();
  delete from postos_dono where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function excluir_minha_conta() from public, anon;
grant execute on function excluir_minha_conta() to authenticated;
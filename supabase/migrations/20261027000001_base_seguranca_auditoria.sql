-- =============================================================================
-- Base: perfis de usuário, papéis, funções de autorização e auditoria genérica
-- =============================================================================

create extension if not exists pgcrypto;

create type public.papel_usuario as enum ('admin', 'operador', 'leitor');

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- -----------------------------------------------------------------------------
create table public.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text not null default '',
  email         text,
  papel         public.papel_usuario not null default 'leitor',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.perfis is 'Perfil e papel de cada usuário autenticado.';

-- Cria o perfil automaticamente. O primeiro usuário do sistema vira admin;
-- os demais entram como leitor até um admin alterar o papel.
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel public.papel_usuario;
begin
  if not exists (select 1 from public.perfis) then
    v_papel := 'admin';
  else
    v_papel := 'leitor';
  end if;

  insert into public.perfis (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    new.email,
    v_papel
  );
  return new;
end;
$$;

create trigger trg_auth_users_criar_perfil
after insert on auth.users
for each row execute function public.criar_perfil_novo_usuario();

-- -----------------------------------------------------------------------------
-- Funções de autorização (usadas pelas políticas RLS)
-- -----------------------------------------------------------------------------
create or replace function public.papel_atual()
returns public.papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.pode_ler()
returns boolean
language sql
stable
as $$
  select public.papel_atual() is not null
$$;

create or replace function public.pode_editar()
returns boolean
language sql
stable
as $$
  select public.papel_atual() in ('admin', 'operador')
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
as $$
  select public.papel_atual() = 'admin'
$$;

-- Data corrente no fuso de Brasília (todas as regras de vencimento usam esta data)
create or replace function public.hoje_br()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- -----------------------------------------------------------------------------
-- Colunas de controle padrão
-- -----------------------------------------------------------------------------
create or replace function public.definir_colunas_controle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_em := coalesce(new.criado_em, now());
    new.criado_por := coalesce(new.criado_por, auth.uid());
  else
    new.criado_em := old.criado_em;
    new.criado_por := old.criado_por;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create or replace function public.definir_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger trg_perfis_atualizado_em
before update on public.perfis
for each row execute function public.definir_atualizado_em();

-- -----------------------------------------------------------------------------
-- Auditoria genérica
-- -----------------------------------------------------------------------------
create table public.auditoria (
  id           bigint generated always as identity primary key,
  tabela       text not null,
  registro_id  uuid,
  acao         text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  dados_antes  jsonb,
  dados_depois jsonb,
  usuario_id   uuid default auth.uid(),
  criado_em    timestamptz not null default now()
);

create index idx_auditoria_registro on public.auditoria (tabela, registro_id);
create index idx_auditoria_criado_em on public.auditoria (criado_em desc);

comment on table public.auditoria is 'Histórico imutável de alterações relevantes. Preenchido apenas por trigger.';

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes  jsonb;
  v_depois jsonb;
  v_id     uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_antes := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_depois := to_jsonb(new);
  end if;

  -- Ignora UPDATEs sem mudança efetiva (além de atualizado_em)
  if tg_op = 'UPDATE' and (v_antes - 'atualizado_em') = (v_depois - 'atualizado_em') then
    return new;
  end if;

  v_id := coalesce((v_depois ->> 'id'), (v_antes ->> 'id'))::uuid;

  insert into public.auditoria (tabela, registro_id, acao, dados_antes, dados_depois, usuario_id)
  values (tg_table_name, v_id, tg_op, v_antes, v_depois, auth.uid());

  return coalesce(new, old);
end;
$$;

create trigger trg_perfis_auditoria
after insert or update or delete on public.perfis
for each row execute function public.registrar_auditoria();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.auditoria enable row level security;

create policy perfis_select on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.eh_admin());

create policy perfis_update_admin on public.perfis
  for update to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

create policy auditoria_select_admin on public.auditoria
  for select to authenticated
  using (public.eh_admin());

-- Nenhuma política de insert/update/delete em auditoria: só o trigger grava.
revoke insert, update, delete on public.auditoria from authenticated, anon;

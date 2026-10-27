-- =============================================================================
-- Etapa 6 — Protocolos GOV (controle manual), documentos e movimentações
--
-- Regras confirmadas:
--   * Controle MANUAL dos protocolos no GOV (sem integração automática).
--   * Status do protocolo configuráveis pelo admin (tabela, não enum).
--   * NUPE em texto livre.
--   * Um processo pode ter vários protocolos e um protocolo pode abranger
--     vários processos (relação N:N).
--   * O responsável pelo protocolo é sempre um usuário do sistema.
--   * Documentos em bucket PRIVADO; download apenas por URL assinada temporária.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funções auxiliares de formatação (texto das movimentações)
-- -----------------------------------------------------------------------------
create or replace function public.fmt_brl(v numeric)
returns text
language sql
immutable
as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,990.00'), ',.', '.,')
$$;

create or replace function public.fmt_data(d date)
returns text
language sql
immutable
as $$
  select coalesce(to_char(d, 'DD/MM/YYYY'), '—')
$$;

-- Nome de um usuário (perfis tem RLS restrita; aqui só se expõe o nome)
create or replace function public.nome_usuario(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when public.pode_ler() then (select coalesce(nullif(nome, ''), email) from public.perfis where id = p_id) end
$$;

-- Usuários ativos, para escolher o responsável pelo protocolo
create or replace function public.listar_usuarios_ativos()
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(p.nome, ''), p.email)
  from public.perfis p
  where p.ativo and public.pode_ler()
  order by 2
$$;

-- -----------------------------------------------------------------------------
-- Status de protocolo (configuráveis)
-- -----------------------------------------------------------------------------
create table public.status_protocolo (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique check (length(trim(nome)) > 0),
  ordem         int  not null default 0,
  pendente      boolean not null default true,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  criado_por    uuid references auth.users (id),
  atualizado_em timestamptz not null default now()
);

comment on table public.status_protocolo is 'Status do protocolo no GOV. Lista mantida pelo admin.';
comment on column public.status_protocolo.pendente is 'Se verdadeiro, o protocolo conta como pendente no painel.';

-- Ponto de partida neutro; o admin ajusta conforme o fluxo real do GOV.
insert into public.status_protocolo (nome, ordem, pendente) values
  ('A protocolar', 10, true),
  ('Protocolado', 20, false);

-- -----------------------------------------------------------------------------
-- Protocolos e vínculo N:N com processos
-- -----------------------------------------------------------------------------
create sequence public.seq_codigo_protocolo;

create table public.protocolos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique default (
                   'PRT-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' ||
                   lpad(nextval('public.seq_codigo_protocolo')::text, 4, '0')
                 ),
  nupe           text,
  data_protocolo date,
  status_id      uuid not null references public.status_protocolo (id),
  responsavel_id uuid not null references public.perfis (id),
  assunto        text,
  observacoes    text,
  excluido_em    timestamptz,
  criado_em      timestamptz not null default now(),
  criado_por     uuid references auth.users (id),
  atualizado_em  timestamptz not null default now()
);

comment on column public.protocolos.nupe is 'Número NUPE do GOV (texto livre).';

create unique index uq_protocolos_nupe on public.protocolos (nupe)
  where nupe is not null and excluido_em is null;
create index idx_protocolos_status on public.protocolos (status_id) where excluido_em is null;
create index idx_protocolos_responsavel on public.protocolos (responsavel_id) where excluido_em is null;

create table public.protocolo_processos (
  id           uuid primary key default gen_random_uuid(),
  protocolo_id uuid not null references public.protocolos (id) on delete cascade,
  processo_id  uuid not null references public.processos (id),
  criado_em    timestamptz not null default now(),
  criado_por   uuid references auth.users (id) default auth.uid(),
  unique (protocolo_id, processo_id)
);

create index idx_protocolo_processos_processo on public.protocolo_processos (processo_id);

-- -----------------------------------------------------------------------------
-- Documentos (metadados; o arquivo fica no bucket privado "documentos")
-- -----------------------------------------------------------------------------
create type public.tipo_documento as enum (
  'ata_audiencia', 'sentenca', 'planilha_acordo', 'comprovante_protocolo', 'complementar'
);

create table public.documentos (
  id             uuid primary key default gen_random_uuid(),
  processo_id    uuid references public.processos (id),
  protocolo_id   uuid references public.protocolos (id),
  tipo           public.tipo_documento not null,
  descricao      text,
  nome_arquivo   text not null check (length(trim(nome_arquivo)) > 0),
  storage_path   text not null unique,
  mime_type      text,
  tamanho_bytes  bigint check (tamanho_bytes >= 0),
  excluido_em    timestamptz,
  motivo_exclusao text,
  criado_em      timestamptz not null default now(),
  criado_por     uuid references auth.users (id),
  atualizado_em  timestamptz not null default now(),
  constraint ck_documento_vinculo check ((processo_id is null) <> (protocolo_id is null)),
  constraint ck_documento_path check (
    (processo_id is not null and storage_path like 'processos/' || processo_id::text || '/%') or
    (protocolo_id is not null and storage_path like 'protocolos/' || protocolo_id::text || '/%')
  )
);

comment on table public.documentos is 'Documentos anexos a um processo ou a um protocolo (que pode abranger vários processos).';

create index idx_documentos_processo on public.documentos (processo_id) where excluido_em is null;
create index idx_documentos_protocolo on public.documentos (protocolo_id) where excluido_em is null;

-- -----------------------------------------------------------------------------
-- Movimentações do processo (linha do tempo legível; complementa a auditoria)
-- -----------------------------------------------------------------------------
create table public.processo_movimentacoes (
  id                uuid primary key default gen_random_uuid(),
  processo_id       uuid not null references public.processos (id),
  data_movimentacao date not null default public.hoje_br(),
  tipo              text not null check (tipo in ('anotacao', 'processo', 'acordo', 'recebimento', 'protocolo', 'documento')),
  descricao         text not null check (length(trim(descricao)) > 0),
  automatica        boolean not null default false,
  referencia_tabela text,
  referencia_id     uuid,
  criado_em         timestamptz not null default now(),
  criado_por        uuid references auth.users (id) default auth.uid()
);

comment on table public.processo_movimentacoes is 'Histórico de movimentações de cada processo. Imutável: correções são novas anotações.';

create index idx_movimentacoes_processo on public.processo_movimentacoes (processo_id, data_movimentacao desc, criado_em desc);

-- -----------------------------------------------------------------------------
-- Triggers de controle e auditoria
-- -----------------------------------------------------------------------------
create trigger trg_status_protocolo_controle before insert or update on public.status_protocolo
  for each row execute function public.definir_colunas_controle();
create trigger trg_protocolos_controle before insert or update on public.protocolos
  for each row execute function public.definir_colunas_controle();
create trigger trg_documentos_controle before insert or update on public.documentos
  for each row execute function public.definir_colunas_controle();

create trigger trg_status_protocolo_auditoria after insert or update or delete on public.status_protocolo
  for each row execute function public.registrar_auditoria();
create trigger trg_protocolos_auditoria after insert or update or delete on public.protocolos
  for each row execute function public.registrar_auditoria();
create trigger trg_protocolo_processos_auditoria after insert or update or delete on public.protocolo_processos
  for each row execute function public.registrar_auditoria();
create trigger trg_documentos_auditoria after insert or update or delete on public.documentos
  for each row execute function public.registrar_auditoria();
create trigger trg_movimentacoes_auditoria after insert or update or delete on public.processo_movimentacoes
  for each row execute function public.registrar_auditoria();

-- -----------------------------------------------------------------------------
-- Movimentações automáticas
-- -----------------------------------------------------------------------------
create or replace function public.registrar_movimentacao(
  p_processo_id uuid,
  p_tipo        text,
  p_descricao   text,
  p_tabela      text,
  p_ref_id      uuid,
  p_data        date default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.processo_movimentacoes
    (processo_id, data_movimentacao, tipo, descricao, automatica, referencia_tabela, referencia_id)
  values
    (p_processo_id, coalesce(p_data, public.hoje_br()), p_tipo, p_descricao, true, p_tabela, p_ref_id)
$$;

revoke execute on function public.registrar_movimentacao(uuid, text, text, text, uuid, date) from public, authenticated;

create or replace function public.trg_mov_processo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_movimentacao(new.id, 'processo', 'Processo cadastrado', 'processos', new.id);
    if new.data_audiencia is not null then
      perform public.registrar_movimentacao(new.id, 'processo',
        'Audiência em ' || public.fmt_data(new.data_audiencia), 'processos', new.id);
    end if;
  else
    if new.status is distinct from old.status then
      perform public.registrar_movimentacao(new.id, 'processo',
        'Status do processo: ' || old.status || ' → ' || new.status, 'processos', new.id);
    end if;
    if new.data_audiencia is distinct from old.data_audiencia then
      perform public.registrar_movimentacao(new.id, 'processo',
        'Data da audiência: ' || public.fmt_data(old.data_audiencia) || ' → ' || public.fmt_data(new.data_audiencia),
        'processos', new.id);
    end if;
    if new.numero_processo is distinct from old.numero_processo then
      perform public.registrar_movimentacao(new.id, 'processo',
        'Número do processo: ' || coalesce(old.numero_processo, '—') || ' → ' || coalesce(new.numero_processo, '—'),
        'processos', new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_processos_movimentacao after insert or update on public.processos
  for each row execute function public.trg_mov_processo();

create or replace function public.trg_mov_acordo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_movimentacao(new.processo_id, 'acordo',
      'Acordo ' || new.codigo || ' cadastrado: ' || public.fmt_brl(new.valor_total), 'acordos', new.id);
  elsif new.excluido_em is not null and old.excluido_em is null then
    perform public.registrar_movimentacao(new.processo_id, 'acordo', 'Acordo ' || new.codigo || ' excluído', 'acordos', new.id);
  else
    if new.status is distinct from old.status then
      perform public.registrar_movimentacao(new.processo_id, 'acordo',
        'Acordo ' || new.codigo || ': status ' || old.status || ' → ' || new.status, 'acordos', new.id);
    end if;
    if new.valor_total is distinct from old.valor_total then
      perform public.registrar_movimentacao(new.processo_id, 'acordo',
        'Acordo ' || new.codigo || ': valor ' || public.fmt_brl(old.valor_total) || ' → ' || public.fmt_brl(new.valor_total),
        'acordos', new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_acordos_movimentacao after insert or update on public.acordos
  for each row execute function public.trg_mov_acordo();

create or replace function public.trg_mov_recebimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  select processo_id, codigo into a from public.acordos where id = new.acordo_id;
  if tg_op = 'INSERT' then
    perform public.registrar_movimentacao(a.processo_id, 'recebimento',
      'Recebimento de ' || public.fmt_brl(new.valor) || ' no acordo ' || a.codigo,
      'acordo_recebimentos', new.id, new.data_recebimento);
  elsif new.estornado_em is not null and old.estornado_em is null then
    perform public.registrar_movimentacao(a.processo_id, 'recebimento',
      'Estorno do recebimento de ' || public.fmt_brl(new.valor) || ' (' || public.fmt_data(new.data_recebimento) ||
      ') no acordo ' || a.codigo || ': ' || coalesce(new.motivo_estorno, ''),
      'acordo_recebimentos', new.id);
  end if;
  return new;
end;
$$;

create trigger trg_recebimentos_movimentacao after insert or update on public.acordo_recebimentos
  for each row execute function public.trg_mov_recebimento();

create or replace function public.rotulo_protocolo(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select codigo || coalesce(' (NUPE ' || nupe || ')', '') from public.protocolos where id = p_id
$$;

create or replace function public.trg_mov_protocolo_processo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_movimentacao(new.processo_id, 'protocolo',
      'Vinculado ao protocolo ' || public.rotulo_protocolo(new.protocolo_id), 'protocolos', new.protocolo_id);
    return new;
  end if;
  -- Na exclusão do protocolo (cascade) o protocolo já não existe; protocolos usam exclusão lógica.
  if exists (select 1 from public.protocolos where id = old.protocolo_id) then
    perform public.registrar_movimentacao(old.processo_id, 'protocolo',
      'Desvinculado do protocolo ' || public.rotulo_protocolo(old.protocolo_id), 'protocolos', old.protocolo_id);
  end if;
  return old;
end;
$$;

create trigger trg_protocolo_processos_movimentacao after insert or delete on public.protocolo_processos
  for each row execute function public.trg_mov_protocolo_processo();

create or replace function public.trg_mov_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_textos text[] := '{}';
  v_texto  text;
  v_proc   uuid;
begin
  if new.excluido_em is not null and old.excluido_em is null then
    v_textos := array_append(v_textos, 'Protocolo ' || new.codigo || ' excluído');
  else
    if new.status_id is distinct from old.status_id then
      v_textos := array_append(v_textos, 'Protocolo ' || new.codigo || ': status ' ||
        (select nome from public.status_protocolo where id = old.status_id) || ' → ' ||
        (select nome from public.status_protocolo where id = new.status_id));
    end if;
    if new.nupe is distinct from old.nupe then
      v_textos := array_append(v_textos, 'Protocolo ' || new.codigo || ': NUPE ' ||
        coalesce(old.nupe, '—') || ' → ' || coalesce(new.nupe, '—'));
    end if;
    if new.data_protocolo is distinct from old.data_protocolo then
      v_textos := array_append(v_textos, 'Protocolo ' || new.codigo || ': data do protocolo ' ||
        public.fmt_data(old.data_protocolo) || ' → ' || public.fmt_data(new.data_protocolo));
    end if;
    if new.responsavel_id is distinct from old.responsavel_id then
      v_textos := array_append(v_textos, 'Protocolo ' || new.codigo || ': responsável ' ||
        coalesce((select coalesce(nullif(nome, ''), email) from public.perfis where id = old.responsavel_id), '—') || ' → ' ||
        coalesce((select coalesce(nullif(nome, ''), email) from public.perfis where id = new.responsavel_id), '—'));
    end if;
  end if;

  foreach v_texto in array v_textos loop
    for v_proc in select processo_id from public.protocolo_processos where protocolo_id = new.id loop
      perform public.registrar_movimentacao(v_proc, 'protocolo', v_texto, 'protocolos', new.id);
    end loop;
  end loop;
  return new;
end;
$$;

create trigger trg_protocolos_movimentacao after update on public.protocolos
  for each row execute function public.trg_mov_protocolo();

create or replace function public.trg_mov_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text;
  v_proc  uuid;
  v_tipo  text := replace(new.tipo::text, '_', ' ');
begin
  if tg_op = 'INSERT' then
    v_texto := 'Documento anexado (' || v_tipo || '): ' || new.nome_arquivo;
  elsif new.excluido_em is not null and old.excluido_em is null then
    v_texto := 'Documento removido (' || v_tipo || '): ' || new.nome_arquivo || ' — ' || coalesce(new.motivo_exclusao, '');
  else
    return new;
  end if;

  if new.protocolo_id is not null then
    v_texto := v_texto || ' [protocolo ' || public.rotulo_protocolo(new.protocolo_id) || ']';
    for v_proc in select processo_id from public.protocolo_processos where protocolo_id = new.protocolo_id loop
      perform public.registrar_movimentacao(v_proc, 'documento', v_texto, 'documentos', new.id);
    end loop;
  else
    perform public.registrar_movimentacao(new.processo_id, 'documento', v_texto, 'documentos', new.id);
  end if;
  return new;
end;
$$;

create trigger trg_documentos_movimentacao after insert or update on public.documentos
  for each row execute function public.trg_mov_documento();

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------
create view public.vw_protocolos
with (security_invoker = true) as
select
  p.id,
  p.codigo,
  p.nupe,
  p.data_protocolo,
  p.status_id,
  s.nome as status_nome,
  s.pendente,
  p.responsavel_id,
  public.nome_usuario(p.responsavel_id) as responsavel_nome,
  p.assunto,
  p.observacoes,
  p.criado_em,
  coalesce(v.qtd_processos, 0)::int as qtd_processos,
  coalesce(v.processos, '') as processos,
  coalesce(d.qtd_documentos, 0)::int as qtd_documentos
from public.protocolos p
join public.status_protocolo s on s.id = p.status_id
left join lateral (
  select count(*) as qtd_processos,
         string_agg(coalesce(pr.numero_processo, pr.codigo), ', ' order by pr.codigo) as processos
  from public.protocolo_processos pp
  join public.processos pr on pr.id = pp.processo_id and pr.excluido_em is null
  where pp.protocolo_id = p.id
) v on true
left join lateral (
  select count(*) as qtd_documentos
  from public.documentos dd
  where dd.protocolo_id = p.id and dd.excluido_em is null
) d on true
where p.excluido_em is null;

-- Resumo do processo: mesmas colunas da Etapa 5 + protocolos ao final
create or replace view public.vw_processo_resumo
with (security_invoker = true) as
select
  pr.id,
  pr.codigo,
  pr.numero_processo,
  pr.data_audiencia,
  pr.status,
  pr.observacoes,
  pr.criado_em,
  coalesce(partes.requerentes, '') as requerentes,
  coalesce(partes.requeridos, '') as requeridos,
  coalesce(ac.qtd_acordos, 0)::int as qtd_acordos,
  coalesce(ac.qtd_acordos_ativos, 0)::int as qtd_acordos_ativos,
  coalesce(ac.valor_acordos_ativos, 0)::numeric(14,2) as valor_acordos_ativos,
  coalesce(ac.recebido_acordos_ativos, 0)::numeric(14,2) as recebido_acordos_ativos,
  coalesce(ac.saldo_acordos_ativos, 0)::numeric(14,2) as saldo_acordos_ativos,
  coalesce(ac.parcelas_atrasadas, 0)::int as parcelas_atrasadas,
  (coalesce(ac.parcelas_atrasadas, 0) > 0) as em_atraso,
  coalesce(pt.qtd_protocolos, 0)::int as qtd_protocolos,
  coalesce(pt.protocolos_pendentes, 0)::int as protocolos_pendentes,
  coalesce(pt.tem_nupe, false) as tem_nupe,
  coalesce(pt.nupes, '') as nupes
from public.processos pr
left join lateral (
  select
    string_agg(pp.nome, ', ' order by pp.nome) filter (where pp.polo = 'requerente') as requerentes,
    string_agg(pp.nome, ', ' order by pp.nome) filter (where pp.polo = 'requerido') as requeridos
  from public.processo_partes pp
  where pp.processo_id = pr.id
) partes on true
left join lateral (
  select
    count(*) as qtd_acordos,
    count(*) filter (where ap.status = 'ativo') as qtd_acordos_ativos,
    sum(ap.valor_total) filter (where ap.status = 'ativo') as valor_acordos_ativos,
    sum(ap.total_recebido) filter (where ap.status = 'ativo') as recebido_acordos_ativos,
    sum(ap.saldo_em_aberto) filter (where ap.status = 'ativo') as saldo_acordos_ativos,
    sum(ap.parcelas_atrasadas) filter (where ap.status = 'ativo') as parcelas_atrasadas
  from public.vw_acordo_posicao ap
  where ap.processo_id = pr.id
) ac on true
left join lateral (
  select
    count(*) as qtd_protocolos,
    count(*) filter (where s.pendente) as protocolos_pendentes,
    bool_or(p.nupe is not null) as tem_nupe,
    string_agg(p.nupe, ', ' order by p.nupe) as nupes
  from public.protocolo_processos x
  join public.protocolos p on p.id = x.protocolo_id and p.excluido_em is null
  join public.status_protocolo s on s.id = p.status_id
  where x.processo_id = pr.id
) pt on true
where pr.excluido_em is null;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado de documentos
--   Caminho: processos/<processo_id>/<uuid>-<nome> ou protocolos/<protocolo_id>/<uuid>-<nome>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos', 'documentos', false, 20971520,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.text',
    'text/csv'
  ]
)
on conflict (id) do update set public = false;

create policy documentos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.pode_ler());
create policy documentos_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos' and public.pode_editar()
    and (storage.foldername(name))[1] in ('processos', 'protocolos')
  );
-- Sem UPDATE/DELETE de arquivos: a remoção é lógica (o arquivo permanece para histórico).

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.status_protocolo       enable row level security;
alter table public.protocolos             enable row level security;
alter table public.protocolo_processos    enable row level security;
alter table public.documentos             enable row level security;
alter table public.processo_movimentacoes enable row level security;

create policy status_protocolo_select on public.status_protocolo       for select to authenticated using (public.pode_ler());
create policy protocolos_select       on public.protocolos             for select to authenticated using (public.pode_ler());
create policy prot_proc_select        on public.protocolo_processos    for select to authenticated using (public.pode_ler());
create policy documentos_select       on public.documentos             for select to authenticated using (public.pode_ler());
create policy movimentacoes_select    on public.processo_movimentacoes for select to authenticated using (public.pode_ler());

-- Status: somente admin mantém a lista
create policy status_protocolo_insert on public.status_protocolo for insert to authenticated with check (public.eh_admin());
create policy status_protocolo_update on public.status_protocolo for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy protocolos_insert on public.protocolos for insert to authenticated with check (public.pode_editar());
create policy protocolos_update on public.protocolos for update to authenticated using (public.pode_editar()) with check (public.pode_editar());

create policy prot_proc_insert on public.protocolo_processos for insert to authenticated with check (public.pode_editar());
create policy prot_proc_delete on public.protocolo_processos for delete to authenticated using (public.pode_editar());

create policy documentos_insert on public.documentos for insert to authenticated with check (public.pode_editar());
create policy documentos_update on public.documentos for update to authenticated using (public.pode_editar()) with check (public.pode_editar());

-- Anotações manuais (as automáticas são gravadas pelos triggers)
create policy movimentacoes_insert on public.processo_movimentacoes for insert to authenticated
  with check (public.pode_editar() and not automatica and tipo = 'anotacao');

-- Responsável precisa ser um usuário ativo
create or replace function public.validar_responsavel_protocolo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id)
     and not exists (select 1 from public.perfis where id = new.responsavel_id and ativo) then
    raise exception 'O responsável pelo protocolo deve ser um usuário ativo do sistema.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_protocolos_responsavel before insert or update on public.protocolos
  for each row execute function public.validar_responsavel_protocolo();

revoke delete on public.status_protocolo, public.protocolos, public.documentos, public.processo_movimentacoes from authenticated;
revoke update on public.processo_movimentacoes from authenticated;
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- =============================================================================
-- Módulo 2 — Processos, acordos, parcelas e recebimentos (Etapa 5)
--
-- Regras confirmadas:
--   * O acordo é entre terceiros (requerente e requerido). O sistema apenas
--     acompanha: o valor do acordo NÃO entra no caixa nem nos empréstimos.
--     Cada acordo indica qual polo paga (o outro recebe).
--   * Parcelas: geradas iguais (diferença de centavos na última) ou digitadas
--     uma a uma. Se a soma diferir do valor total, o sistema apenas AVISA.
--   * Carência de 3 dias por padrão (editável por acordo). A parcela fica
--     atrasada quando hoje > vencimento + carência e ainda há saldo.
--   * Recebimento parcial é permitido. O excedente de uma parcela abate a(s)
--     parcela(s) seguinte(s). Sem parcela indicada, abate da mais antiga em aberto.
--   * Recebimentos são lançados manualmente; origem e referência externa já
--     ficam preparadas para a futura importação de extrato bancário.
--
-- Decisão técnica a confirmar: carência em dias CORRIDOS.
-- =============================================================================

create type public.status_processo as enum ('ativo', 'encerrado', 'arquivado');
create type public.polo_processo as enum ('requerente', 'requerido');
create type public.status_acordo as enum ('ativo', 'quitado', 'renegociado', 'cancelado');
create type public.modo_parcelas as enum ('automatico', 'manual');
create type public.origem_recebimento as enum ('manual', 'extrato');

-- -----------------------------------------------------------------------------
-- Processos
-- -----------------------------------------------------------------------------
create sequence public.seq_codigo_processo;

create table public.processos (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique default (
                    'PRC-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' ||
                    lpad(nextval('public.seq_codigo_processo')::text, 4, '0')
                  ),
  numero_processo text,
  data_audiencia  date,
  status          public.status_processo not null default 'ativo',
  observacoes     text,
  excluido_em     timestamptz,
  criado_em       timestamptz not null default now(),
  criado_por      uuid references auth.users (id),
  atualizado_em   timestamptz not null default now()
);

comment on column public.processos.codigo is 'Identificador interno gerado pelo sistema.';
comment on column public.processos.numero_processo is 'Número do processo judicial/administrativo, quando existente.';

create unique index uq_processos_numero on public.processos (numero_processo)
  where numero_processo is not null and excluido_em is null;
create index idx_processos_status on public.processos (status) where excluido_em is null;

-- Partes (permite mais de um requerente ou requerido)
create table public.processo_partes (
  id            uuid primary key default gen_random_uuid(),
  processo_id   uuid not null references public.processos (id) on delete cascade,
  polo          public.polo_processo not null,
  nome          text not null check (length(trim(nome)) > 0),
  tipo_pessoa   public.tipo_pessoa not null default 'PF',
  documento     text,
  contato       text,
  criado_em     timestamptz not null default now(),
  criado_por    uuid references auth.users (id),
  atualizado_em timestamptz not null default now()
);

create index idx_partes_processo on public.processo_partes (processo_id, polo);

-- -----------------------------------------------------------------------------
-- Acordos
-- -----------------------------------------------------------------------------
create sequence public.seq_codigo_acordo;

create table public.acordos (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique default (
                        'ACD-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' ||
                        lpad(nextval('public.seq_codigo_acordo')::text, 4, '0')
                      ),
  processo_id         uuid not null references public.processos (id),
  polo_pagador        public.polo_processo not null,
  valor_total         numeric(14,2) not null check (valor_total > 0),
  condicoes_pagamento text,
  dias_carencia       int not null default 3 check (dias_carencia between 0 and 365),
  modo_parcelas       public.modo_parcelas not null default 'automatico',
  status              public.status_acordo not null default 'ativo',
  observacoes         text,
  excluido_em         timestamptz,
  criado_em           timestamptz not null default now(),
  criado_por          uuid references auth.users (id),
  atualizado_em       timestamptz not null default now()
);

comment on column public.acordos.polo_pagador is 'Polo que paga as parcelas; o outro polo recebe. O sistema apenas acompanha.';
comment on column public.acordos.dias_carencia is 'Dias corridos após o vencimento antes de a parcela contar como atrasada.';

create index idx_acordos_processo on public.acordos (processo_id);
create index idx_acordos_status on public.acordos (status) where excluido_em is null;

create table public.acordo_parcelas (
  id              uuid primary key default gen_random_uuid(),
  acordo_id       uuid not null references public.acordos (id) on delete cascade,
  numero          int  not null check (numero >= 1),
  valor           numeric(14,2) not null check (valor > 0),
  data_vencimento date not null,
  criado_em       timestamptz not null default now(),
  unique (acordo_id, numero)
);

create index idx_parcelas_vencimento on public.acordo_parcelas (data_vencimento);

-- -----------------------------------------------------------------------------
-- Recebimentos (pagamentos feitos entre as partes, registrados para acompanhamento)
-- -----------------------------------------------------------------------------
create table public.acordo_recebimentos (
  id                 uuid primary key default gen_random_uuid(),
  acordo_id          uuid not null references public.acordos (id),
  data_recebimento   date not null,
  valor              numeric(14,2) not null check (valor > 0),
  parcela_indicada_id uuid references public.acordo_parcelas (id) on delete set null,
  forma_pagamento    text,
  origem             public.origem_recebimento not null default 'manual',
  referencia_externa text,
  observacoes        text,
  estornado_em       timestamptz,
  motivo_estorno     text,
  criado_em          timestamptz not null default now(),
  criado_por         uuid references auth.users (id),
  atualizado_em      timestamptz not null default now()
);

comment on column public.acordo_recebimentos.referencia_externa is 'Identificador do lançamento no extrato bancário (conciliação futura).';

create index idx_recebimentos_acordo on public.acordo_recebimentos (acordo_id, data_recebimento);
create unique index uq_recebimentos_referencia on public.acordo_recebimentos (acordo_id, referencia_externa)
  where referencia_externa is not null and estornado_em is null;

-- Como cada recebimento foi abatido nas parcelas
create table public.acordo_recebimento_imputacoes (
  id             uuid primary key default gen_random_uuid(),
  recebimento_id uuid not null references public.acordo_recebimentos (id) on delete cascade,
  acordo_id      uuid not null references public.acordos (id),
  parcela_id     uuid not null references public.acordo_parcelas (id),
  valor          numeric(14,2) not null check (valor > 0),
  criado_em      timestamptz not null default now()
);

create index idx_rec_imputacoes_recebimento on public.acordo_recebimento_imputacoes (recebimento_id);
create index idx_rec_imputacoes_parcela on public.acordo_recebimento_imputacoes (parcela_id);
create index idx_rec_imputacoes_acordo on public.acordo_recebimento_imputacoes (acordo_id);

-- -----------------------------------------------------------------------------
-- Triggers de controle e auditoria
-- -----------------------------------------------------------------------------
create trigger trg_processos_controle before insert or update on public.processos
  for each row execute function public.definir_colunas_controle();
create trigger trg_partes_controle before insert or update on public.processo_partes
  for each row execute function public.definir_colunas_controle();
create trigger trg_acordos_controle before insert or update on public.acordos
  for each row execute function public.definir_colunas_controle();
create trigger trg_recebimentos_controle before insert or update on public.acordo_recebimentos
  for each row execute function public.definir_colunas_controle();

create trigger trg_processos_auditoria after insert or update or delete on public.processos
  for each row execute function public.registrar_auditoria();
create trigger trg_partes_auditoria after insert or update or delete on public.processo_partes
  for each row execute function public.registrar_auditoria();
create trigger trg_acordos_auditoria after insert or update or delete on public.acordos
  for each row execute function public.registrar_auditoria();
create trigger trg_parcelas_auditoria after insert or update or delete on public.acordo_parcelas
  for each row execute function public.registrar_auditoria();
create trigger trg_recebimentos_auditoria after insert or update or delete on public.acordo_recebimentos
  for each row execute function public.registrar_auditoria();
create trigger trg_rec_imputacoes_auditoria after insert or update or delete on public.acordo_recebimento_imputacoes
  for each row execute function public.registrar_auditoria();

-- -----------------------------------------------------------------------------
-- Views de posição (security_invoker: respeitam RLS de quem consulta)
-- -----------------------------------------------------------------------------
create view public.vw_rec_imputacoes_validas
with (security_invoker = true) as
select i.*
from public.acordo_recebimento_imputacoes i
join public.acordo_recebimentos r on r.id = i.recebimento_id
where r.estornado_em is null;

create view public.vw_acordo_parcelas
with (security_invoker = true) as
with base as (
  select
    p.*,
    a.processo_id,
    a.status as acordo_status,
    a.dias_carencia,
    (p.data_vencimento + a.dias_carencia) as data_limite,
    coalesce(i.recebido, 0)::numeric(14,2) as valor_recebido,
    i.ultimo_recebimento
  from public.acordo_parcelas p
  join public.acordos a on a.id = p.acordo_id
  left join lateral (
    select sum(v.valor) as recebido, max(r.data_recebimento) as ultimo_recebimento
    from public.vw_rec_imputacoes_validas v
    join public.acordo_recebimentos r on r.id = v.recebimento_id
    where v.parcela_id = p.id
  ) i on true
  where a.excluido_em is null
)
select
  b.*,
  (b.valor - b.valor_recebido)::numeric(14,2) as saldo,
  case
    when b.valor_recebido >= b.valor then 'recebida'
    when public.hoje_br() <= b.data_vencimento then
      case when b.valor_recebido > 0 then 'parcial' else 'a_vencer' end
    when public.hoje_br() <= b.data_limite then 'em_carencia'
    when b.valor_recebido > 0 then 'parcial_atrasada'
    else 'atrasada'
  end as situacao,
  (b.valor_recebido < b.valor and public.hoje_br() > b.data_limite) as atrasada
from base b;

create view public.vw_acordo_posicao
with (security_invoker = true) as
select
  a.id,
  a.codigo,
  a.processo_id,
  pr.codigo as processo_codigo,
  pr.numero_processo,
  a.polo_pagador,
  a.valor_total,
  a.condicoes_pagamento,
  a.dias_carencia,
  a.modo_parcelas,
  a.status,
  a.observacoes,
  a.criado_em,
  coalesce(partes.requerentes, '') as requerentes,
  coalesce(partes.requeridos, '') as requeridos,
  coalesce(p.qtd_parcelas, 0)::int as qtd_parcelas,
  coalesce(p.soma_parcelas, 0)::numeric(14,2) as soma_parcelas,
  (a.valor_total - coalesce(p.soma_parcelas, 0))::numeric(14,2) as diferenca_parcelas,
  coalesce(p.total_recebido, 0)::numeric(14,2) as total_recebido,
  (coalesce(p.soma_parcelas, 0) - coalesce(p.total_recebido, 0))::numeric(14,2) as saldo_em_aberto,
  coalesce(p.parcelas_recebidas, 0)::int as parcelas_recebidas,
  coalesce(p.parcelas_atrasadas, 0)::int as parcelas_atrasadas,
  coalesce(p.valor_atrasado, 0)::numeric(14,2) as valor_atrasado,
  coalesce(p.parcelas_em_carencia, 0)::int as parcelas_em_carencia,
  p.proximo_vencimento,
  coalesce(r.qtd_recebimentos, 0)::int as qtd_recebimentos,
  r.ultimo_recebimento,
  case
    when coalesce(p.qtd_parcelas, 0) = 0 then 'sem_parcelas'
    when p.soma_parcelas <= coalesce(p.total_recebido, 0) then 'quitado'
    when coalesce(p.parcelas_atrasadas, 0) > 0 then 'em_atraso'
    when coalesce(p.parcelas_em_carencia, 0) > 0 then 'em_carencia'
    else 'em_dia'
  end as situacao_financeira,
  (coalesce(p.parcelas_atrasadas, 0) > 0) as em_atraso
from public.acordos a
join public.processos pr on pr.id = a.processo_id
left join lateral (
  select
    count(*) as qtd_parcelas,
    sum(vp.valor) as soma_parcelas,
    sum(vp.valor_recebido) as total_recebido,
    count(*) filter (where vp.situacao = 'recebida') as parcelas_recebidas,
    count(*) filter (where vp.atrasada) as parcelas_atrasadas,
    sum(vp.saldo) filter (where vp.atrasada) as valor_atrasado,
    count(*) filter (where vp.situacao = 'em_carencia') as parcelas_em_carencia,
    min(vp.data_vencimento) filter (where vp.saldo > 0) as proximo_vencimento
  from public.vw_acordo_parcelas vp
  where vp.acordo_id = a.id
) p on true
left join lateral (
  select count(*) as qtd_recebimentos, max(rr.data_recebimento) as ultimo_recebimento
  from public.acordo_recebimentos rr
  where rr.acordo_id = a.id and rr.estornado_em is null
) r on true
left join lateral (
  select
    string_agg(pp.nome, ', ' order by pp.nome) filter (where pp.polo = 'requerente') as requerentes,
    string_agg(pp.nome, ', ' order by pp.nome) filter (where pp.polo = 'requerido') as requeridos
  from public.processo_partes pp
  where pp.processo_id = a.processo_id
) partes on true
where a.excluido_em is null;

create view public.vw_processo_resumo
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
  (coalesce(ac.parcelas_atrasadas, 0) > 0) as em_atraso
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
where pr.excluido_em is null;

-- -----------------------------------------------------------------------------
-- RPC: definir parcelas (substitui todas as parcelas do acordo)
--   p_parcelas: [{"valor": "333.33", "data_vencimento": "2026-11-10"}, ...]
--   A numeração segue a data de vencimento (e a ordem informada, em empate).
--   Bloqueado se o acordo já tiver recebimentos válidos.
-- -----------------------------------------------------------------------------
create or replace function public.definir_parcelas(p_acordo_id uuid, p_parcelas jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_qtd int;
begin
  if not public.pode_editar() then
    raise exception 'Sem permissão para alterar parcelas.' using errcode = '42501';
  end if;

  perform 1 from public.acordos where id = p_acordo_id and excluido_em is null for update;
  if not found then
    raise exception 'Acordo não encontrado.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.vw_rec_imputacoes_validas where acordo_id = p_acordo_id) then
    raise exception 'As parcelas não podem ser alteradas porque o acordo já possui recebimentos. Estorne os recebimentos ou registre um novo acordo.'
      using errcode = 'P0001';
  end if;

  if p_parcelas is null or jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'Informe ao menos uma parcela.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_parcelas) > 600 then
    raise exception 'Máximo de 600 parcelas.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parcelas) e
    where (e ->> 'valor') is null or (e ->> 'data_vencimento') is null
       or (e ->> 'valor')::numeric <= 0
       or round((e ->> 'valor')::numeric, 2) <> (e ->> 'valor')::numeric
  ) then
    raise exception 'Cada parcela precisa de valor maior que zero (até 2 casas decimais) e data de vencimento.'
      using errcode = 'P0001';
  end if;

  -- Imputações de recebimentos estornados apontam para as parcelas antigas
  delete from public.acordo_recebimento_imputacoes where acordo_id = p_acordo_id;
  delete from public.acordo_parcelas where acordo_id = p_acordo_id;

  insert into public.acordo_parcelas (acordo_id, numero, valor, data_vencimento)
  select
    p_acordo_id,
    row_number() over (order by (e ->> 'data_vencimento')::date, ord),
    (e ->> 'valor')::numeric(14,2),
    (e ->> 'data_vencimento')::date
  from jsonb_array_elements(p_parcelas) with ordinality as t(e, ord);

  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: registrar recebimento (atômico)
--   Com parcela indicada: abate primeiro dela; o excedente vai para as parcelas
--   seguintes (por vencimento) e, se ainda sobrar, para as anteriores em aberto.
--   Sem parcela indicada: abate da mais antiga em aberto para a mais recente.
--   O valor não pode exceder o saldo em aberto do acordo.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_recebimento(
  p_acordo_id          uuid,
  p_data_recebimento   date,
  p_valor              numeric,
  p_parcela_id         uuid default null,
  p_forma_pagamento    text default null,
  p_observacoes        text default null,
  p_origem             public.origem_recebimento default 'manual',
  p_referencia_externa text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recebimento_id uuid;
  v_saldo          numeric(14,2);
  v_restante       numeric(14,2);
  v_aplicar        numeric(14,2);
  v_ind_venc       date;
  v_ind_numero     int;
  c                record;
begin
  if not public.pode_editar() then
    raise exception 'Sem permissão para registrar recebimentos.' using errcode = '42501';
  end if;

  p_valor := round(p_valor, 2);
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor do recebimento deve ser maior que zero.' using errcode = 'P0001';
  end if;
  if p_data_recebimento is null then
    raise exception 'Informe a data do recebimento.' using errcode = 'P0001';
  end if;

  perform 1 from public.acordos where id = p_acordo_id and excluido_em is null for update;
  if not found then
    raise exception 'Acordo não encontrado.' using errcode = 'P0001';
  end if;

  select coalesce(sum(saldo), 0) into v_saldo from public.vw_acordo_parcelas where acordo_id = p_acordo_id;
  if v_saldo <= 0 then
    raise exception 'O acordo não possui parcelas em aberto.' using errcode = 'P0001';
  end if;
  if p_valor > v_saldo then
    raise exception 'O valor (%) excede o saldo em aberto do acordo (%).', p_valor, v_saldo using errcode = 'P0001';
  end if;

  if p_parcela_id is not null then
    select data_vencimento, numero into v_ind_venc, v_ind_numero
    from public.acordo_parcelas where id = p_parcela_id and acordo_id = p_acordo_id;
    if not found then
      raise exception 'A parcela indicada não pertence a este acordo.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.acordo_recebimentos
    (acordo_id, data_recebimento, valor, parcela_indicada_id, forma_pagamento, origem, referencia_externa, observacoes)
  values
    (p_acordo_id, p_data_recebimento, p_valor, p_parcela_id, p_forma_pagamento,
     coalesce(p_origem, 'manual'), nullif(trim(p_referencia_externa), ''), p_observacoes)
  returning id into v_recebimento_id;

  v_restante := p_valor;
  for c in
    select vp.id, vp.saldo
    from public.vw_acordo_parcelas vp
    where vp.acordo_id = p_acordo_id and vp.saldo > 0
    order by
      (vp.id = p_parcela_id) is true desc,
      ((vp.data_vencimento, vp.numero) > (v_ind_venc, v_ind_numero)) is true desc,
      vp.data_vencimento, vp.numero
  loop
    exit when v_restante <= 0;
    v_aplicar := least(v_restante, c.saldo);
    insert into public.acordo_recebimento_imputacoes (recebimento_id, acordo_id, parcela_id, valor)
    values (v_recebimento_id, p_acordo_id, c.id, v_aplicar);
    v_restante := v_restante - v_aplicar;
  end loop;

  if v_restante > 0 then
    raise exception 'Não foi possível distribuir todo o valor do recebimento.' using errcode = 'P0001';
  end if;

  return v_recebimento_id;
end;
$$;

create or replace function public.estornar_recebimento(p_recebimento_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.pode_editar() then
    raise exception 'Sem permissão para estornar recebimentos.' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno.' using errcode = 'P0001';
  end if;

  update public.acordo_recebimentos
     set estornado_em = now(), motivo_estorno = p_motivo
   where id = p_recebimento_id and estornado_em is null;
  if not found then
    raise exception 'Recebimento não encontrado ou já estornado.' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.processos                     enable row level security;
alter table public.processo_partes               enable row level security;
alter table public.acordos                       enable row level security;
alter table public.acordo_parcelas               enable row level security;
alter table public.acordo_recebimentos           enable row level security;
alter table public.acordo_recebimento_imputacoes enable row level security;

-- Leitura: qualquer usuário ativo
create policy processos_select    on public.processos                     for select to authenticated using (public.pode_ler());
create policy partes_select       on public.processo_partes               for select to authenticated using (public.pode_ler());
create policy acordos_select      on public.acordos                       for select to authenticated using (public.pode_ler());
create policy parcelas_select     on public.acordo_parcelas               for select to authenticated using (public.pode_ler());
create policy recebimentos_select on public.acordo_recebimentos           for select to authenticated using (public.pode_ler());
create policy rec_imput_select    on public.acordo_recebimento_imputacoes for select to authenticated using (public.pode_ler());

-- Escrita: admin e operador
create policy processos_insert on public.processos for insert to authenticated with check (public.pode_editar());
create policy processos_update on public.processos for update to authenticated using (public.pode_editar()) with check (public.pode_editar());

create policy partes_insert on public.processo_partes for insert to authenticated with check (public.pode_editar());
create policy partes_update on public.processo_partes for update to authenticated using (public.pode_editar()) with check (public.pode_editar());
create policy partes_delete on public.processo_partes for delete to authenticated using (public.pode_editar());

create policy acordos_insert on public.acordos for insert to authenticated with check (public.pode_editar());
create policy acordos_update on public.acordos for update to authenticated using (public.pode_editar()) with check (public.pode_editar());

-- Parcelas e imputações são mantidas pelas funções (executadas no contexto de quem edita)
create policy parcelas_insert on public.acordo_parcelas for insert to authenticated with check (public.pode_editar());
create policy parcelas_delete on public.acordo_parcelas for delete to authenticated using (public.pode_editar());

create policy recebimentos_insert on public.acordo_recebimentos for insert to authenticated with check (public.pode_editar());
create policy recebimentos_update on public.acordo_recebimentos for update to authenticated using (public.pode_editar()) with check (public.pode_editar());

create policy rec_imput_insert on public.acordo_recebimento_imputacoes for insert to authenticated with check (public.pode_editar());
create policy rec_imput_delete on public.acordo_recebimento_imputacoes for delete to authenticated using (public.pode_editar());

-- Sem DELETE físico em processos, acordos e recebimentos (exclusão lógica / estorno).
revoke delete on public.processos, public.acordos, public.acordo_recebimentos from authenticated;
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

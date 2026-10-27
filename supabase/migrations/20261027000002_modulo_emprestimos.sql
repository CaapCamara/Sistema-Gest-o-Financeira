-- =============================================================================
-- Módulo 1 — Empréstimos e compromissos financeiros
--
-- Regras confirmadas:
--   * Juros simples, fixos, calculados sobre o principal ORIGINAL:
--       juros_mensal = round(valor_principal * taxa_juros_mensal, 2)
--   * Juros não pagos acumulam como "vencidos e não pagos", sem gerar novos juros.
--   * Pagamento abate primeiro juros e depois principal.
--   * Reserva é controlada por empréstimo, com visão consolidada.
--   * Reserva NUNCA é pagamento ao credor. Só vira pagamento quando o usuário
--     registra um pagamento com origem na reserva (gera saída da reserva + pagamento).
--
-- Saldos não são digitados: são calculados por views a partir dos lançamentos.
-- =============================================================================

create type public.tipo_pessoa as enum ('PF', 'PJ');
create type public.status_emprestimo as enum ('ativo', 'quitado', 'renegociado', 'cancelado');
create type public.tipo_imputacao as enum ('juros', 'principal');
create type public.tipo_movimento_reserva as enum ('aporte', 'resgate', 'utilizacao_pagamento');

-- -----------------------------------------------------------------------------
-- Credores
-- -----------------------------------------------------------------------------
create table public.credores (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (length(trim(nome)) > 0),
  tipo_pessoa     public.tipo_pessoa not null default 'PF',
  documento       text,
  email           text,
  telefone        text,
  endereco        text,
  dados_bancarios text,
  observacoes     text,
  excluido_em     timestamptz,
  criado_em       timestamptz not null default now(),
  criado_por      uuid references auth.users (id),
  atualizado_em   timestamptz not null default now()
);

create index idx_credores_nome on public.credores (nome);

-- -----------------------------------------------------------------------------
-- Empréstimos
-- -----------------------------------------------------------------------------
create sequence public.seq_codigo_emprestimo;

create table public.emprestimos (
  id                               uuid primary key default gen_random_uuid(),
  codigo                           text not null unique default (
                                     'EMP-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' ||
                                     lpad(nextval('public.seq_codigo_emprestimo')::text, 4, '0')
                                   ),
  credor_id                        uuid not null references public.credores (id),
  valor_principal                  numeric(14,2) not null check (valor_principal > 0),
  taxa_juros_mensal                numeric(9,6)  not null check (taxa_juros_mensal >= 0 and taxa_juros_mensal < 1),
  juros_mensal                     numeric(14,2) generated always as (round(valor_principal * taxa_juros_mensal, 2)) stored,
  data_inicio                      date not null,
  data_vencimento_principal        date not null,
  prazo_meses                      int  not null check (prazo_meses between 1 and 600),
  juros_contratados_total          numeric(14,2) not null check (juros_contratados_total >= 0),
  valor_mensal_pagamento_planejado numeric(14,2) not null default 0 check (valor_mensal_pagamento_planejado >= 0),
  valor_mensal_reserva_planejado   numeric(14,2) not null default 0 check (valor_mensal_reserva_planejado >= 0),
  status                           public.status_emprestimo not null default 'ativo',
  observacoes                      text,
  excluido_em                      timestamptz,
  criado_em                        timestamptz not null default now(),
  criado_por                       uuid references auth.users (id),
  atualizado_em                    timestamptz not null default now(),
  constraint ck_emprestimo_datas check (data_vencimento_principal > data_inicio)
);

comment on column public.emprestimos.taxa_juros_mensal is 'Fração decimal: 10% ao mês = 0.100000';
comment on column public.emprestimos.juros_mensal is 'Juros fixos mensais sobre o principal original (sem capitalização).';
comment on column public.emprestimos.juros_contratados_total is 'Valor digitado conforme o contrato. A referência calculada é juros_mensal * prazo_meses.';

create index idx_emprestimos_credor on public.emprestimos (credor_id);
create index idx_emprestimos_status on public.emprestimos (status) where excluido_em is null;

-- -----------------------------------------------------------------------------
-- Cronograma (competências mensais previstas)
-- -----------------------------------------------------------------------------
create table public.emprestimo_competencias (
  id                 uuid primary key default gen_random_uuid(),
  emprestimo_id      uuid not null references public.emprestimos (id) on delete cascade,
  numero             int  not null check (numero >= 1),
  data_vencimento    date not null,
  juros_devido       numeric(14,2) not null check (juros_devido >= 0),
  principal_previsto numeric(14,2) not null default 0 check (principal_previsto >= 0),
  pagamento_previsto numeric(14,2) not null default 0 check (pagamento_previsto >= 0),
  reserva_prevista   numeric(14,2) not null default 0 check (reserva_prevista >= 0),
  criado_em          timestamptz not null default now(),
  unique (emprestimo_id, numero)
);

create index idx_competencias_vencimento on public.emprestimo_competencias (data_vencimento);

-- -----------------------------------------------------------------------------
-- Pagamentos ao credor (somente valores efetivamente pagos)
-- -----------------------------------------------------------------------------
create table public.pagamentos (
  id               uuid primary key default gen_random_uuid(),
  emprestimo_id    uuid not null references public.emprestimos (id),
  data_pagamento   date not null,
  valor_total      numeric(14,2) not null check (valor_total > 0),
  forma_pagamento  text,
  origem_reserva   boolean not null default false,
  comprovante_path text,
  observacoes      text,
  estornado_em     timestamptz,
  motivo_estorno   text,
  criado_em        timestamptz not null default now(),
  criado_por       uuid references auth.users (id),
  atualizado_em    timestamptz not null default now()
);

create index idx_pagamentos_emprestimo on public.pagamentos (emprestimo_id, data_pagamento);

-- Como cada pagamento foi abatido (juros por competência e/ou principal)
create table public.pagamento_imputacoes (
  id             uuid primary key default gen_random_uuid(),
  pagamento_id   uuid not null references public.pagamentos (id) on delete cascade,
  emprestimo_id  uuid not null references public.emprestimos (id),
  tipo           public.tipo_imputacao not null,
  competencia_id uuid references public.emprestimo_competencias (id),
  valor          numeric(14,2) not null check (valor > 0),
  criado_em      timestamptz not null default now(),
  constraint ck_imputacao_competencia check (
    (tipo = 'juros' and competencia_id is not null) or
    (tipo = 'principal' and competencia_id is null)
  )
);

create index idx_imputacoes_pagamento on public.pagamento_imputacoes (pagamento_id);
create index idx_imputacoes_competencia on public.pagamento_imputacoes (competencia_id);
create index idx_imputacoes_emprestimo on public.pagamento_imputacoes (emprestimo_id);

-- -----------------------------------------------------------------------------
-- Reserva (por empréstimo)
-- -----------------------------------------------------------------------------
create table public.reserva_movimentos (
  id             uuid primary key default gen_random_uuid(),
  emprestimo_id  uuid not null references public.emprestimos (id),
  tipo           public.tipo_movimento_reserva not null,
  data_movimento date not null,
  valor          numeric(14,2) not null check (valor > 0),
  conta          text,
  pagamento_id   uuid references public.pagamentos (id),
  observacoes    text,
  estornado_em   timestamptz,
  motivo_estorno text,
  criado_em      timestamptz not null default now(),
  criado_por     uuid references auth.users (id),
  atualizado_em  timestamptz not null default now(),
  constraint ck_reserva_utilizacao check (
    (tipo = 'utilizacao_pagamento') = (pagamento_id is not null)
  )
);

create index idx_reserva_emprestimo on public.reserva_movimentos (emprestimo_id, data_movimento);

-- -----------------------------------------------------------------------------
-- Triggers de controle e auditoria
-- -----------------------------------------------------------------------------
create trigger trg_credores_controle before insert or update on public.credores
  for each row execute function public.definir_colunas_controle();
create trigger trg_emprestimos_controle before insert or update on public.emprestimos
  for each row execute function public.definir_colunas_controle();
create trigger trg_pagamentos_controle before insert or update on public.pagamentos
  for each row execute function public.definir_colunas_controle();
create trigger trg_reserva_controle before insert or update on public.reserva_movimentos
  for each row execute function public.definir_colunas_controle();

create trigger trg_credores_auditoria after insert or update or delete on public.credores
  for each row execute function public.registrar_auditoria();
create trigger trg_emprestimos_auditoria after insert or update or delete on public.emprestimos
  for each row execute function public.registrar_auditoria();
create trigger trg_pagamentos_auditoria after insert or update or delete on public.pagamentos
  for each row execute function public.registrar_auditoria();
create trigger trg_imputacoes_auditoria after insert or update or delete on public.pagamento_imputacoes
  for each row execute function public.registrar_auditoria();
create trigger trg_reserva_auditoria after insert or update or delete on public.reserva_movimentos
  for each row execute function public.registrar_auditoria();

-- -----------------------------------------------------------------------------
-- Geração do cronograma
--   Competência n vence em data_inicio + n meses.
--   Principal previsto na última competência (vencimento do principal informado
--   no contrato fica registrado em emprestimos.data_vencimento_principal).
-- -----------------------------------------------------------------------------
create or replace function public.gerar_cronograma(p_emprestimo_id uuid)
returns void
language plpgsql
as $$
declare
  e public.emprestimos;
begin
  select * into e from public.emprestimos where id = p_emprestimo_id;
  if not found then
    raise exception 'Empréstimo não encontrado';
  end if;

  if exists (
    select 1 from public.pagamento_imputacoes i
    join public.pagamentos p on p.id = i.pagamento_id
    where i.emprestimo_id = p_emprestimo_id and p.estornado_em is null
  ) then
    raise exception 'O cronograma não pode ser regerado porque já existem pagamentos registrados. Estorne os pagamentos ou registre um novo contrato (renegociação).'
      using errcode = 'P0001';
  end if;

  -- Imputações de pagamentos estornados apontam para competências antigas
  delete from public.pagamento_imputacoes where emprestimo_id = p_emprestimo_id;
  delete from public.emprestimo_competencias where emprestimo_id = p_emprestimo_id;

  insert into public.emprestimo_competencias
    (emprestimo_id, numero, data_vencimento, juros_devido, principal_previsto, pagamento_previsto, reserva_prevista)
  select
    e.id,
    n,
    (e.data_inicio + make_interval(months => n))::date,
    e.juros_mensal,
    case when n = e.prazo_meses then e.valor_principal else 0 end,
    e.valor_mensal_pagamento_planejado,
    e.valor_mensal_reserva_planejado
  from generate_series(1, e.prazo_meses) as n;
end;
$$;

create or replace function public.trg_emprestimo_cronograma()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.valor_principal is distinct from old.valor_principal
     or new.taxa_juros_mensal is distinct from old.taxa_juros_mensal
     or new.data_inicio is distinct from old.data_inicio
     or new.prazo_meses is distinct from old.prazo_meses
     or new.valor_mensal_pagamento_planejado is distinct from old.valor_mensal_pagamento_planejado
     or new.valor_mensal_reserva_planejado is distinct from old.valor_mensal_reserva_planejado
  then
    perform public.gerar_cronograma(new.id);
  end if;
  return new;
end;
$$;

create trigger trg_emprestimos_cronograma
after insert or update on public.emprestimos
for each row execute function public.trg_emprestimo_cronograma();

-- -----------------------------------------------------------------------------
-- Views de posição (security_invoker: respeitam RLS de quem consulta)
-- -----------------------------------------------------------------------------
create view public.vw_imputacoes_validas
with (security_invoker = true) as
select i.*
from public.pagamento_imputacoes i
join public.pagamentos p on p.id = i.pagamento_id
where p.estornado_em is null;

create view public.vw_competencias
with (security_invoker = true) as
select
  c.id,
  c.emprestimo_id,
  c.numero,
  c.data_vencimento,
  c.juros_devido,
  c.principal_previsto,
  c.pagamento_previsto,
  c.reserva_prevista,
  coalesce(jp.juros_pago, 0)::numeric(14,2)                         as juros_pago,
  (c.juros_devido - coalesce(jp.juros_pago, 0))::numeric(14,2)      as juros_em_aberto,
  (c.data_vencimento < public.hoje_br())                            as vencida,
  case
    when c.juros_devido - coalesce(jp.juros_pago, 0) <= 0 then 'paga'
    when c.data_vencimento >= public.hoje_br() then
      case when coalesce(jp.juros_pago, 0) > 0 then 'parcial' else 'a_vencer' end
    when coalesce(jp.juros_pago, 0) > 0 then 'parcial_atrasada'
    else 'atrasada'
  end                                                               as situacao,
  -- Realizado no mês civil do vencimento
  coalesce(pm.pago_no_mes, 0)::numeric(14,2)                        as pagamento_realizado_mes,
  coalesce(rm.reserva_no_mes, 0)::numeric(14,2)                     as reserva_realizada_mes
from public.emprestimo_competencias c
left join lateral (
  select sum(i.valor) as juros_pago
  from public.vw_imputacoes_validas i
  where i.competencia_id = c.id and i.tipo = 'juros'
) jp on true
left join lateral (
  select sum(p.valor_total) as pago_no_mes
  from public.pagamentos p
  where p.emprestimo_id = c.emprestimo_id
    and p.estornado_em is null
    and date_trunc('month', p.data_pagamento) = date_trunc('month', c.data_vencimento)
) pm on true
left join lateral (
  select sum(r.valor) as reserva_no_mes
  from public.reserva_movimentos r
  where r.emprestimo_id = c.emprestimo_id
    and r.estornado_em is null
    and r.tipo = 'aporte'
    and date_trunc('month', r.data_movimento) = date_trunc('month', c.data_vencimento)
) rm on true;

create view public.vw_emprestimo_posicao
with (security_invoker = true) as
select
  e.id,
  e.codigo,
  e.credor_id,
  cr.nome                                                   as credor_nome,
  e.status,
  e.valor_principal,
  e.taxa_juros_mensal,
  e.juros_mensal,
  e.data_inicio,
  e.data_vencimento_principal,
  e.prazo_meses,
  e.juros_contratados_total,
  (e.juros_mensal * e.prazo_meses)::numeric(14,2)           as juros_contratados_referencia,
  e.valor_mensal_pagamento_planejado,
  e.valor_mensal_reserva_planejado,
  -- Principal
  coalesce(pp.principal_pago, 0)::numeric(14,2)             as principal_pago,
  (e.valor_principal - coalesce(pp.principal_pago, 0))::numeric(14,2) as principal_devido,
  -- Juros
  coalesce(j.juros_devidos_vencidos, 0)::numeric(14,2)      as juros_devidos_ate_hoje,
  coalesce(j.juros_pagos, 0)::numeric(14,2)                 as juros_pagos,
  coalesce(j.juros_vencidos_nao_pagos, 0)::numeric(14,2)    as juros_vencidos_nao_pagos,
  coalesce(j.juros_a_vencer, 0)::numeric(14,2)              as juros_a_vencer,
  coalesce(j.competencias_atrasadas, 0)::int                as competencias_atrasadas,
  -- Pagamentos
  coalesce(pg.total_pago, 0)::numeric(14,2)                 as total_pago,
  coalesce(pg.qtd_pagamentos, 0)::int                       as qtd_pagamentos,
  -- Reserva
  coalesce(r.aportes, 0)::numeric(14,2)                     as reserva_aportes,
  coalesce(r.saidas, 0)::numeric(14,2)                      as reserva_saidas,
  (coalesce(r.aportes, 0) - coalesce(r.saidas, 0))::numeric(14,2) as reserva_saldo,
  -- Saldos
  (e.valor_principal - coalesce(pp.principal_pago, 0) + coalesce(j.juros_vencidos_nao_pagos, 0))::numeric(14,2)
                                                            as saldo_devedor_exigivel,
  (e.valor_principal - coalesce(pp.principal_pago, 0)
     + coalesce(j.juros_vencidos_nao_pagos, 0) + coalesce(j.juros_a_vencer, 0))::numeric(14,2)
                                                            as saldo_devedor_contratual,
  j.proximo_vencimento,
  (coalesce(j.competencias_atrasadas, 0) > 0
     or (e.data_vencimento_principal < public.hoje_br() and e.valor_principal - coalesce(pp.principal_pago, 0) > 0))
                                                            as em_atraso,
  e.observacoes,
  e.criado_em,
  e.atualizado_em
from public.emprestimos e
join public.credores cr on cr.id = e.credor_id
left join lateral (
  select sum(i.valor) as principal_pago
  from public.vw_imputacoes_validas i
  where i.emprestimo_id = e.id and i.tipo = 'principal'
) pp on true
left join lateral (
  select
    sum(c.juros_devido) filter (where c.vencida)                      as juros_devidos_vencidos,
    sum(c.juros_pago)                                                 as juros_pagos,
    sum(greatest(c.juros_em_aberto, 0)) filter (where c.vencida)      as juros_vencidos_nao_pagos,
    sum(greatest(c.juros_em_aberto, 0)) filter (where not c.vencida)  as juros_a_vencer,
    count(*) filter (where c.vencida and c.juros_em_aberto > 0)       as competencias_atrasadas,
    min(c.data_vencimento) filter (where not c.vencida and c.juros_em_aberto > 0) as proximo_vencimento
  from public.vw_competencias c
  where c.emprestimo_id = e.id
) j on true
left join lateral (
  select sum(p.valor_total) as total_pago, count(*) as qtd_pagamentos
  from public.pagamentos p
  where p.emprestimo_id = e.id and p.estornado_em is null
) pg on true
left join lateral (
  select
    sum(m.valor) filter (where m.tipo = 'aporte')                      as aportes,
    sum(m.valor) filter (where m.tipo in ('resgate', 'utilizacao_pagamento')) as saidas
  from public.reserva_movimentos m
  where m.emprestimo_id = e.id and m.estornado_em is null
) r on true
where e.excluido_em is null;

-- -----------------------------------------------------------------------------
-- Validação de saldo da reserva (não pode ficar negativa)
-- -----------------------------------------------------------------------------
create or replace function public.validar_saldo_reserva()
returns trigger
language plpgsql
as $$
declare
  v_saldo numeric(14,2);
begin
  select coalesce(sum(case when tipo = 'aporte' then valor else -valor end), 0)
    into v_saldo
  from public.reserva_movimentos
  where emprestimo_id = new.emprestimo_id and estornado_em is null;

  if v_saldo < 0 then
    raise exception 'Saldo de reserva insuficiente para este empréstimo (saldo resultante: %).', v_saldo
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create constraint trigger trg_reserva_saldo
after insert or update on public.reserva_movimentos
deferrable initially deferred
for each row execute function public.validar_saldo_reserva();

-- -----------------------------------------------------------------------------
-- RPC: registrar pagamento (atômico)
--   p_modo = 'automatico': abate juros VENCIDOS até a data do pagamento (do mais
--            antigo para o mais recente) e depois principal. Se o principal já
--            estiver quitado, o excedente antecipa juros a vencer.
--   p_modo = 'manual': o usuário informa quanto vai para juros e quanto vai para
--            principal. A parte de juros é distribuída do mais antigo em aberto
--            para o mais recente (vencidos primeiro, depois a vencer).
-- -----------------------------------------------------------------------------
create or replace function public.registrar_pagamento(
  p_emprestimo_id   uuid,
  p_data_pagamento  date,
  p_valor_total     numeric,
  p_modo            text default 'automatico',
  p_valor_juros     numeric default null,
  p_valor_principal numeric default null,
  p_forma_pagamento text default null,
  p_origem_reserva  boolean default false,
  p_observacoes     text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pagamento_id    uuid;
  v_restante        numeric(14,2);
  v_para_juros      numeric(14,2);
  v_para_principal  numeric(14,2);
  v_principal_aberto numeric(14,2);
  v_juros_aberto_total numeric(14,2);
  v_aplicar         numeric(14,2);
  c                 record;
begin
  if not public.pode_editar() then
    raise exception 'Sem permissão para registrar pagamentos.' using errcode = '42501';
  end if;

  p_valor_total := round(p_valor_total, 2);
  if p_valor_total is null or p_valor_total <= 0 then
    raise exception 'O valor do pagamento deve ser maior que zero.' using errcode = 'P0001';
  end if;

  perform 1 from public.emprestimos
   where id = p_emprestimo_id and excluido_em is null
   for update;
  if not found then
    raise exception 'Empréstimo não encontrado.' using errcode = 'P0001';
  end if;

  select e.valor_principal - coalesce((
           select sum(i.valor) from public.vw_imputacoes_validas i
           where i.emprestimo_id = e.id and i.tipo = 'principal'), 0)
    into v_principal_aberto
  from public.emprestimos e where e.id = p_emprestimo_id;

  select coalesce(sum(greatest(juros_em_aberto, 0)), 0) into v_juros_aberto_total
  from public.vw_competencias where emprestimo_id = p_emprestimo_id;

  if p_valor_total > v_principal_aberto + v_juros_aberto_total then
    raise exception 'O valor (%) excede o saldo total do contrato (%).',
      p_valor_total, v_principal_aberto + v_juros_aberto_total using errcode = 'P0001';
  end if;

  insert into public.pagamentos
    (emprestimo_id, data_pagamento, valor_total, forma_pagamento, origem_reserva, observacoes)
  values
    (p_emprestimo_id, p_data_pagamento, p_valor_total, p_forma_pagamento, coalesce(p_origem_reserva, false), p_observacoes)
  returning id into v_pagamento_id;

  if p_modo = 'manual' then
    v_para_juros := round(coalesce(p_valor_juros, 0), 2);
    v_para_principal := round(coalesce(p_valor_principal, 0), 2);
    if v_para_juros < 0 or v_para_principal < 0 or v_para_juros + v_para_principal <> p_valor_total then
      raise exception 'Na imputação manual, juros + principal deve ser igual ao valor total.' using errcode = 'P0001';
    end if;
    if v_para_juros > v_juros_aberto_total then
      raise exception 'O valor destinado a juros (%) excede os juros em aberto (%).', v_para_juros, v_juros_aberto_total
        using errcode = 'P0001';
    end if;
    if v_para_principal > v_principal_aberto then
      raise exception 'O valor destinado ao principal (%) excede o principal devido (%).', v_para_principal, v_principal_aberto
        using errcode = 'P0001';
    end if;

    v_restante := v_para_juros;
    for c in
      select id, juros_em_aberto from public.vw_competencias
      where emprestimo_id = p_emprestimo_id and juros_em_aberto > 0
      order by data_vencimento, numero
    loop
      exit when v_restante <= 0;
      v_aplicar := least(v_restante, c.juros_em_aberto);
      insert into public.pagamento_imputacoes (pagamento_id, emprestimo_id, tipo, competencia_id, valor)
      values (v_pagamento_id, p_emprestimo_id, 'juros', c.id, v_aplicar);
      v_restante := v_restante - v_aplicar;
    end loop;

    if v_para_principal > 0 then
      insert into public.pagamento_imputacoes (pagamento_id, emprestimo_id, tipo, valor)
      values (v_pagamento_id, p_emprestimo_id, 'principal', v_para_principal);
    end if;

  elsif p_modo = 'automatico' then
    v_restante := p_valor_total;

    -- 1) Juros vencidos até a data do pagamento
    for c in
      select id, juros_em_aberto from public.vw_competencias
      where emprestimo_id = p_emprestimo_id and juros_em_aberto > 0
        and data_vencimento <= p_data_pagamento
      order by data_vencimento, numero
    loop
      exit when v_restante <= 0;
      v_aplicar := least(v_restante, c.juros_em_aberto);
      insert into public.pagamento_imputacoes (pagamento_id, emprestimo_id, tipo, competencia_id, valor)
      values (v_pagamento_id, p_emprestimo_id, 'juros', c.id, v_aplicar);
      v_restante := v_restante - v_aplicar;
    end loop;

    -- 2) Principal
    if v_restante > 0 and v_principal_aberto > 0 then
      v_aplicar := least(v_restante, v_principal_aberto);
      insert into public.pagamento_imputacoes (pagamento_id, emprestimo_id, tipo, valor)
      values (v_pagamento_id, p_emprestimo_id, 'principal', v_aplicar);
      v_restante := v_restante - v_aplicar;
    end if;

    -- 3) Excedente antecipa juros a vencer
    if v_restante > 0 then
      for c in
        select id, juros_em_aberto from public.vw_competencias
        where emprestimo_id = p_emprestimo_id and juros_em_aberto > 0
        order by data_vencimento, numero
      loop
        exit when v_restante <= 0;
        v_aplicar := least(v_restante, c.juros_em_aberto);
        insert into public.pagamento_imputacoes (pagamento_id, emprestimo_id, tipo, competencia_id, valor)
        values (v_pagamento_id, p_emprestimo_id, 'juros', c.id, v_aplicar);
        v_restante := v_restante - v_aplicar;
      end loop;
    end if;

    if v_restante > 0 then
      raise exception 'Não foi possível imputar todo o valor do pagamento.' using errcode = 'P0001';
    end if;
  else
    raise exception 'Modo de imputação inválido: %', p_modo using errcode = 'P0001';
  end if;

  -- Pagamento feito com recursos da reserva: gera a saída correspondente
  if coalesce(p_origem_reserva, false) then
    insert into public.reserva_movimentos
      (emprestimo_id, tipo, data_movimento, valor, pagamento_id, observacoes)
    values
      (p_emprestimo_id, 'utilizacao_pagamento', p_data_pagamento, p_valor_total, v_pagamento_id,
       'Utilização da reserva para pagamento ao credor');
  end if;

  return v_pagamento_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: estornar pagamento (mantém o registro, marca como estornado)
-- -----------------------------------------------------------------------------
create or replace function public.estornar_pagamento(p_pagamento_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.pode_editar() then
    raise exception 'Sem permissão para estornar pagamentos.' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno.' using errcode = 'P0001';
  end if;

  update public.pagamentos
     set estornado_em = now(), motivo_estorno = p_motivo
   where id = p_pagamento_id and estornado_em is null;
  if not found then
    raise exception 'Pagamento não encontrado ou já estornado.' using errcode = 'P0001';
  end if;

  update public.reserva_movimentos
     set estornado_em = now(), motivo_estorno = 'Estorno do pagamento vinculado: ' || p_motivo
   where pagamento_id = p_pagamento_id and estornado_em is null;
end;
$$;

create or replace function public.estornar_movimento_reserva(p_movimento_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.pode_editar() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reserva_movimentos where id = p_movimento_id and pagamento_id is not null) then
    raise exception 'Este movimento está vinculado a um pagamento. Estorne o pagamento.' using errcode = 'P0001';
  end if;

  update public.reserva_movimentos
     set estornado_em = now(), motivo_estorno = p_motivo
   where id = p_movimento_id and estornado_em is null;
  if not found then
    raise exception 'Movimento não encontrado ou já estornado.' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.credores               enable row level security;
alter table public.emprestimos            enable row level security;
alter table public.emprestimo_competencias enable row level security;
alter table public.pagamentos             enable row level security;
alter table public.pagamento_imputacoes   enable row level security;
alter table public.reserva_movimentos     enable row level security;

-- Leitura: qualquer usuário ativo
create policy credores_select    on public.credores               for select to authenticated using (public.pode_ler());
create policy emprestimos_select on public.emprestimos            for select to authenticated using (public.pode_ler());
create policy competencias_select on public.emprestimo_competencias for select to authenticated using (public.pode_ler());
create policy pagamentos_select  on public.pagamentos             for select to authenticated using (public.pode_ler());
create policy imputacoes_select  on public.pagamento_imputacoes   for select to authenticated using (public.pode_ler());
create policy reserva_select     on public.reserva_movimentos     for select to authenticated using (public.pode_ler());

-- Escrita: admin e operador
create policy credores_insert on public.credores for insert to authenticated with check (public.pode_editar());
create policy credores_update on public.credores for update to authenticated using (public.pode_editar()) with check (public.pode_editar());

create policy emprestimos_insert on public.emprestimos for insert to authenticated with check (public.pode_editar());
create policy emprestimos_update on public.emprestimos for update to authenticated using (public.pode_editar()) with check (public.pode_editar());

-- Cronograma é mantido pela função gerar_cronograma (executada no contexto de quem edita)
create policy competencias_insert on public.emprestimo_competencias for insert to authenticated with check (public.pode_editar());
create policy competencias_delete on public.emprestimo_competencias for delete to authenticated using (public.pode_editar());

create policy pagamentos_insert on public.pagamentos for insert to authenticated with check (public.pode_editar());
create policy pagamentos_update on public.pagamentos for update to authenticated using (public.pode_editar()) with check (public.pode_editar());

create policy imputacoes_insert on public.pagamento_imputacoes for insert to authenticated with check (public.pode_editar());
create policy imputacoes_delete on public.pagamento_imputacoes for delete to authenticated using (public.pode_editar());

create policy reserva_insert on public.reserva_movimentos for insert to authenticated
  with check (public.pode_editar() and (tipo <> 'utilizacao_pagamento' or pagamento_id is not null));
create policy reserva_update on public.reserva_movimentos for update to authenticated using (public.pode_editar()) with check (public.pode_editar());

-- Sem DELETE físico em credores, empréstimos, pagamentos e reservas (exclusão lógica / estorno).
revoke delete on public.credores, public.emprestimos, public.pagamentos, public.reserva_movimentos from authenticated;
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

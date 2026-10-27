-- =============================================================================
-- Operações: o acordo como fonte de recursos do empréstimo
--
-- Regras confirmadas com o responsável:
--   1. Uma OPERAÇÃO liga um acordo a um empréstimo e define percentuais de
--      destinação de cada recebimento: % para o empréstimo e % para a reserva.
--      Se a soma ficar abaixo de 100%, a diferença vai para o montante
--      remanescente.
--   2. Cada recebimento do acordo é destinado na mesma transação:
--        * parte do empréstimo -> paga JUROS em aberto (vencidos na data do
--          recebimento e a próxima competência a vencer), do mais antigo para o
--          mais recente. Nunca abate principal;
--        * parte da reserva    -> aporte na reserva do empréstimo;
--        * excedente           -> montante remanescente da operação.
--   3. Recebimento parcial: o empréstimo tem prioridade. As cotas são calculadas
--      sobre o valor nominal de cada parcela do acordo. O que chega primeiro
--      preenche a cota do empréstimo da parcela, depois a da reserva.
--   4. Vários acordos (processos) podem alimentar o mesmo empréstimo; as
--      contribuições somam na mesma competência de juros.
--   5. Sem juros a pagar (empréstimo quitado, ou juros já cobertos até a próxima
--      competência), a cota do empréstimo vai para o montante remanescente.
--   6. O principal é quitado com a reserva por ação explícita do usuário
--      (quitar_principal_com_reserva).
--   7. Estornar o recebimento estorna em cascata o pagamento e o aporte gerados.
--      Esses lançamentos não podem ser estornados isoladamente.
-- =============================================================================

create type public.destino_operacao as enum ('emprestimo', 'reserva', 'remanescente');
create type public.cota_operacao as enum ('emprestimo', 'reserva', 'livre');

-- -----------------------------------------------------------------------------
-- Operações
-- -----------------------------------------------------------------------------
create sequence public.seq_codigo_operacao;

create table public.operacoes (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null unique default (
                          'OPR-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' ||
                          lpad(nextval('public.seq_codigo_operacao')::text, 4, '0')
                        ),
  acordo_id             uuid not null references public.acordos (id),
  emprestimo_id         uuid not null references public.emprestimos (id),
  percentual_emprestimo numeric(5,2) not null check (percentual_emprestimo between 0 and 100),
  percentual_reserva    numeric(5,2) not null check (percentual_reserva between 0 and 100),
  observacoes           text,
  encerrada_em          timestamptz,
  motivo_encerramento   text,
  criado_em             timestamptz not null default now(),
  criado_por            uuid references auth.users (id),
  atualizado_em         timestamptz not null default now(),
  constraint ck_operacao_percentuais check (
    percentual_emprestimo + percentual_reserva > 0 and percentual_emprestimo + percentual_reserva <= 100
  ),
  constraint ck_operacao_encerramento check (
    (encerrada_em is null) or (coalesce(trim(motivo_encerramento), '') <> '')
  )
);

comment on table public.operacoes is 'Vínculo acordo → empréstimo: como cada recebimento do acordo é destinado.';
comment on column public.operacoes.percentual_emprestimo is 'Percentual de cada parcela do acordo destinado aos juros do empréstimo.';
comment on column public.operacoes.percentual_reserva is 'Percentual de cada parcela do acordo destinado à reserva do empréstimo.';

-- Um acordo alimenta no máximo uma operação ativa; um empréstimo pode ter várias.
create unique index uq_operacao_acordo_ativa on public.operacoes (acordo_id) where encerrada_em is null;
create index idx_operacoes_emprestimo on public.operacoes (emprestimo_id);

-- Vínculo dos lançamentos financeiros com a origem
alter table public.pagamentos
  add column operacao_id    uuid references public.operacoes (id),
  add column recebimento_id uuid references public.acordo_recebimentos (id);
alter table public.reserva_movimentos
  add column operacao_id    uuid references public.operacoes (id),
  add column recebimento_id uuid references public.acordo_recebimentos (id);

create index idx_pagamentos_recebimento on public.pagamentos (recebimento_id) where recebimento_id is not null;
create index idx_reserva_recebimento on public.reserva_movimentos (recebimento_id) where recebimento_id is not null;

-- O vínculo com a origem é gravado uma vez e não muda (garante o estorno pela origem)
create or replace function public.trg_vinculo_origem_imutavel()
returns trigger
language plpgsql
as $$
begin
  if (old.operacao_id is not null and new.operacao_id is distinct from old.operacao_id)
     or (old.recebimento_id is not null and new.recebimento_id is distinct from old.recebimento_id) then
    raise exception 'O vínculo deste lançamento com o recebimento de origem não pode ser alterado.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_pagamentos_vinculo before update on public.pagamentos
  for each row execute function public.trg_vinculo_origem_imutavel();
create trigger trg_reserva_vinculo before update on public.reserva_movimentos
  for each row execute function public.trg_vinculo_origem_imutavel();

-- -----------------------------------------------------------------------------
-- Destinações: como cada recebimento foi distribuído (por parcela do acordo)
-- -----------------------------------------------------------------------------
create table public.operacao_destinacoes (
  id                   uuid primary key default gen_random_uuid(),
  operacao_id          uuid not null references public.operacoes (id),
  recebimento_id       uuid not null references public.acordo_recebimentos (id),
  parcela_id           uuid not null references public.acordo_parcelas (id),
  emprestimo_id        uuid not null references public.emprestimos (id),
  data_destinacao      date not null,
  cota                 public.cota_operacao not null,
  destino              public.destino_operacao not null,
  valor                numeric(14,2) not null check (valor > 0),
  pagamento_id         uuid references public.pagamentos (id),
  reserva_movimento_id uuid references public.reserva_movimentos (id),
  estornado_em         timestamptz,
  motivo_estorno       text,
  criado_em            timestamptz not null default now(),
  criado_por           uuid references auth.users (id) default auth.uid(),
  constraint ck_destinacao_vinculo check (
    (destino = 'emprestimo'   and pagamento_id is not null and reserva_movimento_id is null) or
    (destino = 'reserva'      and reserva_movimento_id is not null and pagamento_id is null) or
    (destino = 'remanescente' and pagamento_id is null and reserva_movimento_id is null)
  )
);

comment on column public.operacao_destinacoes.cota is 'Cota de origem (regra da operação). A cota do empréstimo pode ir para o remanescente quando não há juros a pagar.';

create index idx_destinacoes_operacao on public.operacao_destinacoes (operacao_id, data_destinacao);
create index idx_destinacoes_recebimento on public.operacao_destinacoes (recebimento_id);
create index idx_destinacoes_parcela on public.operacao_destinacoes (parcela_id);
create index idx_destinacoes_emprestimo on public.operacao_destinacoes (emprestimo_id);

-- -----------------------------------------------------------------------------
-- Controle, auditoria e movimentações
-- -----------------------------------------------------------------------------
create trigger trg_operacoes_controle before insert or update on public.operacoes
  for each row execute function public.definir_colunas_controle();
create trigger trg_operacoes_auditoria after insert or update or delete on public.operacoes
  for each row execute function public.registrar_auditoria();
create trigger trg_destinacoes_auditoria after insert or update or delete on public.operacao_destinacoes
  for each row execute function public.registrar_auditoria();

alter table public.processo_movimentacoes drop constraint processo_movimentacoes_tipo_check;
alter table public.processo_movimentacoes add constraint processo_movimentacoes_tipo_check
  check (tipo in ('anotacao', 'processo', 'acordo', 'recebimento', 'protocolo', 'documento', 'operacao'));

-- Validação e movimentação ao criar/alterar operação
create or replace function public.trg_operacao_validar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.acordos where id = new.acordo_id and excluido_em is null) then
      raise exception 'Acordo não encontrado.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.emprestimos where id = new.emprestimo_id and excluido_em is null) then
      raise exception 'Empréstimo não encontrado.' using errcode = 'P0001';
    end if;
  else
    -- Regras e vínculos são imutáveis depois de criada (preserva o histórico das destinações).
    if new.acordo_id <> old.acordo_id or new.emprestimo_id <> old.emprestimo_id
       or new.percentual_emprestimo <> old.percentual_emprestimo
       or new.percentual_reserva <> old.percentual_reserva then
      raise exception 'Os percentuais e vínculos de uma operação não podem ser alterados. Encerre a operação e crie outra.'
        using errcode = 'P0001';
    end if;
    if old.encerrada_em is not null and new.encerrada_em is distinct from old.encerrada_em then
      raise exception 'Operação já encerrada.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_operacoes_validar before insert or update on public.operacoes
  for each row execute function public.trg_operacao_validar();

create or replace function public.trg_mov_operacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proc uuid;
  v_acordo text;
  v_emp text;
begin
  select a.processo_id, a.codigo into v_proc, v_acordo from public.acordos a where a.id = new.acordo_id;
  select e.codigo into v_emp from public.emprestimos e where e.id = new.emprestimo_id;
  if tg_op = 'INSERT' then
    perform public.registrar_movimentacao(v_proc, 'operacao',
      'Operação ' || new.codigo || ': acordo ' || v_acordo || ' passa a alimentar o empréstimo ' || v_emp ||
      ' (' || to_char(new.percentual_emprestimo, 'FM990D00') || '% juros, ' ||
      to_char(new.percentual_reserva, 'FM990D00') || '% reserva)',
      'operacoes', new.id);
  elsif new.encerrada_em is not null and old.encerrada_em is null then
    perform public.registrar_movimentacao(v_proc, 'operacao',
      'Operação ' || new.codigo || ' encerrada: ' || coalesce(new.motivo_encerramento, ''), 'operacoes', new.id);
  end if;
  return new;
end;
$$;

create trigger trg_operacoes_movimentacao after insert or update on public.operacoes
  for each row execute function public.trg_mov_operacao();

-- -----------------------------------------------------------------------------
-- Capacidade de juros do empréstimo numa data:
--   juros em aberto das competências vencidas até a data + a próxima a vencer.
-- -----------------------------------------------------------------------------
create or replace function public.capacidade_juros_operacao(p_emprestimo_id uuid, p_data date)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  with abertas as (
    select data_vencimento, numero, juros_em_aberto
    from public.vw_competencias
    where emprestimo_id = p_emprestimo_id and juros_em_aberto > 0
  ), proxima as (
    select data_vencimento, numero from abertas
    where data_vencimento > p_data
    order by data_vencimento, numero
    limit 1
  )
  select coalesce(sum(a.juros_em_aberto), 0)::numeric(14,2)
  from abertas a
  where a.data_vencimento <= p_data
     or (a.data_vencimento, a.numero) = (select data_vencimento, numero from proxima)
$$;

-- -----------------------------------------------------------------------------
-- Destinação de um recebimento (chamada por registrar_recebimento)
-- -----------------------------------------------------------------------------
create or replace function public.destinar_recebimento(p_recebimento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r            record;
  op           record;
  i            record;
  v_cota_emp   numeric(14,2);
  v_cota_res   numeric(14,2);
  v_ja_emp     numeric(14,2);
  v_ja_res     numeric(14,2);
  v_disp       numeric(14,2);
  v_emp        numeric(14,2);
  v_res        numeric(14,2);
  v_capacidade numeric(14,2);
  v_para_juros numeric(14,2);
  v_total_juros numeric(14,2) := 0;
  v_total_res  numeric(14,2) := 0;
  v_total_rem  numeric(14,2) := 0;
  v_pagamento  uuid;
  v_reserva    uuid;
  v_acordo     text;
  partes       jsonb := '[]'::jsonb;
  p            jsonb;
begin
  select * into r from public.acordo_recebimentos where id = p_recebimento_id;
  select * into op from public.operacoes where acordo_id = r.acordo_id and encerrada_em is null;
  if not found then
    return;  -- acordo sem operação: só acompanhamento
  end if;

  perform 1 from public.emprestimos where id = op.emprestimo_id and excluido_em is null for update;
  if not found then
    raise exception 'O empréstimo vinculado à operação % não está disponível.', op.codigo using errcode = 'P0001';
  end if;
  perform public.atualizar_competencias_pos_vencimento(op.emprestimo_id);

  v_capacidade := public.capacidade_juros_operacao(op.emprestimo_id, r.data_recebimento);

  -- 1) Cotas por parcela do acordo (empréstimo primeiro, depois reserva, resto livre)
  for i in
    select ri.parcela_id, ri.valor, ap.valor as valor_parcela
    from public.acordo_recebimento_imputacoes ri
    join public.acordo_parcelas ap on ap.id = ri.parcela_id
    where ri.recebimento_id = p_recebimento_id
    order by ap.data_vencimento, ap.numero
  loop
    v_cota_emp := round(i.valor_parcela * op.percentual_emprestimo / 100, 2);
    v_cota_res := case when op.percentual_emprestimo + op.percentual_reserva = 100
                       then i.valor_parcela - v_cota_emp
                       else round(i.valor_parcela * op.percentual_reserva / 100, 2) end;

    select coalesce(sum(valor) filter (where cota = 'emprestimo'), 0),
           coalesce(sum(valor) filter (where cota = 'reserva'), 0)
      into v_ja_emp, v_ja_res
    from public.operacao_destinacoes
    where operacao_id = op.id and parcela_id = i.parcela_id and estornado_em is null;

    v_disp := i.valor;
    v_emp := least(v_disp, greatest(v_cota_emp - v_ja_emp, 0));
    v_disp := v_disp - v_emp;
    v_res := least(v_disp, greatest(v_cota_res - v_ja_res, 0));
    v_disp := v_disp - v_res;

    -- cota do empréstimo: juros até a capacidade; excedente para o remanescente
    if v_emp > 0 then
      v_para_juros := least(v_emp, v_capacidade);
      v_capacidade := v_capacidade - v_para_juros;
      if v_para_juros > 0 then
        partes := partes || jsonb_build_object('parcela', i.parcela_id, 'cota', 'emprestimo', 'destino', 'emprestimo', 'valor', v_para_juros);
        v_total_juros := v_total_juros + v_para_juros;
      end if;
      if v_emp - v_para_juros > 0 then
        partes := partes || jsonb_build_object('parcela', i.parcela_id, 'cota', 'emprestimo', 'destino', 'remanescente', 'valor', v_emp - v_para_juros);
        v_total_rem := v_total_rem + (v_emp - v_para_juros);
      end if;
    end if;
    if v_res > 0 then
      partes := partes || jsonb_build_object('parcela', i.parcela_id, 'cota', 'reserva', 'destino', 'reserva', 'valor', v_res);
      v_total_res := v_total_res + v_res;
    end if;
    if v_disp > 0 then
      partes := partes || jsonb_build_object('parcela', i.parcela_id, 'cota', 'livre', 'destino', 'remanescente', 'valor', v_disp);
      v_total_rem := v_total_rem + v_disp;
    end if;
  end loop;

  select a.codigo into v_acordo from public.acordos a where a.id = r.acordo_id;

  -- 2) Lançamentos financeiros (um pagamento e um aporte por recebimento)
  if v_total_juros > 0 then
    v_pagamento := public.registrar_pagamento(
      op.emprestimo_id, r.data_recebimento, v_total_juros, 'manual', v_total_juros, 0,
      'Acordo ' || v_acordo, false,
      'Operação ' || op.codigo || ': recebimento do acordo ' || v_acordo);
    update public.pagamentos set operacao_id = op.id, recebimento_id = r.id where id = v_pagamento;
  end if;

  if v_total_res > 0 then
    insert into public.reserva_movimentos
      (emprestimo_id, tipo, data_movimento, valor, observacoes, operacao_id, recebimento_id)
    values
      (op.emprestimo_id, 'aporte', r.data_recebimento, v_total_res,
       'Operação ' || op.codigo || ': recebimento do acordo ' || v_acordo, op.id, r.id)
    returning id into v_reserva;
  end if;

  -- 3) Registro detalhado por parcela
  for p in select * from jsonb_array_elements(partes) loop
    insert into public.operacao_destinacoes
      (operacao_id, recebimento_id, parcela_id, emprestimo_id, data_destinacao, cota, destino, valor,
       pagamento_id, reserva_movimento_id)
    values
      (op.id, r.id, (p->>'parcela')::uuid, op.emprestimo_id, r.data_recebimento,
       (p->>'cota')::public.cota_operacao, (p->>'destino')::public.destino_operacao, (p->>'valor')::numeric,
       case when p->>'destino' = 'emprestimo' then v_pagamento end,
       case when p->>'destino' = 'reserva' then v_reserva end);
  end loop;

  perform public.registrar_movimentacao_destinacao(r.id);
end;
$$;

-- Movimentação do processo com o resumo da destinação. SECURITY DEFINER porque
-- movimentações só são gravadas pelo sistema; o texto é montado a partir das
-- destinações gravadas (nenhum texto vem do usuário).
create or replace function public.registrar_movimentacao_destinacao(p_recebimento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if not public.pode_editar() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select
    a.processo_id, o.codigo as operacao, e.codigo as emprestimo, r.valor, r.data_recebimento,
    coalesce(sum(d.valor) filter (where d.destino = 'emprestimo'), 0)   as juros,
    coalesce(sum(d.valor) filter (where d.destino = 'reserva'), 0)      as reserva,
    coalesce(sum(d.valor) filter (where d.destino = 'remanescente'), 0) as remanescente
  into t
  from public.operacao_destinacoes d
  join public.acordo_recebimentos r on r.id = d.recebimento_id
  join public.acordos a on a.id = r.acordo_id
  join public.operacoes o on o.id = d.operacao_id
  join public.emprestimos e on e.id = d.emprestimo_id
  where d.recebimento_id = p_recebimento_id and d.estornado_em is null
  group by a.processo_id, o.codigo, e.codigo, r.valor, r.data_recebimento;
  if not found then
    return;
  end if;
  perform public.registrar_movimentacao(t.processo_id, 'operacao',
    'Operação ' || t.operacao || ': ' || public.fmt_brl(t.valor) || ' destinados ao empréstimo ' || t.emprestimo ||
    ' — juros ' || public.fmt_brl(t.juros) || ', reserva ' || public.fmt_brl(t.reserva) ||
    ', remanescente ' || public.fmt_brl(t.remanescente),
    'acordo_recebimentos', p_recebimento_id, t.data_recebimento);
end;
$$;

-- -----------------------------------------------------------------------------
-- registrar_recebimento: mesma regra anterior + destinação da operação
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

  perform public.destinar_recebimento(v_recebimento_id);

  return v_recebimento_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Estornos
-- -----------------------------------------------------------------------------
create or replace function public.estornar_recebimento(p_recebimento_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_motivo text;
  m        record;
  v_saldo  numeric(14,2);
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

  v_motivo := 'Estorno do recebimento de origem: ' || p_motivo;

  -- Aportes na reserva: o saldo não pode ficar negativo (reserva já utilizada)
  for m in
    select rm.id, rm.emprestimo_id, rm.valor
    from public.reserva_movimentos rm
    where rm.recebimento_id = p_recebimento_id and rm.estornado_em is null
  loop
    select coalesce(sum(case when tipo = 'aporte' then valor else -valor end), 0) into v_saldo
    from public.reserva_movimentos
    where emprestimo_id = m.emprestimo_id and estornado_em is null;
    if v_saldo - m.valor < 0 then
      raise exception 'Não é possível estornar: o aporte de % já foi utilizado da reserva (saldo atual %). Estorne antes o uso da reserva.',
        public.fmt_brl(m.valor), public.fmt_brl(v_saldo) using errcode = 'P0001';
    end if;
    update public.reserva_movimentos set estornado_em = now(), motivo_estorno = v_motivo where id = m.id;
  end loop;

  update public.pagamentos
     set estornado_em = now(), motivo_estorno = v_motivo
   where recebimento_id = p_recebimento_id and estornado_em is null;

  update public.operacao_destinacoes
     set estornado_em = now(), motivo_estorno = p_motivo
   where recebimento_id = p_recebimento_id and estornado_em is null;
end;
$$;

-- Pagamentos e aportes gerados por operação só são estornados pela origem
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
  if exists (select 1 from public.pagamentos where id = p_pagamento_id and recebimento_id is not null) then
    raise exception 'Este pagamento foi gerado por um recebimento de acordo (operação). Estorne o recebimento no acordo.'
      using errcode = 'P0001';
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
  if exists (select 1 from public.reserva_movimentos where id = p_movimento_id and recebimento_id is not null) then
    raise exception 'Este aporte foi gerado por um recebimento de acordo (operação). Estorne o recebimento no acordo.'
      using errcode = 'P0001';
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
-- Encerrar operação (os recebimentos seguintes do acordo deixam de ser destinados)
-- -----------------------------------------------------------------------------
create or replace function public.encerrar_operacao(p_operacao_id uuid, p_motivo text)
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
    raise exception 'Informe o motivo do encerramento.' using errcode = 'P0001';
  end if;
  update public.operacoes
     set encerrada_em = now(), motivo_encerramento = p_motivo
   where id = p_operacao_id and encerrada_em is null;
  if not found then
    raise exception 'Operação não encontrada ou já encerrada.' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Views
-- -----------------------------------------------------------------------------

-- Data em que a quitação do principal não anula juros já pagos
create view public.vw_emprestimo_quitacao_sugerida
with (security_invoker = true) as
select
  p.id as emprestimo_id,
  p.principal_devido,
  p.reserva_saldo,
  greatest(public.hoje_br(), coalesce((
    select max(c.data_vencimento) from public.vw_competencias c
    where c.emprestimo_id = p.id and c.juros_pago > 0), public.hoje_br())) as data_sugerida,
  (p.principal_devido > 0 and p.reserva_saldo >= p.principal_devido) as reserva_cobre_principal
from public.vw_emprestimo_posicao p;

create view public.vw_operacoes
with (security_invoker = true) as
select
  o.id,
  o.codigo,
  o.acordo_id,
  a.codigo                       as acordo_codigo,
  a.processo_id,
  pr.codigo                      as processo_codigo,
  pr.numero_processo,
  o.emprestimo_id,
  e.codigo                       as emprestimo_codigo,
  cr.nome                        as credor_nome,
  e.juros_mensal                 as emprestimo_juros_mensal,
  o.percentual_emprestimo,
  o.percentual_reserva,
  (100 - o.percentual_emprestimo - o.percentual_reserva)::numeric(5,2) as percentual_livre,
  o.observacoes,
  o.encerrada_em,
  o.motivo_encerramento,
  (o.encerrada_em is null)       as ativa,
  o.criado_em,
  coalesce(d.total_juros, 0)::numeric(14,2)        as total_juros,
  coalesce(d.total_reserva, 0)::numeric(14,2)      as total_reserva,
  coalesce(d.total_remanescente, 0)::numeric(14,2) as total_remanescente,
  coalesce(d.total_destinado, 0)::numeric(14,2)    as total_destinado,
  d.ultima_destinacao,
  np.valor                                          as proxima_parcela_valor,
  np.data_vencimento                                as proxima_parcela_vencimento,
  round(coalesce(np.valor, 0) * o.percentual_emprestimo / 100, 2)::numeric(14,2) as contribuicao_juros_prevista
from public.operacoes o
join public.acordos a      on a.id = o.acordo_id
join public.processos pr   on pr.id = a.processo_id
join public.emprestimos e  on e.id = o.emprestimo_id
join public.credores cr    on cr.id = e.credor_id
left join lateral (
  select
    sum(valor) filter (where destino = 'emprestimo')   as total_juros,
    sum(valor) filter (where destino = 'reserva')      as total_reserva,
    sum(valor) filter (where destino = 'remanescente') as total_remanescente,
    sum(valor)                                         as total_destinado,
    max(data_destinacao)                               as ultima_destinacao
  from public.operacao_destinacoes
  where operacao_id = o.id and estornado_em is null
) d on true
left join lateral (
  select vp.valor, vp.data_vencimento
  from public.vw_acordo_parcelas vp
  where vp.acordo_id = o.acordo_id and vp.saldo > 0
  order by vp.data_vencimento, vp.numero
  limit 1
) np on true;

-- Destinações legíveis (aba do acordo, do empréstimo e do remanescente)
create view public.vw_operacao_destinacoes
with (security_invoker = true) as
select
  d.id,
  d.operacao_id,
  o.codigo        as operacao_codigo,
  d.recebimento_id,
  d.parcela_id,
  ap.numero       as parcela_numero,
  d.emprestimo_id,
  e.codigo        as emprestimo_codigo,
  a.id            as acordo_id,
  a.codigo        as acordo_codigo,
  pr.id           as processo_id,
  pr.codigo       as processo_codigo,
  d.data_destinacao,
  d.cota,
  d.destino,
  d.valor,
  d.pagamento_id,
  d.reserva_movimento_id,
  d.estornado_em,
  d.motivo_estorno
from public.operacao_destinacoes d
join public.operacoes o       on o.id = d.operacao_id
join public.acordo_parcelas ap on ap.id = d.parcela_id
join public.acordos a         on a.id = o.acordo_id
join public.processos pr      on pr.id = a.processo_id
join public.emprestimos e     on e.id = d.emprestimo_id;

-- Cobertura da competência atual de cada empréstimo por fonte
--   competência atual = a mais antiga com juros em aberto; se não houver,
--   a última com juros pagos.
create view public.vw_emprestimo_cobertura
with (security_invoker = true) as
with atual as (
  select distinct on (c.emprestimo_id)
    c.emprestimo_id, c.id as competencia_id, c.numero, c.data_vencimento,
    c.juros_devido, c.juros_pago, greatest(c.juros_em_aberto, 0)::numeric(14,2) as juros_em_aberto,
    c.situacao, c.vencida
  from public.vw_competencias c
  where c.juros_devido > 0
  order by c.emprestimo_id, (c.juros_em_aberto > 0) desc, c.data_vencimento, c.numero
), fontes as (
  select
    i.competencia_id,
    p.operacao_id,
    sum(i.valor)::numeric(14,2) as valor
  from public.vw_imputacoes_validas i
  join public.pagamentos p on p.id = i.pagamento_id
  where i.tipo = 'juros'
  group by i.competencia_id, p.operacao_id
)
select
  a.emprestimo_id,
  a.competencia_id,
  a.numero,
  a.data_vencimento,
  a.juros_devido,
  a.juros_pago,
  a.juros_em_aberto,
  a.situacao,
  a.vencida,
  coalesce(jsonb_agg(
    jsonb_build_object(
      'operacao_id', f.operacao_id,
      'operacao_codigo', o.codigo,
      'acordo_codigo', ac.codigo,
      'processo_codigo', pr.codigo,
      'valor', f.valor
    ) order by o.codigo nulls last
  ) filter (where f.competencia_id is not null), '[]'::jsonb) as fontes
from atual a
left join fontes f            on f.competencia_id = a.competencia_id
left join public.operacoes o  on o.id = f.operacao_id
left join public.acordos ac   on ac.id = o.acordo_id
left join public.processos pr on pr.id = ac.processo_id
group by a.emprestimo_id, a.competencia_id, a.numero, a.data_vencimento, a.juros_devido,
         a.juros_pago, a.juros_em_aberto, a.situacao, a.vencida;

-- -----------------------------------------------------------------------------
-- Quitar o principal com a reserva (ação explícita do usuário)
-- -----------------------------------------------------------------------------
create or replace function public.quitar_principal_com_reserva(p_emprestimo_id uuid, p_data date default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  s        record;
  v_data   date;
  v_pag    uuid;
begin
  if not public.pode_editar() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  perform 1 from public.emprestimos where id = p_emprestimo_id and excluido_em is null for update;
  if not found then
    raise exception 'Empréstimo não encontrado.' using errcode = 'P0001';
  end if;

  select * into s from public.vw_emprestimo_quitacao_sugerida where emprestimo_id = p_emprestimo_id;
  if s.principal_devido <= 0 then
    raise exception 'O principal deste empréstimo já está quitado.' using errcode = 'P0001';
  end if;
  if s.reserva_saldo < s.principal_devido then
    raise exception 'A reserva (%) ainda não cobre o principal em aberto (%).',
      public.fmt_brl(s.reserva_saldo), public.fmt_brl(s.principal_devido) using errcode = 'P0001';
  end if;

  v_data := coalesce(p_data, s.data_sugerida);
  if v_data < s.data_sugerida then
    raise exception 'Há juros já pagos com vencimento até %. Use essa data ou uma posterior para não anular juros pagos.',
      public.fmt_data(s.data_sugerida) using errcode = 'P0001';
  end if;

  v_pag := public.registrar_pagamento(
    p_emprestimo_id, v_data, s.principal_devido, 'manual', 0, s.principal_devido,
    'Reserva', true, 'Quitação do principal com a reserva');

  return v_pag;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.operacoes            enable row level security;
alter table public.operacao_destinacoes enable row level security;

create policy operacoes_select on public.operacoes for select to authenticated using (public.pode_ler());
create policy operacoes_insert on public.operacoes for insert to authenticated with check (public.pode_editar());
create policy operacoes_update on public.operacoes for update to authenticated
  using (public.pode_editar()) with check (public.pode_editar());

create policy destinacoes_select on public.operacao_destinacoes for select to authenticated using (public.pode_ler());
create policy destinacoes_insert on public.operacao_destinacoes for insert to authenticated with check (public.pode_editar());
create policy destinacoes_update on public.operacao_destinacoes for update to authenticated
  using (public.pode_editar()) with check (public.pode_editar());

revoke delete on public.operacoes, public.operacao_destinacoes from authenticated;
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

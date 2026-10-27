-- =============================================================================
-- Regras confirmadas (2ª rodada):
--   1. Quitado o principal antes do prazo, os juros das competências que vencem
--      DEPOIS da data de quitação deixam de ser devidos.
--   2. Vencido o principal sem quitação, os juros mensais fixos continuam vencendo
--      (competências adicionais "pós-vencimento").
--   3. Multa, mora e correção monetária: não se aplicam (por enquanto).
-- =============================================================================

alter table public.emprestimo_competencias
  add column pos_vencimento boolean not null default false;

comment on column public.emprestimo_competencias.pos_vencimento is
  'Competência gerada após o prazo contratual porque o principal não foi quitado.';

-- -----------------------------------------------------------------------------
-- Data de quitação do principal: data do pagamento em que a soma acumulada
-- das imputações de principal atinge o valor principal.
-- -----------------------------------------------------------------------------
create view public.vw_emprestimo_quitacao
with (security_invoker = true) as
select emprestimo_id, min(data_pagamento) as data_quitacao_principal
from (
  select
    i.emprestimo_id,
    p.data_pagamento,
    e.valor_principal,
    sum(i.valor) over (
      partition by i.emprestimo_id
      order by p.data_pagamento, p.criado_em, i.id
    ) as acumulado
  from public.pagamento_imputacoes i
  join public.pagamentos p on p.id = i.pagamento_id and p.estornado_em is null
  join public.emprestimos e on e.id = i.emprestimo_id
  where i.tipo = 'principal'
) x
where acumulado >= valor_principal
group by emprestimo_id;

-- -----------------------------------------------------------------------------
-- Recria as views de posição com juros efetivamente devidos
-- -----------------------------------------------------------------------------
drop view public.vw_emprestimo_posicao;
drop view public.vw_competencias;

create view public.vw_competencias
with (security_invoker = true) as
with base as (
  select
    c.*,
    q.data_quitacao_principal,
    (q.data_quitacao_principal is not null and c.data_vencimento > q.data_quitacao_principal) as anulada_por_quitacao
  from public.emprestimo_competencias c
  left join public.vw_emprestimo_quitacao q on q.emprestimo_id = c.emprestimo_id
)
select
  c.id,
  c.emprestimo_id,
  c.numero,
  c.data_vencimento,
  (case when c.anulada_por_quitacao then 0 else c.juros_devido end)::numeric(14,2) as juros_devido,
  c.principal_previsto,
  c.pagamento_previsto,
  c.reserva_prevista,
  coalesce(jp.juros_pago, 0)::numeric(14,2)                                          as juros_pago,
  ((case when c.anulada_por_quitacao then 0 else c.juros_devido end)
     - coalesce(jp.juros_pago, 0))::numeric(14,2)                                   as juros_em_aberto,
  (c.data_vencimento < public.hoje_br())                                             as vencida,
  case
    when c.anulada_por_quitacao and coalesce(jp.juros_pago, 0) = 0 then 'nao_devida'
    when (case when c.anulada_por_quitacao then 0 else c.juros_devido end) - coalesce(jp.juros_pago, 0) <= 0 then 'paga'
    when c.data_vencimento >= public.hoje_br() then
      case when coalesce(jp.juros_pago, 0) > 0 then 'parcial' else 'a_vencer' end
    when coalesce(jp.juros_pago, 0) > 0 then 'parcial_atrasada'
    else 'atrasada'
  end                                                                                as situacao,
  coalesce(pm.pago_no_mes, 0)::numeric(14,2)                                         as pagamento_realizado_mes,
  coalesce(rm.reserva_no_mes, 0)::numeric(14,2)                                      as reserva_realizada_mes,
  c.juros_devido                                                                     as juros_contratual,
  c.pos_vencimento,
  c.anulada_por_quitacao
from base c
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
  coalesce(pp.principal_pago, 0)::numeric(14,2)             as principal_pago,
  (e.valor_principal - coalesce(pp.principal_pago, 0))::numeric(14,2) as principal_devido,
  coalesce(j.juros_devidos_vencidos, 0)::numeric(14,2)      as juros_devidos_ate_hoje,
  coalesce(j.juros_pagos, 0)::numeric(14,2)                 as juros_pagos,
  coalesce(j.juros_vencidos_nao_pagos, 0)::numeric(14,2)    as juros_vencidos_nao_pagos,
  coalesce(j.juros_a_vencer, 0)::numeric(14,2)              as juros_a_vencer,
  coalesce(j.competencias_atrasadas, 0)::int                as competencias_atrasadas,
  coalesce(pg.total_pago, 0)::numeric(14,2)                 as total_pago,
  coalesce(pg.qtd_pagamentos, 0)::int                       as qtd_pagamentos,
  coalesce(r.aportes, 0)::numeric(14,2)                     as reserva_aportes,
  coalesce(r.saidas, 0)::numeric(14,2)                      as reserva_saidas,
  (coalesce(r.aportes, 0) - coalesce(r.saidas, 0))::numeric(14,2) as reserva_saldo,
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
  e.atualizado_em,
  q.data_quitacao_principal,
  coalesce(j.competencias_pos_vencimento, 0)::int           as competencias_pos_vencimento,
  coalesce(j.juros_pos_vencimento, 0)::numeric(14,2)        as juros_pos_vencimento
from public.emprestimos e
join public.credores cr on cr.id = e.credor_id
left join public.vw_emprestimo_quitacao q on q.emprestimo_id = e.id
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
    min(c.data_vencimento) filter (where not c.vencida and c.juros_em_aberto > 0) as proximo_vencimento,
    count(*) filter (where c.pos_vencimento)                          as competencias_pos_vencimento,
    sum(c.juros_devido) filter (where c.pos_vencimento and c.vencida) as juros_pos_vencimento
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
    sum(m.valor) filter (where m.tipo = 'aporte')                             as aportes,
    sum(m.valor) filter (where m.tipo in ('resgate', 'utilizacao_pagamento')) as saidas
  from public.reserva_movimentos m
  where m.emprestimo_id = e.id and m.estornado_em is null
) r on true
where e.excluido_em is null;

-- -----------------------------------------------------------------------------
-- Competências pós-vencimento
--   Para empréstimos ativos, com principal em aberto e prazo encerrado, cria as
--   competências mensais seguintes (mesma regra: data_inicio + n meses, juros
--   fixos) até a primeira com vencimento >= hoje. Idempotente.
--   SECURITY DEFINER: executa inserções determinísticas mesmo quando chamada
--   por usuário leitor (ex.: ao abrir o painel). Não recebe valores do usuário.
-- -----------------------------------------------------------------------------
create or replace function public.atualizar_competencias_pos_vencimento(p_emprestimo_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  e        record;
  v_n      int;
  v_venc   date;
  v_hoje   date := public.hoje_br();
  v_total  int := 0;
begin
  if auth.uid() is not null and public.papel_atual() is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  for e in
    select em.id, em.data_inicio, em.prazo_meses, em.juros_mensal, em.valor_principal
    from public.emprestimos em
    where em.excluido_em is null
      and em.status = 'ativo'
      and (p_emprestimo_id is null or em.id = p_emprestimo_id)
      and em.valor_principal > coalesce((
            select sum(i.valor)
            from public.pagamento_imputacoes i
            join public.pagamentos p on p.id = i.pagamento_id and p.estornado_em is null
            where i.emprestimo_id = em.id and i.tipo = 'principal'), 0)
  loop
    select coalesce(max(numero), 0), max(data_vencimento) into v_n, v_venc
    from public.emprestimo_competencias where emprestimo_id = e.id;

    -- Só estende depois que o prazo contratual terminou
    continue when v_n < e.prazo_meses or v_venc is null;

    while v_venc < v_hoje loop
      v_n := v_n + 1;
      v_venc := (e.data_inicio + make_interval(months => v_n))::date;
      insert into public.emprestimo_competencias
        (emprestimo_id, numero, data_vencimento, juros_devido, pos_vencimento)
      values (e.id, v_n, v_venc, e.juros_mensal, true)
      on conflict (emprestimo_id, numero) do nothing;
      v_total := v_total + 1;
    end loop;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.atualizar_competencias_pos_vencimento(uuid) from public, anon;
grant execute on function public.atualizar_competencias_pos_vencimento(uuid) to authenticated;

-- Ao (re)gerar o cronograma, já cria as competências pós-vencimento se o
-- empréstimo foi cadastrado com prazo encerrado.
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
  if new.status = 'ativo' then
    perform public.atualizar_competencias_pos_vencimento(new.id);
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- registrar_pagamento: garante competências pós-vencimento antes de imputar e
-- impede antecipar juros que deixariam de ser devidos com a quitação.
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

  perform public.atualizar_competencias_pos_vencimento(p_emprestimo_id);

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

    -- 3) Excedente: juros em aberto restantes (vencidos após a data informada
    --    ou a vencer), desde que continuem devidos após esta imputação
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
      raise exception 'O valor excede o total devido nesta data (sobram %). Com a quitação do principal, os juros das competências seguintes deixam de ser devidos.',
        v_restante using errcode = 'P0001';
    end if;
  else
    raise exception 'Modo de imputação inválido: %', p_modo using errcode = 'P0001';
  end if;

  -- Nenhuma competência pode ficar com juros pagos acima do devido
  -- (acontece se o pagamento antecipa juros e quita o principal ao mesmo tempo)
  if exists (
    select 1 from public.vw_competencias
    where emprestimo_id = p_emprestimo_id and juros_em_aberto < 0
  ) then
    raise exception 'Este pagamento antecipa juros de competências que deixam de ser devidas com a quitação do principal. Reduza o valor destinado a juros.'
      using errcode = 'P0001';
  end if;

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
-- Agendamento diário (pg_cron), quando a extensão estiver disponível.
-- No Supabase: Database → Extensions → pg_cron. Sem ela, a aplicação chama a
-- função ao abrir o painel e as telas de empréstimos.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'competencias-pos-vencimento',
      '15 3 * * *',
      'select public.atualizar_competencias_pos_vencimento()'
    );
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end $$;

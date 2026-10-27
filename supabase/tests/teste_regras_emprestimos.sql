-- Teste de regras do Módulo 1 (rodar após stub + migrações).
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@teste.local'),
  ('00000000-0000-0000-0000-000000000002', 'leitor@teste.local')
on conflict (id) do nothing;
select id, papel from public.perfis order by email;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

insert into public.credores (id, nome) values ('10000000-0000-0000-0000-000000000001', 'Credor Exemplo');
-- R$ 1.000 a 10% a.m., 12 meses, início 15/01/2026
insert into public.emprestimos (id, credor_id, valor_principal, taxa_juros_mensal, data_inicio,
  data_vencimento_principal, prazo_meses, juros_contratados_total, valor_mensal_pagamento_planejado, valor_mensal_reserva_planejado)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  1000, 0.10, '2026-01-15', '2027-01-15', 12, 1200, 100, 50);

select numero, data_vencimento, juros_devido, principal_previsto from public.emprestimo_competencias
 where emprestimo_id = '20000000-0000-0000-0000-000000000001' order by numero limit 3;

-- Pagamento automático de 250 em 20/03/2026: vencidos 15/02 e 15/03 (200) -> 50 principal
select public.registrar_pagamento('20000000-0000-0000-0000-000000000001', '2026-03-20', 250) as pg1 \gset
select tipo, valor from public.pagamento_imputacoes where pagamento_id = :'pg1' order by tipo, valor;

-- Pagamento manual parcial: 60 de juros
select public.registrar_pagamento('20000000-0000-0000-0000-000000000001', '2026-05-10', 60, 'manual', 60, 0);

-- Reserva: aporte 300, depois paga 100 com reserva
insert into public.reserva_movimentos (emprestimo_id, tipo, data_movimento, valor)
values ('20000000-0000-0000-0000-000000000001', 'aporte', '2026-04-01', 300);
select public.registrar_pagamento('20000000-0000-0000-0000-000000000001', '2026-06-01', 100, 'automatico', null, null, 'PIX', true);

select principal_devido, juros_devidos_ate_hoje, juros_pagos, juros_vencidos_nao_pagos, juros_a_vencer,
       total_pago, reserva_saldo, saldo_devedor_exigivel, competencias_atrasadas, em_atraso
  from public.vw_emprestimo_posicao where id = '20000000-0000-0000-0000-000000000001';

-- Esperado (hoje = 27/10/2026, 9 competências vencidas = 900 de juros):
--   juros pagos = 200 + 60 + 100 = 360; vencidos não pagos = 540; principal devido = 950
--   total pago = 410; reserva = 200 (reserva não conta como pagamento!)
do $$
declare r record;
begin
  select * into r from public.vw_emprestimo_posicao where id = '20000000-0000-0000-0000-000000000001';
  assert r.principal_devido = 950, 'principal_devido';
  assert r.juros_pagos = 360, 'juros_pagos';
  assert r.total_pago = 410, 'total_pago';
  assert r.reserva_saldo = 200, 'reserva_saldo';
  if public.hoje_br() between '2026-10-15' and '2026-11-14' then
    assert r.juros_devidos_ate_hoje = 900, 'juros_devidos_ate_hoje';
    assert r.juros_vencidos_nao_pagos = 540, 'juros_vencidos_nao_pagos';
    assert r.saldo_devedor_exigivel = 1490, 'saldo_devedor_exigivel';
  end if;
end $$;

-- Reserva não pode ficar negativa
do $$ begin
  begin
    insert into public.reserva_movimentos (emprestimo_id, tipo, data_movimento, valor)
    values ('20000000-0000-0000-0000-000000000001', 'resgate', '2026-07-01', 999);
    set constraints all immediate;
    raise exception 'deveria falhar';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'deveria falhar' then raise; end if;
  end;
end $$;

-- Cronograma não pode ser regerado com pagamentos
do $$ begin
  begin
    update public.emprestimos set prazo_meses = 10 where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'deveria falhar';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'deveria falhar' then raise; end if;
  end;
end $$;


-- ===================== Regra: quitação antecipada anula juros futuros =====================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into public.emprestimos (id, credor_id, valor_principal, taxa_juros_mensal, data_inicio,
  data_vencimento_principal, prazo_meses, juros_contratados_total)
values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
  1000, 0.10, '2026-01-15', '2027-01-15', 12, 1200);

-- Excedente além do devido na data deve falhar (quitação anula juros futuros)
do $$ begin
  begin
    perform public.registrar_pagamento('20000000-0000-0000-0000-000000000002', '2026-03-20', 1300);
    raise exception 'deveria falhar';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'deveria falhar' then raise; end if;
  end;
end $$;

-- 1.200 em 20/03/2026: 200 de juros vencidos (fev e mar) + 1.000 de principal => quitado
select public.registrar_pagamento('20000000-0000-0000-0000-000000000002', '2026-03-20', 1200);
do $$
declare r record; v_nao_devidas int;
begin
  select * into r from public.vw_emprestimo_posicao where id = '20000000-0000-0000-0000-000000000002';
  assert r.data_quitacao_principal = '2026-03-20', 'data_quitacao';
  assert r.principal_devido = 0, 'principal quitado';
  assert r.juros_vencidos_nao_pagos = 0, 'sem juros vencidos';
  assert r.juros_a_vencer = 0, 'sem juros a vencer';
  assert r.saldo_devedor_contratual = 0, 'saldo zerado';
  assert r.em_atraso = false, 'não está em atraso';
  select count(*) into v_nao_devidas from public.vw_competencias
   where emprestimo_id = '20000000-0000-0000-0000-000000000002' and situacao = 'nao_devida';
  assert v_nao_devidas = 10, 'competências 3..12 não devidas: ' || v_nao_devidas;
end $$;

-- Manual: antecipar juros futuros e quitar o principal no mesmo pagamento deve falhar
insert into public.emprestimos (id, credor_id, valor_principal, taxa_juros_mensal, data_inicio,
  data_vencimento_principal, prazo_meses, juros_contratados_total)
values ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
  1000, 0.10, '2026-01-15', '2027-01-15', 12, 1200);
do $$ begin
  begin
    -- vencidos até 20/03: 200; manda 500 para juros (antecipa 3 meses) e quita o principal
    perform public.registrar_pagamento('20000000-0000-0000-0000-000000000004', '2026-03-20', 1500, 'manual', 500, 1000);
    raise exception 'deveria falhar';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'deveria falhar' then raise; end if;
  end;
end $$;

-- ===================== Regra: juros continuam após o vencimento do principal =====================
insert into public.emprestimos (id, credor_id, valor_principal, taxa_juros_mensal, data_inicio,
  data_vencimento_principal, prazo_meses, juros_contratados_total)
values ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
  1000, 0.10, '2026-01-15', '2026-04-15', 3, 300);
do $$
declare r record; v_max date; v_pos int; v_esperado int;
begin
  select max(data_vencimento), count(*) filter (where pos_vencimento) into v_max, v_pos
    from public.emprestimo_competencias where emprestimo_id = '20000000-0000-0000-0000-000000000003';
  assert v_max >= public.hoje_br(), 'cronograma estendido até hoje';
  assert v_pos > 0, 'há competências pós-vencimento';
  -- idempotente
  perform public.atualizar_competencias_pos_vencimento('20000000-0000-0000-0000-000000000003');
  assert (select count(*) filter (where pos_vencimento) from public.emprestimo_competencias
          where emprestimo_id = '20000000-0000-0000-0000-000000000003') = v_pos, 'idempotente';

  select count(*) into v_esperado from public.emprestimo_competencias
   where emprestimo_id = '20000000-0000-0000-0000-000000000003' and data_vencimento < public.hoje_br();
  select * into r from public.vw_emprestimo_posicao where id = '20000000-0000-0000-0000-000000000003';
  assert r.juros_vencidos_nao_pagos = v_esperado * 100, 'juros seguem vencendo: ' || r.juros_vencidos_nao_pagos;
  assert r.em_atraso, 'em atraso';
  assert r.competencias_pos_vencimento = v_pos, 'contagem pós-vencimento';
end $$;

-- Leitor também pode disparar a atualização (função security definer)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select public.atualizar_competencias_pos_vencimento() >= 0 as leitor_atualiza;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
-- Estorno do pagamento com reserva devolve o saldo
select public.estornar_pagamento(id, 'teste') from public.pagamentos where origem_reserva and emprestimo_id = '20000000-0000-0000-0000-000000000001';
select total_pago, reserva_saldo from public.vw_emprestimo_posicao where id = '20000000-0000-0000-0000-000000000001';

-- Leitor não pode registrar pagamento nem ver auditoria
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  begin
    perform public.registrar_pagamento('20000000-0000-0000-0000-000000000001', '2026-06-01', 10);
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
end $$;
select count(*) as auditoria_visivel_leitor from public.auditoria;
select count(*) as emprestimos_visiveis_leitor from public.vw_emprestimo_posicao where id = '20000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select tabela, acao, count(*) from public.auditoria group by 1,2 order by 1,2;
reset role;
select 'OK - todas as verificações passaram' as resultado;

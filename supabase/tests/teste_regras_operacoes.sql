-- Teste das operações (acordo → empréstimo). Rodar após stub + migrações.
-- Cenário do responsável: empréstimo de R$ 10.000 a 10% a.m. (R$ 1.000/mês de juros);
-- acordo de 30 parcelas de R$ 2.000; cada parcela: 50% juros, 50% reserva.
-- Datas relativas a hoje_br().
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@teste.local')
on conflict (id) do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

-- Empréstimo: competências 1 e 2 vencidas, a 3 vence em ~25 dias
insert into public.credores (id, nome) values ('71000000-0000-0000-0000-000000000001', 'Credor Operação');
insert into public.emprestimos (id, credor_id, valor_principal, taxa_juros_mensal, data_inicio,
  data_vencimento_principal, prazo_meses, juros_contratados_total)
values ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001',
  10000, 0.10, (public.hoje_br() - interval '2 months' - interval '5 days')::date,
  (public.hoje_br() - interval '2 months' - interval '5 days' + interval '10 months')::date, 10, 10000);

-- Processo 1 / acordo A: 30 × R$ 2.000
insert into public.processos (id, numero_processo) values ('73000000-0000-0000-0000-000000000001', 'OPR-TESTE-1');
insert into public.acordos (id, processo_id, polo_pagador, valor_total)
values ('74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'requerido', 60000);
select public.definir_parcelas('74000000-0000-0000-0000-000000000001', (
  select jsonb_agg(jsonb_build_object('valor', 2000,
           'data_vencimento', (public.hoje_br() - interval '1 month' + make_interval(months => n))::date) order by n)
  from generate_series(0, 29) n));

-- Processo 2 / acordo B: 20 × R$ 1.000
insert into public.processos (id, numero_processo) values ('73000000-0000-0000-0000-000000000002', 'OPR-TESTE-2');
insert into public.acordos (id, processo_id, polo_pagador, valor_total)
values ('74000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000002', 'requerido', 20000);
select public.definir_parcelas('74000000-0000-0000-0000-000000000002', (
  select jsonb_agg(jsonb_build_object('valor', 1000,
           'data_vencimento', (public.hoje_br() + make_interval(months => n))::date) order by n)
  from generate_series(0, 19) n));

-- Operação A: 50% juros / 50% reserva
insert into public.operacoes (id, acordo_id, emprestimo_id, percentual_emprestimo, percentual_reserva)
values ('75000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001',
        '72000000-0000-0000-0000-000000000001', 50, 50);
-- Operação B: 40% juros / 0% reserva (60% livre → remanescente)
insert into public.operacoes (id, acordo_id, emprestimo_id, percentual_emprestimo, percentual_reserva)
values ('75000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000002',
        '72000000-0000-0000-0000-000000000001', 40, 0);

-- Regras da operação
do $$ begin
  begin
    insert into public.operacoes (acordo_id, emprestimo_id, percentual_emprestimo, percentual_reserva)
    values ('74000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 10, 10);
    raise exception 'deveria bloquear segunda operação ativa no mesmo acordo';
  exception when unique_violation then null; end;
  begin
    insert into public.operacoes (acordo_id, emprestimo_id, percentual_emprestimo, percentual_reserva)
    values ('74000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', 70, 40);
    raise exception 'deveria bloquear soma acima de 100%%';
  exception when check_violation then null; end;
  begin
    update public.operacoes set percentual_emprestimo = 60 where id = '75000000-0000-0000-0000-000000000001';
    raise exception 'deveria bloquear alteração de percentual';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%não podem ser alterados%' then raise; end if;
  end;
end $$;

-- R1: parcela 1 integral (R$ 2.000) → R$ 1.000 juros (competência 1) + R$ 1.000 reserva
select public.registrar_recebimento('74000000-0000-0000-0000-000000000001', public.hoje_br(), 2000) as r1 \gset
do $$
declare v record;
begin
  assert (select juros_pago from public.vw_competencias
          where emprestimo_id = '72000000-0000-0000-0000-000000000001' and numero = 1) = 1000, 'R1: juros competência 1';
  select * into v from public.vw_emprestimo_posicao where id = '72000000-0000-0000-0000-000000000001';
  assert v.reserva_saldo = 1000, 'R1: reserva 1000';
  assert v.principal_pago = 0, 'R1: principal intocado';
  assert (select count(*) from public.operacao_destinacoes where recebimento_id = (
          select id from public.acordo_recebimentos where acordo_id = '74000000-0000-0000-0000-000000000001')) = 2,
         'R1: duas destinações';
  assert (select count(*) from public.pagamentos where operacao_id = '75000000-0000-0000-0000-000000000001') = 1,
         'R1: pagamento vinculado à operação';
end $$;

-- R2: parcela 2 parcial (R$ 1.500) → empréstimo primeiro: R$ 1.000 juros + R$ 500 reserva
select public.registrar_recebimento('74000000-0000-0000-0000-000000000001', public.hoje_br(), 1500);
-- R3: complemento da parcela 2 (R$ 500) → cota de juros já cheia: R$ 500 reserva
select public.registrar_recebimento('74000000-0000-0000-0000-000000000001', public.hoje_br(), 500);
do $$ begin
  assert (select juros_pago from public.vw_competencias
          where emprestimo_id = '72000000-0000-0000-0000-000000000001' and numero = 2) = 1000, 'R2: competência 2 paga';
  assert (select reserva_saldo from public.vw_emprestimo_posicao
          where id = '72000000-0000-0000-0000-000000000001') = 2000, 'R2+R3: reserva 2000';
  assert (select total_juros || '/' || total_reserva || '/' || total_remanescente from public.vw_operacoes
          where id = '75000000-0000-0000-0000-000000000001') = '2000.00/2000.00/0.00', 'operação A: totais';
end $$;

-- B1: processo 2, R$ 1.000 → R$ 400 juros na competência 3 (próxima a vencer) + R$ 600 remanescente (livre)
select public.registrar_recebimento('74000000-0000-0000-0000-000000000002', public.hoje_br(), 1000);
do $$
declare c record;
begin
  select * into c from public.vw_emprestimo_cobertura where emprestimo_id = '72000000-0000-0000-0000-000000000001';
  assert c.numero = 3 and c.juros_pago = 400 and c.juros_em_aberto = 600, 'cobertura: competência 3 com 400 de 1000';
  assert jsonb_array_length(c.fontes) = 1 and (c.fontes->0->>'valor')::numeric = 400, 'cobertura: fonte processo 2';
  assert (select total_remanescente from public.vw_operacoes where id = '75000000-0000-0000-0000-000000000002') = 600,
         'operação B: 600 remanescente';
end $$;

-- R4: parcela 3 do acordo A → só faltam R$ 600 de juros até a próxima competência:
--     R$ 600 juros + R$ 400 remanescente (cota de juros sem capacidade) + R$ 1.000 reserva
select public.registrar_recebimento('74000000-0000-0000-0000-000000000001', public.hoje_br(), 2000) as r4 \gset
do $$
declare c record;
begin
  assert (select juros_pago from public.vw_competencias
          where emprestimo_id = '72000000-0000-0000-0000-000000000001' and numero = 3) = 1000,
         'R4: competência 3 coberta por dois processos (400 + 600)';
  assert (select juros_pago from public.vw_competencias
          where emprestimo_id = '72000000-0000-0000-0000-000000000001' and numero = 4) = 0,
         'R4: não antecipa além da próxima competência';
  assert (select total_remanescente from public.vw_operacoes where id = '75000000-0000-0000-0000-000000000001') = 400,
         'R4: excedente da cota de juros no remanescente';
  assert (select reserva_saldo from public.vw_emprestimo_posicao
          where id = '72000000-0000-0000-0000-000000000001') = 3000, 'R4: reserva 3000';
end $$;

-- Pagamento/aporte gerados pela operação só são estornados pela origem
do $$ begin
  begin
    perform public.estornar_pagamento((select pagamento_id from public.operacao_destinacoes
      where recebimento_id = (select id from public.acordo_recebimentos where acordo_id = '74000000-0000-0000-0000-000000000001'
                              order by criado_em desc limit 1) and destino = 'emprestimo' limit 1), 'teste');
    raise exception 'deveria bloquear estorno direto do pagamento';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%Estorne o recebimento%' then raise; end if;
  end;
  begin
    perform public.estornar_movimento_reserva((select reserva_movimento_id from public.operacao_destinacoes
      where destino = 'reserva' limit 1), 'teste');
    raise exception 'deveria bloquear estorno direto do aporte';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%Estorne o recebimento%' then raise; end if;
  end;
  begin
    update public.pagamentos set recebimento_id = null where operacao_id is not null;
    raise exception 'deveria bloquear desvincular a origem';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%não pode ser alterado%' then raise; end if;
  end;
end $$;

-- Estorno em cascata de R4
select public.estornar_recebimento(:'r4', 'Teste de estorno');
do $$ begin
  assert (select juros_pago from public.vw_competencias
          where emprestimo_id = '72000000-0000-0000-0000-000000000001' and numero = 3) = 400, 'estorno: juros voltam';
  assert (select reserva_saldo from public.vw_emprestimo_posicao
          where id = '72000000-0000-0000-0000-000000000001') = 2000, 'estorno: reserva volta';
  assert (select total_remanescente from public.vw_operacoes where id = '75000000-0000-0000-0000-000000000001') = 0,
         'estorno: remanescente volta';
  assert (select count(*) from public.operacao_destinacoes
          where recebimento_id = (select id from public.acordo_recebimentos where estornado_em is not null
            and acordo_id = '74000000-0000-0000-0000-000000000001') and estornado_em is null) = 0, 'estorno: destinações estornadas';
end $$;

-- Quitação do principal com a reserva
do $$ begin
  begin
    perform public.quitar_principal_com_reserva('72000000-0000-0000-0000-000000000001');
    raise exception 'deveria bloquear: reserva não cobre o principal';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%ainda não cobre%' then raise; end if;
  end;
end $$;
insert into public.reserva_movimentos (emprestimo_id, tipo, data_movimento, valor, observacoes)
values ('72000000-0000-0000-0000-000000000001', 'aporte', public.hoje_br(), 8000, 'Aporte manual de teste');
do $$ begin
  -- competência 3 tem juros pagos e vence no futuro: quitar hoje anularia esses juros
  begin
    perform public.quitar_principal_com_reserva('72000000-0000-0000-0000-000000000001', public.hoje_br());
    raise exception 'deveria exigir data que não anule juros pagos';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%juros já pagos%' then raise; end if;
  end;
  assert (select reserva_cobre_principal from public.vw_emprestimo_quitacao_sugerida
          where emprestimo_id = '72000000-0000-0000-0000-000000000001'), 'sugestão de quitação';
end $$;
select public.quitar_principal_com_reserva('72000000-0000-0000-0000-000000000001');
do $$
declare v record;
begin
  select * into v from public.vw_emprestimo_posicao where id = '72000000-0000-0000-0000-000000000001';
  assert v.principal_devido = 0 and v.reserva_saldo = 0, 'quitação: principal zerado, reserva usada';
  assert (select count(*) from public.vw_competencias
          where emprestimo_id = '72000000-0000-0000-0000-000000000001' and numero > 3 and juros_devido > 0) = 0,
         'quitação: juros seguintes deixam de ser devidos';
end $$;

-- Reserva já utilizada: estornar um aporte de operação deixaria saldo negativo
do $$ begin
  begin
    perform public.estornar_recebimento((select id from public.acordo_recebimentos
      where acordo_id = '74000000-0000-0000-0000-000000000001' and valor = 500), 'teste');
    raise exception 'deveria bloquear estorno com reserva utilizada';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%já foi utilizado%' then raise; end if;
  end;
end $$;

-- Depois da quitação: termina de pagar a competência 3 (R$ 600) e o resto da cota vai ao remanescente
select public.registrar_recebimento('74000000-0000-0000-0000-000000000001', public.hoje_br(), 2000);
select public.registrar_recebimento('74000000-0000-0000-0000-000000000001', public.hoje_br(), 2000);
do $$ begin
  assert (select juros_em_aberto from public.vw_competencias
          where emprestimo_id = '72000000-0000-0000-0000-000000000001' and numero = 3) = 0, 'pós-quitação: competência 3 paga';
  assert (select total_juros || '/' || total_reserva || '/' || total_remanescente from public.vw_operacoes
          where id = '75000000-0000-0000-0000-000000000001') = '2600.00/4000.00/1400.00',
         'pós-quitação: cota de juros vira remanescente';
  assert (select reserva_saldo from public.vw_emprestimo_posicao
          where id = '72000000-0000-0000-0000-000000000001') = 2000, 'pós-quitação: reserva segue recebendo';
  assert not exists (select 1 from public.vw_emprestimo_cobertura
                     where emprestimo_id = '72000000-0000-0000-0000-000000000001' and juros_em_aberto > 0),
         'pós-quitação: nada em aberto';
end $$;

-- Encerrar operação: novos recebimentos não são mais destinados
select public.encerrar_operacao('75000000-0000-0000-0000-000000000002', 'Teste de encerramento');
select public.registrar_recebimento('74000000-0000-0000-0000-000000000002', public.hoje_br(), 1000);
do $$ begin
  assert (select total_destinado from public.vw_operacoes where id = '75000000-0000-0000-0000-000000000002') = 1000,
         'operação encerrada não destina';
  assert (select count(*) from public.processo_movimentacoes
          where processo_id = '73000000-0000-0000-0000-000000000001' and tipo = 'operacao') >= 6,
         'movimentações da operação no processo';
end $$;

reset role;
select 'OK - regras de operações verificadas' as resultado;

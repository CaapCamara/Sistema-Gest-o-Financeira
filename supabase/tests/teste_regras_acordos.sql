-- Teste de regras do Módulo 2 (rodar após stub + migrações).
-- As datas são relativas a hoje_br() para o teste não depender do dia em que roda.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@teste.local'),
  ('00000000-0000-0000-0000-000000000002', 'leitor@teste.local')
on conflict (id) do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

insert into public.processos (id, numero_processo, data_audiencia)
values ('30000000-0000-0000-0000-000000000001', '0001234-56.2026.8.00.0001', public.hoje_br() - 30);
insert into public.processo_partes (processo_id, polo, nome) values
  ('30000000-0000-0000-0000-000000000001', 'requerente', 'Maria Requerente'),
  ('30000000-0000-0000-0000-000000000001', 'requerido', 'João Requerido'),
  ('30000000-0000-0000-0000-000000000001', 'requerido', 'Empresa Requerida');

-- Acordo de R$ 1.000 em 3 parcelas (333,33 + 333,33 + 333,34), carência padrão de 3 dias
insert into public.acordos (id, processo_id, polo_pagador, valor_total)
values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'requerido', 1000);

select public.definir_parcelas('40000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('valor', 333.33, 'data_vencimento', public.hoje_br() - 10),  -- atrasada
  jsonb_build_object('valor', 333.34, 'data_vencimento', public.hoje_br() + 20),  -- a vencer (informada fora de ordem)
  jsonb_build_object('valor', 333.33, 'data_vencimento', public.hoje_br() - 2)    -- em carência
)) as qtd_parcelas;

do $$
declare r record;
begin
  assert (select dias_carencia from public.acordos where id = '40000000-0000-0000-0000-000000000001') = 3, 'carência padrão 3';
  -- numeração segue o vencimento
  assert (select string_agg(numero || ':' || situacao, ',' order by numero) from public.vw_acordo_parcelas
          where acordo_id = '40000000-0000-0000-0000-000000000001') = '1:atrasada,2:em_carencia,3:a_vencer',
         'situações iniciais';
  select * into r from public.vw_acordo_posicao where id = '40000000-0000-0000-0000-000000000001';
  assert r.qtd_parcelas = 3 and r.soma_parcelas = 1000 and r.diferenca_parcelas = 0, 'soma das parcelas';
  assert r.situacao_financeira = 'em_atraso' and r.em_atraso, 'acordo em atraso';
  assert r.parcelas_atrasadas = 1 and r.valor_atrasado = 333.33, 'valor atrasado';
  assert r.requerentes = 'Maria Requerente' and r.requeridos = 'Empresa Requerida, João Requerido', 'partes';
end $$;

-- Carência: vencida há exatamente 3 dias ainda está em carência; há 4 dias, atrasada
insert into public.acordos (id, processo_id, polo_pagador, valor_total)
values ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'requerente', 200);
select public.definir_parcelas('40000000-0000-0000-0000-000000000002', jsonb_build_array(
  jsonb_build_object('valor', 100, 'data_vencimento', public.hoje_br() - 3),
  jsonb_build_object('valor', 50,  'data_vencimento', public.hoje_br() - 4)
));
do $$ begin
  assert (select string_agg(situacao, ',' order by numero) from public.vw_acordo_parcelas
          where acordo_id = '40000000-0000-0000-0000-000000000002') = 'atrasada,em_carencia', 'limite da carência';
  -- soma diferente do total: só aviso (diferença positiva = faltam parcelas)
  assert (select diferenca_parcelas from public.vw_acordo_posicao where id = '40000000-0000-0000-0000-000000000002') = 50,
         'aviso de diferença';
end $$;
-- Sem carência: vencida ontem já está atrasada
update public.acordos set dias_carencia = 0 where id = '40000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select situacao from public.vw_acordo_parcelas
          where acordo_id = '40000000-0000-0000-0000-000000000002' and numero = 2) = 'atrasada', 'carência zero';
end $$;

-- Recebimento sem parcela indicada: abate da mais antiga (333,33 na 1ª e 66,67 na 2ª)
select public.registrar_recebimento('40000000-0000-0000-0000-000000000001', public.hoje_br(), 400) as rec1 \gset
do $$ begin
  assert (select string_agg(numero || ':' || valor_recebido, ',' order by numero) from public.vw_acordo_parcelas
          where acordo_id = '40000000-0000-0000-0000-000000000001') = '1:333.33,2:66.67,3:0.00', 'imputação mais antiga';
  assert (select situacao from public.vw_acordo_parcelas
          where acordo_id = '40000000-0000-0000-0000-000000000001' and numero = 1) = 'recebida', 'parcela 1 recebida';
  assert not (select em_atraso from public.vw_acordo_posicao where id = '40000000-0000-0000-0000-000000000001'), 'saiu do atraso';
end $$;

-- Recebimento parcial indicando a 3ª parcela
select public.registrar_recebimento('40000000-0000-0000-0000-000000000001', public.hoje_br(), 300,
  (select id from public.acordo_parcelas where acordo_id = '40000000-0000-0000-0000-000000000001' and numero = 3));
do $$ begin
  assert (select situacao from public.vw_acordo_parcelas
          where acordo_id = '40000000-0000-0000-0000-000000000001' and numero = 3) = 'parcial', 'parcial antes do vencimento';
end $$;

-- Indicando a 3ª com excedente: 33,34 quitam a 3ª e o excedente (66,66) vai para a 2ª, que é a única em aberto
select public.registrar_recebimento('40000000-0000-0000-0000-000000000001', public.hoje_br(), 100,
  (select id from public.acordo_parcelas where acordo_id = '40000000-0000-0000-0000-000000000001' and numero = 3));
do $$ begin
  assert (select string_agg(numero || ':' || saldo, ',' order by numero) from public.vw_acordo_parcelas
          where acordo_id = '40000000-0000-0000-0000-000000000001') = '1:0.00,2:200.00,3:0.00', 'excedente para outra parcela';
end $$;

-- Excedente vai primeiro para as parcelas SEGUINTES à indicada
insert into public.acordos (id, processo_id, polo_pagador, valor_total)
values ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'requerido', 300);
select public.definir_parcelas('40000000-0000-0000-0000-000000000003', jsonb_build_array(
  jsonb_build_object('valor', 100, 'data_vencimento', public.hoje_br() + 10),
  jsonb_build_object('valor', 100, 'data_vencimento', public.hoje_br() + 40),
  jsonb_build_object('valor', 100, 'data_vencimento', public.hoje_br() + 70)
));
select public.registrar_recebimento('40000000-0000-0000-0000-000000000003', public.hoje_br(), 150,
  (select id from public.acordo_parcelas where acordo_id = '40000000-0000-0000-0000-000000000003' and numero = 2));
do $$ begin
  assert (select string_agg(numero || ':' || valor_recebido, ',' order by numero) from public.vw_acordo_parcelas
          where acordo_id = '40000000-0000-0000-0000-000000000003') = '1:0.00,2:100.00,3:50.00', 'excedente para a seguinte';
end $$;

-- Valor acima do saldo em aberto deve falhar
do $$ begin
  begin
    perform public.registrar_recebimento('40000000-0000-0000-0000-000000000001', public.hoje_br(), 200.01);
    raise exception 'deveria falhar';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'deveria falhar' then raise; end if;
  end;
end $$;

-- Parcela de outro acordo deve falhar
do $$ begin
  begin
    perform public.registrar_recebimento('40000000-0000-0000-0000-000000000001', public.hoje_br(), 10,
      (select id from public.acordo_parcelas where acordo_id = '40000000-0000-0000-0000-000000000003' limit 1));
    raise exception 'deveria falhar';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'deveria falhar' then raise; end if;
  end;
end $$;

-- Parcelas não podem ser redefinidas com recebimentos
do $$ begin
  begin
    perform public.definir_parcelas('40000000-0000-0000-0000-000000000001',
      jsonb_build_array(jsonb_build_object('valor', 1000, 'data_vencimento', public.hoje_br())));
    raise exception 'deveria falhar';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'deveria falhar' then raise; end if;
  end;
end $$;

-- Quitação: recebe o restante
select public.registrar_recebimento('40000000-0000-0000-0000-000000000001', public.hoje_br(), 200);
do $$
declare r record;
begin
  select * into r from public.vw_acordo_posicao where id = '40000000-0000-0000-0000-000000000001';
  assert r.situacao_financeira = 'quitado' and r.saldo_em_aberto = 0 and r.total_recebido = 1000, 'quitado';
  assert r.qtd_recebimentos = 4, 'recebimentos';
end $$;

-- Estorno devolve o saldo e mantém o registro
select public.estornar_recebimento(:'rec1', 'lançado em duplicidade');
do $$ begin
  assert (select saldo_em_aberto from public.vw_acordo_posicao where id = '40000000-0000-0000-0000-000000000001') = 400, 'estorno';
  assert (select count(*) from public.acordo_recebimentos where acordo_id = '40000000-0000-0000-0000-000000000001') = 4, 'nada apagado';
end $$;

-- Referência externa (extrato) não pode se repetir no mesmo acordo
select public.registrar_recebimento('40000000-0000-0000-0000-000000000003', public.hoje_br(), 10, null, 'PIX', null, 'extrato', 'E123');
do $$ begin
  begin
    perform public.registrar_recebimento('40000000-0000-0000-0000-000000000003', public.hoje_br(), 10, null, 'PIX', null, 'extrato', 'E123');
    raise exception 'deveria falhar';
  exception when unique_violation then null;
  end;
end $$;

-- Resumo do processo considera só acordos ativos
update public.acordos set status = 'cancelado' where id = '40000000-0000-0000-0000-000000000002';
do $$
declare r record;
begin
  select * into r from public.vw_processo_resumo where id = '30000000-0000-0000-0000-000000000001';
  assert r.qtd_acordos = 3 and r.qtd_acordos_ativos = 2, 'contagem de acordos';
  assert r.valor_acordos_ativos = 1300, 'valor dos acordos ativos';
end $$;

-- Leitor: consulta, mas não registra nem altera
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.vw_acordo_posicao) = 3, 'leitor consulta';
  begin
    perform public.registrar_recebimento('40000000-0000-0000-0000-000000000003', public.hoje_br(), 10);
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.definir_parcelas('40000000-0000-0000-0000-000000000003',
      jsonb_build_array(jsonb_build_object('valor', 300, 'data_vencimento', public.hoje_br())));
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.processos set observacoes = 'x' where id = '30000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select observacoes from public.processos where id = '30000000-0000-0000-0000-000000000001') is null,
         'RLS impede alteração pelo leitor';
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select tabela, acao, count(*) from public.auditoria
 where tabela in ('processos', 'processo_partes', 'acordos', 'acordo_parcelas', 'acordo_recebimentos', 'acordo_recebimento_imputacoes')
 group by 1,2 order by 1,2;
reset role;
select 'OK - regras de acordos verificadas' as resultado;

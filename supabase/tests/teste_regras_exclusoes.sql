-- Teste da exclusão lógica: nada que movimentou dinheiro some sem estorno antes.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@teste.local')
on conflict (id) do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

insert into public.credores (id, nome) values ('81000000-0000-0000-0000-000000000001', 'Credor Exclusão');
insert into public.emprestimos (id, credor_id, valor_principal, taxa_juros_mensal, data_inicio,
  data_vencimento_principal, prazo_meses, juros_contratados_total)
values ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001',
  10000, 0.10, (public.hoje_br() - interval '5 days')::date,
  (public.hoje_br() - interval '5 days' + interval '10 months')::date, 10, 10000);
insert into public.processos (id, numero_processo) values ('83000000-0000-0000-0000-000000000001', 'EXC-TESTE-1');
insert into public.acordos (id, processo_id, polo_pagador, valor_total)
values ('84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'requerido', 4000);
select public.definir_parcelas('84000000-0000-0000-0000-000000000001', (
  select jsonb_agg(jsonb_build_object('valor', 2000,
           'data_vencimento', (public.hoje_br() + make_interval(months => n))::date) order by n)
  from generate_series(0, 1) n));
insert into public.operacoes (id, acordo_id, emprestimo_id, percentual_emprestimo, percentual_reserva)
values ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001',
        '82000000-0000-0000-0000-000000000001', 50, 50);
select public.registrar_recebimento('84000000-0000-0000-0000-000000000001', public.hoje_br(), 2000);

do $$ begin
  -- Operação com dinheiro destinado não pode ser excluída
  begin
    perform public.excluir_operacao('85000000-0000-0000-0000-000000000001', 'teste');
    raise exception 'deveria bloquear exclusão de operação com destinações';
  exception when sqlstate 'P0001' then
    assert sqlerrm like 'Esta operação já movimentou dinheiro%', sqlerrm;
  end;
  -- Acordo e empréstimo com operação não podem ser excluídos
  begin
    update public.acordos set excluido_em = now() where id = '84000000-0000-0000-0000-000000000001';
    raise exception 'deveria bloquear exclusão de acordo com operação';
  exception when sqlstate 'P0001' then
    assert sqlerrm like 'Exclua antes a(s) operação(ões)%', sqlerrm;
  end;
  begin
    update public.emprestimos set excluido_em = now() where id = '82000000-0000-0000-0000-000000000001';
    raise exception 'deveria bloquear exclusão de empréstimo com operação';
  exception when sqlstate 'P0001' then null; end;
  begin
    perform public.excluir_operacao('85000000-0000-0000-0000-000000000001', '  ');
    raise exception 'deveria exigir motivo';
  exception when sqlstate 'P0001' then null; end;
end $$;

-- Estornado o recebimento, a operação pode ser excluída e some das listas
select public.estornar_recebimento(
  (select id from public.acordo_recebimentos where acordo_id = '84000000-0000-0000-0000-000000000001'), 'teste');
select public.excluir_operacao('85000000-0000-0000-0000-000000000001', 'cadastro de teste');
do $$ begin
  assert not exists (select 1 from public.vw_operacoes where id = '85000000-0000-0000-0000-000000000001'),
         'operação excluída fora da lista';
  assert (select encerrada_em is not null from public.operacoes where id = '85000000-0000-0000-0000-000000000001'),
         'operação excluída também fica encerrada';
  begin
    perform public.excluir_operacao('85000000-0000-0000-0000-000000000001', 'de novo');
    raise exception 'deveria bloquear exclusão repetida';
  exception when sqlstate 'P0001' then null; end;
end $$;

update public.acordos set excluido_em = now() where id = '84000000-0000-0000-0000-000000000001';
update public.emprestimos set excluido_em = now() where id = '82000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.auditoria where tabela = 'operacoes'
          and registro_id = '85000000-0000-0000-0000-000000000001') >= 2, 'exclusão auditada';
end $$;

reset role;
select 'OK - regras de exclusão verificadas' as resultado;

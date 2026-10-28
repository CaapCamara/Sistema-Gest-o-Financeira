-- Teste da exclusão em cascata com caminhos escolhidos.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@teste.local')
on conflict (id) do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

insert into public.credores (id, nome) values ('91000000-0000-0000-0000-000000000001', 'Credor Cascata');
insert into public.emprestimos (id, credor_id, valor_principal, taxa_juros_mensal, data_inicio,
  data_vencimento_principal, prazo_meses, juros_contratados_total)
values ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001',
  10000, 0.10, (public.hoje_br() - interval '5 days')::date,
  (public.hoje_br() - interval '5 days' + interval '10 months')::date, 10, 10000);
insert into public.processos (id, numero_processo) values
  ('93000000-0000-0000-0000-000000000001', 'CASC-1'),
  ('93000000-0000-0000-0000-000000000002', 'CASC-2');
insert into public.acordos (id, processo_id, polo_pagador, valor_total) values
  ('94000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'requerido', 4000),
  ('94000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000002', 'requerido', 2000);
select public.definir_parcelas('94000000-0000-0000-0000-000000000001', (
  select jsonb_agg(jsonb_build_object('valor', 2000, 'data_vencimento', (public.hoje_br() + make_interval(months => n))::date) order by n)
  from generate_series(0, 1) n));
select public.definir_parcelas('94000000-0000-0000-0000-000000000002', (
  select jsonb_agg(jsonb_build_object('valor', 1000, 'data_vencimento', (public.hoje_br() + make_interval(months => n))::date) order by n)
  from generate_series(0, 1) n));
insert into public.operacoes (acordo_id, emprestimo_id, percentual_emprestimo, percentual_reserva) values
  ('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 50, 50),
  ('94000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 40, 0);
select public.registrar_recebimento('94000000-0000-0000-0000-000000000001', public.hoje_br(), 2000);
select public.registrar_recebimento('94000000-0000-0000-0000-000000000002', public.hoje_br(), 1000);

do $$
declare v_previa text[]; v_opcoes jsonb;
begin
  v_previa := public.previa_exclusao('credor', '91000000-0000-0000-0000-000000000001');
  assert cardinality(v_previa) >= 4, 'prévia do credor: ' || array_to_string(v_previa, ' | ');
  v_opcoes := public.opcoes_exclusao('credor', '91000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(v_opcoes) = 2, 'credor: 2 processos ligados';
  assert (v_opcoes->0->>'tipo') = 'processo';
  v_opcoes := public.opcoes_exclusao('acordo', '94000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(v_opcoes) = 1 and (v_opcoes->0->>'tipo') = 'emprestimo', 'acordo: empréstimo ligado';
  -- com dependentes, exige motivo
  begin
    perform public.excluir_em_cascata('credor', '91000000-0000-0000-0000-000000000001', ' ');
    raise exception 'deveria exigir motivo';
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'Informe o motivo da exclusão.', sqlerrm;
  end;
end $$;

-- Exclui o credor e escolhe excluir também o processo 1
select public.excluir_com_selecao('credor', '91000000-0000-0000-0000-000000000001', 'cadastro de teste',
  '[{"tipo": "processo", "id": "93000000-0000-0000-0000-000000000001"}]');

do $$ begin
  assert (select excluido_em is not null from public.credores where id = '91000000-0000-0000-0000-000000000001'), 'credor excluído';
  assert (select excluido_em is not null from public.emprestimos where id = '92000000-0000-0000-0000-000000000001'), 'empréstimo excluído';
  assert not exists (select 1 from public.pagamentos where emprestimo_id = '92000000-0000-0000-0000-000000000001' and estornado_em is null), 'pagamentos estornados';
  assert not exists (select 1 from public.reserva_movimentos where emprestimo_id = '92000000-0000-0000-0000-000000000001' and estornado_em is null), 'reserva estornada';
  assert not exists (select 1 from public.operacoes where emprestimo_id = '92000000-0000-0000-0000-000000000001' and excluido_em is null), 'operações excluídas';
  -- processo 1 escolhido: excluído, recebimento estornado
  assert (select excluido_em is not null from public.processos where id = '93000000-0000-0000-0000-000000000001'), 'processo 1 excluído';
  assert (select excluido_em is not null from public.acordos where id = '94000000-0000-0000-0000-000000000001'), 'acordo 1 excluído';
  assert not exists (select 1 from public.acordo_recebimentos where acordo_id = '94000000-0000-0000-0000-000000000001' and estornado_em is null), 'recebimento 1 estornado';
  -- processo 2 não escolhido: continua, recebimento registrado sem divisão
  assert (select excluido_em is null from public.processos where id = '93000000-0000-0000-0000-000000000002'), 'processo 2 mantido';
  assert exists (select 1 from public.acordo_recebimentos where acordo_id = '94000000-0000-0000-0000-000000000002' and estornado_em is null), 'recebimento 2 mantido';
  assert not exists (select 1 from public.operacao_destinacoes d join public.acordo_recebimentos r on r.id = d.recebimento_id
                     where r.acordo_id = '94000000-0000-0000-0000-000000000002' and d.estornado_em is null), 'divisão do recebimento 2 desfeita';
end $$;

-- Sem nada ligado: exclui sem motivo
insert into public.credores (id, nome) values ('91000000-0000-0000-0000-000000000002', 'Credor Solto');
select public.excluir_em_cascata('credor', '91000000-0000-0000-0000-000000000002', '');
do $$ begin
  assert (select excluido_em is not null from public.credores where id = '91000000-0000-0000-0000-000000000002'), 'credor solto excluído';
end $$;

reset role;
select 'OK - exclusão em cascata verificada' as resultado;

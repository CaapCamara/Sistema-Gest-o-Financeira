-- =============================================================================
-- Exclusão de registros
--
-- Exclusão é sempre lógica (excluido_em) e auditada. Um registro só pode ser
-- excluído quando não tem movimentação financeira ativa: o histórico do dinheiro
-- nunca some. Para excluir algo que já movimentou dinheiro, estorna-se antes o
-- lançamento (o estorno também fica registrado).
--
-- Operação: pode ser excluída quando nenhuma destinação está ativa (nada
-- chegou pelo acordo, ou os recebimentos foram estornados).
-- =============================================================================

alter table public.operacoes
  add column excluido_em     timestamptz,
  add column motivo_exclusao text;

comment on column public.operacoes.excluido_em is 'Exclusão lógica. Só permitida sem destinações ativas.';

create or replace function public.excluir_operacao(p_operacao_id uuid, p_motivo text)
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
    raise exception 'Informe o motivo da exclusão.' using errcode = 'P0001';
  end if;
  perform 1 from public.operacoes where id = p_operacao_id and excluido_em is null for update;
  if not found then
    raise exception 'Operação não encontrada ou já excluída.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.operacao_destinacoes where operacao_id = p_operacao_id and estornado_em is null) then
    raise exception 'Esta operação já movimentou dinheiro. Estorne antes os recebimentos do acordo (aba Recebimentos) ou apenas encerre a operação.'
      using errcode = 'P0001';
  end if;
  update public.operacoes
     set excluido_em = now(),
         motivo_exclusao = p_motivo,
         encerrada_em = coalesce(encerrada_em, now()),
         motivo_encerramento = coalesce(motivo_encerramento, 'Operação excluída: ' || p_motivo)
   where id = p_operacao_id;
end;
$$;

revoke execute on function public.excluir_operacao(uuid, text) from anon;

-- Acordo e empréstimo só são excluídos sem operações (ativas ou encerradas) não excluídas.
create or replace function public.trg_exclusao_sem_operacao()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_codigos text;
begin
  if new.excluido_em is not null and old.excluido_em is null then
    select string_agg(codigo, ', ' order by codigo) into v_codigos
      from public.operacoes
     where excluido_em is null
       and (case when tg_table_name = 'acordos' then acordo_id else emprestimo_id end) = new.id;
    if v_codigos is not null then
      raise exception 'Exclua antes a(s) operação(ões) ligada(s): %.', v_codigos using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_acordos_exclusao_sem_operacao before update of excluido_em on public.acordos
  for each row execute function public.trg_exclusao_sem_operacao();
create trigger trg_emprestimos_exclusao_sem_operacao before update of excluido_em on public.emprestimos
  for each row execute function public.trg_exclusao_sem_operacao();

-- Operações excluídas saem das listas
create or replace view public.vw_operacoes
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
) np on true
where o.excluido_em is null;

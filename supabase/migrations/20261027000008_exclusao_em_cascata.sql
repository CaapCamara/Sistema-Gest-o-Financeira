-- =============================================================================
-- Exclusão em cascata (de cima para baixo)
--
-- Excluir um credor, empréstimo, processo ou acordo desfaz, numa única
-- transação, tudo o que depende dele. Nada é apagado fisicamente: o que
-- movimentou dinheiro é ESTORNADO (com motivo) e o cadastro recebe
-- excluido_em. Tudo fica na auditoria.
--
--   credor     → seus empréstimos (como abaixo)
--   empréstimo → pagamentos e lançamentos de reserva estornados; destinações
--                desfeitas; operações excluídas. Os recebimentos dos acordos
--                continuam registrados no acordo, apenas sem a divisão.
--   processo   → seus acordos (como abaixo)
--   acordo     → recebimentos estornados (com tudo o que geraram); operações
--                excluídas.
--
-- Registro sem nada ligado: qualquer operador exclui. Com algo ligado: só
-- administrador. previa_exclusao() lista o que será desfeito, para a tela de
-- confirmação.
-- =============================================================================

create or replace function public.previa_exclusao(p_tipo text, p_id uuid)
returns text[]
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_emp  uuid[] := '{}';
  v_acd  uuid[] := '{}';
  l      text[] := '{}';
  v_cod  text;
  v_n    integer;
  v_soma numeric;
begin
  if p_tipo = 'credor' then
    v_emp := array(select id from public.emprestimos where credor_id = p_id and excluido_em is null);
    select string_agg(codigo, ', ' order by codigo) into v_cod from public.emprestimos where id = any(v_emp);
    if v_cod is not null then
      l := l || ('Excluir também o(s) empréstimo(s) ' || v_cod);
    end if;
  elsif p_tipo = 'emprestimo' then
    v_emp := array[p_id];
  elsif p_tipo = 'processo' then
    v_acd := array(select id from public.acordos where processo_id = p_id and excluido_em is null);
    select string_agg(codigo, ', ' order by codigo) into v_cod from public.acordos where id = any(v_acd);
    if v_cod is not null then
      l := l || ('Excluir também o(s) acordo(s) ' || v_cod);
    end if;
  elsif p_tipo = 'acordo' then
    v_acd := array[p_id];
  else
    raise exception 'Tipo inválido.' using errcode = 'P0001';
  end if;

  select count(*), coalesce(sum(valor), 0) into v_n, v_soma
    from public.acordo_recebimentos where acordo_id = any(v_acd) and estornado_em is null;
  if v_n > 0 then
    l := l || format('Estornar %s recebimento(s) do acordo (%s) e o que eles pagaram e guardaram', v_n, public.fmt_brl(v_soma));
  end if;

  select string_agg(codigo, ', ' order by codigo) into v_cod
    from public.operacoes
   where (acordo_id = any(v_acd) or emprestimo_id = any(v_emp)) and excluido_em is null;
  if v_cod is not null then
    l := l || ('Excluir a(s) operação(ões) ' || v_cod);
  end if;

  select count(*), coalesce(sum(valor_total), 0) into v_n, v_soma
    from public.pagamentos where emprestimo_id = any(v_emp) and estornado_em is null;
  if v_n > 0 then
    l := l || format('Estornar %s pagamento(s) ao credor (%s)', v_n, public.fmt_brl(v_soma));
  end if;

  select count(*), coalesce(sum(case when tipo = 'aporte' then valor else -valor end), 0) into v_n, v_soma
    from public.reserva_movimentos where emprestimo_id = any(v_emp) and estornado_em is null;
  if v_n > 0 then
    l := l || format('Estornar %s lançamento(s) da reserva (saldo de %s vai a zero)', v_n, public.fmt_brl(v_soma));
  end if;

  select count(distinct d.recebimento_id) into v_n
    from public.operacao_destinacoes d
    join public.acordo_recebimentos r on r.id = d.recebimento_id
   where d.emprestimo_id = any(v_emp) and d.estornado_em is null and not (r.acordo_id = any(v_acd));
  if v_n > 0 then
    l := l || format('%s recebimento(s) de acordos continuam registrados nos acordos, mas sem a divisão', v_n);
  end if;

  return l;
end;
$$;

create or replace function public.excluir_em_cascata(p_tipo text, p_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_emp    uuid[] := '{}';
  v_acd    uuid[] := '{}';
  v_motivo text;
  r        record;
begin
  if not public.pode_editar() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Trava o registro e reúne os dependentes
  if p_tipo = 'credor' then
    perform 1 from public.credores where id = p_id and excluido_em is null for update;
    if not found then raise exception 'Credor não encontrado ou já excluído.' using errcode = 'P0001'; end if;
    v_emp := array(select id from public.emprestimos where credor_id = p_id and excluido_em is null);
  elsif p_tipo = 'emprestimo' then
    perform 1 from public.emprestimos where id = p_id and excluido_em is null for update;
    if not found then raise exception 'Empréstimo não encontrado ou já excluído.' using errcode = 'P0001'; end if;
    v_emp := array[p_id];
  elsif p_tipo = 'processo' then
    perform 1 from public.processos where id = p_id and excluido_em is null for update;
    if not found then raise exception 'Processo não encontrado ou já excluído.' using errcode = 'P0001'; end if;
    v_acd := array(select id from public.acordos where processo_id = p_id and excluido_em is null);
  elsif p_tipo = 'acordo' then
    perform 1 from public.acordos where id = p_id and excluido_em is null for update;
    if not found then raise exception 'Acordo não encontrado ou já excluído.' using errcode = 'P0001'; end if;
    v_acd := array[p_id];
  else
    raise exception 'Tipo inválido.' using errcode = 'P0001';
  end if;

  if cardinality(public.previa_exclusao(p_tipo, p_id)) > 0 then
    if not public.eh_admin() then
      raise exception 'Só um administrador pode excluir um registro que já tem cadastros ou dinheiro ligados a ele.'
        using errcode = 'P0001';
    end if;
    if coalesce(trim(p_motivo), '') = '' then
      raise exception 'Informe o motivo da exclusão.' using errcode = 'P0001';
    end if;
  end if;
  v_motivo := 'Exclusão: ' || coalesce(nullif(trim(p_motivo), ''), 'sem motivo informado');

  -- Acordos: estorna os recebimentos (com o que geraram) e exclui as operações
  for r in
    select id from public.acordo_recebimentos
     where acordo_id = any(v_acd) and estornado_em is null
     order by data_recebimento desc, criado_em desc
  loop
    perform public.estornar_recebimento(r.id, v_motivo);
  end loop;
  update public.operacoes
     set excluido_em = now(), motivo_exclusao = v_motivo,
         encerrada_em = coalesce(encerrada_em, now()), motivo_encerramento = coalesce(motivo_encerramento, v_motivo)
   where acordo_id = any(v_acd) and excluido_em is null;
  update public.acordos set excluido_em = now() where id = any(v_acd) and excluido_em is null;

  -- Empréstimos: desfaz destinações, estorna pagamentos e reserva, exclui operações
  update public.operacao_destinacoes set estornado_em = now(), motivo_estorno = v_motivo
   where emprestimo_id = any(v_emp) and estornado_em is null;
  update public.reserva_movimentos set estornado_em = now(), motivo_estorno = v_motivo
   where emprestimo_id = any(v_emp) and estornado_em is null;
  update public.pagamentos set estornado_em = now(), motivo_estorno = v_motivo
   where emprestimo_id = any(v_emp) and estornado_em is null;
  update public.operacoes
     set excluido_em = now(), motivo_exclusao = v_motivo,
         encerrada_em = coalesce(encerrada_em, now()), motivo_encerramento = coalesce(motivo_encerramento, v_motivo)
   where emprestimo_id = any(v_emp) and excluido_em is null;
  update public.emprestimos set excluido_em = now() where id = any(v_emp) and excluido_em is null;

  -- O registro em si
  if p_tipo = 'credor' then
    update public.credores set excluido_em = now() where id = p_id;
  elsif p_tipo = 'processo' then
    update public.processos set excluido_em = now() where id = p_id;
  end if;
end;
$$;

revoke execute on function public.previa_exclusao(text, uuid) from anon;
revoke execute on function public.excluir_em_cascata(text, uuid, text) from anon;

-- -----------------------------------------------------------------------------
-- Caminhos opcionais: o que está ligado pelo dinheiro e o usuário pode escolher
-- excluir junto (marcando na tela de confirmação).
--   credor/empréstimo → processos cujos acordos alimentam os empréstimos
--   processo/acordo   → empréstimos alimentados pelos acordos
-- -----------------------------------------------------------------------------
create or replace function public.opcoes_exclusao(p_tipo text, p_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_emp uuid[] := '{}';
  v_acd uuid[] := '{}';
begin
  if p_tipo = 'credor' then
    v_emp := array(select id from public.emprestimos where credor_id = p_id and excluido_em is null);
  elsif p_tipo = 'emprestimo' then
    v_emp := array[p_id];
  elsif p_tipo = 'processo' then
    v_acd := array(select id from public.acordos where processo_id = p_id and excluido_em is null);
  elsif p_tipo = 'acordo' then
    v_acd := array[p_id];
  else
    raise exception 'Tipo inválido.' using errcode = 'P0001';
  end if;

  if cardinality(v_emp) > 0 then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
               'tipo', 'processo',
               'id', pr.id,
               'rotulo', 'Processo ' || pr.codigo || coalesce(' (' || pr.numero_processo || ')', ''),
               'detalhe', (
                 select 'Acordo(s) ' || string_agg(a2.codigo, ', ' order by a2.codigo) ||
                        coalesce(' · estorna ' || public.fmt_brl(nullif(sum(rr.total), 0)) || ' recebidos', '')
                 from public.acordos a2
                 left join lateral (
                   select sum(valor) as total from public.acordo_recebimentos
                    where acordo_id = a2.id and estornado_em is null
                 ) rr on true
                 where a2.processo_id = pr.id and a2.excluido_em is null)
             ) order by pr.codigo)
      from public.processos pr
      where pr.excluido_em is null
        and exists (
          select 1 from public.operacoes o
          join public.acordos a on a.id = o.acordo_id
          where a.processo_id = pr.id and o.excluido_em is null and o.emprestimo_id = any(v_emp))
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'tipo', 'emprestimo',
             'id', e.id,
             'rotulo', 'Empréstimo ' || e.codigo || ' · ' || c.nome,
             'detalhe', 'Estorna pagamentos e reserva dele e desfaz a divisão dos outros acordos ligados'
           ) order by e.codigo)
    from public.emprestimos e
    join public.credores c on c.id = e.credor_id
    where e.excluido_em is null
      and exists (
        select 1 from public.operacoes o
        where o.emprestimo_id = e.id and o.excluido_em is null and o.acordo_id = any(v_acd))
  ), '[]'::jsonb);
end;
$$;

-- Exclui o registro principal e, em seguida, os caminhos marcados.
-- p_extras: [{"tipo": "processo"|"emprestimo"|..., "id": "..."}]
create or replace function public.excluir_com_selecao(p_tipo text, p_id uuid, p_motivo text, p_extras jsonb default '[]')
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  x       record;
  v_ativo boolean;
begin
  perform public.excluir_em_cascata(p_tipo, p_id, p_motivo);
  for x in select e->>'tipo' as tipo, (e->>'id')::uuid as id from jsonb_array_elements(coalesce(p_extras, '[]')) e
  loop
    -- Pode já ter saído junto com o principal
    v_ativo := case x.tipo
      when 'credor'     then exists (select 1 from public.credores    where id = x.id and excluido_em is null)
      when 'emprestimo' then exists (select 1 from public.emprestimos where id = x.id and excluido_em is null)
      when 'processo'   then exists (select 1 from public.processos   where id = x.id and excluido_em is null)
      when 'acordo'     then exists (select 1 from public.acordos     where id = x.id and excluido_em is null)
      else null end;
    if v_ativo is null then
      raise exception 'Tipo inválido.' using errcode = 'P0001';
    end if;
    if v_ativo then
      perform public.excluir_em_cascata(x.tipo, x.id, p_motivo);
    end if;
  end loop;
end;
$$;

revoke execute on function public.opcoes_exclusao(text, uuid) from anon;
revoke execute on function public.excluir_com_selecao(text, uuid, text, jsonb) from anon;

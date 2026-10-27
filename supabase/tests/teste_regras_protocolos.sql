-- Teste de regras da Etapa 6: protocolos (N:N), documentos e movimentações.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@teste.local'),
  ('00000000-0000-0000-0000-000000000002', 'leitor@teste.local'),
  ('00000000-0000-0000-0000-000000000003', 'operador@teste.local')
on conflict (id) do nothing;
update public.perfis set papel = 'operador', nome = 'Operadora' where id = '00000000-0000-0000-0000-000000000003';

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);

insert into public.processos (id, numero_processo) values
  ('50000000-0000-0000-0000-000000000001', '1111111-11.2026.8.00.0001'),
  ('50000000-0000-0000-0000-000000000002', '2222222-22.2026.8.00.0001'),
  ('50000000-0000-0000-0000-000000000003', null);

-- Status configuráveis: lista inicial e somente admin altera
do $$ begin
  assert (select count(*) from public.status_protocolo) = 2, 'status iniciais';
end $$;
do $$ begin
  begin
    insert into public.status_protocolo (nome) values ('Tentativa do operador');
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Um protocolo abrangendo dois processos
insert into public.protocolos (id, status_id, responsavel_id, assunto)
values ('60000000-0000-0000-0000-000000000001',
        (select id from public.status_protocolo where nome = 'A protocolar'),
        '00000000-0000-0000-0000-000000000003', 'Homologação dos acordos');
insert into public.protocolo_processos (protocolo_id, processo_id) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002');
-- Um processo com mais de um protocolo
insert into public.protocolos (id, status_id, responsavel_id, nupe, data_protocolo)
values ('60000000-0000-0000-0000-000000000002',
        (select id from public.status_protocolo where nome = 'Protocolado'),
        '00000000-0000-0000-0000-000000000003', 'NUPE-0002', public.hoje_br());
insert into public.protocolo_processos (protocolo_id, processo_id) values
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001');

do $$
declare r record;
begin
  select * into r from public.vw_protocolos where id = '60000000-0000-0000-0000-000000000001';
  assert r.qtd_processos = 2 and r.pendente and r.responsavel_nome = 'Operadora', 'protocolo N:N';
  select * into r from public.vw_processo_resumo where id = '50000000-0000-0000-0000-000000000001';
  assert r.qtd_protocolos = 2 and r.protocolos_pendentes = 1 and r.tem_nupe and r.nupes = 'NUPE-0002', 'processo com 2 protocolos';
  select * into r from public.vw_processo_resumo where id = '50000000-0000-0000-0000-000000000002';
  assert not r.tem_nupe, 'processo 2 ainda sem NUPE';
  select * into r from public.vw_processo_resumo where id = '50000000-0000-0000-0000-000000000003';
  assert r.qtd_protocolos = 0 and not r.tem_nupe, 'processo sem protocolo';
end $$;

-- Informar o NUPE e mudar o status gera movimentação nos DOIS processos
update public.protocolos
   set nupe = 'NUPE-0001', data_protocolo = public.hoje_br(),
       status_id = (select id from public.status_protocolo where nome = 'Protocolado')
 where id = '60000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select tem_nupe from public.vw_processo_resumo where id = '50000000-0000-0000-0000-000000000002'), 'NUPE propagado';
  assert (select count(*) from public.processo_movimentacoes
          where processo_id = '50000000-0000-0000-0000-000000000002' and tipo = 'protocolo'
            and descricao like '%NUPE — → NUPE-0001%') = 1, 'movimentação do NUPE no processo 2';
  assert (select count(*) from public.processo_movimentacoes
          where processo_id = '50000000-0000-0000-0000-000000000001' and descricao like '%status A protocolar → Protocolado%') = 1,
         'movimentação de status no processo 1';
end $$;

-- NUPE não pode se repetir
do $$ begin
  begin
    insert into public.protocolos (status_id, responsavel_id, nupe)
    values ((select id from public.status_protocolo limit 1), '00000000-0000-0000-0000-000000000003', 'NUPE-0001');
    raise exception 'deveria falhar';
  exception when unique_violation then null;
  end;
end $$;

-- Responsável precisa ser usuário ativo
do $$ begin
  begin
    insert into public.protocolos (status_id, responsavel_id)
    values ((select id from public.status_protocolo limit 1), gen_random_uuid());
    raise exception 'deveria falhar';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'deveria falhar' then raise; end if;
  end;
end $$;

-- Desvincular gera movimentação
delete from public.protocolo_processos
 where protocolo_id = '60000000-0000-0000-0000-000000000002' and processo_id = '50000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.processo_movimentacoes
          where processo_id = '50000000-0000-0000-0000-000000000001' and descricao like 'Desvinculado do protocolo%') = 1,
         'desvínculo registrado';
end $$;

-- Documentos: caminho precisa corresponder ao vínculo
insert into public.documentos (id, processo_id, tipo, nome_arquivo, storage_path)
values ('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'ata_audiencia', 'ata.pdf',
        'processos/50000000-0000-0000-0000-000000000001/a1-ata.pdf');
do $$ begin
  begin
    insert into public.documentos (processo_id, tipo, nome_arquivo, storage_path)
    values ('50000000-0000-0000-0000-000000000001', 'sentenca', 'x.pdf', 'processos/50000000-0000-0000-0000-000000000002/x.pdf');
    raise exception 'deveria falhar';
  exception when check_violation then null;
  end;
end $$;
-- Comprovante no protocolo aparece na linha do tempo dos dois processos
insert into public.documentos (protocolo_id, tipo, nome_arquivo, storage_path)
values ('60000000-0000-0000-0000-000000000001', 'comprovante_protocolo', 'comprovante.pdf',
        'protocolos/60000000-0000-0000-0000-000000000001/c1-comprovante.pdf');
do $$ begin
  assert (select count(*) from public.processo_movimentacoes
          where tipo = 'documento' and descricao like 'Documento anexado (comprovante protocolo)%') = 2, 'documento do protocolo';
end $$;
-- Remoção lógica
update public.documentos set excluido_em = now(), motivo_exclusao = 'arquivo errado'
 where id = '70000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.processo_movimentacoes
          where processo_id = '50000000-0000-0000-0000-000000000001' and descricao like 'Documento removido%arquivo errado') = 1,
         'remoção registrada';
end $$;

-- Anotação manual permitida; movimentação "automática" forjada não
insert into public.processo_movimentacoes (processo_id, tipo, descricao)
values ('50000000-0000-0000-0000-000000000001', 'anotacao', 'Ligação para a parte requerida');
do $$ begin
  begin
    insert into public.processo_movimentacoes (processo_id, tipo, descricao, automatica)
    values ('50000000-0000-0000-0000-000000000001', 'protocolo', 'forjada', true);
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.processo_movimentacoes set descricao = 'alterada';
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Movimentações do Módulo 2 também entram na linha do tempo
insert into public.acordos (id, processo_id, polo_pagador, valor_total)
values ('80000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'requerido', 1234.5);
select public.definir_parcelas('80000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('valor', 1234.5, 'data_vencimento', public.hoje_br())));
select public.registrar_recebimento('80000000-0000-0000-0000-000000000001', public.hoje_br(), 100) as rec \gset
select public.estornar_recebimento(:'rec', 'teste');
do $$ begin
  assert (select string_agg(descricao, ' | ' order by criado_em, descricao) from public.processo_movimentacoes
          where processo_id = '50000000-0000-0000-0000-000000000003' and tipo in ('acordo', 'recebimento'))
         like '%cadastrado: R$ 1.234,50%Recebimento de R$ 100,00%Estorno do recebimento%', 'linha do tempo do acordo';
end $$;

-- Storage: leitor lê, não envia; operador envia só nas pastas previstas
do $$ begin
  insert into storage.objects (bucket_id, name) values ('documentos', 'processos/x/arquivo.pdf');
  begin
    insert into storage.objects (bucket_id, name) values ('documentos', 'outros/arquivo.pdf');
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.vw_protocolos) = 2, 'leitor consulta protocolos';
  assert (select count(*) from public.listar_usuarios_ativos()) >= 3, 'leitor vê nomes dos usuários';
  begin
    insert into storage.objects (bucket_id, name) values ('documentos', 'processos/y/arquivo.pdf');
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.processo_movimentacoes (processo_id, tipo, descricao)
    values ('50000000-0000-0000-0000-000000000001', 'anotacao', 'leitor');
    raise exception 'deveria falhar';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Admin mantém os status
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into public.status_protocolo (nome, ordem, pendente) values ('Em análise no GOV', 15, true);
do $$ begin
  assert (select count(*) from public.status_protocolo) = 3, 'admin cria status';
end $$;
reset role;
select 'OK - regras de protocolos, documentos e movimentações verificadas' as resultado;

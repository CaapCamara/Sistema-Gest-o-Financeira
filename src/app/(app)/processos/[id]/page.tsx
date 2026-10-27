import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileCheck2, Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { HistoricoAuditoria } from "@/components/ui/historico-auditoria";
import { POLO_LABEL, STATUS_PROCESSO_LABEL } from "@/modules/processos/labels";
import { SITUACAO_ACORDO_LABEL, STATUS_ACORDO_LABEL } from "@/modules/acordos/labels";
import { Movimentacoes } from "@/modules/processos/components/movimentacoes";
import { DocumentosCard, type DocumentoListado } from "@/modules/documentos/components/documentos-card";
import { tomStatusProtocolo } from "@/modules/protocolos/labels";
import { listarUsuarios } from "@/modules/protocolos/queries";
import type {
  AcordoPosicao,
  Documento,
  Movimentacao,
  ProcessoParte,
  ProcessoResumo,
  ProtocoloView,
  RegistroAuditoria,
} from "@/types/db";

export const metadata: Metadata = { title: "Processo" };

const ABAS = [
  { id: "acordos", label: "Acordos" },
  { id: "protocolos", label: "Protocolos GOV" },
  { id: "documentos", label: "Documentos" },
  { id: "movimentacoes", label: "Movimentações" },
  { id: "historico", label: "Histórico de alterações" },
] as const;

export default async function ProcessoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba = "acordos" } = await searchParams;
  const supabase = await createClient();
  const perfil = await getPerfil();
  const editavel = podeEditar(perfil);

  const [{ data: resumo }, { data: partesData }, { data: acordosData }, { data: vinculos }] = await Promise.all([
    supabase.from("vw_processo_resumo").select("*").eq("id", id).maybeSingle(),
    supabase.from("processo_partes").select("*").eq("processo_id", id).order("polo").order("nome"),
    supabase.from("vw_acordo_posicao").select("*").eq("processo_id", id).order("criado_em", { ascending: false }),
    supabase.from("protocolo_processos").select("protocolo_id").eq("processo_id", id),
  ]);
  if (!resumo) notFound();

  const p = resumo as ProcessoResumo;
  const partes = (partesData ?? []) as ProcessoParte[];
  const acordos = (acordosData ?? []) as AcordoPosicao[];
  const protocoloIds = (vinculos ?? []).map((v) => v.protocolo_id as string);
  const { data: protsData } = protocoloIds.length
    ? await supabase.from("vw_protocolos").select("*").in("id", protocoloIds).order("criado_em", { ascending: false })
    : { data: [] };
  const protocolos = (protsData ?? []) as ProtocoloView[];

  let documentos: DocumentoListado[] = [];
  if (aba === "documentos") {
    const filtro = protocoloIds.length
      ? `processo_id.eq.${id},protocolo_id.in.(${protocoloIds.join(",")})`
      : `processo_id.eq.${id}`;
    const { data } = await supabase
      .from("documentos")
      .select("*")
      .or(filtro)
      .is("excluido_em", null)
      .order("criado_em", { ascending: false });
    const rotulo = new Map(protocolos.map((x) => [x.id, x.nupe ? `${x.codigo} (NUPE ${x.nupe})` : x.codigo]));
    documentos = ((data ?? []) as Documento[]).map((d) =>
      d.protocolo_id ? { ...d, origem: { href: `/protocolos/${d.protocolo_id}?aba=documentos`, label: `protocolo ${rotulo.get(d.protocolo_id) ?? ""}` } } : d,
    );
  }

  let movimentacoes: Movimentacao[] = [];
  let autores: Record<string, string> = {};
  if (aba === "movimentacoes") {
    const [{ data }, usuarios] = await Promise.all([
      supabase
        .from("processo_movimentacoes")
        .select("*")
        .eq("processo_id", id)
        .order("data_movimentacao", { ascending: false })
        .order("criado_em", { ascending: false })
        .limit(500),
      listarUsuarios(supabase),
    ]);
    movimentacoes = (data ?? []) as Movimentacao[];
    autores = Object.fromEntries(usuarios.map((u) => [u.id, u.nome]));
  }

  let auditoria: RegistroAuditoria[] = [];
  if (aba === "historico" && perfil?.papel === "admin") {
    const ids = [id, ...partes.map((x) => x.id), ...acordos.map((a) => a.id)];
    const { data } = await supabase
      .from("auditoria")
      .select("*")
      .in("registro_id", ids)
      .order("criado_em", { ascending: false })
      .limit(200);
    auditoria = (data ?? []) as RegistroAuditoria[];
  }

  return (
    <>
      <PageHeader
        back={{ href: "/processos", label: "Processos" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.codigo}
            <Badge tone={STATUS_PROCESSO_LABEL[p.status].tone}>{STATUS_PROCESSO_LABEL[p.status].label}</Badge>
            {p.em_atraso && <Badge tone="red">Parcelas atrasadas</Badge>}
            {!p.tem_nupe && <Badge tone="amber">Sem NUPE</Badge>}
          </span>
        }
        description={p.numero_processo ? `Processo nº ${p.numero_processo}` : "Sem número de processo"}
        actions={
          editavel && (
            <>
              <Link href={`/processos/${id}/editar`} className={buttonClasses("secondary", "sm")}>
                <Pencil className="h-4 w-4" /> Editar
              </Link>
              <Link href={`/acordos/novo?processo=${id}`} className={buttonClasses("primary", "sm")}>
                <Plus className="h-4 w-4" /> Novo acordo
              </Link>
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Acordos ativos" value={p.qtd_acordos_ativos} hint={`${p.qtd_acordos} no total`} />
        <Stat label="Valor dos acordos ativos" value={formatBRL(p.valor_acordos_ativos)} />
        <Stat label="Recebido" value={formatBRL(p.recebido_acordos_ativos)} tone="positive" />
        <Stat
          label="Em aberto"
          value={formatBRL(p.saldo_acordos_ativos)}
          tone={p.em_atraso ? "negative" : "default"}
          hint={p.parcelas_atrasadas > 0 ? `${p.parcelas_atrasadas} parcela(s) atrasada(s)` : "nenhuma parcela atrasada"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Partes" />
          <Table>
            <thead>
              <tr>
                <Th>Polo</Th>
                <Th>Nome</Th>
                <Th>Documento</Th>
                <Th>Contato</Th>
              </tr>
            </thead>
            <tbody>
              {partes.length === 0 && <EmptyRow colSpan={4}>Nenhuma parte cadastrada.</EmptyRow>}
              {partes.map((x) => (
                <tr key={x.id}>
                  <Td>
                    <Badge tone={x.polo === "requerente" ? "blue" : "gray"}>{POLO_LABEL[x.polo]}</Badge>
                  </Td>
                  <Td className="whitespace-normal">{x.nome}</Td>
                  <Td>{x.documento ?? "—"}</Td>
                  <Td className="whitespace-normal">{x.contato ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Dados do processo" />
          <CardBody className="space-y-3 text-sm">
            <div>
              <p className="text-slate-500">Identificador interno</p>
              <p className="font-medium">{p.codigo}</p>
            </div>
            <div>
              <p className="text-slate-500">Número do processo</p>
              <p className="font-medium">{p.numero_processo ?? "—"}</p>
            </div>
            <div>
              <p className="text-slate-500">Data da audiência</p>
              <p className="font-medium">{formatDateBR(p.data_audiencia)}</p>
            </div>
            {p.observacoes && (
              <div>
                <p className="text-slate-500">Observações</p>
                <p className="whitespace-pre-wrap text-slate-700">{p.observacoes}</p>
              </div>
            )}
            <div>
              <p className="text-slate-500">NUPE</p>
              <p className={cn("font-medium", !p.tem_nupe && "text-amber-700")}>{p.nupes || "Ainda não informado"}</p>
              <p className="text-xs text-slate-500">
                {p.qtd_protocolos} protocolo(s){p.protocolos_pendentes > 0 ? ` · ${p.protocolos_pendentes} pendente(s)` : ""}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/processos/${id}?aba=${a.id}`}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium",
              aba === a.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {a.label}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {aba === "acordos" && (
          <Card>
            <CardHeader title="Acordos" description="Valores pagos entre as partes, acompanhados pelo sistema." />
            <Table>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Quem paga</Th>
                  <Th align="right">Valor total</Th>
                  <Th align="right">Parcelas</Th>
                  <Th align="right">Recebido</Th>
                  <Th align="right">Em aberto</Th>
                  <Th>Próx. venc.</Th>
                  <Th>Situação</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {acordos.length === 0 && <EmptyRow colSpan={9}>Nenhum acordo cadastrado.</EmptyRow>}
                {acordos.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/acordos/${a.id}`} className="font-medium text-brand-700 hover:underline">
                        {a.codigo}
                      </Link>
                    </Td>
                    <Td>{POLO_LABEL[a.polo_pagador]}</Td>
                    <Td align="right">{formatBRL(a.valor_total)}</Td>
                    <Td align="right">
                      {a.parcelas_recebidas}/{a.qtd_parcelas}
                    </Td>
                    <Td align="right" className="text-emerald-700">{formatBRL(a.total_recebido)}</Td>
                    <Td align="right">{formatBRL(a.saldo_em_aberto)}</Td>
                    <Td>{formatDateBR(a.proximo_vencimento)}</Td>
                    <Td>
                      <Badge tone={SITUACAO_ACORDO_LABEL[a.situacao_financeira].tone}>
                        {SITUACAO_ACORDO_LABEL[a.situacao_financeira].label}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_ACORDO_LABEL[a.status].tone}>{STATUS_ACORDO_LABEL[a.status].label}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {aba === "protocolos" && (
          <Card>
            <CardHeader
              title="Protocolos GOV"
              description="Controle manual. Um protocolo pode abranger este e outros processos."
              actions={
                editavel && (
                  <Link href={`/protocolos/novo?processo=${id}`} className={buttonClasses("primary", "sm")}>
                    <FileCheck2 className="h-4 w-4" /> Novo protocolo
                  </Link>
                )
              }
            />
            <Table>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>NUPE</Th>
                  <Th>Data</Th>
                  <Th>Responsável</Th>
                  <Th align="right">Processos</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {protocolos.length === 0 && <EmptyRow colSpan={6}>Nenhum protocolo vinculado.</EmptyRow>}
                {protocolos.map((x) => (
                  <tr key={x.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/protocolos/${x.id}`} className="font-medium text-brand-700 hover:underline">
                        {x.codigo}
                      </Link>
                    </Td>
                    <Td>{x.nupe ?? <span className="text-amber-700">sem NUPE</span>}</Td>
                    <Td>{formatDateBR(x.data_protocolo)}</Td>
                    <Td>{x.responsavel_nome ?? "—"}</Td>
                    <Td align="right" title={x.processos}>{x.qtd_processos}</Td>
                    <Td>
                      <Badge tone={tomStatusProtocolo(x.pendente)}>{x.status_nome}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {aba === "documentos" && (
          <DocumentosCard
            destino={{ entidade: "processo", id }}
            documentos={documentos}
            editavel={editavel}
            descricao="Ata, sentença, planilha do acordo e complementares. Comprovantes anexados aos protocolos também aparecem aqui."
          />
        )}

        {aba === "movimentacoes" && (
          <Movimentacoes processoId={id} movimentacoes={movimentacoes} autores={autores} editavel={editavel} />
        )}

        {aba === "historico" && <HistoricoAuditoria registros={auditoria} admin={perfil?.papel === "admin"} />}
      </div>
    </>
  );
}

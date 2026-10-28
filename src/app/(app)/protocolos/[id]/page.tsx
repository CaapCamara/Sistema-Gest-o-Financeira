import type { Metadata } from "next";
import { ExcluirButton } from "@/components/excluir-button";
import { excluirProtocolo } from "@/modules/protocolos/actions/protocolos";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { HistoricoAuditoria } from "@/components/ui/historico-auditoria";
import { DocumentosCard } from "@/modules/documentos/components/documentos-card";
import { STATUS_PROCESSO_LABEL } from "@/modules/processos/labels";
import { tomStatusProtocolo } from "@/modules/protocolos/labels";
import type { Documento, ProcessoResumo, ProtocoloView, RegistroAuditoria } from "@/types/db";

export const metadata: Metadata = { title: "Protocolo" };

const ABAS = [
  { id: "processos", label: "Processos abrangidos" },
  { id: "documentos", label: "Documentos" },
  { id: "historico", label: "Histórico de alterações" },
] as const;

export default async function ProtocoloPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba = "processos" } = await searchParams;
  const supabase = await createClient();
  const perfil = await getPerfil();
  const editavel = podeEditar(perfil);

  const [{ data: prot }, { data: vinculos }, { data: docs }] = await Promise.all([
    supabase.from("vw_protocolos").select("*").eq("id", id).maybeSingle(),
    supabase.from("protocolo_processos").select("id, processo_id").eq("protocolo_id", id),
    supabase.from("documentos").select("*").eq("protocolo_id", id).is("excluido_em", null).order("criado_em", { ascending: false }),
  ]);
  if (!prot) notFound();
  const p = prot as ProtocoloView;
  const processoIds = (vinculos ?? []).map((v) => v.processo_id as string);
  const { data: procs } = processoIds.length
    ? await supabase.from("vw_processo_resumo").select("*").in("id", processoIds).order("codigo")
    : { data: [] };
  const processos = (procs ?? []) as ProcessoResumo[];

  let auditoria: RegistroAuditoria[] = [];
  if (aba === "historico" && perfil?.papel === "admin") {
    const ids = [id, ...(vinculos ?? []).map((v) => v.id as string), ...(docs ?? []).map((d) => d.id as string)];
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
        back={{ href: "/protocolos", label: "Protocolos GOV" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.codigo}
            <Badge tone={tomStatusProtocolo(p.pendente)}>{p.status_nome}</Badge>
          </span>
        }
        description={p.assunto ?? undefined}
        actions={
          editavel && (
            <>
              <Link href={`/protocolos/${id}/editar`} className={buttonClasses("secondary", "sm")}>
                <Pencil className="h-4 w-4" /> Editar
              </Link>
              <ExcluirButton
                size="sm"
                nome="este protocolo"
                acao={excluirProtocolo.bind(null, id)}
                redirecionarPara="/protocolos"
              />
            </>
          )
        }
      />

      <Card>
        <CardBody className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-slate-500">Número NUPE</p>
            <p className={cn("font-medium", !p.nupe && "text-amber-700")}>{p.nupe ?? "Ainda não informado"}</p>
          </div>
          <div>
            <p className="text-slate-500">Data do protocolo</p>
            <p className="font-medium">{formatDateBR(p.data_protocolo)}</p>
          </div>
          <div>
            <p className="text-slate-500">Responsável</p>
            <p className="font-medium">{p.responsavel_nome ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Status</p>
            <p className="font-medium">
              {p.status_nome}
              <span className="ml-1 text-xs font-normal text-slate-500">{p.pendente ? "(pendente)" : "(não pendente)"}</span>
            </p>
          </div>
          {p.observacoes && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-slate-500">Observações</p>
              <p className="whitespace-pre-wrap text-slate-700">{p.observacoes}</p>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/protocolos/${id}?aba=${a.id}`}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium",
              aba === a.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {a.label}
            {a.id === "processos" && ` (${processos.length})`}
            {a.id === "documentos" && ` (${(docs ?? []).length})`}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {aba === "processos" && (
          <Card>
            <CardHeader title="Processos abrangidos" description="Para incluir ou retirar processos, edite o protocolo." />
            <Table>
              <thead>
                <tr>
                  <Th>Processo</Th>
                  <Th>Requerente(s)</Th>
                  <Th>Requerido(s)</Th>
                  <Th align="right">Em aberto (acordos)</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {processos.length === 0 && <EmptyRow colSpan={5}>Nenhum processo vinculado.</EmptyRow>}
                {processos.map((x) => (
                  <tr key={x.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/processos/${x.id}`} className="font-medium text-brand-700 hover:underline">
                        {x.numero_processo ?? x.codigo}
                      </Link>
                      {x.numero_processo && <span className="ml-1 text-xs text-slate-500">{x.codigo}</span>}
                    </Td>
                    <Td className="max-w-[14rem] truncate" title={x.requerentes}>{x.requerentes || "—"}</Td>
                    <Td className="max-w-[14rem] truncate" title={x.requeridos}>{x.requeridos || "—"}</Td>
                    <Td align="right">{formatBRL(x.saldo_acordos_ativos)}</Td>
                    <Td>
                      <Badge tone={STATUS_PROCESSO_LABEL[x.status].tone}>{STATUS_PROCESSO_LABEL[x.status].label}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {aba === "documentos" && (
          <DocumentosCard
            destino={{ entidade: "protocolo", id }}
            documentos={(docs ?? []) as Documento[]}
            editavel={editavel}
            tipoPadrao="comprovante_protocolo"
            descricao="Documentos do protocolo aparecem em todos os processos abrangidos."
          />
        )}

        {aba === "historico" && <HistoricoAuditoria registros={auditoria} admin={perfil?.papel === "admin"} />}
      </div>
    </>
  );
}

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
import type { AcordoPosicao, ProcessoParte, ProcessoResumo, RegistroAuditoria } from "@/types/db";

export const metadata: Metadata = { title: "Processo" };

const ABAS = [
  { id: "acordos", label: "Acordos" },
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

  const [{ data: resumo }, { data: partesData }, { data: acordosData }] = await Promise.all([
    supabase.from("vw_processo_resumo").select("*").eq("id", id).maybeSingle(),
    supabase.from("processo_partes").select("*").eq("processo_id", id).order("polo").order("nome"),
    supabase.from("vw_acordo_posicao").select("*").eq("processo_id", id).order("criado_em", { ascending: false }),
  ]);
  if (!resumo) notFound();

  const p = resumo as ProcessoResumo;
  const partes = (partesData ?? []) as ProcessoParte[];
  const acordos = (acordosData ?? []) as AcordoPosicao[];

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
            <div className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" />
              Protocolos GOV (NUPE, responsável e status) e documentos anexos entram na próxima etapa.
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

        {aba === "historico" && <HistoricoAuditoria registros={auditoria} admin={perfil?.papel === "admin"} />}
      </div>
    </>
  );
}

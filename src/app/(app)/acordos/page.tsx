import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { POLO_LABEL } from "@/modules/processos/labels";
import { SITUACAO_ACORDO_LABEL, STATUS_ACORDO_LABEL } from "@/modules/acordos/labels";
import type { AcordoPosicao } from "@/types/db";

export const metadata: Metadata = { title: "Acordos" };

const FILTROS = [
  { valor: "", label: "Todos" },
  { valor: "ativo", label: "Ativos" },
  { valor: "atraso", label: "Em atraso" },
  { valor: "quitado", label: "Quitados" },
];

export default async function AcordosPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro = "" } = await searchParams;
  const supabase = await createClient();
  const perfil = await getPerfil();

  let query = supabase.from("vw_acordo_posicao").select("*").order("criado_em", { ascending: false });
  if (filtro === "ativo") query = query.eq("status", "ativo");
  if (filtro === "atraso") query = query.eq("em_atraso", true).eq("status", "ativo");
  if (filtro === "quitado") query = query.or("status.eq.quitado,situacao_financeira.eq.quitado");
  const { data } = await query;
  const lista = (data ?? []) as AcordoPosicao[];

  return (
    <>
      <PageHeader
        title="Acordos"
        description="Parcelas pagas entre as partes dos processos, acompanhadas pelo sistema."
        actions={
          podeEditar(perfil) && (
            <Link href="/acordos/novo" className={buttonClasses()}>
              <Plus className="h-4 w-4" /> Novo acordo
            </Link>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={f.valor ? `/acordos?filtro=${f.valor}` : "/acordos"}
            className={buttonClasses(filtro === f.valor ? "primary" : "secondary", "sm")}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Acordo</Th>
              <Th>Processo</Th>
              <Th>Pagador</Th>
              <Th align="right">Valor total</Th>
              <Th align="right">Parcelas</Th>
              <Th align="right">Recebido</Th>
              <Th align="right">Atrasado</Th>
              <Th>Próx. venc.</Th>
              <Th>Situação</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <EmptyRow colSpan={10}>Nenhum acordo encontrado.</EmptyRow>}
            {lista.map((a) => {
              const pagador = a.polo_pagador === "requerido" ? a.requeridos : a.requerentes;
              return (
                <tr key={a.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/acordos/${a.id}`} className="font-medium text-brand-700 hover:underline">
                      {a.codigo}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/processos/${a.processo_id}`} className="hover:underline">
                      {a.numero_processo ?? a.processo_codigo}
                    </Link>
                  </Td>
                  <Td className="max-w-[14rem] truncate" title={pagador}>
                    {pagador || POLO_LABEL[a.polo_pagador]}
                  </Td>
                  <Td align="right">{formatBRL(a.valor_total)}</Td>
                  <Td align="right">
                    {a.parcelas_recebidas}/{a.qtd_parcelas}
                  </Td>
                  <Td align="right" className="text-emerald-700">{formatBRL(a.total_recebido)}</Td>
                  <Td align="right" className={Number(a.valor_atrasado) > 0 ? "font-medium text-red-700" : ""}>
                    {formatBRL(a.valor_atrasado)}
                  </Td>
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
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

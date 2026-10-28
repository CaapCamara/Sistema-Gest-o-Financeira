import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { garantirCompetencias } from "@/modules/emprestimos/queries/competencias";
import { getPerfil, podeEditar } from "@/lib/auth";
import { formatBRL, formatPercent } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { STATUS_LABEL } from "@/modules/emprestimos/labels";
import type { EmprestimoPosicao } from "@/types/db";

export const metadata: Metadata = { title: "Empréstimos" };

const FILTROS = [
  { valor: "", label: "Todos" },
  { valor: "ativo", label: "Ativos" },
  { valor: "atraso", label: "Em atraso" },
  { valor: "quitado", label: "Quitados" },
];

export default async function EmprestimosPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro = "" } = await searchParams;
  const supabase = await createClient();
  await garantirCompetencias(supabase);
  const perfil = await getPerfil();

  let query = supabase.from("vw_emprestimo_posicao").select("*").order("data_inicio", { ascending: false });
  if (filtro === "ativo" || filtro === "quitado") query = query.eq("status", filtro);
  if (filtro === "atraso") query = query.eq("em_atraso", true).eq("status", "ativo");
  const { data } = await query;
  const lista = (data ?? []) as EmprestimoPosicao[];

  return (
    <>
      <PageHeader
        etapa={{ numero: 1, nome: "Empréstimo" }}
        title="Empréstimos"
        description="O dinheiro recebido de cada credor: valor, juros por mês e prazo para devolver."
        actions={
          podeEditar(perfil) && (
            <Link href="/emprestimos/novo" className={buttonClasses()}>
              <Plus className="h-4 w-4" /> Novo empréstimo
            </Link>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={f.valor ? `/emprestimos?filtro=${f.valor}` : "/emprestimos"}
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
              <Th>Código</Th>
              <Th>Credor</Th>
              <Th align="right">Principal</Th>
              <Th align="right">Taxa</Th>
              <Th align="right">Juros/mês</Th>
              <Th align="right">Juros vencidos não pagos</Th>
              <Th align="right">Principal devido</Th>
              <Th align="right">Reserva</Th>
              <Th>Próx. venc.</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <EmptyRow colSpan={10}>Nenhum empréstimo encontrado.</EmptyRow>}
            {lista.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/emprestimos/${e.id}`} className="font-medium text-brand-700 hover:underline">
                    {e.codigo}
                  </Link>
                </Td>
                <Td>{e.credor_nome}</Td>
                <Td align="right">{formatBRL(e.valor_principal)}</Td>
                <Td align="right">{formatPercent(e.taxa_juros_mensal)}</Td>
                <Td align="right">{formatBRL(e.juros_mensal)}</Td>
                <Td align="right" className={Number(e.juros_vencidos_nao_pagos) > 0 ? "font-medium text-red-700" : ""}>
                  {formatBRL(e.juros_vencidos_nao_pagos)}
                </Td>
                <Td align="right">{formatBRL(e.principal_devido)}</Td>
                <Td align="right" className="text-emerald-700">
                  {formatBRL(e.reserva_saldo)}
                </Td>
                <Td>{formatDateBR(e.proximo_vencimento)}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Badge tone={STATUS_LABEL[e.status].tone}>{STATUS_LABEL[e.status].label}</Badge>
                    {e.em_atraso && e.status === "ativo" && <Badge tone="red">Atraso</Badge>}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightLeft, CircleDollarSign, Layers, PiggyBank } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, formatDecimalBR, sum } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { SplitBar } from "@/components/ui/progress";
import type { OperacaoView } from "@/types/db";

export const metadata: Metadata = { title: "Operações" };

export default async function OperacoesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vw_operacoes")
    .select("*")
    .order("ativa", { ascending: false })
    .order("codigo", { ascending: false });
  const lista = (data ?? []) as OperacaoView[];
  const ativas = lista.filter((o) => o.ativa);

  const totalJuros = sum(lista.map((o) => o.total_juros));
  const totalReserva = sum(lista.map((o) => o.total_reserva));
  const totalRemanescente = sum(lista.map((o) => o.total_remanescente));

  return (
    <>
      <PageHeader
        title="Operações"
        description="Cada operação liga um acordo a um empréstimo: os recebimentos do acordo pagam os juros, formam a reserva e o excedente vira montante remanescente."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Operações ativas" value={ativas.length} icon={<ArrowRightLeft className="h-4 w-4" />} tone="info" hint={`${lista.length} no total`} />
        <Stat label="Destinado a juros" value={formatBRL(totalJuros)} icon={<CircleDollarSign className="h-4 w-4" />} tone="info" />
        <Stat label="Destinado à reserva" value={formatBRL(totalReserva)} icon={<PiggyBank className="h-4 w-4" />} tone="positive" />
        <Link href="/remanescente" className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Stat label="Montante remanescente" value={formatBRL(totalRemanescente)} icon={<Layers className="h-4 w-4" />} tone="violet" className="h-full" hint="ver por operação" />
        </Link>
      </div>

      <Card>
        <CardHeader title="Todas as operações" description="Para criar uma operação, abra o acordo e use “Vincular a empréstimo”." />
        <Table>
          <thead>
            <tr>
              <Th>Operação</Th>
              <Th>Processo · acordo</Th>
              <Th>Empréstimo</Th>
              <Th>Regra</Th>
              <Th align="right">Juros</Th>
              <Th align="right">Reserva</Th>
              <Th align="right">Remanescente</Th>
              <Th>Distribuição</Th>
              <Th>Último recebimento</Th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <EmptyRow colSpan={9}>Nenhuma operação cadastrada.</EmptyRow>}
            {lista.map((o) => (
              <tr key={o.id} className={cn("hover:bg-slate-50/70", !o.ativa && "text-slate-400")}>
                <Td>
                  <Link href={`/acordos/${o.acordo_id}?aba=operacao`} className="font-medium text-brand-700 hover:underline">
                    {o.codigo}
                  </Link>
                  {!o.ativa && (
                    <Badge tone="gray" className="ml-2">
                      Encerrada
                    </Badge>
                  )}
                </Td>
                <Td>
                  <Link href={`/processos/${o.processo_id}`} className="hover:underline">
                    {o.numero_processo ?? o.processo_codigo}
                  </Link>
                  <span className="block text-xs text-slate-500">{o.acordo_codigo}</span>
                </Td>
                <Td>
                  <Link href={`/emprestimos/${o.emprestimo_id}`} className="hover:underline">
                    {o.emprestimo_codigo}
                  </Link>
                  <span className="block text-xs text-slate-500">{o.credor_nome}</span>
                </Td>
                <Td className="text-xs">
                  {formatDecimalBR(o.percentual_emprestimo)}% juros · {formatDecimalBR(o.percentual_reserva)}% reserva
                  {Number(o.percentual_livre) > 0 && <> · {formatDecimalBR(o.percentual_livre)}% livre</>}
                </Td>
                <Td align="right" className="text-brand-700">{formatBRL(o.total_juros)}</Td>
                <Td align="right" className="text-emerald-700">{formatBRL(o.total_reserva)}</Td>
                <Td align="right" className="font-medium text-violet-700">{formatBRL(o.total_remanescente)}</Td>
                <Td className="w-40">
                  <SplitBar
                    partes={[
                      { valor: Number(o.total_juros), tone: "brand" },
                      { valor: Number(o.total_reserva), tone: "green" },
                      { valor: Number(o.total_remanescente), tone: "violet" },
                    ]}
                  />
                </Td>
                <Td>{formatDateBR(o.ultima_destinacao)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

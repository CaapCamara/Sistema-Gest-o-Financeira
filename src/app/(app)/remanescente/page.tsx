import type { Metadata } from "next";
import Link from "next/link";
import { Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL, money, sum } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { COTA_LABEL } from "@/modules/operacoes/labels";
import type { DestinacaoView, OperacaoView } from "@/types/db";

export const metadata: Metadata = { title: "Montante remanescente" };

export default async function RemanescentePage() {
  const supabase = await createClient();
  const [{ data: ops }, { data: agreg }, { data: dest }] = await Promise.all([
    supabase.from("vw_operacoes").select("*").order("codigo"),
    // Todas as destinações ao remanescente (só as colunas da soma), para o detalhamento por cota
    supabase.from("operacao_destinacoes").select("operacao_id, cota, valor").eq("destino", "remanescente").is("estornado_em", null),
    supabase
      .from("vw_operacao_destinacoes")
      .select("*")
      .eq("destino", "remanescente")
      .is("estornado_em", null)
      .order("data_destinacao", { ascending: false })
      .limit(200),
  ]);
  const operacoes = (ops ?? []) as OperacaoView[];
  const lancamentos = (dest ?? []) as DestinacaoView[];
  const somas = (agreg ?? []) as Pick<DestinacaoView, "operacao_id" | "cota" | "valor">[];

  const total = sum(operacoes.map((o) => o.total_remanescente));
  const comSaldo = operacoes.filter((o) => money(o.total_remanescente).gt(0));
  const porCota = (opId: string, cota: DestinacaoView["cota"]) =>
    sum(somas.filter((l) => l.operacao_id === opId && l.cota === cota).map((l) => l.valor));
  const totalPosQuitacao = sum(somas.filter((l) => l.cota === "emprestimo").map((l) => l.valor));
  const totalLivre = sum(somas.filter((l) => l.cota === "livre").map((l) => l.valor));

  return (
    <>
      <PageHeader
        etapa={{ numero: 4, nome: "Gestão" }}
        title="Montante remanescente"
        description="O que sobra depois de pagar os juros e formar a reserva, inclusive tudo o que continua entrando depois que o empréstimo termina."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Total remanescente"
          value={formatBRL(total)}
          tone="rem"
          icon={<Layers className="h-4 w-4" />}
          hint={`${comSaldo.length} operação(ões) com saldo`}
          className="sm:col-span-1"
        />
        <Stat label="Cota de juros sem juros a pagar" value={formatBRL(totalPosQuitacao)} hint="empréstimo quitado ou juros já cobertos" />
        <Stat label="Percentual livre das operações" value={formatBRL(totalLivre)} hint="parte não destinada a juros nem à reserva" />
      </div>

      <Card>
        <CardHeader title="Por operação" />
        <Table>
          <thead>
            <tr>
              <Th>Operação</Th>
              <Th>Processo · acordo</Th>
              <Th>Empréstimo</Th>
              <Th align="right">Cota de juros excedente</Th>
              <Th align="right">Percentual livre</Th>
              <Th align="right">Remanescente</Th>
              <Th align="right">% do total</Th>
            </tr>
          </thead>
          <tbody>
            {operacoes.length === 0 && <EmptyRow colSpan={7}>Nenhuma operação cadastrada.</EmptyRow>}
            {operacoes.map((o) => (
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
                  {o.numero_processo ?? o.processo_codigo}
                  <span className="block text-xs text-slate-500">{o.acordo_codigo}</span>
                </Td>
                <Td>{o.emprestimo_codigo}</Td>
                <Td align="right">{formatBRL(porCota(o.id, "emprestimo"))}</Td>
                <Td align="right">{formatBRL(porCota(o.id, "livre"))}</Td>
                <Td align="right" className="font-semibold text-rem-700">{formatBRL(o.total_remanescente)}</Td>
                <Td align="right" className="text-slate-500">
                  {total.isZero() ? "—" : `${money(o.total_remanescente).dividedBy(total).times(100).toFixed(1).replace(".", ",")}%`}
                </Td>
              </tr>
            ))}
          </tbody>
          {operacoes.length > 0 && (
            <tfoot>
              <tr className="bg-rem-50/60 font-semibold">
                <Td colSpan={5}>Total</Td>
                <Td align="right" className="text-rem-800">{formatBRL(total)}</Td>
                <Td />
              </tr>
            </tfoot>
          )}
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Lançamentos" description="Os 200 mais recentes. Cada um tem origem rastreável: processo, acordo, parcela e recebimento." />
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Operação</Th>
              <Th>Processo · acordo</Th>
              <Th>Parcela</Th>
              <Th>Origem do valor</Th>
              <Th align="right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            {lancamentos.length === 0 && <EmptyRow colSpan={6}>Nenhum valor remanescente ainda.</EmptyRow>}
            {lancamentos.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50/70">
                <Td>{formatDateBR(l.data_destinacao)}</Td>
                <Td>{l.operacao_codigo}</Td>
                <Td>
                  <Link href={`/acordos/${l.acordo_id}?aba=recebimentos`} className="hover:underline">
                    {l.processo_codigo} · {l.acordo_codigo}
                  </Link>
                </Td>
                <Td>{l.parcela_numero}</Td>
                <Td className="text-xs text-slate-600">{COTA_LABEL[l.cota]}</Td>
                <Td align="right" className="font-medium text-rem-700">{formatBRL(l.valor)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

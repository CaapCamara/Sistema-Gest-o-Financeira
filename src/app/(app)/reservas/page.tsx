import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { garantirCompetencias } from "@/modules/emprestimos/queries/competencias";
import { formatBRL, sum } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import type { EmprestimoPosicao } from "@/types/db";

export const metadata: Metadata = { title: "Reservas" };

export default async function ReservasPage() {
  const supabase = await createClient();
  await garantirCompetencias(supabase);
  const { data } = await supabase
    .from("vw_emprestimo_posicao")
    .select("id, codigo, credor_nome, status, reserva_aportes, reserva_saidas, reserva_saldo, saldo_devedor_exigivel, valor_mensal_reserva_planejado")
    .order("codigo");
  const lista = (data ?? []) as EmprestimoPosicao[];

  const totalSaldo = sum(lista.map((e) => e.reserva_saldo));
  const totalAportes = sum(lista.map((e) => e.reserva_aportes));
  const totalSaidas = sum(lista.map((e) => e.reserva_saidas));
  const totalExigivel = sum(lista.filter((e) => e.status === "ativo").map((e) => e.saldo_devedor_exigivel));

  return (
    <>
      <PageHeader
        title="Reservas"
        description="Valores separados para honrar os compromissos. Reserva não é pagamento: a dívida só diminui quando há pagamento ao credor."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo consolidado" value={formatBRL(totalSaldo)} tone="info" />
        <Stat label="Total aportado" value={formatBRL(totalAportes)} />
        <Stat label="Total de saídas" value={formatBRL(totalSaidas)} hint="resgates + uso em pagamentos" />
        <Stat
          label="Cobertura da dívida exigível"
          value={totalExigivel.isZero() ? "—" : `${totalSaldo.dividedBy(totalExigivel).times(100).toFixed(1).replace(".", ",")}%`}
          hint={`dívida exigível ${formatBRL(totalExigivel)}`}
        />
      </div>
      <Card>
        <CardHeader title="Reserva por empréstimo" />
        <Table>
          <thead>
            <tr>
              <Th>Empréstimo</Th>
              <Th>Credor</Th>
              <Th align="right">Planejado/mês</Th>
              <Th align="right">Aportes</Th>
              <Th align="right">Saídas</Th>
              <Th align="right">Saldo</Th>
              <Th align="right">Saldo exigível da dívida</Th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <EmptyRow colSpan={7}>Nenhum empréstimo.</EmptyRow>}
            {lista.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/emprestimos/${e.id}?aba=reservas`} className="font-medium text-brand-700 hover:underline">
                    {e.codigo}
                  </Link>
                </Td>
                <Td>{e.credor_nome}</Td>
                <Td align="right">{formatBRL(e.valor_mensal_reserva_planejado)}</Td>
                <Td align="right">{formatBRL(e.reserva_aportes)}</Td>
                <Td align="right">{formatBRL(e.reserva_saidas)}</Td>
                <Td align="right" className="font-medium text-emerald-700">{formatBRL(e.reserva_saldo)}</Td>
                <Td align="right">{formatBRL(e.saldo_devedor_exigivel)}</Td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <Td colSpan={3}>Consolidado</Td>
                <Td align="right">{formatBRL(totalAportes)}</Td>
                <Td align="right">{formatBRL(totalSaidas)}</Td>
                <Td align="right" className="text-emerald-700">{formatBRL(totalSaldo)}</Td>
                <Td align="right">{formatBRL(sum(lista.map((e) => e.saldo_devedor_exigivel)))}</Td>
              </tr>
            </tfoot>
          )}
        </Table>
      </Card>
    </>
  );
}

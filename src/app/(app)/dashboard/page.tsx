import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Landmark, PiggyBank, Wallet, Receipt, Scale } from "lucide-react";
import { endOfMonth, startOfMonth, addDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { garantirCompetencias } from "@/modules/emprestimos/queries/competencias";
import { formatBRL, sum } from "@/lib/money";
import { formatDateBR, hojeISO, parseDateOnly, toISODate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import type { Competencia, EmprestimoPosicao } from "@/types/db";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage() {
  const supabase = await createClient();
  await garantirCompetencias(supabase);
  const hoje = hojeISO();
  const d = parseDateOnly(hoje);
  const inicioMes = toISODate(startOfMonth(d));
  const fimMes = toISODate(endOfMonth(d));
  const em30 = toISODate(addDays(d, 30));

  const [{ data: pos }, { data: compsMes }, { data: proximos }, { data: pagsMes }] = await Promise.all([
    supabase.from("vw_emprestimo_posicao").select("*"),
    supabase.from("vw_competencias").select("emprestimo_id, juros_devido, juros_em_aberto").gte("data_vencimento", inicioMes).lte("data_vencimento", fimMes),
    supabase
      .from("vw_competencias")
      .select("*")
      .gt("juros_em_aberto", 0)
      .lte("data_vencimento", em30)
      .order("data_vencimento")
      .limit(50),
    supabase.from("pagamentos").select("emprestimo_id, valor_total").is("estornado_em", null).gte("data_pagamento", inicioMes).lte("data_pagamento", fimMes),
  ]);

  const todos = (pos ?? []) as EmprestimoPosicao[];
  const ativos = todos.filter((e) => e.status === "ativo");
  const idsAtivos = new Set(ativos.map((e) => e.id));
  const porId = new Map(todos.map((e) => [e.id, e]));

  const capitalADevolver = sum(ativos.map((e) => e.principal_devido));
  const jurosMes = sum((compsMes ?? []).filter((c) => idsAtivos.has(c.emprestimo_id)).map((c) => c.juros_devido));
  const pagosMes = sum((pagsMes ?? []).map((p) => p.valor_total));
  const pagosTotal = sum(todos.map((e) => e.total_pago));
  const reservas = sum(todos.map((e) => e.reserva_saldo));
  const jurosAtrasados = sum(ativos.map((e) => e.juros_vencidos_nao_pagos));
  const emAtraso = ativos.filter((e) => e.em_atraso);

  const listaProximos = ((proximos ?? []) as Competencia[]).filter((c) => idsAtivos.has(c.emprestimo_id));
  const principaisAVencer = ativos.filter(
    (e) => Number(e.principal_devido) > 0 && e.data_vencimento_principal <= em30,
  );

  return (
    <>
      <PageHeader title="Painel" description={`Posição em ${formatDateBR(hoje)}`} />

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Empréstimos</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Empréstimos ativos" value={ativos.length} icon={<Landmark className="h-4 w-4" />} hint={emAtraso.length ? `${emAtraso.length} em atraso` : "nenhum em atraso"} tone={emAtraso.length ? "warning" : "default"} />
        <Stat label="Capital a devolver" value={formatBRL(capitalADevolver)} icon={<Wallet className="h-4 w-4" />} hint="principal ainda devido" />
        <Stat label="Juros previstos no mês" value={formatBRL(jurosMes)} icon={<CalendarClock className="h-4 w-4" />} />
        <Stat label="Pagamentos no mês" value={formatBRL(pagosMes)} tone="positive" icon={<Receipt className="h-4 w-4" />} hint={`total histórico ${formatBRL(pagosTotal)}`} />
        <Stat label="Reservas constituídas" value={formatBRL(reservas)} tone="info" icon={<PiggyBank className="h-4 w-4" />} hint="não abatem a dívida" />
        <Stat label="Juros vencidos não pagos" value={formatBRL(jurosAtrasados)} tone={jurosAtrasados.greaterThan(0) ? "negative" : "default"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Próximos vencimentos e atrasos" description="Juros em aberto vencidos ou com vencimento nos próximos 30 dias." />
          <Table>
            <thead>
              <tr>
                <Th>Vencimento</Th>
                <Th>Empréstimo</Th>
                <Th>Credor</Th>
                <Th>Item</Th>
                <Th align="right">Em aberto</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {listaProximos.length === 0 && principaisAVencer.length === 0 && (
                <EmptyRow colSpan={6}>Nada vencido ou a vencer nos próximos 30 dias.</EmptyRow>
              )}
              {principaisAVencer.map((e) => (
                <tr key={`p-${e.id}`} className="hover:bg-slate-50">
                  <Td>{formatDateBR(e.data_vencimento_principal)}</Td>
                  <Td>
                    <Link href={`/emprestimos/${e.id}`} className="text-brand-700 hover:underline">{e.codigo}</Link>
                  </Td>
                  <Td>{e.credor_nome}</Td>
                  <Td>Principal</Td>
                  <Td align="right">{formatBRL(e.principal_devido)}</Td>
                  <Td>{e.data_vencimento_principal < hoje ? <Badge tone="red">Vencido</Badge> : <Badge tone="amber">A vencer</Badge>}</Td>
                </tr>
              ))}
              {listaProximos.map((c) => {
                const e = porId.get(c.emprestimo_id);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td>{formatDateBR(c.data_vencimento)}</Td>
                    <Td>
                      <Link href={`/emprestimos/${c.emprestimo_id}`} className="text-brand-700 hover:underline">{e?.codigo}</Link>
                    </Td>
                    <Td>{e?.credor_nome}</Td>
                    <Td>Juros comp. {c.numero}</Td>
                    <Td align="right">{formatBRL(c.juros_em_aberto)}</Td>
                    <Td>{c.vencida ? <Badge tone="red">Vencido</Badge> : <Badge tone="gray">A vencer</Badge>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Acordos e processos" description="Módulo 2" />
          <CardBody className="space-y-3 text-sm text-slate-600">
            <div className="flex items-center gap-2 text-slate-500">
              <Scale className="h-4 w-4" /> Em desenvolvimento (próxima etapa).
            </div>
            <p>
              Aqui aparecerão: acordos ativos, parcelas previstas e recebidas, parcelas atrasadas, protocolos pendentes e
              processos sem NUPE.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

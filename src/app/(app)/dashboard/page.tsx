import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, FileCheck2, Handshake, Landmark, PiggyBank, Wallet, Receipt, HandCoins } from "lucide-react";
import { endOfMonth, startOfMonth, addDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { garantirCompetencias } from "@/modules/emprestimos/queries/competencias";
import { formatBRL, sum } from "@/lib/money";
import { formatDateBR, hojeISO, parseDateOnly, toISODate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { SITUACAO_PARCELA_LABEL } from "@/modules/acordos/labels";
import type { AcordoPosicao, Competencia, EmprestimoPosicao, ParcelaPosicao } from "@/types/db";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage() {
  const supabase = await createClient();
  await garantirCompetencias(supabase);
  const hoje = hojeISO();
  const d = parseDateOnly(hoje);
  const inicioMes = toISODate(startOfMonth(d));
  const fimMes = toISODate(endOfMonth(d));
  const em30 = toISODate(addDays(d, 30));

  const [
    { data: pos },
    { data: compsMes },
    { data: proximos },
    { data: pagsMes },
    { data: acordosData },
    { data: parcelasMes },
    { data: parcelasProximas },
    { data: recebimentosMes },
    { count: protocolosPendentes },
    { count: processosSemNupe },
  ] = await Promise.all([
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
    supabase.from("vw_acordo_posicao").select("*").eq("status", "ativo"),
    supabase
      .from("vw_acordo_parcelas")
      .select("valor, valor_recebido")
      .eq("acordo_status", "ativo")
      .gte("data_vencimento", inicioMes)
      .lte("data_vencimento", fimMes),
    supabase
      .from("vw_acordo_parcelas")
      .select("*")
      .eq("acordo_status", "ativo")
      .gt("saldo", 0)
      .lte("data_vencimento", em30)
      .order("data_vencimento")
      .limit(50),
    supabase.from("acordo_recebimentos").select("valor").is("estornado_em", null).gte("data_recebimento", inicioMes).lte("data_recebimento", fimMes),
    supabase.from("vw_protocolos").select("id", { count: "exact", head: true }).eq("pendente", true),
    supabase.from("vw_processo_resumo").select("id", { count: "exact", head: true }).eq("status", "ativo").eq("tem_nupe", false),
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

  const acordosAtivos = (acordosData ?? []) as AcordoPosicao[];
  const acordoPorId = new Map(acordosAtivos.map((a) => [a.id, a]));
  const previstasMes = parcelasMes ?? [];
  const valorPrevistoMes = sum(previstasMes.map((p) => p.valor));
  const recebidoDasPrevistas = sum(previstasMes.map((p) => p.valor_recebido));
  const recebidoMes = sum((recebimentosMes ?? []).map((r) => r.valor));
  const parcelasAtrasadas = acordosAtivos.reduce((n, a) => n + a.parcelas_atrasadas, 0);
  const valorAtrasado = sum(acordosAtivos.map((a) => a.valor_atrasado));
  const saldoAcordos = sum(acordosAtivos.map((a) => a.saldo_em_aberto));
  const listaParcelas = (parcelasProximas ?? []) as ParcelaPosicao[];

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

      <div className="mt-6">
        <Card>
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

      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Acordos e processos</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Acordos ativos" value={acordosAtivos.length} icon={<Handshake className="h-4 w-4" />} hint={`em aberto ${formatBRL(saldoAcordos)}`} />
        <Stat
          label="Parcelas previstas no mês"
          value={formatBRL(valorPrevistoMes)}
          icon={<CalendarClock className="h-4 w-4" />}
          hint={`${previstasMes.length} parcela(s) · recebido ${formatBRL(recebidoDasPrevistas)}`}
        />
        <Stat label="Recebido no mês" value={formatBRL(recebidoMes)} tone="positive" icon={<HandCoins className="h-4 w-4" />} hint="todos os recebimentos do mês" />
        <Stat
          label="Parcelas atrasadas"
          value={parcelasAtrasadas}
          tone={parcelasAtrasadas > 0 ? "negative" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint={`${formatBRL(valorAtrasado)} após a carência`}
        />
        <Link href="/protocolos?filtro=pendentes" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Stat
            label="Protocolos pendentes"
            value={protocolosPendentes ?? 0}
            tone={(protocolosPendentes ?? 0) > 0 ? "warning" : "default"}
            icon={<FileCheck2 className="h-4 w-4" />}
            hint="status marcados como pendentes"
            className="h-full hover:border-brand-200"
          />
        </Link>
        <Link href="/processos?filtro=sem_nupe" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Stat
            label="Processos sem NUPE"
            value={processosSemNupe ?? 0}
            tone={(processosSemNupe ?? 0) > 0 ? "warning" : "default"}
            icon={<FileCheck2 className="h-4 w-4" />}
            hint="processos ativos"
            className="h-full hover:border-brand-200"
          />
        </Link>
      </div>

      <Card className="mt-6">
        <CardHeader title="Parcelas de acordos: atrasos e próximos vencimentos" description="Parcelas em aberto vencidas ou com vencimento nos próximos 30 dias." />
        <Table>
          <thead>
            <tr>
              <Th>Vencimento</Th>
              <Th>Acordo</Th>
              <Th>Processo</Th>
              <Th>Parcela</Th>
              <Th align="right">Em aberto</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {listaParcelas.length === 0 && <EmptyRow colSpan={6}>Nenhuma parcela vencida ou a vencer nos próximos 30 dias.</EmptyRow>}
            {listaParcelas.map((p) => {
              const a = acordoPorId.get(p.acordo_id);
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td>{formatDateBR(p.data_vencimento)}</Td>
                  <Td>
                    <Link href={`/acordos/${p.acordo_id}`} className="text-brand-700 hover:underline">{a?.codigo}</Link>
                  </Td>
                  <Td>{a?.numero_processo ?? a?.processo_codigo}</Td>
                  <Td>{p.numero}</Td>
                  <Td align="right">{formatBRL(p.saldo)}</Td>
                  <Td>
                    <Badge tone={SITUACAO_PARCELA_LABEL[p.situacao].tone}>{SITUACAO_PARCELA_LABEL[p.situacao].label}</Badge>
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

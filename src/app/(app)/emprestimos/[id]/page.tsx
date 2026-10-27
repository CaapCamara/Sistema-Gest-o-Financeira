import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { garantirCompetencias } from "@/modules/emprestimos/queries/competencias";
import { getPerfil, podeEditar } from "@/lib/auth";
import { formatBRL, formatPercent, money } from "@/lib/money";
import { formatDateBR, formatDateTimeBR, formatMesAno } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { MOVIMENTO_RESERVA_LABEL, SITUACAO_LABEL, STATUS_LABEL } from "@/modules/emprestimos/labels";
import { PagamentoDialog } from "@/modules/emprestimos/components/pagamento-dialog";
import { ReservaDialog } from "@/modules/emprestimos/components/reserva-dialog";
import { EstornoButton } from "@/modules/emprestimos/components/estorno-button";
import { HistoricoAuditoria } from "@/components/ui/historico-auditoria";
import type { Competencia, EmprestimoPosicao, MovimentoReserva, Pagamento, RegistroAuditoria } from "@/types/db";

export const metadata: Metadata = { title: "Empréstimo" };

const ABAS = [
  { id: "cronograma", label: "Cronograma" },
  { id: "pagamentos", label: "Pagamentos" },
  { id: "reservas", label: "Reservas" },
  { id: "historico", label: "Histórico de alterações" },
] as const;

export default async function EmprestimoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba = "cronograma" } = await searchParams;
  const supabase = await createClient();
  await garantirCompetencias(supabase, id);
  const perfil = await getPerfil();
  const editavel = podeEditar(perfil);

  const [{ data: pos }, { data: comps }, { data: pags }, { data: movs }] = await Promise.all([
    supabase.from("vw_emprestimo_posicao").select("*").eq("id", id).maybeSingle(),
    supabase.from("vw_competencias").select("*").eq("emprestimo_id", id).order("numero"),
    supabase
      .from("pagamentos")
      .select("*, pagamento_imputacoes(id, tipo, competencia_id, valor)")
      .eq("emprestimo_id", id)
      .order("data_pagamento", { ascending: false }),
    supabase.from("reserva_movimentos").select("*").eq("emprestimo_id", id).order("data_movimento", { ascending: false }),
  ]);
  if (!pos) notFound();

  const e = pos as EmprestimoPosicao;
  const competencias = (comps ?? []) as Competencia[];
  const pagamentos = (pags ?? []) as Pagamento[];
  const movimentos = (movs ?? []) as MovimentoReserva[];
  const numeroCompetencia = new Map(competencias.map((c) => [c.id, c.numero]));

  let auditoria: RegistroAuditoria[] = [];
  if (aba === "historico" && perfil?.papel === "admin") {
    const ids = [id, ...pagamentos.map((p) => p.id), ...movimentos.map((m) => m.id)];
    const { data } = await supabase
      .from("auditoria")
      .select("*")
      .in("registro_id", ids)
      .order("criado_em", { ascending: false })
      .limit(200);
    auditoria = (data ?? []) as RegistroAuditoria[];
  }

  const jurosContratadosDiverge = !money(e.juros_contratados_total).equals(money(e.juros_contratados_referencia));

  return (
    <>
      <PageHeader
        back={{ href: "/emprestimos", label: "Empréstimos" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {e.codigo}
            <Badge tone={STATUS_LABEL[e.status].tone}>{STATUS_LABEL[e.status].label}</Badge>
            {e.em_atraso && e.status === "ativo" && <Badge tone="red">Em atraso</Badge>}
          </span>
        }
        description={`Credor: ${e.credor_nome} · ${formatBRL(e.valor_principal)} a ${formatPercent(e.taxa_juros_mensal)} ao mês · ${e.prazo_meses} meses`}
        actions={
          editavel && (
            <>
              <Link href={`/emprestimos/${id}/editar`} className={buttonClasses("secondary", "sm")}>
                <Pencil className="h-4 w-4" /> Editar
              </Link>
              <ReservaDialog emprestimoId={id} saldoReserva={e.reserva_saldo} />
              <PagamentoDialog
                emprestimoId={id}
                jurosVencidos={e.juros_vencidos_nao_pagos}
                principalDevido={e.principal_devido}
                saldoReserva={e.reserva_saldo}
              />
            </>
          )
        }
      />

      {/* As cinco grandezas que não podem se misturar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Juros contratualmente devidos"
          value={formatBRL(e.juros_devidos_ate_hoje)}
          hint={`até hoje · ${formatBRL(e.juros_mensal)}/mês · contrato ${formatBRL(e.juros_contratados_total)}`}
        />
        <Stat label="Valores pagos ao credor" value={formatBRL(e.total_pago)} tone="positive" hint={`${e.qtd_pagamentos} pagamento(s) · juros ${formatBRL(e.juros_pagos)} · principal ${formatBRL(e.principal_pago)}`} />
        <Stat label="Reserva constituída" value={formatBRL(e.reserva_saldo)} tone="info" hint="não é pagamento ao credor" />
        <Stat
          label="Juros vencidos não pagos"
          value={formatBRL(e.juros_vencidos_nao_pagos)}
          tone={Number(e.juros_vencidos_nao_pagos) > 0 ? "negative" : "default"}
          hint={`${e.competencias_atrasadas} competência(s) em aberto · sem novos juros`}
        />
        <Stat
          label="Principal ainda devido"
          value={formatBRL(e.principal_devido)}
          tone={e.data_quitacao_principal ? "positive" : "default"}
          hint={
            e.data_quitacao_principal
              ? `quitado em ${formatDateBR(e.data_quitacao_principal)}`
              : `vence em ${formatDateBR(e.data_vencimento_principal)}`
          }
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Saldo devedor exigível hoje" value={formatBRL(e.saldo_devedor_exigivel)} hint="principal devido + juros vencidos não pagos" />
        <Stat label="Saldo contratual total" value={formatBRL(e.saldo_devedor_contratual)} hint="inclui juros ainda a vencer" />
        <Stat label="Próximo vencimento de juros" value={formatDateBR(e.proximo_vencimento)} />
      </div>

      {e.competencias_pos_vencimento > 0 && !e.data_quitacao_principal && (
        <div className="mt-4">
          <FormAlert>
            O principal venceu em {formatDateBR(e.data_vencimento_principal)} sem quitação. Os juros fixos de{" "}
            {formatBRL(e.juros_mensal)} continuam vencendo todo mês: {e.competencias_pos_vencimento} competência(s) após o
            prazo, somando {formatBRL(e.juros_pos_vencimento)} já vencidos.
          </FormAlert>
        </div>
      )}

      {e.data_quitacao_principal && (
        <div className="mt-4">
          <FormAlert tone="success">
            Principal quitado em {formatDateBR(e.data_quitacao_principal)}. Os juros das competências com vencimento
            posterior deixaram de ser devidos.
          </FormAlert>
        </div>
      )}

      {jurosContratadosDiverge && (
        <div className="mt-4">
          <FormAlert tone="info">
            Os juros contratados digitados ({formatBRL(e.juros_contratados_total)}) diferem da referência calculada
            ({formatBRL(e.juros_contratados_referencia)} = {formatBRL(e.juros_mensal)} × {e.prazo_meses}). O cronograma
            usa os juros fixos mensais.
          </FormAlert>
        </div>
      )}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/emprestimos/${id}?aba=${a.id}`}
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
        {aba === "cronograma" && (
          <Card>
            <CardHeader
              title="Cronograma mensal — previsto x realizado"
              description="Juros por competência (abatidos pelos pagamentos) e valores realizados no mês civil do vencimento. Competências pós-prazo surgem enquanto o principal vencido não for quitado."
            />
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Vencimento</Th>
                  <Th align="right">Juros devidos</Th>
                  <Th align="right">Juros pagos</Th>
                  <Th align="right">Juros em aberto</Th>
                  <Th align="right">Principal previsto</Th>
                  <Th align="right">Pagamento previsto</Th>
                  <Th align="right">Pago no mês</Th>
                  <Th align="right">Reserva prevista</Th>
                  <Th align="right">Reservado no mês</Th>
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {competencias.length === 0 && <EmptyRow colSpan={11}>Sem competências.</EmptyRow>}
                {competencias.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      "hover:bg-slate-50",
                      c.vencida && Number(c.juros_em_aberto) > 0 && "bg-red-50/40",
                      c.anulada_por_quitacao && "text-slate-400",
                    )}
                  >
                    <Td>
                      {c.numero}
                      {c.pos_vencimento && (
                        <Badge tone="amber" className="ml-1">
                          pós-prazo
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      {formatDateBR(c.data_vencimento)}
                      <span className="ml-1 text-xs text-slate-400">{formatMesAno(c.data_vencimento)}</span>
                    </Td>
                    <Td align="right">
                      {c.anulada_por_quitacao ? <s title="Não devida: principal quitado antes do vencimento">{formatBRL(c.juros_contratual)}</s> : formatBRL(c.juros_devido)}
                    </Td>
                    <Td align="right" className="text-emerald-700">{formatBRL(c.juros_pago)}</Td>
                    <Td align="right" className={Number(c.juros_em_aberto) > 0 && c.vencida ? "font-medium text-red-700" : ""}>
                      {formatBRL(c.juros_em_aberto)}
                    </Td>
                    <Td align="right">{Number(c.principal_previsto) > 0 ? formatBRL(c.principal_previsto) : "—"}</Td>
                    <Td align="right">{formatBRL(c.pagamento_previsto)}</Td>
                    <Td align="right">{formatBRL(c.pagamento_realizado_mes)}</Td>
                    <Td align="right">{formatBRL(c.reserva_prevista)}</Td>
                    <Td align="right">{formatBRL(c.reserva_realizada_mes)}</Td>
                    <Td>
                      <Badge tone={SITUACAO_LABEL[c.situacao].tone}>{SITUACAO_LABEL[c.situacao].label}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {aba === "pagamentos" && (
          <Card>
            <CardHeader title="Pagamentos ao credor" description="Somente valores efetivamente pagos. Cada pagamento mostra como foi abatido." />
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th align="right">Valor</Th>
                  <Th>Abatimento</Th>
                  <Th>Forma</Th>
                  <Th>Origem</Th>
                  <Th>Observações</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {pagamentos.length === 0 && <EmptyRow colSpan={7}>Nenhum pagamento registrado.</EmptyRow>}
                {pagamentos.map((p) => {
                  const estornado = !!p.estornado_em;
                  const imps = [...(p.pagamento_imputacoes ?? [])].sort(
                    (a, b) => (numeroCompetencia.get(a.competencia_id ?? "") ?? 999) - (numeroCompetencia.get(b.competencia_id ?? "") ?? 999),
                  );
                  return (
                    <tr key={p.id} className={cn("align-top", estornado && "text-slate-400 line-through decoration-slate-300")}>
                      <Td>{formatDateBR(p.data_pagamento)}</Td>
                      <Td align="right" className="font-medium">{formatBRL(p.valor_total)}</Td>
                      <Td className="whitespace-normal">
                        <ul className="space-y-0.5 text-xs">
                          {imps.map((i) => (
                            <li key={i.id}>
                              {i.tipo === "juros" ? `Juros comp. ${numeroCompetencia.get(i.competencia_id ?? "") ?? "?"}` : "Principal"}:{" "}
                              <span className="tabular">{formatBRL(i.valor)}</span>
                            </li>
                          ))}
                        </ul>
                      </Td>
                      <Td>{p.forma_pagamento ?? "—"}</Td>
                      <Td>{p.origem_reserva ? <Badge tone="blue">Reserva</Badge> : "Recursos próprios"}</Td>
                      <Td className="max-w-xs whitespace-normal text-xs">
                        {p.observacoes}
                        {estornado && (
                          <span className="block text-red-600 no-underline">
                            Estornado em {formatDateTimeBR(p.estornado_em)}: {p.motivo_estorno}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {editavel && !estornado && (
                          <EstornoButton
                            emprestimoId={id}
                            alvoId={p.id}
                            tipo="pagamento"
                            descricao={`Pagamento de ${formatBRL(p.valor_total)} em ${formatDateBR(p.data_pagamento)}`}
                          />
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}

        {aba === "reservas" && (
          <Card>
            <CardHeader
              title="Movimentos da reserva"
              description={`Saldo: ${formatBRL(e.reserva_saldo)} · aportes ${formatBRL(e.reserva_aportes)} · saídas ${formatBRL(e.reserva_saidas)}`}
            />
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Tipo</Th>
                  <Th align="right">Valor</Th>
                  <Th>Conta</Th>
                  <Th>Observações</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {movimentos.length === 0 && <EmptyRow colSpan={6}>Nenhum movimento de reserva.</EmptyRow>}
                {movimentos.map((m) => {
                  const estornado = !!m.estornado_em;
                  const entrada = m.tipo === "aporte";
                  return (
                    <tr key={m.id} className={cn(estornado && "text-slate-400 line-through decoration-slate-300")}>
                      <Td>{formatDateBR(m.data_movimento)}</Td>
                      <Td>{MOVIMENTO_RESERVA_LABEL[m.tipo]}</Td>
                      <Td align="right" className={entrada ? "text-emerald-700" : "text-red-700"}>
                        {entrada ? "+" : "−"} {formatBRL(m.valor)}
                      </Td>
                      <Td>{m.conta ?? "—"}</Td>
                      <Td className="max-w-xs whitespace-normal text-xs">
                        {m.observacoes}
                        {estornado && <span className="block text-red-600">Estornado: {m.motivo_estorno}</span>}
                      </Td>
                      <Td>
                        {editavel && !estornado && !m.pagamento_id && (
                          <EstornoButton
                            emprestimoId={id}
                            alvoId={m.id}
                            tipo="reserva"
                            descricao={`${MOVIMENTO_RESERVA_LABEL[m.tipo]} de ${formatBRL(m.valor)} em ${formatDateBR(m.data_movimento)}`}
                          />
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}

        {aba === "historico" && <HistoricoAuditoria registros={auditoria} admin={perfil?.papel === "admin"} />}
      </div>

      {e.observacoes && (
        <Card className="mt-6">
          <CardHeader title="Observações" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{e.observacoes}</p>
          </CardBody>
        </Card>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { formatBRL, formatDecimalBR, money } from "@/lib/money";
import { formatDateBR, formatDateTimeBR } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { FormAlert } from "@/components/ui/form";
import { Table, Th, Td, EmptyRow } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { HistoricoAuditoria } from "@/components/ui/historico-auditoria";
import { POLO_LABEL } from "@/modules/processos/labels";
import {
  ORIGEM_RECEBIMENTO_LABEL,
  SITUACAO_ACORDO_LABEL,
  SITUACAO_PARCELA_LABEL,
  STATUS_ACORDO_LABEL,
} from "@/modules/acordos/labels";
import { RecebimentoDialog } from "@/modules/acordos/components/recebimento-dialog";
import { EstornoRecebimentoButton } from "@/modules/acordos/components/estorno-recebimento-button";
import { OperacaoDialog, type EmprestimoOpcao } from "@/modules/operacoes/components/operacao-dialog";
import { EncerrarOperacaoButton } from "@/modules/operacoes/components/encerrar-operacao-button";
import { DESTINO_LABEL } from "@/modules/operacoes/labels";
import { SplitBar } from "@/components/ui/progress";
import type {
  AcordoPosicao,
  DestinacaoView,
  EmprestimoPosicao,
  OperacaoView,
  ParcelaPosicao,
  Recebimento,
  RegistroAuditoria,
} from "@/types/db";

export const metadata: Metadata = { title: "Acordo" };

const ABAS = [
  { id: "parcelas", label: "Parcelas" },
  { id: "recebimentos", label: "Recebimentos" },
  { id: "operacao", label: "Operação" },
  { id: "historico", label: "Histórico de alterações" },
] as const;

export default async function AcordoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba = "parcelas" } = await searchParams;
  const supabase = await createClient();
  const perfil = await getPerfil();
  const editavel = podeEditar(perfil);

  const [{ data: pos }, { data: parcs }, { data: recs }, { data: ops }, { data: dest }] = await Promise.all([
    supabase.from("vw_acordo_posicao").select("*").eq("id", id).maybeSingle(),
    supabase.from("vw_acordo_parcelas").select("*").eq("acordo_id", id).order("numero"),
    supabase
      .from("acordo_recebimentos")
      .select("*, acordo_recebimento_imputacoes(id, parcela_id, valor)")
      .eq("acordo_id", id)
      .order("data_recebimento", { ascending: false })
      .order("criado_em", { ascending: false }),
    supabase.from("vw_operacoes").select("*").eq("acordo_id", id).order("criado_em", { ascending: false }),
    supabase.from("vw_operacao_destinacoes").select("*").eq("acordo_id", id).is("estornado_em", null),
  ]);
  if (!pos) notFound();

  const a = pos as AcordoPosicao;
  const parcelas = (parcs ?? []) as ParcelaPosicao[];
  const recebimentos = (recs ?? []) as Recebimento[];
  const numeroParcela = new Map(parcelas.map((p) => [p.id, p.numero]));
  const operacoes = (ops ?? []) as OperacaoView[];
  const operacaoAtiva = operacoes.find((o) => o.ativa) ?? null;
  const destinacoes = (dest ?? []) as DestinacaoView[];
  const destinoPorRecebimento = new Map<string, { emprestimo: number; reserva: number; remanescente: number }>();
  for (const d of destinacoes) {
    const atual = destinoPorRecebimento.get(d.recebimento_id) ?? { emprestimo: 0, reserva: 0, remanescente: 0 };
    atual[d.destino] = money(atual[d.destino]).plus(d.valor).toNumber();
    destinoPorRecebimento.set(d.recebimento_id, atual);
  }

  // Empréstimos disponíveis para vincular (com as contribuições já previstas por outras operações)
  let opcoesEmprestimo: EmprestimoOpcao[] = [];
  if (editavel && !operacaoAtiva && a.status === "ativo") {
    const [{ data: emps }, { data: opsAtivas }] = await Promise.all([
      supabase.from("vw_emprestimo_posicao").select("id, codigo, credor_nome, juros_mensal, status").eq("status", "ativo").order("codigo"),
      supabase.from("vw_operacoes").select("emprestimo_id, contribuicao_juros_prevista").eq("ativa", true),
    ]);
    const contrib = (opsAtivas ?? []) as Pick<OperacaoView, "emprestimo_id" | "contribuicao_juros_prevista">[];
    opcoesEmprestimo = ((emps ?? []) as Pick<EmprestimoPosicao, "id" | "codigo" | "credor_nome" | "juros_mensal">[]).map((e) => ({
      id: e.id,
      codigo: e.codigo,
      credor_nome: e.credor_nome,
      juros_mensal: e.juros_mensal,
      contribuicoes_atuais: contrib.filter((c) => c.emprestimo_id === e.id).map((c) => c.contribuicao_juros_prevista),
    }));
  }
  const proximaParcela = parcelas.find((p) => Number(p.saldo) > 0) ?? parcelas[0] ?? null;

  let auditoria: RegistroAuditoria[] = [];
  if (aba === "historico" && perfil?.papel === "admin") {
    const ids = [id, ...parcelas.map((p) => p.id), ...recebimentos.map((r) => r.id)];
    const { data } = await supabase
      .from("auditoria")
      .select("*")
      .in("registro_id", ids)
      .order("criado_em", { ascending: false })
      .limit(200);
    auditoria = (data ?? []) as RegistroAuditoria[];
  }

  const pagador = a.polo_pagador === "requerido" ? a.requeridos : a.requerentes;
  const recebedor = a.polo_pagador === "requerido" ? a.requerentes : a.requeridos;
  const diferenca = money(a.diferenca_parcelas);

  return (
    <>
      <PageHeader
        back={{ href: `/processos/${a.processo_id}`, label: a.numero_processo ?? a.processo_codigo }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {a.codigo}
            <Badge tone={STATUS_ACORDO_LABEL[a.status].tone}>{STATUS_ACORDO_LABEL[a.status].label}</Badge>
            <Badge tone={SITUACAO_ACORDO_LABEL[a.situacao_financeira].tone}>
              {SITUACAO_ACORDO_LABEL[a.situacao_financeira].label}
            </Badge>
          </span>
        }
        description={`${POLO_LABEL[a.polo_pagador]} paga: ${pagador || "—"} → recebe: ${recebedor || "—"} · carência de ${a.dias_carencia} dia(s)`}
        actions={
          editavel && (
            <>
              <Link href={`/acordos/${id}/editar`} className={buttonClasses("secondary", "sm")}>
                <Pencil className="h-4 w-4" /> Editar
              </Link>
              {!operacaoAtiva && a.status === "ativo" && (
                <OperacaoDialog
                  acordoId={id}
                  acordoCodigo={a.codigo}
                  valorParcelaReferencia={proximaParcela?.valor ?? null}
                  emprestimos={opcoesEmprestimo}
                />
              )}
              <RecebimentoDialog
                acordoId={id}
                parcelas={parcelas.map((p) => ({ id: p.id, numero: p.numero, data_vencimento: p.data_vencimento, saldo: p.saldo }))}
                saldoEmAberto={a.saldo_em_aberto}
              />
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Valor total do acordo" value={formatBRL(a.valor_total)} hint={`${a.qtd_parcelas} parcela(s) · soma ${formatBRL(a.soma_parcelas)}`} />
        <Stat label="Recebido" value={formatBRL(a.total_recebido)} tone="positive" hint={`${a.parcelas_recebidas} parcela(s) quitada(s) · ${a.qtd_recebimentos} recebimento(s)`} />
        <Stat label="Em aberto" value={formatBRL(a.saldo_em_aberto)} />
        <Stat
          label="Atrasado"
          value={formatBRL(a.valor_atrasado)}
          tone={a.em_atraso ? "negative" : "default"}
          hint={`${a.parcelas_atrasadas} parcela(s) após a carência`}
        />
        <Stat
          label="Próximo vencimento"
          value={formatDateBR(a.proximo_vencimento)}
          hint={a.parcelas_em_carencia > 0 ? `${a.parcelas_em_carencia} parcela(s) em carência` : undefined}
          tone={a.parcelas_em_carencia > 0 ? "warning" : "default"}
        />
      </div>

      {operacaoAtiva && (
        <Link
          href={`/acordos/${id}?aba=operacao`}
          className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-violet-50 px-4 py-3 text-sm hover:border-brand-200"
        >
          <span className="font-semibold text-brand-800">{operacaoAtiva.codigo}</span>
          <span className="text-slate-600">
            alimenta o empréstimo <strong>{operacaoAtiva.emprestimo_codigo}</strong> ·{" "}
            {formatDecimalBR(operacaoAtiva.percentual_emprestimo)}% juros · {formatDecimalBR(operacaoAtiva.percentual_reserva)}% reserva
          </span>
          <span className="ml-auto tabular text-slate-500">
            destinado {formatBRL(operacaoAtiva.total_destinado)}
          </span>
        </Link>
      )}

      {!diferenca.isZero() && a.qtd_parcelas > 0 && (
        <div className="mt-4">
          <FormAlert tone="info">
            A soma das parcelas ({formatBRL(a.soma_parcelas)}) difere do valor total do acordo ({formatBRL(a.valor_total)})
            em {formatBRL(diferenca.abs())}. Confira o acordo.
          </FormAlert>
        </div>
      )}

      {(a.condicoes_pagamento || a.observacoes) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {a.condicoes_pagamento && (
            <Card>
              <CardHeader title="Condições de pagamento" />
              <CardBody>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{a.condicoes_pagamento}</p>
              </CardBody>
            </Card>
          )}
          {a.observacoes && (
            <Card>
              <CardHeader title="Observações" />
              <CardBody>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{a.observacoes}</p>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {ABAS.map((x) => (
          <Link
            key={x.id}
            href={`/acordos/${id}?aba=${x.id}`}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium",
              aba === x.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {aba === "parcelas" && (
          <Card>
            <CardHeader
              title="Parcelas — previsto x recebido"
              description={`A parcela fica atrasada após ${a.dias_carencia} dia(s) corrido(s) do vencimento sem recebimento integral.`}
            />
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Vencimento</Th>
                  <Th>Fim da carência</Th>
                  <Th align="right">Valor</Th>
                  <Th align="right">Recebido</Th>
                  <Th align="right">Em aberto</Th>
                  <Th>Último recebimento</Th>
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {parcelas.length === 0 && <EmptyRow colSpan={8}>Sem parcelas.</EmptyRow>}
                {parcelas.map((p) => (
                  <tr key={p.id} className={cn("hover:bg-slate-50", p.atrasada && "bg-red-50/40")}>
                    <Td>{p.numero}</Td>
                    <Td>{formatDateBR(p.data_vencimento)}</Td>
                    <Td className="text-slate-500">{formatDateBR(p.data_limite)}</Td>
                    <Td align="right">{formatBRL(p.valor)}</Td>
                    <Td align="right" className="text-emerald-700">{formatBRL(p.valor_recebido)}</Td>
                    <Td align="right" className={p.atrasada ? "font-medium text-red-700" : ""}>
                      {formatBRL(p.saldo)}
                    </Td>
                    <Td>{formatDateBR(p.ultimo_recebimento)}</Td>
                    <Td>
                      <Badge tone={SITUACAO_PARCELA_LABEL[p.situacao].tone}>{SITUACAO_PARCELA_LABEL[p.situacao].label}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {aba === "recebimentos" && (
          <Card>
            <CardHeader title="Recebimentos" description="Valores pagos entre as partes. Cada recebimento mostra como foi abatido nas parcelas." />
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th align="right">Valor</Th>
                  <Th>Abatimento</Th>
                  <Th>Destinação</Th>
                  <Th>Forma</Th>
                  <Th>Origem</Th>
                  <Th>Observações</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {recebimentos.length === 0 && <EmptyRow colSpan={8}>Nenhum recebimento registrado.</EmptyRow>}
                {recebimentos.map((r) => {
                  const estornado = !!r.estornado_em;
                  const imps = [...(r.acordo_recebimento_imputacoes ?? [])].sort(
                    (x, y) => (numeroParcela.get(x.parcela_id) ?? 999) - (numeroParcela.get(y.parcela_id) ?? 999),
                  );
                  return (
                    <tr key={r.id} className={cn("align-top", estornado && "text-slate-400 line-through decoration-slate-300")}>
                      <Td>{formatDateBR(r.data_recebimento)}</Td>
                      <Td align="right" className="font-medium">{formatBRL(r.valor)}</Td>
                      <Td className="whitespace-normal">
                        <ul className="space-y-0.5 text-xs">
                          {imps.map((i) => (
                            <li key={i.id}>
                              Parcela {numeroParcela.get(i.parcela_id) ?? "?"}: <span className="tabular">{formatBRL(i.valor)}</span>
                            </li>
                          ))}
                        </ul>
                      </Td>
                      <Td className="whitespace-normal">
                        {(() => {
                          const d = destinoPorRecebimento.get(r.id);
                          if (!d) return <span className="text-xs text-slate-400">{estornado ? "—" : "Sem operação"}</span>;
                          return (
                            <ul className="space-y-0.5 text-xs">
                              {(["emprestimo", "reserva", "remanescente"] as const)
                                .filter((k) => d[k] > 0)
                                .map((k) => (
                                  <li key={k}>
                                    {DESTINO_LABEL[k].label}: <span className="tabular">{formatBRL(d[k])}</span>
                                  </li>
                                ))}
                            </ul>
                          );
                        })()}
                      </Td>
                      <Td>{r.forma_pagamento ?? "—"}</Td>
                      <Td className="whitespace-normal text-xs">
                        {ORIGEM_RECEBIMENTO_LABEL[r.origem]}
                        {r.referencia_externa && <span className="block text-slate-500">Ref.: {r.referencia_externa}</span>}
                      </Td>
                      <Td className="max-w-xs whitespace-normal text-xs">
                        {r.observacoes}
                        {estornado && (
                          <span className="block text-red-600 no-underline">
                            Estornado em {formatDateTimeBR(r.estornado_em)}: {r.motivo_estorno}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {editavel && !estornado && (
                          <EstornoRecebimentoButton
                            acordoId={id}
                            recebimentoId={r.id}
                            descricao={`Recebimento de ${formatBRL(r.valor)} em ${formatDateBR(r.data_recebimento)}`}
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

        {aba === "operacao" && (
          <div className="space-y-4">
            {operacoes.length === 0 && (
              <Card>
                <CardBody className="py-10 text-center">
                  <p className="text-sm text-slate-600">Este acordo ainda não alimenta nenhum empréstimo.</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Use “Vincular a empréstimo” para que cada recebimento pague juros e forme a reserva automaticamente.
                  </p>
                </CardBody>
              </Card>
            )}
            {operacoes.map((o) => (
              <Card key={o.id} className={cn(!o.ativa && "opacity-70")}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {o.codigo}
                      <Badge tone={o.ativa ? "blue" : "gray"}>{o.ativa ? "Ativa" : "Encerrada"}</Badge>
                    </span>
                  }
                  description={
                    <>
                      Alimenta o empréstimo{" "}
                      <Link href={`/emprestimos/${o.emprestimo_id}`} className="font-medium text-brand-700 hover:underline">
                        {o.emprestimo_codigo}
                      </Link>{" "}
                      ({o.credor_nome}, juros de {formatBRL(o.emprestimo_juros_mensal)}/mês) · criada em {formatDateBR(o.criado_em.slice(0, 10))}
                      {o.encerrada_em && <> · encerrada em {formatDateTimeBR(o.encerrada_em)}: {o.motivo_encerramento}</>}
                    </>
                  }
                  actions={
                    editavel && o.ativa ? (
                      <EncerrarOperacaoButton operacaoId={o.id} codigo={o.codigo} acordoId={id} emprestimoId={o.emprestimo_id} />
                    ) : undefined
                  }
                />
                <CardBody className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-brand-50 p-3">
                      <p className="text-xs text-slate-500">{formatDecimalBR(o.percentual_emprestimo)}% para juros</p>
                      <p className="tabular mt-1 text-lg font-semibold text-brand-700">{formatBRL(o.total_juros)}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-3">
                      <p className="text-xs text-slate-500">{formatDecimalBR(o.percentual_reserva)}% para reserva</p>
                      <p className="tabular mt-1 text-lg font-semibold text-emerald-700">{formatBRL(o.total_reserva)}</p>
                    </div>
                    <div className="rounded-xl bg-violet-50 p-3">
                      <p className="text-xs text-slate-500">Remanescente</p>
                      <p className="tabular mt-1 text-lg font-semibold text-violet-700">{formatBRL(o.total_remanescente)}</p>
                    </div>
                  </div>
                  <SplitBar
                    partes={[
                      { valor: Number(o.total_juros), tone: "brand" },
                      { valor: Number(o.total_reserva), tone: "green" },
                      { valor: Number(o.total_remanescente), tone: "violet" },
                    ]}
                  />
                  {o.ativa && o.proxima_parcela_valor !== null && (
                    <p className="text-sm text-slate-600">
                      Próxima parcela: {formatBRL(o.proxima_parcela_valor)} em {formatDateBR(o.proxima_parcela_vencimento)} →
                      contribuição prevista de <strong>{formatBRL(o.contribuicao_juros_prevista)}</strong> para os juros.
                    </p>
                  )}
                  {o.observacoes && <p className="whitespace-pre-wrap text-sm text-slate-600">{o.observacoes}</p>}
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {aba === "historico" && <HistoricoAuditoria registros={auditoria} admin={perfil?.papel === "admin"} />}
      </div>
    </>
  );
}

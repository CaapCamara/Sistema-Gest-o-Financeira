import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { formatBRL, money } from "@/lib/money";
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
import type { AcordoPosicao, ParcelaPosicao, Recebimento, RegistroAuditoria } from "@/types/db";

export const metadata: Metadata = { title: "Acordo" };

const ABAS = [
  { id: "parcelas", label: "Parcelas" },
  { id: "recebimentos", label: "Recebimentos" },
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

  const [{ data: pos }, { data: parcs }, { data: recs }] = await Promise.all([
    supabase.from("vw_acordo_posicao").select("*").eq("id", id).maybeSingle(),
    supabase.from("vw_acordo_parcelas").select("*").eq("acordo_id", id).order("numero"),
    supabase
      .from("acordo_recebimentos")
      .select("*, acordo_recebimento_imputacoes(id, parcela_id, valor)")
      .eq("acordo_id", id)
      .order("data_recebimento", { ascending: false })
      .order("criado_em", { ascending: false }),
  ]);
  if (!pos) notFound();

  const a = pos as AcordoPosicao;
  const parcelas = (parcs ?? []) as ParcelaPosicao[];
  const recebimentos = (recs ?? []) as Recebimento[];
  const numeroParcela = new Map(parcelas.map((p) => [p.id, p.numero]));

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
                  <Th>Forma</Th>
                  <Th>Origem</Th>
                  <Th>Observações</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {recebimentos.length === 0 && <EmptyRow colSpan={7}>Nenhum recebimento registrado.</EmptyRow>}
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

        {aba === "historico" && <HistoricoAuditoria registros={auditoria} admin={perfil?.papel === "admin"} />}
      </div>
    </>
  );
}

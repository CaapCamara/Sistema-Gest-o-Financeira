import Link from "next/link";
import { Target } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { formatBRL, money } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { SITUACAO_LABEL } from "@/modules/emprestimos/labels";
import { coberturaPrevista } from "../domain/destinacao";
import type { CoberturaEmprestimo, OperacaoView } from "@/types/db";

/**
 * "Cobertura do mês": quanto a competência de juros atual já recebeu de cada
 * fonte (operações/processos ou pagamentos diretos) e quanto falta.
 */
export function CoberturaCard({
  cobertura,
  operacoes,
  jurosMensal,
}: {
  cobertura: CoberturaEmprestimo | null;
  operacoes: OperacaoView[];
  jurosMensal: number | string;
}) {
  const ativas = operacoes.filter((o) => o.ativa);
  const prevista = coberturaPrevista(
    jurosMensal,
    ativas.map((o) => o.contribuicao_juros_prevista),
  );

  if (!cobertura) {
    return (
      <Card>
        <CardHeader title="Cobertura do mês" description="Nenhuma competência de juros em aberto." />
      </Card>
    );
  }

  const devido = money(cobertura.juros_devido);
  const pago = money(cobertura.juros_pago);
  const pct = devido.isZero() ? 100 : Math.min(100, pago.dividedBy(devido).times(100).toNumber());
  const situacao = SITUACAO_LABEL[cobertura.situacao];

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Target className="h-4 w-4 text-brand-600" /> Cobertura do mês
          </span>
        }
        description={`Competência ${cobertura.numero} · vence em ${formatDateBR(cobertura.data_vencimento)}`}
        actions={<Badge tone={situacao.tone}>{situacao.label}</Badge>}
      />
      <CardBody className="space-y-4">
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="tabular text-2xl font-semibold text-slate-900">
              {formatBRL(pago)} <span className="text-base font-normal text-slate-400">de {formatBRL(devido)}</span>
            </p>
            <p className={money(cobertura.juros_em_aberto).isZero() ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-amber-700"}>
              {money(cobertura.juros_em_aberto).isZero() ? "Coberta" : `Faltam ${formatBRL(cobertura.juros_em_aberto)}`}
            </p>
          </div>
          <ProgressBar value={pct} tone={pct >= 100 ? "green" : cobertura.vencida ? "red" : "brand"} />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Quem pagou esta competência</p>
          {cobertura.fontes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum valor recebido ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {cobertura.fontes.map((f, i) => (
                <li key={f.operacao_id ?? `direto-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-slate-700">
                    {f.operacao_codigo ? (
                      <>
                        <span className="font-medium">{f.processo_codigo}</span>
                        <span className="text-slate-400"> · {f.acordo_codigo} · {f.operacao_codigo}</span>
                      </>
                    ) : (
                      "Pagamento direto"
                    )}
                  </span>
                  <span className="tabular font-medium text-brand-700">{formatBRL(f.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {ativas.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-slate-600">
              Previsto pelas {ativas.length} operação(ões) ativa(s):{" "}
              <strong className="tabular text-slate-900">{formatBRL(prevista.total)}</strong> por mês para juros de{" "}
              {formatBRL(prevista.juros)}
              {prevista.diferenca.isNegative() && (
                <span className="text-amber-700"> · faltam {formatBRL(prevista.diferenca.abs())}/mês</span>
              )}
              {prevista.diferenca.isPositive() && (
                <span className="text-violet-700"> · sobram {formatBRL(prevista.diferenca)}/mês (remanescente)</span>
              )}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {ativas.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/acordos/${o.acordo_id}?aba=operacao`}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-slate-200 hover:ring-brand-300"
                  >
                    {o.processo_codigo} · {formatBRL(o.contribuicao_juros_prevista)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

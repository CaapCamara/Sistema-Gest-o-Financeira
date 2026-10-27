"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { formatBRL, formatDecimalBR, money, parseDecimalBR } from "@/lib/money";
import { addMonthsISO, formatDateBR } from "@/lib/dates";
import { emprestimoSchema, STATUS_EMPRESTIMO, type EmprestimoInput, type EmprestimoOutput } from "../schemas/emprestimo";
import { jurosContratadosReferencia, jurosMensal, percentualParaFracao } from "../domain/juros";
import { salvarEmprestimo } from "../actions/emprestimos";
import { STATUS_LABEL } from "../labels";
import type { Credor, Emprestimo } from "@/types/db";

export function EmprestimoForm({
  credores,
  emprestimo,
  possuiPagamentos = false,
}: {
  credores: Pick<Credor, "id" | "nome">[];
  emprestimo?: Emprestimo;
  possuiPagamentos?: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setError,
    formState: { errors },
  } = useForm<EmprestimoInput, unknown, EmprestimoOutput>({
    resolver: zodResolver(emprestimoSchema),
    defaultValues: {
      credor_id: emprestimo?.credor_id ?? "",
      valor_principal: emprestimo ? formatDecimalBR(emprestimo.valor_principal) : "",
      taxa_percentual: emprestimo ? money(emprestimo.taxa_juros_mensal).times(100).toString().replace(".", ",") : "",
      data_inicio: emprestimo?.data_inicio ?? "",
      data_vencimento_principal: emprestimo?.data_vencimento_principal ?? "",
      prazo_meses: emprestimo?.prazo_meses ?? 12,
      juros_contratados_total: emprestimo ? formatDecimalBR(emprestimo.juros_contratados_total) : "",
      valor_mensal_pagamento_planejado: emprestimo ? formatDecimalBR(emprestimo.valor_mensal_pagamento_planejado) : "0,00",
      valor_mensal_reserva_planejado: emprestimo ? formatDecimalBR(emprestimo.valor_mensal_reserva_planejado) : "0,00",
      status: emprestimo?.status ?? "ativo",
      observacoes: emprestimo?.observacoes ?? "",
    },
  });

  const [principalTxt, taxaTxt, prazo, inicio, vencimento, jurosDigitadoTxt] = watch([
    "valor_principal",
    "taxa_percentual",
    "prazo_meses",
    "data_inicio",
    "data_vencimento_principal",
    "juros_contratados_total",
  ]);

  const previa = useMemo(() => {
    const principal = parseDecimalBR(principalTxt);
    const taxa = parseDecimalBR(taxaTxt);
    const meses = Number(prazo);
    if (!principal || !taxa || !Number.isInteger(meses) || meses < 1) return null;
    const fracao = percentualParaFracao(taxa);
    const mensal = jurosMensal(principal, fracao);
    const referencia = jurosContratadosReferencia(principal, fracao, meses);
    const digitado = parseDecimalBR(jurosDigitadoTxt);
    const divergente = digitado !== null && !money(digitado).equals(referencia);
    const vencimentoSugerido = inicio ? addMonthsISO(inicio, meses) : null;
    return { mensal, referencia, digitado, divergente, vencimentoSugerido };
  }, [principalTxt, taxaTxt, prazo, inicio, jurosDigitadoTxt]);

  const onSubmit = handleSubmit(() => {
    setErro(null);
    startTransition(async () => {
      const res = await salvarEmprestimo(emprestimo?.id ?? null, getValues());
      if (!res.ok) {
        setErro(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) =>
          setError(k as keyof EmprestimoInput, { message: v?.[0] }),
        );
        return;
      }
      router.push(`/emprestimos/${res.data!.id}`);
      router.refresh();
    });
  });

  const bloqueado = possuiPagamentos;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {erro && <FormAlert>{erro}</FormAlert>}
      {bloqueado && (
        <FormAlert tone="info">
          Este empréstimo já possui pagamentos. Os campos que definem o cronograma (principal, taxa, início, prazo e
          valores planejados) ficam bloqueados para preservar o histórico. Para alterá-los, estorne os pagamentos ou
          registre um novo contrato com status &quot;renegociado&quot; no atual.
        </FormAlert>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Contrato</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Credor" htmlFor="credor_id" error={errors.credor_id?.message} required className="lg:col-span-2">
            <Select id="credor_id" {...register("credor_id")} aria-invalid={!!errors.credor_id}>
              <option value="">Selecione...</option>
              {credores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" {...register("status")}>
              {STATUS_EMPRESTIMO.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor principal recebido (R$)" htmlFor="valor_principal" error={errors.valor_principal?.message} required>
            <Input id="valor_principal" inputMode="decimal" placeholder="0,00" disabled={bloqueado} {...register("valor_principal")} />
          </Field>
          <Field label="Taxa de juros mensal (%)" htmlFor="taxa_percentual" error={errors.taxa_percentual?.message} required>
            <Input id="taxa_percentual" inputMode="decimal" placeholder="10" disabled={bloqueado} {...register("taxa_percentual")} />
          </Field>
          <Field label="Prazo (meses)" htmlFor="prazo_meses" error={errors.prazo_meses?.message} required>
            <Input id="prazo_meses" type="number" min={1} max={600} disabled={bloqueado} {...register("prazo_meses")} />
          </Field>
          <Field label="Data de início" htmlFor="data_inicio" error={errors.data_inicio?.message} required>
            <Input id="data_inicio" type="date" disabled={bloqueado} {...register("data_inicio")} />
          </Field>
          <Field
            label="Vencimento do principal"
            htmlFor="data_vencimento_principal"
            error={errors.data_vencimento_principal?.message}
            required
            hint={
              previa?.vencimentoSugerido && vencimento && vencimento !== previa.vencimentoSugerido
                ? `Pelo prazo, seria ${formatDateBR(previa.vencimentoSugerido)}. Confira o contrato.`
                : undefined
            }
          >
            <Input id="data_vencimento_principal" type="date" {...register("data_vencimento_principal")} />
          </Field>
          <Field
            label="Juros contratados — total (R$)"
            htmlFor="juros_contratados_total"
            error={errors.juros_contratados_total?.message}
            required
            hint="Digite o valor que consta no contrato."
          >
            <Input id="juros_contratados_total" inputMode="decimal" placeholder="0,00" {...register("juros_contratados_total")} />
          </Field>
        </div>
      </section>

      {previa && (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-slate-500">Juros fixos por mês</p>
            <p className="tabular text-lg font-semibold">{formatBRL(previa.mensal)}</p>
            <p className="text-xs text-slate-500">principal × taxa, sem capitalização</p>
          </div>
          <div>
            <p className="text-slate-500">Referência calculada (mensal × prazo)</p>
            <p className="tabular text-lg font-semibold">{formatBRL(previa.referencia)}</p>
          </div>
          <div>
            <p className="text-slate-500">Juros digitados (contrato)</p>
            <p className="tabular text-lg font-semibold">{previa.digitado ? formatBRL(previa.digitado) : "—"}</p>
            {previa.divergente && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Diferente da referência calculada. Confira o contrato.
              </p>
            )}
          </div>
        </div>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Planejamento mensal</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Pagamento mensal planejado (R$)"
            htmlFor="valor_mensal_pagamento_planejado"
            error={errors.valor_mensal_pagamento_planejado?.message}
            hint="Quanto se pretende pagar ao credor por mês."
          >
            <Input id="valor_mensal_pagamento_planejado" inputMode="decimal" disabled={bloqueado} {...register("valor_mensal_pagamento_planejado")} />
          </Field>
          <Field
            label="Reserva mensal planejada (R$)"
            htmlFor="valor_mensal_reserva_planejado"
            error={errors.valor_mensal_reserva_planejado?.message}
            hint="Quanto se pretende guardar por mês. Reserva não é pagamento."
          >
            <Input id="valor_mensal_reserva_planejado" inputMode="decimal" disabled={bloqueado} {...register("valor_mensal_reserva_planejado")} />
          </Field>
        </div>
      </section>

      <Field label="Observações" htmlFor="observacoes">
        <Textarea id="observacoes" {...register("observacoes")} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar empréstimo"}
        </Button>
      </div>
    </form>
  );
}

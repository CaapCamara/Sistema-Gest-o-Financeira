"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { Table, Th, Td } from "@/components/ui/table";
import { formatBRL, formatDecimalBR, parseDecimalBR } from "@/lib/money";
import { formatDateBR, isISODate } from "@/lib/dates";
import { acordoSchema, STATUS_ACORDO, type AcordoInput, type AcordoOutput } from "../schemas/acordo";
import { CARENCIA_PADRAO, diferencaParcelas, gerarParcelasIguais } from "../domain/parcelas";
import { salvarAcordo } from "../actions/acordos";
import { STATUS_ACORDO_LABEL } from "../labels";
import type { Acordo, ParcelaPosicao, Processo } from "@/types/db";

type ProcessoOpcao = Pick<Processo, "id" | "codigo" | "numero_processo">;

function rotuloProcesso(p?: ProcessoOpcao) {
  if (!p) return "";
  return p.numero_processo ? `${p.codigo} · ${p.numero_processo}` : p.codigo;
}

export function AcordoForm({
  processos,
  processoIdInicial,
  acordo,
  parcelas = [],
  possuiRecebimentos = false,
}: {
  processos: ProcessoOpcao[];
  processoIdInicial?: string;
  acordo?: Acordo;
  parcelas?: Pick<ParcelaPosicao, "valor" | "data_vencimento">[];
  possuiRecebimentos?: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<AcordoInput, unknown, AcordoOutput>({
    resolver: zodResolver(acordoSchema),
    defaultValues: {
      processo_id: acordo?.processo_id ?? processoIdInicial ?? "",
      polo_pagador: acordo?.polo_pagador ?? ("" as AcordoInput["polo_pagador"]),
      valor_total: acordo ? formatDecimalBR(acordo.valor_total) : "",
      dias_carencia: acordo?.dias_carencia ?? CARENCIA_PADRAO,
      condicoes_pagamento: acordo?.condicoes_pagamento ?? "",
      status: acordo?.status ?? "ativo",
      observacoes: acordo?.observacoes ?? "",
      modo_parcelas: acordo?.modo_parcelas ?? "automatico",
      quantidade_parcelas: parcelas.length || 1,
      primeiro_vencimento: parcelas[0]?.data_vencimento ?? "",
      parcelas: parcelas.map((p) => ({ valor: formatDecimalBR(p.valor), data_vencimento: p.data_vencimento })),
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "parcelas" });

  const [modo, totalTxt, qtd, primeiro, manuais] = watch([
    "modo_parcelas",
    "valor_total",
    "quantidade_parcelas",
    "primeiro_vencimento",
    "parcelas",
  ]);

  const previa = useMemo(() => {
    const total = parseDecimalBR(totalTxt);
    if (modo === "automatico") {
      const n = Number(qtd);
      if (!total || Number(total) <= 0 || !Number.isInteger(n) || n < 1 || n > 600 || !primeiro || !isISODate(primeiro))
        return null;
      const lista = gerarParcelasIguais(total, n, primeiro);
      return { lista, diferenca: diferencaParcelas(total, lista.map((p) => p.valor)) };
    }
    const valores = (manuais ?? []).map((p) => parseDecimalBR(p.valor) ?? "0");
    return { lista: null, diferenca: total ? diferencaParcelas(total, valores) : null };
  }, [modo, totalTxt, qtd, primeiro, manuais]);

  function preencherIguais() {
    const total = parseDecimalBR(totalTxt);
    const n = Number(qtd);
    if (!total || !Number.isInteger(n) || n < 1 || !primeiro || !isISODate(primeiro)) {
      setErro("Para preencher, informe o valor total, a quantidade e o primeiro vencimento.");
      return;
    }
    setErro(null);
    replace(
      gerarParcelasIguais(total, n, primeiro).map((p) => ({
        valor: formatDecimalBR(p.valor),
        data_vencimento: p.dataVencimento,
      })),
    );
  }

  const bloqueado = possuiRecebimentos;

  const onSubmit = handleSubmit(() => {
    setErro(null);
    const parcelasAlteradas =
      !acordo ||
      !!dirtyFields.modo_parcelas ||
      !!dirtyFields.quantidade_parcelas ||
      !!dirtyFields.primeiro_vencimento ||
      !!dirtyFields.parcelas ||
      (modo === "automatico" && !!dirtyFields.valor_total);
    startTransition(async () => {
      const res = await salvarAcordo(acordo?.id ?? null, getValues(), !bloqueado && parcelasAlteradas);
      if (!res.ok) {
        setErro(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) =>
          setError(k as keyof AcordoInput, { message: v?.[0] }),
        );
        return;
      }
      router.push(`/acordos/${res.data!.id}`);
      router.refresh();
    });
  });

  const diferencaNaoZero = previa?.diferenca && !previa.diferenca.isZero();

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {erro && <FormAlert>{erro}</FormAlert>}
      <FormAlert tone="info">
        O acordo é entre as partes do processo. O sistema apenas acompanha as parcelas: os valores não entram no caixa nem
        nos empréstimos.
      </FormAlert>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Acordo</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Processo" htmlFor="processo_id" error={errors.processo_id?.message} required className="lg:col-span-2">
            {acordo ? (
              <>
                <input type="hidden" {...register("processo_id")} />
                <Input id="processo_id" readOnly value={rotuloProcesso(processos.find((p) => p.id === acordo.processo_id))} />
              </>
            ) : (
              <Select id="processo_id" {...register("processo_id")} aria-invalid={!!errors.processo_id}>
                <option value="">Selecione...</option>
                {processos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {rotuloProcesso(p)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" {...register("status")}>
              {STATUS_ACORDO.map((s) => (
                <option key={s} value={s}>
                  {STATUS_ACORDO_LABEL[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quem paga" htmlFor="polo_pagador" error={errors.polo_pagador?.message} required>
            <Select id="polo_pagador" {...register("polo_pagador")} aria-invalid={!!errors.polo_pagador}>
              <option value="">Selecione...</option>
              <option value="requerido">Requerido paga ao requerente</option>
              <option value="requerente">Requerente paga ao requerido</option>
            </Select>
          </Field>
          <Field label="Valor total do acordo (R$)" htmlFor="valor_total" error={errors.valor_total?.message} required>
            <Input id="valor_total" inputMode="decimal" placeholder="0,00" {...register("valor_total")} />
          </Field>
          <Field
            label="Carência (dias corridos)"
            htmlFor="dias_carencia"
            error={errors.dias_carencia?.message}
            hint="Dias após o vencimento antes de a parcela contar como atrasada."
          >
            <Input id="dias_carencia" type="number" min={0} max={365} {...register("dias_carencia")} />
          </Field>
          <Field label="Condições de pagamento" htmlFor="condicoes_pagamento" className="sm:col-span-2 lg:col-span-3">
            <Textarea id="condicoes_pagamento" rows={2} placeholder="Forma, conta de destino, multa prevista no acordo..." {...register("condicoes_pagamento")} />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Parcelas</h3>
        {bloqueado && (
          <div className="mb-3">
            <FormAlert tone="info">
              Este acordo já possui recebimentos. As parcelas ficam bloqueadas para preservar o histórico. Para
              alterá-las, estorne os recebimentos ou registre um novo acordo com status &quot;renegociado&quot; no atual.
            </FormAlert>
          </div>
        )}
        <fieldset disabled={bloqueado} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Como gerar" htmlFor="modo_parcelas">
              <Select id="modo_parcelas" {...register("modo_parcelas")}>
                <option value="automatico">Iguais (centavos na última)</option>
                <option value="manual">Digitar uma a uma</option>
              </Select>
            </Field>
            <Field label="Quantidade" htmlFor="quantidade_parcelas" error={errors.quantidade_parcelas?.message}>
              <Input id="quantidade_parcelas" type="number" min={1} max={600} {...register("quantidade_parcelas")} />
            </Field>
            <Field label="Primeiro vencimento" htmlFor="primeiro_vencimento" error={errors.primeiro_vencimento?.message}>
              <Input id="primeiro_vencimento" type="date" {...register("primeiro_vencimento")} />
            </Field>
          </div>

          {modo === "manual" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={preencherIguais}>
                  <Wand2 className="h-4 w-4" /> Preencher com parcelas iguais
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => append({ valor: "", data_vencimento: "" })}
                >
                  <Plus className="h-4 w-4" /> Adicionar parcela
                </Button>
              </div>
              {errors.parcelas?.message && <p className="text-xs text-red-600">{errors.parcelas.message}</p>}
              {fields.length > 0 && (
                <div className="space-y-2">
                  {fields.map((f, i) => {
                    const e = errors.parcelas?.[i];
                    return (
                      <div key={f.id} className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] items-start gap-2">
                        <span className="pt-2.5 text-right text-sm text-slate-500">{i + 1}.</span>
                        <div>
                          <Input
                            aria-label={`Valor da parcela ${i + 1}`}
                            inputMode="decimal"
                            placeholder="0,00"
                            aria-invalid={!!e?.valor}
                            {...register(`parcelas.${i}.valor`)}
                          />
                          {e?.valor?.message && <p className="mt-1 text-xs text-red-600">{e.valor.message}</p>}
                        </div>
                        <div>
                          <Input
                            aria-label={`Vencimento da parcela ${i + 1}`}
                            type="date"
                            aria-invalid={!!e?.data_vencimento}
                            {...register(`parcelas.${i}.data_vencimento`)}
                          />
                          {e?.data_vencimento?.message && <p className="mt-1 text-xs text-red-600">{e.data_vencimento.message}</p>}
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => remove(i)} aria-label="Remover parcela">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-slate-500">A numeração final segue a data de vencimento.</p>
            </div>
          )}
        </fieldset>

        {modo === "automatico" && previa?.lista && (
          <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Vencimento</Th>
                  <Th align="right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {previa.lista.map((p) => (
                  <tr key={p.numero}>
                    <Td>{p.numero}</Td>
                    <Td>{formatDateBR(p.dataVencimento)}</Td>
                    <Td align="right">{formatBRL(p.valor)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {diferencaNaoZero && (
          <p className="mt-3 flex items-center gap-1 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            A soma das parcelas difere do valor total em {formatBRL(previa!.diferenca!.abs())}
            {previa!.diferenca!.greaterThan(0) ? " (faltam)" : " (sobram)"}. Você pode salvar assim; confira o acordo.
          </p>
        )}
      </section>

      <Field label="Observações" htmlFor="observacoes">
        <Textarea id="observacoes" {...register("observacoes")} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar acordo"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { formatBRL, parseDecimalBR } from "@/lib/money";
import { formatDateBR, hojeISO } from "@/lib/dates";
import { recebimentoSchema, type RecebimentoInput, type RecebimentoOutput } from "../schemas/acordo";
import { distribuirRecebimento } from "../domain/parcelas";
import { registrarRecebimento } from "../actions/acordos";
import { previaRecebimento } from "@/modules/operacoes/domain/destinacao";
import type { ParcelaPosicao } from "@/types/db";

export function RecebimentoDialog({
  acordoId,
  parcelas,
  saldoEmAberto,
  operacao,
}: {
  acordoId: string;
  parcelas: Pick<ParcelaPosicao, "id" | "numero" | "data_vencimento" | "saldo" | "valor">[];
  saldoEmAberto: number | string;
  operacao?: { emprestimoCodigo: string; percentualEmprestimo: number | string; percentualReserva: number | string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    watch,
    getValues,
    reset,
    setError,
    formState: { errors },
  } = useForm<RecebimentoInput, unknown, RecebimentoOutput>({
    resolver: zodResolver(recebimentoSchema),
    defaultValues: { data_recebimento: hojeISO(), valor: "", parcela_id: "" },
  });
  const [valorTxt, parcelaId] = watch(["valor", "parcela_id"]);

  const abertas = useMemo(() => parcelas.filter((p) => Number(p.saldo) > 0), [parcelas]);
  const distribuicao = useMemo(() => {
    const valor = parseDecimalBR(valorTxt);
    if (!valor || Number(valor) <= 0) return undefined;
    return distribuirRecebimento(
      abertas.map((p) => ({ id: p.id, numero: p.numero, dataVencimento: p.data_vencimento, saldo: p.saldo })),
      valor,
      parcelaId || null,
    );
  }, [abertas, valorTxt, parcelaId]);

  const previa = useMemo(() => {
    if (!operacao || !distribuicao) return null;
    return previaRecebimento(
      parcelas.map((p) => ({ id: p.id, valor: p.valor, saldo: p.saldo })),
      distribuicao.map((i) => ({ parcelaId: i.parcelaId, valor: i.valor })),
      operacao.percentualEmprestimo,
      operacao.percentualReserva,
    );
  }, [operacao, distribuicao, parcelas]);

  const onSubmit = handleSubmit(() => {
    setErro(null);
    startTransition(async () => {
      const res = await registrarRecebimento(acordoId, getValues());
      if (!res.ok) {
        setErro(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) =>
          setError(k as keyof RecebimentoInput, { message: v?.[0] }),
        );
        return;
      }
      reset({ data_recebimento: hojeISO(), valor: "", parcela_id: "" });
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={abertas.length === 0}>
        <Plus className="h-4 w-4" /> Registrar recebimento
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Registrar recebimento de parcela">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {erro && <FormAlert>{erro}</FormAlert>}
          <FormAlert tone="info">
            Saldo em aberto do acordo: <strong>{formatBRL(saldoEmAberto)}</strong>. Recebimento parcial é permitido; o
            excedente de uma parcela abate as seguintes.
          </FormAlert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data do recebimento" htmlFor="data_recebimento" error={errors.data_recebimento?.message} required>
              <Input id="data_recebimento" type="date" {...register("data_recebimento")} />
            </Field>
            <Field label="Valor recebido (R$)" htmlFor="valor_recebimento" error={errors.valor?.message} required>
              <Input id="valor_recebimento" inputMode="decimal" placeholder="0,00" {...register("valor")} />
            </Field>
          </div>
          <Field label="Parcela" htmlFor="parcela_id" error={errors.parcela_id?.message}>
            <Select id="parcela_id" {...register("parcela_id")}>
              <option value="">Automático: da mais antiga em aberto</option>
              {abertas.map((p) => (
                <option key={p.id} value={p.id}>
                  Parcela {p.numero} · vence {formatDateBR(p.data_vencimento)} · em aberto {formatBRL(p.saldo)}
                </option>
              ))}
            </Select>
          </Field>
          {distribuicao === null && (
            <p className="text-sm text-red-600">O valor excede o saldo em aberto do acordo.</p>
          )}
          {distribuicao && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="mb-1 font-medium text-slate-700">Como será abatido</p>
              <ul className="space-y-0.5 text-slate-600">
                {distribuicao.map((i) => (
                  <li key={i.parcelaId}>
                    Parcela {i.numero}: <span className="tabular">{formatBRL(i.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {previa && operacao && (
            <div className="rounded-2xl border border-brand-300 bg-brand-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-950">Para onde vai este dinheiro ({operacao.emprestimoCodigo})</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-juros-100 p-3 ring-1 ring-juros-300">
                  <p className="text-xs text-slate-600">Paga juros</p>
                  <p className="tabular mt-1 font-bold text-juros-700">{formatBRL(previa.juros)}</p>
                </div>
                <div className="rounded-xl bg-emerald-100 p-3 ring-1 ring-emerald-300">
                  <p className="text-xs text-slate-600">Guarda na reserva</p>
                  <p className="tabular mt-1 font-bold text-emerald-700">{formatBRL(previa.reserva)}</p>
                </div>
                <div className="rounded-xl bg-rem-100 p-3 ring-1 ring-rem-300">
                  <p className="text-xs text-slate-600">Sobra</p>
                  <p className="tabular mt-1 font-bold text-rem-700">{formatBRL(previa.livre)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Se os juros do empréstimo já estiverem pagos, a parte dos juros vai para a sobra.</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Forma de pagamento" htmlFor="forma_pagamento_rec">
              <Input id="forma_pagamento_rec" placeholder="PIX, depósito, boleto..." {...register("forma_pagamento")} />
            </Field>
            <Field label="Referência / comprovante" htmlFor="referencia_externa" hint="Ex.: ID da transação no extrato.">
              <Input id="referencia_externa" {...register("referencia_externa")} />
            </Field>
          </div>
          <Field label="Observações" htmlFor="observacoes_rec">
            <Textarea id="observacoes_rec" rows={2} {...register("observacoes")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Registrando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

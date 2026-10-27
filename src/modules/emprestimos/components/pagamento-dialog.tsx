"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { formatBRL } from "@/lib/money";
import { hojeISO } from "@/lib/dates";
import { pagamentoSchema, type PagamentoInput, type PagamentoOutput } from "../schemas/emprestimo";
import { registrarPagamento } from "../actions/emprestimos";

export function PagamentoDialog({
  emprestimoId,
  jurosVencidos,
  principalDevido,
  saldoReserva,
}: {
  emprestimoId: string;
  jurosVencidos: number | string;
  principalDevido: number | string;
  saldoReserva: number | string;
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
  } = useForm<PagamentoInput, unknown, PagamentoOutput>({
    resolver: zodResolver(pagamentoSchema),
    defaultValues: { data_pagamento: hojeISO(), valor_total: "", modo: "automatico", origem_reserva: false },
  });
  const modo = watch("modo");

  const onSubmit = handleSubmit(() => {
    setErro(null);
    startTransition(async () => {
      const res = await registrarPagamento(emprestimoId, getValues());
      if (!res.ok) {
        setErro(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) =>
          setError(k as keyof PagamentoInput, { message: v?.[0] }),
        );
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Registrar pagamento
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Registrar pagamento ao credor">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {erro && <FormAlert>{erro}</FormAlert>}
          <FormAlert tone="info">
            Juros vencidos em aberto: <strong>{formatBRL(jurosVencidos)}</strong> · Principal devido:{" "}
            <strong>{formatBRL(principalDevido)}</strong>
          </FormAlert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data do pagamento" htmlFor="data_pagamento" error={errors.data_pagamento?.message} required>
              <Input id="data_pagamento" type="date" {...register("data_pagamento")} />
            </Field>
            <Field label="Valor pago (R$)" htmlFor="valor_total" error={errors.valor_total?.message} required>
              <Input id="valor_total" inputMode="decimal" placeholder="0,00" {...register("valor_total")} />
            </Field>
          </div>
          <Field
            label="Como abater"
            htmlFor="modo"
            hint={
              modo === "automatico"
                ? "Abate primeiro os juros vencidos (do mais antigo ao mais recente) e depois o principal."
                : "Informe quanto vai para juros e quanto vai para principal. Os juros são abatidos do mais antigo em aberto."
            }
          >
            <Select id="modo" {...register("modo")}>
              <option value="automatico">Automático: juros vencidos e depois principal</option>
              <option value="manual">Manual: informar a divisão</option>
            </Select>
          </Field>
          {modo === "manual" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Para juros (R$)" htmlFor="valor_juros" error={errors.valor_juros?.message}>
                <Input id="valor_juros" inputMode="decimal" {...register("valor_juros")} />
              </Field>
              <Field label="Para principal (R$)" htmlFor="valor_principal" error={errors.valor_principal?.message}>
                <Input id="valor_principal" inputMode="decimal" {...register("valor_principal")} />
              </Field>
            </div>
          )}
          <Field label="Forma de pagamento" htmlFor="forma_pagamento">
            <Input id="forma_pagamento" placeholder="PIX, transferência, dinheiro..." {...register("forma_pagamento")} />
          </Field>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" {...register("origem_reserva")} />
            <span>
              Pago com recursos da reserva (saldo atual {formatBRL(saldoReserva)}). Será lançada a saída correspondente
              na reserva.
            </span>
          </label>
          <Field label="Observações" htmlFor="observacoes_pg">
            <Textarea id="observacoes_pg" rows={2} {...register("observacoes")} />
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

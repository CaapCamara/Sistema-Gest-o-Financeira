"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { formatBRL } from "@/lib/money";
import { hojeISO } from "@/lib/dates";
import { reservaSchema, type ReservaInput, type ReservaOutput } from "../schemas/emprestimo";
import { registrarMovimentoReserva } from "../actions/emprestimos";

export function ReservaDialog({ emprestimoId, saldoReserva }: { emprestimoId: string; saldoReserva: number | string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = useForm<ReservaInput, unknown, ReservaOutput>({
    resolver: zodResolver(reservaSchema),
    defaultValues: { tipo: "aporte", data_movimento: hojeISO(), valor: "" },
  });

  const onSubmit = handleSubmit(() => {
    setErro(null);
    startTransition(async () => {
      const res = await registrarMovimentoReserva(emprestimoId, getValues());
      if (!res.ok) return setErro(res.error);
      reset();
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PiggyBank className="h-4 w-4" /> Movimentar reserva
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Movimentar reserva">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {erro && <FormAlert>{erro}</FormAlert>}
          <FormAlert tone="info">
            Saldo atual da reserva: <strong>{formatBRL(saldoReserva)}</strong>. Aportes na reserva <strong>não</strong>{" "}
            reduzem a dívida. Para usar a reserva no pagamento, registre um pagamento marcando &quot;pago com recursos da
            reserva&quot;.
          </FormAlert>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tipo" htmlFor="tipo">
              <Select id="tipo" {...register("tipo")}>
                <option value="aporte">Aporte</option>
                <option value="resgate">Resgate</option>
              </Select>
            </Field>
            <Field label="Data" htmlFor="data_movimento" error={errors.data_movimento?.message}>
              <Input id="data_movimento" type="date" {...register("data_movimento")} />
            </Field>
            <Field label="Valor (R$)" htmlFor="valor_reserva" error={errors.valor?.message}>
              <Input id="valor_reserva" inputMode="decimal" placeholder="0,00" {...register("valor")} />
            </Field>
          </div>
          <Field label="Conta / onde está guardado" htmlFor="conta">
            <Input id="conta" {...register("conta")} />
          </Field>
          <Field label="Observações" htmlFor="observacoes_res">
            <Textarea id="observacoes_res" rows={2} {...register("observacoes")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

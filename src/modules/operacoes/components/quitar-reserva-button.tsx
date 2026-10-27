"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { formatBRL, money } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { quitarPrincipalComReserva } from "../actions/operacoes";

export function QuitarReservaButton({
  emprestimoId,
  principalDevido,
  reservaSaldo,
  dataSugerida,
}: {
  emprestimoId: string;
  principalDevido: number | string;
  reservaSaldo: number | string;
  dataSugerida: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(dataSugerida);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sobra = money(reservaSaldo).minus(principalDevido);

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const res = await quitarPrincipalComReserva(emprestimoId, data);
      if (!res.ok) return setErro(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="success" onClick={() => setOpen(true)}>
        <BadgeCheck className="h-4 w-4" /> Quitar principal com a reserva
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Quitar principal com a reserva">
        <div className="space-y-4">
          {erro && <FormAlert>{erro}</FormAlert>}
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Principal em aberto</dt>
              <dd className="tabular font-semibold">{formatBRL(principalDevido)}</dd>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <dt className="text-xs text-slate-500">Reserva</dt>
              <dd className="tabular font-semibold text-emerald-700">{formatBRL(reservaSaldo)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Fica na reserva</dt>
              <dd className="tabular font-semibold">{formatBRL(sobra)}</dd>
            </div>
          </dl>
          <p className="text-sm text-slate-600">
            Será registrado um pagamento de {formatBRL(principalDevido)} ao credor, com saída da reserva. Os juros das
            competências com vencimento depois da data de quitação deixam de ser devidos.
          </p>
          <Field
            label="Data da quitação"
            htmlFor="data_quitacao"
            hint={`Não pode ser anterior a ${formatDateBR(dataSugerida)}, para não anular juros já pagos.`}
            required
          >
            <Input id="data_quitacao" type="date" min={dataSugerida} value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="success" onClick={confirmar} disabled={pending || !data}>
              {pending ? "Quitando..." : "Confirmar quitação"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

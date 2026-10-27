"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { estornarMovimentoReserva, estornarPagamento } from "../actions/emprestimos";

export function EstornoButton({
  emprestimoId,
  alvoId,
  tipo,
  descricao,
}: {
  emprestimoId: string;
  alvoId: string;
  tipo: "pagamento" | "reserva";
  descricao: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const res =
        tipo === "pagamento"
          ? await estornarPagamento(emprestimoId, alvoId, motivo)
          : await estornarMovimentoReserva(emprestimoId, alvoId, motivo);
      if (!res.ok) return setErro(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-slate-400 hover:text-red-600" title="Estornar" aria-label="Estornar">
        <Undo2 className="h-4 w-4" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Estornar lançamento">
        <div className="space-y-4">
          {erro && <FormAlert>{erro}</FormAlert>}
          <p className="text-sm text-slate-600">
            {descricao}. O lançamento continua no histórico, marcado como estornado, e deixa de contar nos saldos.
          </p>
          <Field label="Motivo do estorno" htmlFor={`motivo-${alvoId}`} required>
            <Textarea id={`motivo-${alvoId}`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmar} disabled={pending || motivo.trim().length < 3}>
              {pending ? "Estornando..." : "Confirmar estorno"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

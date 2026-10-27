"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { estornarRecebimento } from "../actions/acordos";

export function EstornoRecebimentoButton({
  acordoId,
  recebimentoId,
  descricao,
}: {
  acordoId: string;
  recebimentoId: string;
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
      const res = await estornarRecebimento(acordoId, recebimentoId, motivo);
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
      <Dialog open={open} onClose={() => setOpen(false)} title="Estornar recebimento">
        <div className="space-y-4">
          {erro && <FormAlert>{erro}</FormAlert>}
          <p className="text-sm text-slate-600">
            {descricao}. O recebimento continua no histórico, marcado como estornado, e as parcelas voltam a ficar em
            aberto.
          </p>
          <Field label="Motivo do estorno" htmlFor={`motivo-${recebimentoId}`} required>
            <Textarea id={`motivo-${recebimentoId}`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
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

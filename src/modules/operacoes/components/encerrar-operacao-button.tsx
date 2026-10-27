"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleStop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { encerrarOperacao } from "../actions/operacoes";

export function EncerrarOperacaoButton({
  operacaoId,
  codigo,
  acordoId,
  emprestimoId,
}: {
  operacaoId: string;
  codigo: string;
  acordoId: string;
  emprestimoId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const res = await encerrarOperacao(operacaoId, { acordoId, emprestimoId }, motivo);
      if (!res.ok) return setErro(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <CircleStop className="h-4 w-4" /> Encerrar
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Encerrar operação ${codigo}`}>
        <div className="space-y-4">
          {erro && <FormAlert>{erro}</FormAlert>}
          <p className="text-sm text-slate-600">
            Os próximos recebimentos do acordo deixam de ser destinados ao empréstimo. Tudo o que já foi destinado continua
            registrado.
          </p>
          <Field label="Motivo do encerramento" htmlFor={`motivo-op-${operacaoId}`} required>
            <Textarea id={`motivo-op-${operacaoId}`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmar} disabled={pending || motivo.trim().length < 3}>
              {pending ? "Encerrando..." : "Encerrar operação"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

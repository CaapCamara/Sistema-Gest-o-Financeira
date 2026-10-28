"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import type { ActionResult } from "@/types/db";

/**
 * Botão "Excluir" com confirmação. A exclusão é lógica e auditada; quando o
 * registro não pode sair (já movimentou dinheiro, tem dependentes), a mensagem
 * do servidor diz o que fazer antes.
 */
export function ExcluirButton({
  acao,
  nome,
  explicacao = "Ele sai das listas e das contas do sistema. O registro fica guardado no histórico de auditoria.",
  redirecionarPara,
  pedirMotivo = false,
  size = "md",
}: {
  acao: (motivo: string) => Promise<ActionResult<unknown>>;
  /** Como o registro aparece na pergunta: "o empréstimo EMP-2026-0001". */
  nome: string;
  explicacao?: string;
  redirecionarPara?: string;
  pedirMotivo?: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function fechar() {
    setOpen(false);
    setErro(null);
  }

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const res = await acao(motivo);
      if (!res.ok) return setErro(res.error);
      setOpen(false);
      if (redirecionarPara) router.push(redirecionarPara);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size={size}
        variant="ghost"
        className="text-red-700 hover:bg-red-50 hover:text-red-700"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" /> Excluir
      </Button>
      <Dialog open={open} onClose={fechar} title={`Excluir ${nome}?`}>
        <div className="space-y-4">
          {erro && <FormAlert>{erro}</FormAlert>}
          <p className="text-sm text-slate-600">{explicacao}</p>
          {pedirMotivo && (
            <Field label="Por que excluir?" htmlFor="motivo-exclusao" required>
              <Textarea id="motivo-exclusao" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmar}
              disabled={pending || (pedirMotivo && motivo.trim().length < 3)}
            >
              <Trash2 className="h-4 w-4" /> {pending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

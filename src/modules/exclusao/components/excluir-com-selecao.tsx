"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/form";
import { excluirComSelecao } from "../actions/exclusao";
import type { OpcaoExclusao, TipoExclusao } from "../types";

/**
 * Excluir de cima para baixo. A confirmação mostra o que será desfeito junto
 * (obrigatório) e deixa marcar outros caminhos ligados pelo dinheiro para
 * excluir também (opcional).
 */
export function ExcluirComSelecao({
  tipo,
  id,
  nome,
  previa,
  opcoes,
  redirecionarPara,
  size = "sm",
}: {
  tipo: TipoExclusao;
  id: string;
  /** Como aparece na pergunta: "o credor Fulano". */
  nome: string;
  previa: string[];
  opcoes: OpcaoExclusao[];
  redirecionarPara: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const exigeMotivo = previa.length > 0 || marcados.size > 0;

  function alternar(chave: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  function fechar() {
    setOpen(false);
    setErro(null);
  }

  function confirmar() {
    setErro(null);
    const extras = opcoes.filter((o) => marcados.has(`${o.tipo}:${o.id}`)).map((o) => ({ tipo: o.tipo, id: o.id }));
    startTransition(async () => {
      const res = await excluirComSelecao(tipo, id, motivo, extras);
      if (!res.ok) return setErro(res.error);
      setOpen(false);
      router.push(redirecionarPara);
      router.refresh();
    });
  }

  return (
    <>
      <Button size={size} variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-700" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Excluir
      </Button>
      <Dialog open={open} onClose={fechar} title={`Excluir ${nome}?`}>
        <div className="space-y-5">
          {erro && <FormAlert>{erro}</FormAlert>}

          {previa.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-slate-800">Junto, o sistema vai:</p>
              <ul className="mt-2 space-y-1.5">
                {previa.map((linha) => (
                  <li key={linha} className="flex gap-2 text-sm text-slate-600">
                    <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                    {linha}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Não há nada ligado a este registro. Ele sai das listas do sistema.</p>
          )}

          {opcoes.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-800">Quer excluir também?</p>
              <p className="text-xs text-slate-500">Estão ligados pelo dinheiro. Marque só o que deve sair junto.</p>
              <ul className="mt-2 space-y-2">
                {opcoes.map((o) => {
                  const chave = `${o.tipo}:${o.id}`;
                  const marcado = marcados.has(chave);
                  return (
                    <li key={chave}>
                      <label
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ring-inset transition-colors",
                          marcado ? "bg-red-50 ring-red-300" : "bg-slate-50 ring-slate-200 hover:ring-slate-300",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternar(chave)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-900">{o.rotulo}</span>
                          {o.detalhe && <span className="block text-xs text-slate-500">{o.detalhe}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {exigeMotivo && (
            <Field label="Por que excluir?" htmlFor={`motivo-${tipo}-${id}`} required>
              <Textarea id={`motivo-${tipo}-${id}`} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
          )}

          <p className="text-xs text-slate-500">Nada é apagado de verdade: o que movimentou dinheiro é estornado e tudo fica na auditoria.</p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={fechar}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmar} disabled={pending || (exigeMotivo && motivo.trim().length < 3)}>
              <Trash2 className="h-4 w-4" /> {pending ? "Excluindo..." : marcados.size > 0 ? `Excluir (${marcados.size + 1})` : "Excluir"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

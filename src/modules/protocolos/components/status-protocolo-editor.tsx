"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { statusProtocoloSchema, type StatusProtocoloInput, type StatusProtocoloOutput } from "../schemas/protocolo";
import { salvarStatusProtocolo } from "../actions/protocolos";
import type { StatusProtocolo } from "@/types/db";

/** Botão + diálogo para criar ou editar um status de protocolo (somente admin). */
export function StatusProtocoloEditor({ status }: { status?: StatusProtocolo }) {
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
  } = useForm<StatusProtocoloInput, unknown, StatusProtocoloOutput>({
    resolver: zodResolver(statusProtocoloSchema),
    defaultValues: {
      nome: status?.nome ?? "",
      ordem: status?.ordem ?? 100,
      pendente: status?.pendente ?? true,
      ativo: status?.ativo ?? true,
    },
  });

  const onSubmit = handleSubmit(() => {
    setErro(null);
    startTransition(async () => {
      const res = await salvarStatusProtocolo(status?.id ?? null, getValues());
      if (!res.ok) return setErro(res.error);
      if (!status) reset();
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <>
      {status ? (
        <button onClick={() => setOpen(true)} className="text-slate-400 hover:text-brand-700" title="Editar" aria-label={`Editar ${status.nome}`}>
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Novo status
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={status ? "Editar status" : "Novo status de protocolo"}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {erro && <FormAlert>{erro}</FormAlert>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nome" htmlFor="nome_status" error={errors.nome?.message} required className="sm:col-span-2">
              <Input id="nome_status" {...register("nome")} />
            </Field>
            <Field label="Ordem" htmlFor="ordem_status" error={errors.ordem?.message} hint="Posição na lista.">
              <Input id="ordem_status" type="number" min={0} {...register("ordem")} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" {...register("pendente")} />
            <span>Conta como protocolo pendente no painel</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" {...register("ativo")} />
            <span>Disponível para novos protocolos</span>
          </label>
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

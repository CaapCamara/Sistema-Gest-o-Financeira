"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { protocoloSchema, type ProtocoloInput, type ProtocoloOutput } from "../schemas/protocolo";
import { salvarProtocolo } from "../actions/protocolos";
import type { Protocolo, StatusProtocolo, Usuario } from "@/types/db";

export interface ProcessoOpcao {
  id: string;
  codigo: string;
  numero_processo: string | null;
  requerentes: string;
  requeridos: string;
}

export function ProtocoloForm({
  protocolo,
  processoIds = [],
  processos,
  status,
  usuarios,
  responsavelPadrao,
}: {
  protocolo?: Protocolo;
  processoIds?: string[];
  processos: ProcessoOpcao[];
  status: Pick<StatusProtocolo, "id" | "nome" | "ativo">[];
  usuarios: Usuario[];
  responsavelPadrao?: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ProtocoloInput, unknown, ProtocoloOutput>({
    resolver: zodResolver(protocoloSchema),
    defaultValues: {
      nupe: protocolo?.nupe ?? "",
      data_protocolo: protocolo?.data_protocolo ?? "",
      status_id: protocolo?.status_id ?? status.find((s) => s.ativo)?.id ?? "",
      responsavel_id: protocolo?.responsavel_id ?? responsavelPadrao ?? "",
      assunto: protocolo?.assunto ?? "",
      observacoes: protocolo?.observacoes ?? "",
      processo_ids: processoIds,
    },
  });
  const selecionados = watch("processo_ids") ?? [];

  // Checkboxes controlados: o filtro esconde itens sem perder a seleção deles.
  function alternar(id: string, marcado: boolean) {
    const proximo = marcado ? [...selecionados, id] : selecionados.filter((x) => x !== id);
    setValue("processo_ids", proximo, { shouldDirty: true, shouldValidate: !!errors.processo_ids });
  }

  const visiveis = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    if (!t) return processos;
    return processos.filter((p) =>
      [p.codigo, p.numero_processo ?? "", p.requerentes, p.requeridos].some((v) => v.toLowerCase().includes(t)),
    );
  }, [filtro, processos]);

  const onSubmit = handleSubmit(() => {
    setErro(null);
    startTransition(async () => {
      const res = await salvarProtocolo(protocolo?.id ?? null, getValues());
      if (!res.ok) {
        setErro(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) =>
          setError(k as keyof ProtocoloInput, { message: v?.[0] }),
        );
        return;
      }
      router.push(`/protocolos/${res.data!.id}`);
      router.refresh();
    });
  });

  // Status inativos continuam disponíveis só para o protocolo que já os usa
  const opcoesStatus = status.filter((s) => s.ativo || s.id === protocolo?.status_id);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {erro && <FormAlert>{erro}</FormAlert>}
      <FormAlert tone="info">
        Controle manual do protocolo no GOV. Um protocolo pode abranger vários processos, e um processo pode ter vários
        protocolos.
      </FormAlert>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Número NUPE" htmlFor="nupe" error={errors.nupe?.message} hint="Deixe em branco se ainda não houver.">
          <Input id="nupe" {...register("nupe")} />
        </Field>
        <Field label="Data do protocolo" htmlFor="data_protocolo" error={errors.data_protocolo?.message}>
          <Input id="data_protocolo" type="date" {...register("data_protocolo")} />
        </Field>
        <Field label="Status" htmlFor="status_id" error={errors.status_id?.message} required>
          <Select id="status_id" {...register("status_id")} aria-invalid={!!errors.status_id}>
            <option value="">Selecione...</option>
            {opcoesStatus.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsável pelo protocolo" htmlFor="responsavel_id" error={errors.responsavel_id?.message} required>
          <Select id="responsavel_id" {...register("responsavel_id")} aria-invalid={!!errors.responsavel_id}>
            <option value="">Selecione...</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assunto" htmlFor="assunto" className="sm:col-span-2">
          <Input id="assunto" placeholder="Ex.: homologação de acordo" {...register("assunto")} />
        </Field>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Processos abrangidos</h3>
            <p className="text-xs text-slate-500">{selecionados.length} selecionado(s)</p>
          </div>
          <Input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por número, código ou parte"
            aria-label="Filtrar processos"
            className="h-8 sm:w-72"
          />
        </div>
        {errors.processo_ids?.message && <p className="mb-2 text-xs text-red-600">{errors.processo_ids.message}</p>}
        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {visiveis.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">Nenhum processo encontrado.</p>}
          {visiveis.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                checked={selecionados.includes(p.id)}
                onChange={(e) => alternar(p.id, e.target.checked)}
              />
              <span>
                <span className="font-medium">{p.numero_processo ?? p.codigo}</span>
                {p.numero_processo && <span className="ml-1 text-xs text-slate-500">{p.codigo}</span>}
                <span className="block text-xs text-slate-500">
                  {p.requerentes || "—"} × {p.requeridos || "—"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <Field label="Observações" htmlFor="observacoes">
        <Textarea id="observacoes" {...register("observacoes")} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar protocolo"}
        </Button>
      </div>
    </form>
  );
}

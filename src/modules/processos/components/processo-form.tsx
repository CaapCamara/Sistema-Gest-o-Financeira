"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { processoSchema, POLOS, STATUS_PROCESSO, type ProcessoInput, type ProcessoOutput } from "../schemas/processo";
import { salvarProcesso } from "../actions/processos";
import { POLO_LABEL, STATUS_PROCESSO_LABEL } from "../labels";
import type { Processo, ProcessoParte } from "@/types/db";

const PARTE_VAZIA = (polo: (typeof POLOS)[number]) => ({
  id: "",
  polo,
  nome: "",
  tipo_pessoa: "PF" as const,
  documento: "",
  contato: "",
});

export function ProcessoForm({ processo, partes = [] }: { processo?: Processo; partes?: ProcessoParte[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { errors },
  } = useForm<ProcessoInput, unknown, ProcessoOutput>({
    resolver: zodResolver(processoSchema),
    defaultValues: {
      numero_processo: processo?.numero_processo ?? "",
      data_audiencia: processo?.data_audiencia ?? "",
      status: processo?.status ?? "ativo",
      observacoes: processo?.observacoes ?? "",
      partes:
        partes.length > 0
          ? partes.map((p) => ({
              id: p.id,
              polo: p.polo,
              nome: p.nome,
              tipo_pessoa: p.tipo_pessoa,
              documento: p.documento ?? "",
              contato: p.contato ?? "",
            }))
          : [PARTE_VAZIA("requerente"), PARTE_VAZIA("requerido")],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "partes" });

  const onSubmit = handleSubmit(() => {
    setErro(null);
    startTransition(async () => {
      const res = await salvarProcesso(processo?.id ?? null, getValues());
      if (!res.ok) {
        setErro(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) =>
          setError(k as keyof ProcessoInput, { message: v?.[0] }),
        );
        return;
      }
      router.push(`/processos/${res.data!.id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {erro && <FormAlert>{erro}</FormAlert>}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Processo</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Número do processo"
            htmlFor="numero_processo"
            error={errors.numero_processo?.message}
            hint="Opcional. O identificador interno é gerado pelo sistema."
          >
            <Input id="numero_processo" placeholder="0000000-00.0000.0.00.0000" {...register("numero_processo")} />
          </Field>
          <Field label="Data da audiência" htmlFor="data_audiencia" error={errors.data_audiencia?.message}>
            <Input id="data_audiencia" type="date" {...register("data_audiencia")} />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" {...register("status")}>
              {STATUS_PROCESSO.map((s) => (
                <option key={s} value={s}>
                  {STATUS_PROCESSO_LABEL[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Partes</h3>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => append(PARTE_VAZIA("requerente"))}>
              <Plus className="h-4 w-4" /> Requerente
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => append(PARTE_VAZIA("requerido"))}>
              <Plus className="h-4 w-4" /> Requerido
            </Button>
          </div>
        </div>
        {errors.partes?.message && <p className="mb-2 text-xs text-red-600">{errors.partes.message}</p>}
        {errors.partes?.root?.message && <p className="mb-2 text-xs text-red-600">{errors.partes.root.message}</p>}
        <div className="space-y-3">
          {fields.map((f, i) => {
            const e = errors.partes?.[i];
            return (
              <div key={f.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-12">
                <input type="hidden" {...register(`partes.${i}.id`)} />
                <Field label="Polo" htmlFor={`partes.${i}.polo`} className="lg:col-span-2">
                  <Select id={`partes.${i}.polo`} {...register(`partes.${i}.polo`)}>
                    {POLOS.map((p) => (
                      <option key={p} value={p}>
                        {POLO_LABEL[p]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Nome" htmlFor={`partes.${i}.nome`} error={e?.nome?.message} required className="lg:col-span-4">
                  <Input id={`partes.${i}.nome`} {...register(`partes.${i}.nome`)} aria-invalid={!!e?.nome} />
                </Field>
                <Field label="Pessoa" htmlFor={`partes.${i}.tipo_pessoa`} className="lg:col-span-1">
                  <Select id={`partes.${i}.tipo_pessoa`} {...register(`partes.${i}.tipo_pessoa`)}>
                    <option value="PF">PF</option>
                    <option value="PJ">PJ</option>
                  </Select>
                </Field>
                <Field label="CPF / CNPJ" htmlFor={`partes.${i}.documento`} className="lg:col-span-2">
                  <Input id={`partes.${i}.documento`} {...register(`partes.${i}.documento`)} />
                </Field>
                <Field label="Contato" htmlFor={`partes.${i}.contato`} className="lg:col-span-2">
                  <Input id={`partes.${i}.contato`} {...register(`partes.${i}.contato`)} />
                </Field>
                <div className="flex items-end lg:col-span-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} aria-label="Remover parte" title="Remover parte">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
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
          {pending ? "Salvando..." : "Salvar processo"}
        </Button>
      </div>
    </form>
  );
}

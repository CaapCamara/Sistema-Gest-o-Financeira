"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/form";
import { credorSchema, type CredorInput, type CredorOutput } from "../schemas/credor";
import { salvarCredor } from "../actions/credores";
import type { Credor } from "@/types/db";

export function CredorForm({ credor }: { credor?: Credor }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors },
  } = useForm<CredorInput, unknown, CredorOutput>({
    resolver: zodResolver(credorSchema),
    defaultValues: {
      nome: credor?.nome ?? "",
      tipo_pessoa: credor?.tipo_pessoa ?? "PF",
      documento: credor?.documento ?? "",
      email: credor?.email ?? "",
      telefone: credor?.telefone ?? "",
      endereco: credor?.endereco ?? "",
      dados_bancarios: credor?.dados_bancarios ?? "",
      observacoes: credor?.observacoes ?? "",
    },
  });

  const onSubmit = handleSubmit(() => {
    setErro(null);
    startTransition(async () => {
      const res = await salvarCredor(credor?.id ?? null, getValues());
      if (!res.ok) {
        setErro(res.error);
        Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) =>
          setError(k as keyof CredorInput, { message: v?.[0] }),
        );
        return;
      }
      router.push("/credores");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {erro && <FormAlert>{erro}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome / Razão social" htmlFor="nome" error={errors.nome?.message} required className="sm:col-span-2">
          <Input id="nome" {...register("nome")} aria-invalid={!!errors.nome} />
        </Field>
        <Field label="Tipo de pessoa" htmlFor="tipo_pessoa">
          <Select id="tipo_pessoa" {...register("tipo_pessoa")}>
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </Select>
        </Field>
        <Field label="CPF / CNPJ" htmlFor="documento" error={errors.documento?.message}>
          <Input id="documento" {...register("documento")} aria-invalid={!!errors.documento} />
        </Field>
        <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label="Telefone" htmlFor="telefone">
          <Input id="telefone" {...register("telefone")} />
        </Field>
        <Field label="Endereço" htmlFor="endereco" className="sm:col-span-2">
          <Input id="endereco" {...register("endereco")} />
        </Field>
        <Field label="Dados bancários / PIX" htmlFor="dados_bancarios" className="sm:col-span-2">
          <Textarea id="dados_bancarios" rows={2} {...register("dados_bancarios")} />
        </Field>
        <Field label="Observações" htmlFor="observacoes" className="sm:col-span-2">
          <Textarea id="observacoes" {...register("observacoes")} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar credor"}
        </Button>
      </div>
    </form>
  );
}

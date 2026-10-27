"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { definirSenha, type DefinirSenhaState } from "./actions";

export function DefinirSenhaForm({ minimo }: { minimo: number }) {
  const [state, action, pending] = useActionState<DefinirSenhaState, FormData>(definirSenha, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <Field label="Nova senha" htmlFor="senha" hint={`Mínimo de ${minimo} caracteres, com letras e números.`}>
        <Input id="senha" name="senha" type="password" autoComplete="new-password" minLength={minimo} required />
      </Field>
      <Field label="Confirme a nova senha" htmlFor="confirmacao">
        <Input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={minimo} required />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Salvando..." : "Salvar senha e entrar"}
      </Button>
    </form>
  );
}

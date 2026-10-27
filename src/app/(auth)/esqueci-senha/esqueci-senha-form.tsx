"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/form";
import { solicitarRedefinicao, type EsqueciSenhaState } from "./actions";

export function EsqueciSenhaForm() {
  const [state, action, pending] = useActionState<EsqueciSenhaState, FormData>(solicitarRedefinicao, {});

  if (state.enviado) {
    return (
      <FormAlert tone="success">
        Se o e-mail estiver cadastrado, você vai receber um link para redefinir a senha. O link vale por 1 hora.
      </FormAlert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link de redefinição"}
      </Button>
    </form>
  );
}

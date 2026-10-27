"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { TAMANHO_MINIMO_SENHA } from "@/lib/auth-links";

const schema = z
  .object({
    senha: z
      .string()
      .min(TAMANHO_MINIMO_SENHA, `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`)
      .max(72, "A senha pode ter no máximo 72 caracteres.")
      .regex(/[a-zA-Z]/, "A senha precisa ter letras.")
      .regex(/[0-9]/, "A senha precisa ter números."),
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, { message: "As senhas não conferem.", path: ["confirmacao"] });

export type DefinirSenhaState = { error?: string };

export async function definirSenha(_prev: DefinirSenhaState, formData: FormData): Promise<DefinirSenhaState> {
  const parsed = schema.safeParse({ senha: formData.get("senha"), confirmacao: formData.get("confirmacao") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?erro=link_invalido");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.senha });
  if (error) {
    if (error.code === "same_password") return { error: "A nova senha precisa ser diferente da atual." };
    if (error.code === "weak_password") return { error: "Senha fraca. Use letras e números e evite senhas comuns." };
    return { error: "Não foi possível salvar a senha. Tente novamente." };
  }

  redirect("/dashboard");
}

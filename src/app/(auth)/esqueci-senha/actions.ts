"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.string().trim().email("Informe um e-mail válido.") });

export type EsqueciSenhaState = { error?: string; enviado?: boolean };

/** Origem pública da aplicação. Em produção, fixe NEXT_PUBLIC_SITE_URL. */
async function origemPublica(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function solicitarRedefinicao(_prev: EsqueciSenhaState, formData: FormData): Promise<EsqueciSenhaState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  // - Modelo padrão do Supabase: o link volta com ?code=... (PKCE) para este redirectTo.
  // - Modelo próprio (supabase/templates/recovery.html): o link usa token_hash.
  // Em ambos os casos /auth/confirm valida no servidor e leva a /definir-senha.
  // O redirectTo precisa estar em Authentication → URL Configuration → Redirect URLs.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origemPublica()}/auth/confirm?next=/definir-senha`,
  });

  // Só o limite de envios é mostrado; outros erros são omitidos para não revelar
  // quais e-mails estão cadastrados.
  if (error?.status === 429) return { error: "Muitas solicitações. Aguarde alguns minutos e tente de novo." };
  return { enviado: true };
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TAMANHO_MINIMO_SENHA } from "@/lib/auth-links";
import { AuthShell } from "../auth-shell";
import { DefinirSenhaForm } from "./definir-senha-form";

export const metadata: Metadata = { title: "Definir senha" };

export default async function DefinirSenhaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?erro=link_invalido");

  return (
    <AuthShell subtitulo={`Defina sua senha de acesso para ${user.email}`}>
      <DefinirSenhaForm minimo={TAMANHO_MINIMO_SENHA} />
    </AuthShell>
  );
}

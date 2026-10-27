import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/ui/form";
import { MENSAGENS_ERRO_LINK } from "@/lib/auth-links";
import { AuthShell } from "../auth-shell";
import { LinkImplicito } from "./link-implicito";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; erro?: string }>;
}) {
  const { redirect, erro } = await searchParams;
  const mensagemErro = erro ? MENSAGENS_ERRO_LINK[erro] : undefined;
  return (
    <AuthShell
      subtitulo="Acesso restrito a usuários autorizados"
      rodape={
        <Link href="/esqueci-senha" className="font-medium text-brand-700 hover:underline">
          Esqueci minha senha
        </Link>
      }
    >
      <LinkImplicito />
      {mensagemErro && (
        <div className="mb-4">
          <FormAlert>{mensagemErro}</FormAlert>
        </div>
      )}
      <LoginForm redirectTo={redirect} />
    </AuthShell>
  );
}

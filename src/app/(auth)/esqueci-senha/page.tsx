import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../auth-shell";
import { EsqueciSenhaForm } from "./esqueci-senha-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function EsqueciSenhaPage() {
  return (
    <AuthShell
      subtitulo="Informe seu e-mail para receber o link de redefinição"
      rodape={
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Voltar para o login
        </Link>
      }
    >
      <EsqueciSenhaForm />
    </AuthShell>
  );
}

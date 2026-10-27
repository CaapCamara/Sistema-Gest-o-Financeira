import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow">
            <Wallet className="h-5 w-5" />
          </span>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">Gestão Financeira</h1>
          <p className="text-sm text-slate-500">Acesso restrito a usuários autorizados</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm redirectTo={redirect} />
        </div>
      </div>
    </div>
  );
}

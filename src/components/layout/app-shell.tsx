"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Perfil } from "@/types/db";
import { NAVEGACAO } from "./nav";
import { sair } from "@/app/(auth)/login/actions";

const PAPEL_LABEL: Record<Perfil["papel"], string> = {
  admin: "Administrador",
  operador: "Operador",
  leitor: "Somente leitura",
};

function Sidebar({ perfil, onNavigate }: { perfil: Perfil; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Wallet className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-white">Gestão Financeira</span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAVEGACAO.map((grupo) => {
          const itens = grupo.itens.filter((i) => !i.somenteAdmin || perfil.papel === "admin");
          if (itens.length === 0) return null;
          return (
            <div key={grupo.titulo}>
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{grupo.titulo}</p>
              <ul className="space-y-0.5">
                {itens.map((item) => {
                  const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  if (item.emBreve) {
                    return (
                      <li key={item.href}>
                        <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-500">
                          <Icon className="h-4 w-4" />
                          {item.label}
                          <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase">em breve</span>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                          ativo ? "bg-slate-800 font-medium text-white" : "hover:bg-slate-800/60 hover:text-white",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <p className="truncate text-sm font-medium text-white">{perfil.nome || perfil.email}</p>
        <p className="text-xs text-slate-500">{PAPEL_LABEL[perfil.papel]}</p>
        <form action={sair} className="mt-3">
          <button className="flex items-center gap-2 text-xs text-slate-400 hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppShell({ perfil, children }: { perfil: Perfil; children: React.ReactNode }) {
  const [aberto, setAberto] = React.useState(false);
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar perfil={perfil} />
      </aside>

      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setAberto(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <Sidebar perfil={perfil} onNavigate={() => setAberto(false)} />
          </aside>
          <button
            onClick={() => setAberto(false)}
            className="absolute left-[16.5rem] top-4 rounded-lg bg-white p-2 text-slate-700"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setAberto(true)} className="rounded-lg p-2 text-slate-700 hover:bg-slate-100" aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">Gestão Financeira</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

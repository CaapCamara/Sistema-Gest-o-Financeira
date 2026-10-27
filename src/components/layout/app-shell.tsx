"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Perfil } from "@/types/db";
import { NAVEGACAO } from "./nav";
import { Marca } from "./marca";
import { sair } from "@/app/(auth)/login/actions";

const PAPEL_LABEL: Record<Perfil["papel"], string> = {
  admin: "Administrador",
  operador: "Operador",
  leitor: "Somente leitura",
};

function iniciais(nome: string) {
  const partes = nome.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Sidebar({ perfil, onNavigate }: { perfil: Perfil; onNavigate?: () => void }) {
  const pathname = usePathname();
  const nome = perfil.nome || perfil.email || "";
  return (
    <div className="flex h-full flex-col bg-tinta-900 text-slate-300">
      <div className="flex h-[72px] items-center gap-3 px-5">
        <Marca />
        <div className="leading-tight">
          <p className="font-display text-[15px] font-bold text-white">Gestão Financeira</p>
          <p className="text-[11px] text-slate-400">Acordos, empréstimos e reservas</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2">
        {NAVEGACAO.map((grupo) => {
          const itens = grupo.itens.filter((i) => !i.somenteAdmin || perfil.papel === "admin");
          if (itens.length === 0) return null;
          return (
            <div key={grupo.titulo}>
              <p className="px-3 pb-1.5 text-xs font-medium text-slate-500">{grupo.titulo}</p>
              <ul className="space-y-0.5">
                {itens.map((item) => {
                  const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  if (item.emBreve) {
                    return (
                      <li key={item.href}>
                        <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500">
                          <Icon className="h-4 w-4" />
                          {item.label}
                          <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px]">em breve</span>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={ativo ? "page" : undefined}
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                          ativo
                            ? "bg-white/[0.08] font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-400"
                            : "text-slate-300 hover:bg-white/[0.05] hover:text-white",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", ativo ? "text-brand-300" : "text-slate-400")} />
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
      <div className="m-3 flex items-center gap-3 rounded-xl bg-white/[0.05] p-3 ring-1 ring-white/10">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {iniciais(nome)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{nome}</p>
          <p className="text-xs text-slate-400">{PAPEL_LABEL[perfil.papel]}</p>
        </div>
        <form action={sair}>
          <button
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] lg:block">
        <Sidebar perfil={perfil} />
      </aside>

      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-tinta-950/60 backdrop-blur-sm" onClick={() => setAberto(false)} />
          <aside className="absolute inset-y-0 left-0 w-[264px] shadow-2xl">
            <Sidebar perfil={perfil} onNavigate={() => setAberto(false)} />
          </aside>
          <button
            onClick={() => setAberto(false)}
            className="absolute left-[17rem] top-4 rounded-lg bg-white p-2 text-slate-700"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-tinta-900 px-4 text-white lg:hidden">
          <button onClick={() => setAberto(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <Marca className="h-8 w-8 p-1.5" />
          <span className="font-display text-sm font-bold">Gestão Financeira</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}

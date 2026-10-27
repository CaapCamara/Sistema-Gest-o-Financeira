import {
  LayoutDashboard,
  Landmark,
  Users,
  PiggyBank,
  Calculator,
  Scale,
  Handshake,
  FileCheck2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  emBreve?: boolean;
  somenteAdmin?: boolean;
}

export interface NavGroup {
  titulo: string;
  itens: NavItem[];
}

export const NAVEGACAO: NavGroup[] = [
  {
    titulo: "Geral",
    itens: [{ href: "/dashboard", label: "Painel", icon: LayoutDashboard }],
  },
  {
    titulo: "Empréstimos",
    itens: [
      { href: "/emprestimos", label: "Operações", icon: Landmark },
      { href: "/credores", label: "Credores", icon: Users },
      { href: "/reservas", label: "Reservas", icon: PiggyBank },
      { href: "/simulador", label: "Simulador", icon: Calculator },
    ],
  },
  {
    titulo: "Acordos e processos",
    itens: [
      { href: "/processos", label: "Processos", icon: Scale },
      { href: "/acordos", label: "Acordos", icon: Handshake },
      { href: "/protocolos", label: "Protocolos GOV", icon: FileCheck2, emBreve: true },
    ],
  },
  {
    titulo: "Administração",
    itens: [{ href: "/auditoria", label: "Auditoria", icon: ShieldCheck, somenteAdmin: true }],
  },
];

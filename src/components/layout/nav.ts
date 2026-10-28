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
  ListChecks,
  ArrowRightLeft,
  Layers,
  HandCoins,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Frase curta, discreta, dizendo para que serve. */
  dica: string;
  icon: LucideIcon;
  emBreve?: boolean;
  somenteAdmin?: boolean;
}

export interface NavGroup {
  titulo: string;
  /** Etapa do caminho do dinheiro (1 a 4); grupos sem etapa não são numerados. */
  etapa?: number;
  itens: NavItem[];
}

/**
 * O menu segue o caminho do dinheiro: o credor empresta → o processo gera um
 * acordo → o acordo paga → o que entra é dividido → no fim, a gestão do que sobrou.
 */
export const NAVEGACAO: NavGroup[] = [
  {
    titulo: "Geral",
    itens: [{ href: "/dashboard", label: "Painel", dica: "Resumo de tudo", icon: LayoutDashboard }],
  },
  {
    titulo: "Empréstimo",
    etapa: 1,
    itens: [
      { href: "/credores", label: "Credores", dica: "Quem emprestou o dinheiro", icon: Users },
      { href: "/emprestimos", label: "Empréstimos", dica: "Valor, juros e prazo", icon: Landmark },
    ],
  },
  {
    titulo: "Processo",
    etapa: 2,
    itens: [
      { href: "/processos", label: "Processos", dica: "As ações e suas partes", icon: Scale },
      { href: "/acordos", label: "Acordos", dica: "Parcelas combinadas no processo", icon: Handshake },
      { href: "/protocolos", label: "Protocolos GOV", dica: "Acordo protocolado no governo", icon: FileCheck2 },
    ],
  },
  {
    titulo: "Entradas",
    etapa: 3,
    itens: [
      { href: "/recebimentos", label: "Recebimentos", dica: "Tudo o que entrou dos acordos", icon: HandCoins },
      { href: "/operacoes", label: "Operações", dica: "Divide cada entrada: juros e reserva", icon: ArrowRightLeft },
      { href: "/reservas", label: "Reservas", dica: "Dinheiro guardado para quitar", icon: PiggyBank },
    ],
  },
  {
    titulo: "Gestão",
    etapa: 4,
    itens: [{ href: "/remanescente", label: "Montante remanescente", dica: "O que sobra depois de tudo pago", icon: Layers }],
  },
  {
    titulo: "Ferramentas",
    itens: [
      { href: "/simulador", label: "Simulador", dica: "Calcule antes de emprestar", icon: Calculator },
      { href: "/configuracoes/status-protocolo", label: "Status de protocolo", dica: "Etapas de um protocolo", icon: ListChecks, somenteAdmin: true },
      { href: "/auditoria", label: "Auditoria", dica: "Quem fez o quê e quando", icon: ShieldCheck, somenteAdmin: true },
    ],
  },
];

import Decimal from "decimal.js";
import { money, round2, type MoneyInput } from "@/lib/money";
import { addMonthsISO } from "@/lib/dates";

/**
 * Regras confirmadas (espelham supabase/migrations/..._modulo_emprestimos.sql):
 *  - Juros simples e fixos sobre o principal ORIGINAL.
 *  - Juros não pagos acumulam sem gerar novos juros.
 *  - Competência n vence em data_inicio + n meses.
 */
export function jurosMensal(principal: MoneyInput, taxaMensal: MoneyInput): Decimal {
  return round2(money(principal).times(money(taxaMensal)));
}

export function jurosContratadosReferencia(principal: MoneyInput, taxaMensal: MoneyInput, prazoMeses: number): Decimal {
  return jurosMensal(principal, taxaMensal).times(prazoMeses);
}

export interface CompetenciaPrevista {
  numero: number;
  dataVencimento: string;
  jurosDevido: Decimal;
  principalPrevisto: Decimal;
  pagamentoPrevisto: Decimal;
  reservaPrevista: Decimal;
}

export interface ParametrosCronograma {
  valorPrincipal: MoneyInput;
  taxaJurosMensal: MoneyInput;
  dataInicio: string;
  prazoMeses: number;
  pagamentoMensalPlanejado?: MoneyInput;
  reservaMensalPlanejada?: MoneyInput;
}

export function gerarCronograma(p: ParametrosCronograma): CompetenciaPrevista[] {
  const juros = jurosMensal(p.valorPrincipal, p.taxaJurosMensal);
  const principal = round2(p.valorPrincipal);
  return Array.from({ length: p.prazoMeses }, (_, i) => {
    const numero = i + 1;
    return {
      numero,
      dataVencimento: addMonthsISO(p.dataInicio, numero),
      jurosDevido: juros,
      principalPrevisto: numero === p.prazoMeses ? principal : new Decimal(0),
      pagamentoPrevisto: round2(p.pagamentoMensalPlanejado),
      reservaPrevista: round2(p.reservaMensalPlanejada),
    };
  });
}

/** Percentual digitado (ex.: "10" ou "2,5") -> fração (0.1 / 0.025). */
export function percentualParaFracao(pct: MoneyInput): Decimal {
  return money(pct).dividedBy(100);
}

/** Juros vencidos e não pagos dado o total devido até hoje e o total já pago de juros. */
export function jurosVencidosNaoPagos(devidosAteHoje: MoneyInput, pagos: MoneyInput): Decimal {
  return Decimal.max(0, money(devidosAteHoje).minus(money(pagos)));
}

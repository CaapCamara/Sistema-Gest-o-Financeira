import Decimal from "decimal.js";
import { money, round2, type MoneyInput } from "@/lib/money";

export interface CotasParcela {
  emprestimo: Decimal;
  reserva: Decimal;
  livre: Decimal;
}

/**
 * Divide o valor nominal de uma parcela do acordo pelas cotas da operação.
 * Mesma regra do banco (destinar_recebimento): a cota do empréstimo é arredondada
 * no centavo; com soma de 100%, a reserva fica com a diferença exata.
 */
export function cotasDaParcela(
  valorParcela: MoneyInput,
  percentualEmprestimo: MoneyInput,
  percentualReserva: MoneyInput,
): CotasParcela {
  const valor = money(valorParcela);
  const pe = money(percentualEmprestimo);
  const pr = money(percentualReserva);
  const emprestimo = round2(valor.times(pe).dividedBy(100));
  const reserva = pe.plus(pr).equals(100) ? valor.minus(emprestimo) : round2(valor.times(pr).dividedBy(100));
  const livre = Decimal.max(valor.minus(emprestimo).minus(reserva), 0);
  return { emprestimo, reserva, livre };
}

/**
 * Soma das contribuições mensais previstas das operações para os juros de um
 * empréstimo, comparada com o juros mensal. Diferença positiva = sobra
 * (vai para o remanescente); negativa = falta.
 */
export function coberturaPrevista(jurosMensal: MoneyInput, contribuicoes: MoneyInput[]) {
  const total = contribuicoes.reduce<Decimal>((acc, c) => acc.plus(money(c)), new Decimal(0));
  const juros = money(jurosMensal);
  return { total, juros, diferenca: total.minus(juros) };
}

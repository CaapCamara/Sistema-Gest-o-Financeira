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

export interface ParcelaParaPrevia {
  id: string;
  valor: MoneyInput;
  saldo: MoneyInput;
}

/**
 * Prévia de como um recebimento será dividido (mesma regra do banco).
 * Supõe que o que já foi recebido em cada parcela preencheu primeiro a cota de
 * juros e depois a de reserva. Não conhece os juros em aberto do empréstimo: a
 * parte de juros é o máximo possível; se não houver juros a pagar, ela vira
 * remanescente no registro.
 */
export function previaRecebimento(
  parcelas: ParcelaParaPrevia[],
  distribuicao: { parcelaId: string; valor: MoneyInput }[],
  percentualEmprestimo: MoneyInput,
  percentualReserva: MoneyInput,
) {
  let juros = new Decimal(0);
  let reserva = new Decimal(0);
  let livre = new Decimal(0);
  for (const d of distribuicao) {
    const p = parcelas.find((x) => x.id === d.parcelaId);
    if (!p) continue;
    const cotas = cotasDaParcela(p.valor, percentualEmprestimo, percentualReserva);
    const recebido = Decimal.max(money(p.valor).minus(money(p.saldo)), 0);
    const jaJuros = Decimal.min(recebido, cotas.emprestimo);
    const jaReserva = Decimal.min(recebido.minus(jaJuros), cotas.reserva);
    let disp = money(d.valor);
    const j = Decimal.min(disp, cotas.emprestimo.minus(jaJuros));
    disp = disp.minus(j);
    const r = Decimal.min(disp, cotas.reserva.minus(jaReserva));
    disp = disp.minus(r);
    juros = juros.plus(j);
    reserva = reserva.plus(r);
    livre = livre.plus(disp);
  }
  return { juros, reserva, livre };
}

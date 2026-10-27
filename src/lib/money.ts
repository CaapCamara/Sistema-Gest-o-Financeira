import Decimal from "decimal.js";

// Precisão alta para cálculos intermediários; arredondamento só na saída (2 casas, meio para cima).
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal | string | number | null | undefined;

export function money(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  if (value instanceof Decimal) return value;
  return new Decimal(typeof value === "number" ? value.toString() : value);
}

/** Arredonda para centavos (meio para cima). */
export function round2(value: MoneyInput): Decimal {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), new Decimal(0));
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimalBR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formata como R$ 1.234,56 */
export function formatBRL(value: MoneyInput): string {
  return brl.format(round2(value).toNumber());
}

/** Formata número com 2 casas no padrão brasileiro (sem símbolo). */
export function formatDecimalBR(value: MoneyInput): string {
  return decimalBR.format(round2(value).toNumber());
}

/** Taxa em fração (0.1) -> "10,00%" */
export function formatPercent(fraction: MoneyInput, digits = 2): string {
  const pct = money(fraction).times(100);
  return (
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: 4 }).format(
      pct.toNumber(),
    ) + "%"
  );
}

/**
 * Converte texto digitado no padrão brasileiro em string decimal canônica.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234,56". Retorna null se inválido.
 */
export function parseDecimalBR(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/R\$|\s|%/g, "").trim();
  if (s === "") return null;
  const hasComma = s.includes(",");
  if (hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(s)) {
    // "1.234.567" ou "1.000": ponto como separador de milhar
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return new Decimal(s).toString();
}

import { addMonths, format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

export const TIMEZONE = "America/Sao_Paulo";

/** Data de hoje (aaaa-mm-dd) no fuso de Brasília. */
export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

/** Converte "aaaa-mm-dd" em Date local sem deslocamento de fuso. */
export function parseDateOnly(iso: string): Date {
  return parseISO(iso.slice(0, 10));
}

export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** "2026-03-15" -> "15/03/2026" */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDateOnly(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
}

/** "2026-03-15" -> "mar/2026" */
export function formatMesAno(iso: string | null | undefined): string {
  if (!iso) return "—";
  return format(parseDateOnly(iso), "MMM/yyyy", { locale: ptBR });
}

export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Soma meses mantendo a regra do PostgreSQL (fim de mês ajustado). */
export function addMonthsISO(iso: string, months: number): string {
  return toISODate(addMonths(parseDateOnly(iso), months));
}

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseDateOnly(value));
}

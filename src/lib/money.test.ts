import { describe, expect, it } from "vitest";
import { formatBRL, parseDecimalBR, round2, sum } from "./money";

describe("money", () => {
  it("formata em reais", () => {
    expect(formatBRL(1234.56).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
  it("interpreta valores digitados no padrão brasileiro", () => {
    expect(parseDecimalBR("1.234,56")).toBe("1234.56");
    expect(parseDecimalBR("R$ 1.000")).toBe("1000");
    expect(parseDecimalBR("1234.5")).toBe("1234.5");
    expect(parseDecimalBR("10%")).toBe("10");
    expect(parseDecimalBR("abc")).toBeNull();
    expect(parseDecimalBR("")).toBeNull();
  });
  it("soma sem erro de ponto flutuante", () => {
    expect(sum(["0.1", "0.2"]).toString()).toBe("0.3");
    expect(round2("2.675").toFixed(2)).toBe("2.68");
  });
});

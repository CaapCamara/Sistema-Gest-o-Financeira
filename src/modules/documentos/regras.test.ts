import { describe, expect, it } from "vitest";
import { formatTamanho, nomeSeguro } from "./regras";

describe("documentos", () => {
  it("gera nome seguro para o Storage", () => {
    expect(nomeSeguro("Ata de Audiência (1ª).pdf")).toBe("Ata_de_Audiencia_1_.pdf");
    expect(nomeSeguro("../../etc/passwd")).toBe("etc_passwd");
    expect(nomeSeguro("???")).toBe("arquivo");
  });
  it("formata tamanho", () => {
    expect(formatTamanho(512)).toBe("512 B");
    expect(formatTamanho(1536 * 1024)).toBe("1,5 MB");
  });
});

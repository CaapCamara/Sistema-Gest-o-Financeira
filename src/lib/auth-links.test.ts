import { describe, expect, it } from "vitest";
import { destinoAposConfirmar, tipoLinkValido } from "./auth-links";

describe("tipoLinkValido", () => {
  it("aceita os tipos de link de e-mail do Supabase", () => {
    expect(tipoLinkValido("invite")).toBe("invite");
    expect(tipoLinkValido("recovery")).toBe("recovery");
  });

  it("rejeita valores desconhecidos ou ausentes", () => {
    expect(tipoLinkValido("magiclink-falso")).toBeNull();
    expect(tipoLinkValido(null)).toBeNull();
  });
});

describe("destinoAposConfirmar", () => {
  it("leva convite e recuperação para a definição de senha", () => {
    expect(destinoAposConfirmar(null, "invite")).toBe("/definir-senha");
    expect(destinoAposConfirmar(null, "recovery")).toBe("/definir-senha");
  });

  it("usa o painel para os demais tipos", () => {
    expect(destinoAposConfirmar(null, "email")).toBe("/dashboard");
    expect(destinoAposConfirmar(null, null)).toBe("/dashboard");
  });

  it("respeita caminhos internos em next", () => {
    expect(destinoAposConfirmar("/processos?aba=documentos", "invite")).toBe("/processos?aba=documentos");
  });

  it("bloqueia open redirect", () => {
    expect(destinoAposConfirmar("https://exemplo.com", "invite")).toBe("/definir-senha");
    expect(destinoAposConfirmar("//exemplo.com", "invite")).toBe("/definir-senha");
    expect(destinoAposConfirmar("/\\exemplo.com", "recovery")).toBe("/definir-senha");
  });
});

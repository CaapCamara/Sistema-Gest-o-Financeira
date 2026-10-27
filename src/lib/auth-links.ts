import type { EmailOtpType } from "@supabase/supabase-js";

/** Deve coincidir com "Minimum password length" do Supabase Auth (supabase/config.toml). */
export const TAMANHO_MINIMO_SENHA = 10;

/** Tipos de link de e-mail aceitos em /auth/confirm. */
export const TIPOS_LINK_EMAIL = ["invite", "recovery", "signup", "email", "email_change"] as const satisfies readonly EmailOtpType[];

export function tipoLinkValido(valor: string | null): EmailOtpType | null {
  return valor && (TIPOS_LINK_EMAIL as readonly string[]).includes(valor) ? (valor as EmailOtpType) : null;
}

/**
 * Destino após confirmar um link. Aceita apenas caminhos internos (evita open redirect).
 * Convite e recuperação levam à definição de senha.
 */
export function destinoAposConfirmar(next: string | null, tipo: EmailOtpType | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  if (tipo === "invite" || tipo === "recovery") return "/definir-senha";
  return "/dashboard";
}

/** Mensagens exibidas no login para erros vindos de /auth/confirm. */
export const MENSAGENS_ERRO_LINK: Record<string, string> = {
  link_invalido: "O link é inválido ou expirou. Peça um novo convite ao administrador ou use “Esqueci minha senha”.",
};

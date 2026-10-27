import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinoAposConfirmar, tipoLinkValido } from "@/lib/auth-links";

/**
 * Valida links de e-mail do Supabase Auth (convite, recuperação de senha etc.)
 * no servidor e grava a sessão em cookie.
 *
 * Formato esperado (modelos em supabase/templates):
 *   /auth/confirm?token_hash=...&type=invite|recovery[&next=/caminho]
 * Também aceita ?code=... (fluxo PKCE).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const tipo = tipoLinkValido(searchParams.get("type"));
  const destino = destinoAposConfirmar(searchParams.get("next"), tipo);

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  const url = request.nextUrl.clone();
  url.search = "";
  if (ok) {
    const [pathname, query] = destino.split("?");
    url.pathname = pathname;
    if (query) url.search = `?${query}`;
  } else {
    url.pathname = "/login";
    url.searchParams.set("erro", "link_invalido");
  }
  return NextResponse.redirect(url);
}

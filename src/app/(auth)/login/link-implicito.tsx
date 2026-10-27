"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { destinoAposConfirmar, tipoLinkValido } from "@/lib/auth-links";

/**
 * Compatibilidade com os modelos de e-mail PADRÃO do Supabase (sem SMTP próprio).
 *
 * Nesse cenário, o convite enviado pelo painel chega pelo fluxo implícito: o Supabase
 * redireciona para o Site URL com a sessão no fragmento (#access_token=...&type=invite),
 * que o servidor não enxerga. Este componente lê o fragmento, grava a sessão em cookie
 * e segue para /definir-senha.
 *
 * Com SMTP próprio e os modelos de supabase/templates, os links usam token_hash e são
 * validados no servidor em /auth/confirm; este componente deixa de ser acionado.
 */
export function LinkImplicito() {
  const router = useRouter();
  const [estado, setEstado] = useState<"ocioso" | "processando" | "erro">("ocioso");

  useEffect(() => {
    const fragmento = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragmento.get("access_token");
    const refreshToken = fragmento.get("refresh_token");
    const erro = fragmento.get("error_code") ?? fragmento.get("error");
    if (!accessToken && !erro) return;

    // Remove os tokens da barra de endereço e do histórico.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (erro || !accessToken || !refreshToken) {
      setEstado("erro");
      return;
    }

    setEstado("processando");
    const tipo = tipoLinkValido(fragmento.get("type"));
    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) return setEstado("erro");
        router.replace(destinoAposConfirmar(null, tipo));
        router.refresh();
      });
  }, [router]);

  if (estado === "processando") return <div className="mb-4"><FormAlert tone="info">Validando o link…</FormAlert></div>;
  if (estado === "erro")
    return (
      <div className="mb-4">
        <FormAlert>O link é inválido ou expirou. Peça um novo convite ao administrador ou use “Esqueci minha senha”.</FormAlert>
      </div>
    );
  return null;
}

import type { Metadata } from "next";
import { ExcluirButton } from "@/components/excluir-button";
import { excluirCredor } from "@/modules/credores/actions/credores";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CredorForm } from "@/modules/credores/components/credor-form";
import type { Credor } from "@/types/db";

export const metadata: Metadata = { title: "Credor" };

export default async function CredorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("credores").select("*").eq("id", id).is("excluido_em", null).maybeSingle();
  if (!data) notFound();
  const credor = data as Credor;
  const editavel = podeEditar(await getPerfil());

  return (
    <>
      <PageHeader
        title={credor.nome}
        back={{ href: "/credores", label: "Credores" }}
        actions={
          editavel && (
            <ExcluirButton
              nome={`o credor ${credor.nome}`}
              acao={excluirCredor.bind(null, id)}
              redirecionarPara="/credores"
            />
          )
        }
      />
      <Card className="max-w-3xl">
        {editavel ? (
          <CardBody>
            <CredorForm credor={credor} />
          </CardBody>
        ) : (
          <>
            <CardHeader title="Dados do credor" />
            <CardBody>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                {(
                  [
                    ["Tipo", credor.tipo_pessoa],
                    ["Documento", credor.documento],
                    ["E-mail", credor.email],
                    ["Telefone", credor.telefone],
                    ["Endereço", credor.endereco],
                    ["Dados bancários", credor.dados_bancarios],
                    ["Observações", credor.observacoes],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="whitespace-pre-wrap text-slate-900">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </>
        )}
      </Card>
    </>
  );
}

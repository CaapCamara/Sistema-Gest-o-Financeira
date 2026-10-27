import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form";
import { AcordoForm } from "@/modules/acordos/components/acordo-form";

export const metadata: Metadata = { title: "Novo acordo" };

export default async function NovoAcordoPage({ searchParams }: { searchParams: Promise<{ processo?: string }> }) {
  const { processo } = await searchParams;
  if (!podeEditar(await getPerfil())) redirect(processo ? `/processos/${processo}` : "/acordos");
  const supabase = await createClient();
  const { data: processos } = await supabase
    .from("processos")
    .select("id, codigo, numero_processo")
    .is("excluido_em", null)
    .order("criado_em", { ascending: false });

  const voltar = processo ? { href: `/processos/${processo}`, label: "Processo" } : { href: "/acordos", label: "Acordos" };

  return (
    <>
      <PageHeader title="Novo acordo" back={voltar} />
      <Card className="max-w-5xl">
        <CardBody>
          {processos && processos.length > 0 ? (
            <AcordoForm processos={processos} processoIdInicial={processo} />
          ) : (
            <FormAlert tone="info">
              Cadastre o processo antes de registrar o acordo.{" "}
              <Link href="/processos/novo" className="font-medium underline">
                Cadastrar processo
              </Link>
            </FormAlert>
          )}
        </CardBody>
      </Card>
    </>
  );
}

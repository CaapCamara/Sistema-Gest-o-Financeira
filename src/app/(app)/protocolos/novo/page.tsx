import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form";
import { ProtocoloForm } from "@/modules/protocolos/components/protocolo-form";
import { dadosFormularioProtocolo } from "@/modules/protocolos/queries";

export const metadata: Metadata = { title: "Novo protocolo" };

export default async function NovoProtocoloPage({ searchParams }: { searchParams: Promise<{ processo?: string }> }) {
  const { processo } = await searchParams;
  const perfil = await getPerfil();
  if (!podeEditar(perfil)) redirect("/protocolos");
  const supabase = await createClient();
  const { processos, status, usuarios } = await dadosFormularioProtocolo(supabase);
  const voltar = processo ? { href: `/processos/${processo}`, label: "Processo" } : { href: "/protocolos", label: "Protocolos" };

  return (
    <>
      <PageHeader title="Novo protocolo" back={voltar} />
      <Card className="max-w-5xl">
        <CardBody>
          {processos.length > 0 ? (
            <ProtocoloForm
              processos={processos}
              status={status}
              usuarios={usuarios}
              responsavelPadrao={perfil!.id}
              processoIds={processo && processos.some((p) => p.id === processo) ? [processo] : []}
            />
          ) : (
            <FormAlert tone="info">
              Cadastre um processo antes de registrar o protocolo.{" "}
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

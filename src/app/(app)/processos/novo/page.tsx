import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ProcessoForm } from "@/modules/processos/components/processo-form";

export const metadata: Metadata = { title: "Novo processo" };

export default async function NovoProcessoPage() {
  if (!podeEditar(await getPerfil())) redirect("/processos");
  return (
    <>
      <PageHeader title="Novo processo" back={{ href: "/processos", label: "Processos" }} />
      <Card className="max-w-5xl">
        <CardBody>
          <ProcessoForm />
        </CardBody>
      </Card>
    </>
  );
}

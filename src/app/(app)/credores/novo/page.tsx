import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { CredorForm } from "@/modules/credores/components/credor-form";

export const metadata: Metadata = { title: "Novo credor" };

export default async function NovoCredorPage() {
  if (!podeEditar(await getPerfil())) redirect("/credores");
  return (
    <>
      <PageHeader title="Novo credor" back={{ href: "/credores", label: "Credores" }} />
      <Card className="max-w-3xl">
        <CardBody>
          <CredorForm />
        </CardBody>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, podeEditar } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form";
import { EmprestimoForm } from "@/modules/emprestimos/components/emprestimo-form";

export const metadata: Metadata = { title: "Novo empréstimo" };

export default async function NovoEmprestimoPage() {
  if (!podeEditar(await getPerfil())) redirect("/emprestimos");
  const supabase = await createClient();
  const { data: credores } = await supabase.from("credores").select("id, nome").is("excluido_em", null).order("nome");

  return (
    <>
      <PageHeader title="Novo empréstimo" back={{ href: "/emprestimos", label: "Empréstimos" }} />
      <Card className="max-w-5xl">
        <CardBody>
          {credores && credores.length > 0 ? (
            <EmprestimoForm credores={credores} />
          ) : (
            <FormAlert tone="info">
              Cadastre um credor antes de registrar o empréstimo.{" "}
              <Link href="/credores/novo" className="font-medium underline">
                Cadastrar credor
              </Link>
            </FormAlert>
          )}
        </CardBody>
      </Card>
    </>
  );
}

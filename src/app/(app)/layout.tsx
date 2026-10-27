import { AppShell } from "@/components/layout/app-shell";
import { requirePerfil } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requirePerfil();
  return <AppShell perfil={perfil}>{children}</AppShell>;
}

import { Marca } from "@/components/layout/marca";

/** Moldura comum das telas públicas de autenticação. */
export function AuthShell({
  subtitulo,
  children,
  rodape,
}: {
  subtitulo: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-tinta-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Marca className="h-12 w-12 p-2.5" />
          <h1 className="font-display mt-4 text-2xl font-bold text-white">Gestão Financeira</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitulo}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl shadow-black/30">{children}</div>
        {rodape && <div className="mt-5 text-center text-sm text-slate-400 [&_a]:text-brand-300 [&_a:hover]:text-white">{rodape}</div>}
      </div>
    </div>
  );
}

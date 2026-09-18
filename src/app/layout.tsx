import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import MouseGlow from "@/components/MouseGlow";
import { getPagamentos } from "@/lib/data";

export const metadata: Metadata = {
  title: "Comprovantes TRE · Busca de pagamentos",
  description:
    "Consulta rápida de comprovantes de salário, vale-transporte e auxílio por nome ou CPF.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pagamentos = await getPagamentos();
  const totalAlertas = pagamentos.filter((p) => p.situacao === "Cancelado" || p.situacao === "Rejeitado").length;

  return (
    <html lang="pt-BR">
      <body>
        <MouseGlow />
        <div className="content-layer flex min-h-dvh flex-col">
          <header className="sticky top-0 z-30 border-b border-onyx-border/80 bg-onyx/85 backdrop-blur-md">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
              <Link href="/" className="group flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-orange/40 bg-orange/10 font-display text-sm font-bold text-orange transition group-hover:bg-orange/20">
                  ₢
                </span>
                <span className="font-display text-[15px] font-semibold tracking-tight text-paper sm:text-base">
                  Comprovantes<span className="text-orange"> TRE</span>
                </span>
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <Link
                  href="/"
                  className="rounded-md px-3 py-1.5 text-muted transition hover:bg-onyx-elevated hover:text-paper"
                >
                  Buscar
                </Link>
                <Link
                  href="/alertas"
                  className="relative rounded-md px-3 py-1.5 text-muted transition hover:bg-onyx-elevated hover:text-paper"
                >
                  Alertas
                  {totalAlertas > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                      {totalAlertas > 99 ? "99+" : totalAlertas}
                    </span>
                  )}
                </Link>
                <Link
                  href="/pendencias"
                  className="rounded-md px-3 py-1.5 text-muted transition hover:bg-onyx-elevated hover:text-paper"
                >
                  Pendências
                </Link>
                <Link
                  href="/anexar"
                  className="rounded-md border border-orange/30 bg-orange/10 px-3 py-1.5 font-medium text-orange transition hover:bg-orange/20"
                >
                  Anexar arquivos
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-onyx-border/60 px-4 py-6 text-center text-xs text-muted sm:px-6">
            Ferramenta interna de consulta de comprovantes — os dados exibidos vêm dos PDFs e planilhas
            anexados ao projeto.
          </footer>
        </div>
      </body>
    </html>
  );
}

import { NextResponse } from "next/server";
import { getDocumentos, getFuncionarios, getPagamentos } from "@/lib/data";
import { gerarPlanilhaGeral } from "@/lib/exportExcel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const [funcionarios, pagamentos, documentos] = await Promise.all([
    getFuncionarios(),
    getPagamentos(),
    getDocumentos(),
  ]);

  const buffer = await gerarPlanilhaGeral(funcionarios, pagamentos, documentos);

  const dataArquivo = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="comprovantes-tre-${dataArquivo}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

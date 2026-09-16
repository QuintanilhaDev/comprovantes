import { NextRequest, NextResponse } from "next/server";
import { getDocumentos, getFuncionarios, getPagamentos } from "@/lib/data";
import { gerarPlanilhaGeral } from "@/lib/exportExcel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const [funcionarios, pagamentos, documentos] = await Promise.all([
    getFuncionarios(),
    getPagamentos(),
    getDocumentos(),
  ]);

  const mesParam = req.nextUrl.searchParams.get("mes");
  const filtroMes = mesParam === "08" || mesParam === "09" ? mesParam : null;

  const buffer = await gerarPlanilhaGeral(funcionarios, pagamentos, documentos, filtroMes);

  const dataArquivo = new Date().toISOString().slice(0, 10);
  const sufixo = filtroMes === "08" ? "-agosto" : filtroMes === "09" ? "-setembro" : "";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="comprovantes-tre${sufixo}-${dataArquivo}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { getDocumentos, getFuncionarios, getPagamentos } from "@/lib/data";
import { isUsingBlob, isUsingEphemeralStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const [funcionarios, pagamentos, documentos] = await Promise.all([
    getFuncionarios(),
    getPagamentos(),
    getDocumentos(),
  ]);

  const ativos = funcionarios.filter((f) => f.status === "ATIVO").length;
  const alertas = pagamentos.filter((p) => p.situacao === "Cancelado" || p.situacao === "Rejeitado").length;

  return NextResponse.json({
    totalFuncionarios: funcionarios.length,
    ativos,
    totalDocumentos: documentos.length,
    totalPagamentos: pagamentos.length,
    alertas,
    armazenamentoPersistente: isUsingBlob(),
    armazenamentoTemporario: isUsingEphemeralStorage(),
  });
}

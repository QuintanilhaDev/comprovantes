import { NextRequest, NextResponse } from "next/server";
import { getDocumentos, getFuncionarios, getPagamentos } from "@/lib/data";
import { searchFuncionarios } from "@/lib/search";
import { employeeId } from "@/lib/employeeId";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) {
    return NextResponse.json({ resultados: [] });
  }

  const [funcionarios, pagamentos, documentos] = await Promise.all([
    getFuncionarios(),
    getPagamentos(),
    getDocumentos(),
  ]);

  const ranked = searchFuncionarios(q, funcionarios, 20);

  const resultados = ranked.map(({ funcionario, score }) => {
    const cpf = funcionario.cpf;
    const pagsDoFunc = pagamentos.filter((p) => (cpf && p.cpf === cpf) || p.nomeNorm === funcionario.nomeNorm);
    const docsDoFunc = documentos.filter((d) => (cpf && d.cpf === cpf) || d.nomeNorm === funcionario.nomeNorm);
    const alertas = pagsDoFunc.filter((p) => p.situacao === "Cancelado" || p.situacao === "Rejeitado").length;
    const datas = [...pagsDoFunc.map((p) => p.data), ...docsDoFunc.map((d) => d.data)].filter(
      Boolean
    ) as string[];
    const ultimaAtualizacao = datas.sort().at(-1) || null;

    return {
      id: employeeId(funcionario),
      funcionario,
      score,
      resumo: {
        totalDocumentos: docsDoFunc.length,
        totalPagamentos: pagsDoFunc.length,
        ultimaAtualizacao,
        alertas,
      },
    };
  });

  return NextResponse.json({ resultados });
}

import { NextRequest, NextResponse } from "next/server";
import { getExtratoFuncionario, getFuncionarios } from "@/lib/data";
import { employeeId, findEmployeeById } from "@/lib/employeeId";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const funcionarios = await getFuncionarios();
  const funcionario = findEmployeeById(funcionarios, id);

  const { pagamentos, documentos } = await getExtratoFuncionario(funcionario, id);

  if (!funcionario && pagamentos.length === 0 && documentos.length === 0) {
    return NextResponse.json({ erro: "Funcionário não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    id: funcionario ? employeeId(funcionario) : id,
    funcionario,
    pagamentos,
    documentos,
  });
}

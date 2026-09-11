import { NextRequest, NextResponse } from "next/server";
import { getDocumentos, getFuncionarios, getPagamentos } from "@/lib/data";
import { employeeId, findEmployeeById } from "@/lib/employeeId";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [funcionarios, pagamentos, documentos] = await Promise.all([
    getFuncionarios(),
    getPagamentos(),
    getDocumentos(),
  ]);

  const funcionario = findEmployeeById(funcionarios, id);

  if (!funcionario) {
    // Pode ser um funcionário que só existe em uploads avulsos (sem cadastro na planilha).
    const pagsSoltos = pagamentos.filter((p) => p.cpf === id);
    const docsSoltos = documentos.filter((d) => d.cpf === id);
    if (pagsSoltos.length === 0 && docsSoltos.length === 0) {
      return NextResponse.json({ erro: "Funcionário não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ funcionario: null, pagamentos: pagsSoltos, documentos: docsSoltos });
  }

  const cpf = funcionario.cpf;
  const pagamentosDoFuncionario = pagamentos
    .filter((p) => (cpf && p.cpf === cpf) || p.nomeNorm === funcionario.nomeNorm)
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  const documentosDoFuncionario = documentos
    .filter((d) => (cpf && d.cpf === cpf) || d.nomeNorm === funcionario.nomeNorm)
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  return NextResponse.json({
    id: employeeId(funcionario),
    funcionario,
    pagamentos: pagamentosDoFuncionario,
    documentos: documentosDoFuncionario,
  });
}

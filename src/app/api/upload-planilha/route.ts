import { NextRequest, NextResponse } from "next/server";
import { parseEmployeesSpreadsheet } from "@/lib/sheetExtract";
import { mesclarNovaPlanilha } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ erro: "Nenhuma planilha recebida." }, { status: 400 });
  }

  const nomeOk = /\.xlsx?$/i.test(file.name);
  if (!nomeOk) {
    return NextResponse.json({ erro: "Envie um arquivo .xlsx ou .xls." }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { funcionarios, avisos } = parseEmployeesSpreadsheet(bytes);

    if (funcionarios.length === 0) {
      return NextResponse.json({ erro: "Planilha vazia ou em formato inesperado.", avisos }, { status: 400 });
    }

    // Mescla em vez de substituir: quem já existe (mesmo CPF) é atualizado
    // campo a campo (com validação de formato), quem é novo é adicionado, e
    // quem não está na planilha nova continua cadastrado.
    const { novosAdicionados, atualizados, mantidosSemAlteracao, resultado } = await mesclarNovaPlanilha(
      funcionarios
    );

    return NextResponse.json({
      ok: true,
      totalNaPlanilhaEnviada: funcionarios.length,
      totalFuncionarios: resultado.length,
      novosAdicionados,
      atualizados,
      mantidosSemAlteracao,
      avisos,
    });
  } catch (err) {
    return NextResponse.json({ erro: `Não foi possível ler a planilha: ${(err as Error).message}` }, { status: 500 });
  }
}

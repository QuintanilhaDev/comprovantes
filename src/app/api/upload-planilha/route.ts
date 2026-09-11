import { NextRequest, NextResponse } from "next/server";
import { parseEmployeesSpreadsheet } from "@/lib/sheetExtract";
import { replaceFuncionarios } from "@/lib/data";

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

    await replaceFuncionarios(funcionarios);

    return NextResponse.json({
      ok: true,
      totalFuncionarios: funcionarios.length,
      avisos,
    });
  } catch (err) {
    return NextResponse.json({ erro: `Não foi possível ler a planilha: ${(err as Error).message}` }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { classificarDocumentoManualmente } from "@/lib/data";
import type { TipoBeneficio } from "@/lib/types";

export const dynamic = "force-dynamic";

const TIPOS_VALIDOS: TipoBeneficio[] = ["SALARIO", "VT", "AUXILIO", "NAO_IDENTIFICADO"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docId = decodeURIComponent(id);

  const body = await req.json().catch(() => null);
  const tipo = body?.tipo;

  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ erro: "Tipo inválido." }, { status: 400 });
  }

  await classificarDocumentoManualmente(docId, tipo);
  return NextResponse.json({ ok: true });
}

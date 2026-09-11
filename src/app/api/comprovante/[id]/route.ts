import { NextRequest, NextResponse } from "next/server";
import { readFileBytes } from "@/lib/storage";
import { getDocumentos } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docId = decodeURIComponent(id);

  const documentos = await getDocumentos();
  const doc = documentos.find((d) => d.id === docId);

  if (!doc) {
    return NextResponse.json({ erro: "Comprovante não encontrado." }, { status: 404 });
  }

  const bytes = await readFileBytes(doc.origemUpload ? "upload" : "baseline", doc.arquivoRelativo);

  if (!bytes) {
    return NextResponse.json({ erro: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.nome || "comprovante")}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

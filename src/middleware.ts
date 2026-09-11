import { NextRequest, NextResponse } from "next/server";

/**
 * Proteção simples por usuário/senha (HTTP Basic Auth).
 *
 * Este projeto expõe CPF, dados bancários e valores de pagamento de
 * funcionários reais — não deve ficar acessível publicamente sem alguma
 * proteção. Configure APP_USER e APP_PASSWORD (no .env.local ou nas
 * variáveis de ambiente do Vercel) para exigir login antes de qualquer
 * acesso. Se essas variáveis não estiverem definidas, o middleware não
 * bloqueia nada (útil para desenvolvimento local rápido) — mas ANTES de
 * hospedar publicamente, defina as duas variáveis.
 */

export function middleware(req: NextRequest) {
  const user = process.env.APP_USER;
  const pass = process.env.APP_PASSWORD;

  if (!user || !pass) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const sep = decoded.indexOf(":");
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === pass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Comprovantes TRE"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

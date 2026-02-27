import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CANONICAL_DOMAIN = "task-tiziano.vercel.app";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";

  // Se la richiesta arriva da un dominio diverso da quello canonico,
  // redireziona mantenendo path e query string
  const isLocal = hostname.startsWith("localhost") || hostname.startsWith("127.0.0.1");
  if (hostname && hostname !== CANONICAL_DOMAIN && !isLocal) {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_DOMAIN;
    url.port = "";
    return NextResponse.redirect(url, { status: 301 });
  }

  return NextResponse.next();
}

export const config = {
  // Applica il middleware a tutte le route tranne le risorse statiche
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

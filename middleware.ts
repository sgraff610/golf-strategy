import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Watch API: bypass session check with API key header
  if (pathname.startsWith("/api/watch/")) {
    const key = request.headers.get("X-Watch-Key");
    if (key && key === process.env.WATCH_API_KEY) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Internal server-to-server calls (e.g. watch/strategy calling /api/strategy)
  const internalKey = request.headers.get("X-Internal-Key");
  if (internalKey && internalKey === process.env.INTERNAL_KEY) return NextResponse.next();

  // Supabase stores the session in a cookie named sb-<project-ref>-auth-token
  const hasSession = request.cookies.getAll().some(
    c => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  if (!hasSession && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { NextRequest, NextResponse } from "next/server";

const PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const COOKIE = "lp_auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public: login page, backend API proxy, and public landing pages
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/p/") ||
    pathname === "/_next" ||
    pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }

  // Check auth cookie
  const token = req.cookies.get(COOKIE)?.value;
  if (token === PASSWORD) {
    return NextResponse.next();
  }

  // Redirect to login
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

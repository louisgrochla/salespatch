import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Single role-aware middleware. Public-by-default routes (research,
// supervisor login, public API) are excluded via the matcher and
// never reach this code.
//
// Everything that DOES reach here:
//   - /supervisor/* requires role=supervisor (founder cannot peek)
//   - everything else requires role=founder
// Cross-role access redirects to the appropriate login page so the
// user gets a clear next step.

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const role = (token?.role as "founder" | "supervisor" | undefined) ?? null;

  if (pathname.startsWith("/supervisor")) {
    if (role === "supervisor") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/supervisor/login";
    url.search = `?callbackUrl=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Founder zone (everything else that matches).
  if (role === "founder") return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?callbackUrl=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

// Public-by-default routes are EXCLUDED from the matcher. Anything that
// matches passes the role gate above.
export const config = {
  matcher: [
    "/((?!api/auth|api/ingest|api/public|login|research|supervisor/login|_next/static|_next/image|favicon.ico|robots.txt|$).*)",
  ],
};

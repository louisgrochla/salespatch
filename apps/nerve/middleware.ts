import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

// Protect everything except auth routes, the webhook, the login page,
// and Next internals.
export const config = {
  matcher: [
    "/((?!api/auth|api/ingest|login|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};

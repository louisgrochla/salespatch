import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

// Two credentials providers in one NextAuth instance:
// - "founder"    → unrestricted access to NERVE
// - "supervisor" → read-only /supervisor/* surface
//
// Roles are encoded in the JWT and the session. Middleware enforces
// per-route role gates.

export type AppRole = "founder" | "supervisor";

export const authOptions: NextAuthOptions = {
  session: {
    // 24h for founder is fine; supervisor is treated identically at the
    // session layer but the middleware enforces an 8h idle limit by
    // checking the iat (issued-at) claim. Keeping a single jwt.maxAge
    // means we don't need two cookie jars.
    strategy: "jwt",
    maxAge: 60 * 60 * 24,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/login", // founder default; supervisor login uses its own page
  },
  providers: [
    CredentialsProvider({
      id: "founder",
      name: "Founder",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const expectedEmail = process.env.FOUNDER_EMAIL;
        const expectedPassword = process.env.FOUNDER_PASSWORD;
        if (!expectedEmail || !expectedPassword) return null;
        if (!credentials?.email || !credentials.password) return null;
        if (
          credentials.email.toLowerCase() === expectedEmail.toLowerCase() &&
          constantTimeEqual(credentials.password, expectedPassword)
        ) {
          return { id: "founder", email: expectedEmail, name: "Founder", role: "founder" } as never;
        }
        return null;
      },
    }),
    CredentialsProvider({
      id: "supervisor",
      name: "Supervisor",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const expectedEmail = process.env.SUPERVISOR_EMAIL;
        const expectedPassword = process.env.SUPERVISOR_PASSWORD;
        if (!expectedEmail || !expectedPassword) return null;
        if (!credentials?.email || !credentials.password) return null;
        if (
          credentials.email.toLowerCase() === expectedEmail.toLowerCase() &&
          constantTimeEqual(credentials.password, expectedPassword)
        ) {
          return { id: "supervisor", email: expectedEmail, name: "Supervisor", role: "supervisor" } as never;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        const role = (user as unknown as { role?: AppRole }).role;
        if (role) token.role = role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: AppRole }).role = (token.role as AppRole) ?? "founder";
      }
      return session;
    },
  },
};

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

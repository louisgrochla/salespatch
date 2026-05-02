import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

// Single-founder auth. Compares against env vars directly — no user table
// lookup, no registration. The User table exists for future audit needs
// but is not consulted here.
//
// Password is plaintext in env (FOUNDER_PASSWORD). That's deliberate:
// it's a single-tenant deployment, the env is private to the founder, and
// hashing serves no purpose without a multi-user store.

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24, // 24 hours, per spec
    updateAge: 60 * 60, // refresh JWT on activity within the window
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
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
        const emailOk = credentials.email.toLowerCase() === expectedEmail.toLowerCase();
        const pwOk = constantTimeEqual(credentials.password, expectedPassword);
        if (!emailOk || !pwOk) return null;
        return { id: "founder", email: expectedEmail, name: "Founder" };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.id as string;
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

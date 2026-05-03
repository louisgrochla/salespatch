import "../../globals.css";
import Link from "next/link";
import { requireSession } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "NERVE — Supervisor View",
  robots: { index: false, follow: false },
};

export default async function SupervisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession({ role: "supervisor" });

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-border bg-bg-panel">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-mono text-2xs uppercase tracking-wider text-fg-dim">
              supervisor view · read only
            </div>
            <div className="font-sans text-base font-medium text-fg leading-tight">
              NERVE — Robert Gordon University Dissertation Access
            </div>
          </div>
          <Link
            href="/api/auth/signout?callbackUrl=/supervisor/login"
            className="font-mono text-2xs uppercase tracking-wider text-fg-dim hover:text-fg
                       border border-border hover:border-border-strong px-2 py-1"
          >
            sign out
          </Link>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</div>
    </div>
  );
}

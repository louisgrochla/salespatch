import Link from "next/link";
import { GraduationCap, Lock, LineChart, type LucideIcon } from "lucide-react";

// Public landing page. Three doors:
//  - Founder    → /dashboard (middleware bounces to /login if unauthed)
//  - Research   → /research (fully public)
//  - Supervisor → /supervisor (middleware bounces to /supervisor/login)
//
// No header, no sidebar — this is the only public-facing surface alongside
// /research, so it has to look approachable rather than command-centre.

export const metadata = {
  title: "NERVE — SL-MAS",
  description: "Choose your view: founder, public research dashboard, or supervisor.",
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-bg text-fg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-10 sm:mb-14">
          <div className="font-mono text-2xs uppercase tracking-wider text-fg-dim mb-2">
            sl-mas / nerve
          </div>
          <h1 className="font-sans text-4xl sm:text-5xl font-medium text-fg leading-tight">
            Choose your view
          </h1>
          <p className="font-sans text-sm text-fg-muted mt-3 max-w-md mx-auto">
            NERVE is the central intelligence layer for SL-MAS — operational
            data, dissertation evidence, and the public research dashboard,
            in one place.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <DoorTile
            href="/dashboard"
            icon={Lock}
            label="Founder"
            tagline="full intranet"
            description="Operational + dissertation. Authentication required."
          />
          <DoorTile
            href="/research"
            icon={LineChart}
            label="Research"
            tagline="public · no login"
            description="Live anonymised research dashboard. Examiners welcome."
          />
          <DoorTile
            href="/supervisor"
            icon={GraduationCap}
            label="Supervisor"
            tagline="read-only"
            description="Read-only supervisor view. Separate credentials."
          />
        </div>

        <footer className="mt-12 text-center font-mono text-2xs text-fg-dim">
          <a href="https://salespatch.co.uk" className="text-accent hover:underline">
            salespatch.co.uk
          </a>
        </footer>
      </div>
    </main>
  );
}

function DoorTile({
  href, icon: Icon, label, tagline, description,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tagline: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group block border border-border bg-bg-panel hover:bg-bg-hover hover:border-border-strong
                 p-5 sm:p-6 transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <Icon size={22} className="text-fg-muted group-hover:text-fg transition-colors" />
        <span className="font-mono text-2xs uppercase tracking-wider text-fg-dim">{tagline}</span>
      </div>
      <div className="font-sans text-2xl font-medium text-fg leading-tight">{label}</div>
      <p className="font-sans text-sm text-fg-muted mt-2 leading-relaxed">{description}</p>
      <div className="font-mono text-2xs uppercase tracking-wider text-fg-dim group-hover:text-accent mt-5 transition-colors">
        enter →
      </div>
    </Link>
  );
}

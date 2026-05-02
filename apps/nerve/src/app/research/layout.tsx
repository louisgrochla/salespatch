import "../globals.css";

// Public-facing layout — no sidebar, no auth gate. Slightly more
// readable than the dense founder UI; still dark.

export const metadata = {
  title: "SL-MAS Research Dashboard",
  description: "Live primary data collection for an undergraduate dissertation evaluating the SL-MAS platform.",
  robots: { index: true, follow: true },
};

export default function ResearchPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-bg text-fg font-sans">{children}</div>;
}

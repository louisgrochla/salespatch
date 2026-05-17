import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { LegalSubNav } from "./_components/SubNav";

export const dynamic = "force-dynamic";

export default async function LegalOverview() {
  const [docs, gdpr, agreements, ch, ip] = await Promise.all([
    prisma.legalDocument.count(),
    prisma.gdprRecord.count(),
    prisma.contractorAgreementVersion.count(),
    prisma.companiesHouseRecord.count(),
    prisma.ipDocument.count(),
  ]);
  return (
    <div className="p-6 space-y-6">
      <LegalSubNav />
      <PageHeader
        title="Legal & Compliance"
        subtitle="Documents, GDPR records, contractor agreements, Companies House filings, IP — everything an auditor would ask to see."
      />
      <section className="space-y-2">
        <div className="font-sans text-xs text-fg-muted max-w-2xl">
          The compliance evidence base. Keep the canonical version of every
          legal document, GDPR record, and contractor agreement here so the
          single source of truth lives inside NERVE, not in scattered Google
          Drive folders.
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border">
          <StatTile label="documents" value={docs.toLocaleString()} />
          <StatTile label="gdpr records" value={gdpr.toLocaleString()} />
          <StatTile label="contractor agreements" value={agreements.toLocaleString()} />
          <StatTile label="companies house" value={ch.toLocaleString()} />
          <StatTile label="ip" value={ip.toLocaleString()} />
        </div>
      </section>
    </div>
  );
}

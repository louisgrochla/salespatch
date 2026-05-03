import { PageHeader } from "@/components/PageHeader";
import { OperationsForm } from "../_components/OperationsForm";
import { createOperationsLog } from "../actions";

export const dynamic = "force-dynamic";

interface SearchParams { type?: string }

export default function NewOperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const initialType =
    searchParams.type === "decision" ||
    searchParams.type === "failure" ||
    searchParams.type === "iteration" ||
    searchParams.type === "weekly"
      ? searchParams.type
      : "weekly";

  return (
    <div className="p-6">
      <PageHeader
        title="New Operations Entry"
        subtitle="Pick a type — fields adapt accordingly. Embeds on save."
      />
      <OperationsForm
        action={createOperationsLog}
        initial={{ type: initialType }}
        cancelHref="/operations"
        submitLabel="Create entry"
      />
    </div>
  );
}

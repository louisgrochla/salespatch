import { PageHeader } from "@/components/PageHeader";
import { NoteForm } from "../_components/NoteForm";
import { createNote } from "../actions";

export const dynamic = "force-dynamic";

interface SearchParams { scope?: string; relatedSlug?: string }

const SCOPES = ["lead", "system", "pitch", "research", "other"] as const;
type Scope = (typeof SCOPES)[number];
function isScope(v: string | undefined): v is Scope {
  return SCOPES.includes(v as Scope);
}

export default function NewNotePage({ searchParams }: { searchParams: SearchParams }) {
  const initialScope: Scope = isScope(searchParams.scope) ? searchParams.scope : "system";

  return (
    <div className="p-6">
      <PageHeader
        title="New note"
        subtitle="Markdown body. Embeds on save → searchable via /search and /ask."
      />
      <NoteForm
        action={createNote}
        initial={{
          scope: initialScope,
          relatedSlug: searchParams.relatedSlug ?? "",
        }}
        cancelHref="/notes"
        submitLabel="Create note"
      />
    </div>
  );
}

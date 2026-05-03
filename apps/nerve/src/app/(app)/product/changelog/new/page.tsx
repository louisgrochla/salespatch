import { PageHeader } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { ChangelogForm } from "../_form";
import { createChangelog } from "../actions";
export const dynamic = "force-dynamic";
export default function NewChangelogPage() {
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="New Changelog Entry" />
      <ChangelogForm action={createChangelog} cancelHref="/product/changelog" submitLabel="Create entry" />
    </div>
  );
}

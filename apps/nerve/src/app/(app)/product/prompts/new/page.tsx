import { PageHeader } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { PromptForm } from "../_form";
import { createPrompt } from "../actions";

export const dynamic = "force-dynamic";

export default function NewPromptPage() {
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title="New Prompt" subtitle="Initial save creates v1." />
      <PromptForm action={createPrompt} cancelHref="/product/prompts" submitLabel="Create prompt" />
    </div>
  );
}

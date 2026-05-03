import { PageHeader } from "@/components/PageHeader";
import { DemoForm } from "../_form";
import { createDemo } from "../actions";

export const dynamic = "force-dynamic";

export default function NewDemoPage() {
  return (
    <div className="p-6">
      <PageHeader title="New Demo" />
      <DemoForm action={createDemo} cancelHref="/demos" submitLabel="Log demo" />
    </div>
  );
}

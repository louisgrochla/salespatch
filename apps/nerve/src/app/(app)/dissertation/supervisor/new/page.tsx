import { PageHeader } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { MeetingForm } from "../_form";
import { createMeeting } from "../actions";

export const dynamic = "force-dynamic";

export default function NewMeetingPage() {
  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader title="New Supervisor Meeting" />
      <MeetingForm action={createMeeting} cancelHref="/dissertation/supervisor" submitLabel="Log meeting" />
    </div>
  );
}

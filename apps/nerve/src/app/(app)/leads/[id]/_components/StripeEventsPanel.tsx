import { Section, formatIso } from "./primitives";
import { cn } from "@/lib/cn";
import type { StripeEventRow } from "@/lib/sl-mas/stripeEventStore";

function statusColor(status: string | undefined): string {
  switch (status) {
    case "paid":
    case "succeeded":
    case "complete":
      return "text-status-closed";
    case "failed":
    case "canceled":
      return "text-status-rejected";
    case "pending":
    case "requires_action":
      return "text-status-pending";
    default:
      return "text-fg-muted";
  }
}

function amount(pence: number | undefined, currency: string | undefined): string {
  if (pence === undefined) return "—";
  const sym = currency === "gbp" ? "£" : currency === "usd" ? "$" : "";
  return `${sym}${(pence / 100).toFixed(2)}`;
}

export function StripeEventsPanel({ events }: { events: StripeEventRow[] }) {
  if (events.length === 0) return null;
  return (
    <Section
      title="Stripe events"
      subtitle={`${events.length} payment event${events.length === 1 ? "" : "s"} tied to this lead's assignments`}
    >
      <div className="border border-border bg-bg-panel">
        <table className="nv-table">
          <thead>
            <tr>
              <th>at</th>
              <th>type</th>
              <th>status</th>
              <th className="text-right">amount</th>
              <th>session / sub</th>
              <th>event id</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.stripe_event_id}>
                <td className="font-mono text-2xs">{formatIso(e.occurred_at)}</td>
                <td className="font-mono text-xs">{e.type}</td>
                <td
                  className={cn(
                    "font-mono text-2xs uppercase",
                    statusColor(e.payment_status),
                  )}
                >
                  {e.payment_status ?? "—"}
                </td>
                <td className="text-right font-mono text-xs">
                  {amount(e.amount_total_pence, e.currency)}
                </td>
                <td className="font-mono text-2xs text-fg-muted truncate max-w-[14rem]">
                  {e.session_id ?? e.subscription_id ?? "—"}
                </td>
                <td className="font-mono text-2xs text-fg-dim truncate max-w-[12rem]">
                  {e.stripe_event_id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

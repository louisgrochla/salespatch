/**
 * Outbound email via Resend.
 *
 * Why Resend: simplest auth (single env var), DKIM/SPF auto-managed via DNS,
 * generous free tier (3k emails/mo) which covers the beta.
 *
 * Required env vars (Vercel — sales-dashboard project):
 *   RESEND_API_KEY        — re_xxx, from https://resend.com/api-keys
 *   EMAIL_FROM            — e.g. 'SalesPatch <hello@salespatch.co.uk>'
 *                           Domain must be verified in Resend Dashboard.
 *   EMAIL_SUPPORT         — e.g. 'support@salespatch.co.uk' (reply-to + body)
 *
 * If RESEND_API_KEY is unset, every helper here is a no-op (logged) so a
 * missing config never breaks the webhook flow that calls it.
 */
import { Resend } from 'resend';

let _client: Resend | null = null;
function getClient(): Resend | null {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _client = new Resend(key);
  return _client;
}

export const SUPPORT_EMAIL =
  process.env.EMAIL_SUPPORT ?? 'support@salespatch.co.uk';

const FROM = process.env.EMAIL_FROM ?? 'SalesPatch <hello@salespatch.co.uk>';

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

async function send(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const client = getClient();
  if (!client) {
    console.warn(
      `[email] RESEND_API_KEY not configured — would have sent "${args.subject}" to ${args.to}`,
    );
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }
  try {
    const { data, error } = await client.emails.send({
      from: FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo ?? SUPPORT_EMAIL,
    });
    if (error) {
      console.error(`[email] Resend error sending "${args.subject}" to ${args.to}: ${error.message}`);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[email] Send threw "${args.subject}" to ${args.to}: ${msg}`);
    return { ok: false, error: msg };
  }
}

// MARK: — Customer welcome (after Stripe payment confirmed)

export interface WelcomeArgs {
  to: string;
  businessName: string;
  amountPaidPence: number;
  setupFeePoundsLabel: string;     // e.g. "£299"
  monthlyPoundsLabel: string;      // e.g. "£25/mo"
  trialEndsLabel: string;          // e.g. "5 June 2026"
  deliveryByLabel: string;         // e.g. "12 May 2026"
  previewUrl: string;              // /preview/<assignmentId>
  assignmentId: string;            // shown as ref
}

export async function sendCustomerWelcome(args: WelcomeArgs): Promise<SendResult> {
  const subject = `Your website is being built — live within 7 days`;
  const html = welcomeHtml(args);
  const text = welcomeText(args);
  return send({ to: args.to, subject, html, text });
}

function welcomeHtml(a: WelcomeArgs): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(a.businessName)} — your site is being built</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:'Inter Tight','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0F0E0C;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="display:inline-block;padding:6px 12px;background:rgba(184,134,11,0.12);border:1px solid rgba(184,134,11,0.32);border-radius:9999px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#B8860B;font-weight:500;">
      Order confirmed
    </div>
    <h1 style="margin:24px 0 8px;font-size:32px;font-weight:500;letter-spacing:-0.03em;line-height:1.15;">
      Welcome, ${escapeHtml(a.businessName)}.
    </h1>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:rgba(15,14,12,0.7);">
      Thanks for going live with us. Your website will be built and delivered within <strong style="color:#0F0E0C;">7 days</strong>. We've already started.
    </p>

    <div style="margin:24px 0;padding:18px 20px;background:#fff;border:1px solid rgba(15,14,12,0.08);border-radius:14px;">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(15,14,12,0.5);margin-bottom:10px;font-family:'JetBrains Mono',ui-monospace,monospace;">
        Order summary
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:rgba(15,14,12,0.65);">Setup fee</td>
          <td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(a.setupFeePoundsLabel)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:rgba(15,14,12,0.65);">Hosting & support</td>
          <td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(a.monthlyPoundsLabel)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:rgba(15,14,12,0.65);">First charge for hosting</td>
          <td style="padding:6px 0;text-align:right;font-weight:500;">${escapeHtml(a.trialEndsLabel)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0 0;color:rgba(15,14,12,0.65);border-top:1px solid rgba(15,14,12,0.08);">Site live by</td>
          <td style="padding:10px 0 0;text-align:right;font-weight:600;color:#B8860B;border-top:1px solid rgba(15,14,12,0.08);">${escapeHtml(a.deliveryByLabel)}</td>
        </tr>
      </table>
    </div>

    <h2 style="margin:32px 0 12px;font-size:18px;font-weight:500;letter-spacing:-0.02em;">What happens next</h2>
    <ol style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.7;color:rgba(15,14,12,0.78);">
      <li>We finalise your site — copy, photos, design.</li>
      <li>You can request small design changes any time during the 7-day build by emailing <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#B8860B;">${escapeHtml(SUPPORT_EMAIL)}</a>.</li>
      <li>We email you the moment your site is live with your domain, login details, and how to manage it.</li>
      <li>30 days from today, your £25/mo hosting & support plan starts. We'll send a reminder a few days before.</li>
    </ol>

    <div style="margin:24px 0;padding:14px 18px;background:rgba(184,134,11,0.08);border:1px solid rgba(184,134,11,0.25);border-radius:12px;font-size:14px;line-height:1.5;color:rgba(15,14,12,0.78);">
      Want a tweak? Reply to this email or send a note to <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#B8860B;font-weight:500;">${escapeHtml(SUPPORT_EMAIL)}</a> any time during the 7-day window. We fold changes in before launch — no extra cost.
    </div>

    <p style="margin:32px 0 0;font-size:13px;line-height:1.6;color:rgba(15,14,12,0.55);">
      Any questions, just reply. A real person reads every email.
    </p>
    <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:rgba(15,14,12,0.55);">
      — The SalesPatch team
    </p>

    <hr style="border:0;border-top:1px solid rgba(15,14,12,0.08);margin:36px 0 16px;">
    <p style="margin:0;font-size:11px;color:rgba(15,14,12,0.4);font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:0.04em;">
      Reference: ${escapeHtml(a.assignmentId)}<br>
      Preview: <a href="${escapeHtml(a.previewUrl)}" style="color:rgba(15,14,12,0.55);">${escapeHtml(a.previewUrl)}</a>
    </p>
  </div>
</body>
</html>`;
}

function welcomeText(a: WelcomeArgs): string {
  return `Welcome, ${a.businessName}.

Thanks for going live with us. Your website will be built and delivered within 7 days. We've already started.

Order summary
  Setup fee:                 ${a.setupFeePoundsLabel}
  Hosting & support:         ${a.monthlyPoundsLabel}
  First hosting charge:      ${a.trialEndsLabel}
  Site live by:              ${a.deliveryByLabel}

What happens next
  1. We finalise your site — copy, photos, design.
  2. You can request small design changes any time during the 7-day build
     by emailing ${SUPPORT_EMAIL}.
  3. We email you the moment your site is live with your domain, login,
     and how to manage it.
  4. 30 days from today, your £25/mo hosting & support plan starts.
     We'll send a reminder a few days before.

Want a tweak? Reply to this email or send a note to ${SUPPORT_EMAIL} any
time during the 7-day window. We fold changes in before launch — no extra
cost.

Any questions, just reply. A real person reads every email.
— The SalesPatch team

Reference: ${a.assignmentId}
Preview:   ${a.previewUrl}
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

'use client';

import { useState } from 'react';
import {
  Card,
  Section,
  PageHero,
  Eyebrow,
  PrimaryButton,
  GhostButton,
  CREAM,
  CREAM_DIM,
  SIGNAL,
  LINE,
  DISPLAY_FONT,
  MONO_FONT,
} from '@/lib/brand';

const FAQS = [
  {
    id: 'leads-first',
    category: 'Getting Started',
    question: 'How do I get my first leads?',
    answer:
      "Leads are assigned to your area automatically — open the dashboard and you'll see them appear. We recommend starting with businesses that have strong Google ratings and are within walking distance.",
  },
  {
    id: 'what-to-say',
    category: 'Getting Started',
    question: 'What should I say when I walk in?',
    answer:
      "Friendly and direct: \"Hi, I'm [name]. I help local businesses get online. I've actually built a demo website for [Business Name] — can I show you real quick?\" Then hand over the phone. The demo does the talking.",
  },
  {
    id: 'how-paid',
    category: 'Payments',
    question: 'How do I get paid?',
    answer:
      'You earn £50 per closed deal — paid out the moment the owner signs, withdrawable to your bank in one tap. No tiers, no quotas, no clawback.',
  },
  {
    id: 'how-quick',
    category: 'Payments',
    question: 'When does the £50 land?',
    answer:
      "The moment the owner signs. You see it in your wallet before you leave the shop. Bank withdrawal is one tap — typically in your account the same day.",
  },
  {
    id: 'no-website',
    category: 'Pitching',
    question: 'What if a business already has a website?',
    answer:
      "No problem — most already do. Compare their site to the demo we built for them. If the demo's more modern and they see that, the conversation gets easy. Don't dismiss what they have, show them what's next.",
  },
  {
    id: 'how-much',
    category: 'Pitching',
    question: 'How much do I tell them it costs?',
    answer:
      '£350 upfront, around £27.50/month. That covers hosting, domain, the site itself, and updates. The demo reveals the price after fifteen seconds of scrolling — the site sells the price.',
  },
  {
    id: 'no-right-to-work',
    category: 'Account',
    question: 'Can I work without right to work in the UK?',
    answer:
      'Unfortunately not — right to work in the UK is a legal requirement for contractors. If your status changes (visa grant, settled status, anything), email hello@salesflow.co and we can pick up where you left off.',
  },
];

const CATEGORIES = ['Getting Started', 'Pitching', 'Payments', 'Account'];

export default function HelpPage() {
  const [open, setOpen] = useState<string | null>(FAQS[0].id);

  return (
    <div className="py-10">
      <PageHero
        eyebrow="Help"
        title="Need a hand?"
        accent="We've got you."
        sub="The short answers to the questions every contractor asks in their first week. If what you need isn't here, reach out — we reply fast."
      />

      <div className="grid gap-4 md:grid-cols-3 mb-12">
        <ContactCard
          eyebrow="Email"
          title="hello@salesflow"
          sub="Replies within a few hours, 7 days a week."
          href="mailto:hello@salesflow.co"
        />
        <ContactCard
          eyebrow="Urgent"
          title="Text us"
          sub="If it's mid-pitch and you're stuck, text for a 2-minute reply."
          href="sms:+447700900000"
        />
        <ContactCard
          eyebrow="Field guide"
          title="The playbook"
          sub="Every step from knock to close, with scripts."
          href="/site/guide.html"
        />
      </div>

      {CATEGORIES.map((cat) => {
        const items = FAQS.filter((f) => f.category === cat);
        return (
          <div key={cat} className="mb-10">
            <Section eyebrow={cat}>
              <div className="flex flex-col gap-3">
                {items.map((f) => (
                  <FaqItem
                    key={f.id}
                    faq={f}
                    open={open === f.id}
                    onClick={() => setOpen(open === f.id ? null : f.id)}
                  />
                ))}
              </div>
            </Section>
          </div>
        );
      })}

      <Card accent padding="lg" className="mt-12 text-center">
        <Eyebrow accent>Still stuck?</Eyebrow>
        <p
          className="text-[22px] m-0 mb-2"
          style={{ fontFamily: DISPLAY_FONT, color: CREAM, fontWeight: 500, letterSpacing: '-0.02em' }}
        >
          We'll unstick you within a few hours.
        </p>
        <p className="text-[14px] mb-6" style={{ color: CREAM_DIM }}>
          Email, text, or tap the chat button in the corner of any lead. Real humans, not a form.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <PrimaryButton href="mailto:hello@salesflow.co">Email support →</PrimaryButton>
          <GhostButton href="sms:+447700900000">Text us</GhostButton>
        </div>
      </Card>
    </div>
  );
}

function ContactCard({
  eyebrow,
  title,
  sub,
  href,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  href: string;
}) {
  return (
    <a href={href} className="no-underline block">
      <Card className="transition-colors h-full" style={{ cursor: 'pointer' }}>
        <div
          className="text-[10px] uppercase mb-2"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
        >
          / {eyebrow}
        </div>
        <p
          className="text-[18px] m-0 mb-1"
          style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
        >
          {title}
        </p>
        <p className="text-[13px] m-0" style={{ color: CREAM_DIM, lineHeight: 1.55 }}>
          {sub}
        </p>
      </Card>
    </a>
  );
}

function FaqItem({
  faq,
  open,
  onClick,
}: {
  faq: (typeof FAQS)[number];
  open: boolean;
  onClick: () => void;
}) {
  return (
    <Card padding="none">
      <button
        onClick={onClick}
        className="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span
          className="text-[15.5px]"
          style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500, letterSpacing: '-0.015em' }}
        >
          {faq.question}
        </span>
        <span
          className="text-[18px] flex-shrink-0 transition-transform"
          style={{ color: SIGNAL, transform: open ? 'rotate(45deg)' : 'rotate(0)' }}
        >
          +
        </span>
      </button>
      {open && (
        <div
          className="px-6 pb-5 text-[14px]"
          style={{ color: CREAM_DIM, lineHeight: 1.6, borderTop: `1px solid ${LINE}`, paddingTop: 16 }}
        >
          {faq.answer}
        </div>
      )}
    </Card>
  );
}

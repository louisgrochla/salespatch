'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface DemoData {
  business_name: string;
  demo_domain: string | null;
  status: string;
}

export default function CustomerDemoPage() {
  const params = useParams();
  const code = params.code as string;
  const [demo, setDemo] = useState<DemoData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'viewing' | 'buying' | 'done'>('viewing');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch(`/api/demo-links/${code}`)
      .then(r => {
        if (r.status === 410) throw new Error('expired');
        if (r.status === 404) throw new Error('not_found');
        return r.json();
      })
      .then(d => setDemo(d.data))
      .catch(e => setError(e.message === 'expired' ? 'expired' : 'not_found'))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/demo-links/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
    } catch { /* */ }
    setSubmitting(false);
    setPhase('done');
  }

  if (loading) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-neutral-200 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-white flex items-center justify-center px-8">
        <div className="text-center max-w-[280px]">
          <p className="text-[28px] font-semibold tracking-[-0.03em] text-neutral-900 mb-2.5 leading-[1.1]">
            {error === 'expired' ? 'This link has expired.' : 'Link not found.'}
          </p>
          <p className="text-[14px] text-neutral-400 leading-relaxed">
            Ask the person who sent this for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  if (!demo) return null;

  const demoSiteUrl = demo.demo_domain ? `/demo-sites/${demo.demo_domain}.html` : null;
  const firstName = name.split(' ')[0];

  return (
    <div className="h-screen bg-neutral-100 relative overflow-hidden">

      {/* Demo site — full viewport */}
      {demoSiteUrl ? (
        <iframe
          src={demoSiteUrl}
          className="w-full h-full border-0"
          title={demo.business_name}
        />
      ) : (
        <div className="h-full flex items-center justify-center">
          <p className="text-[15px] text-neutral-400 tracking-[-0.01em]">
            Your website is being prepared.
          </p>
        </div>
      )}

      {/* ── CTA button ── */}
      {phase === 'viewing' && (
        <button
          onClick={() => setPhase('buying')}
          className={`
            fixed bottom-8 left-1/2 -translate-x-1/2 z-50
            flex items-center gap-2.5
            bg-neutral-900/95 backdrop-blur-sm text-white
            pl-5 pr-4 py-3 rounded-full
            text-[14px] font-medium tracking-[-0.01em]
            shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.18)]
            hover:bg-neutral-800/95
            active:scale-[0.97]
            transition-all
          `}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible
              ? 'translateX(-50%) translateY(0)'
              : 'translateX(-50%) translateY(10px)',
            transition: visible
              ? 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1), background-color 0.15s'
              : 'none',
          }}
        >
          <span>Get this website</span>
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-[12px] leading-none">
            ↗
          </span>
        </button>
      )}

      {/* ── Confirmation ── */}
      {phase === 'done' && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-neutral-900/95 backdrop-blur-sm text-white pl-4 pr-5 py-3 rounded-full text-[14px] font-medium tracking-[-0.01em] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.18)] confirm-enter"
        >
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/90 text-[11px] shrink-0">✓</span>
          <span>We&apos;ll be in touch{firstName ? `, ${firstName}` : ''}.</span>
        </div>
      )}

      {/* ── Purchase sheet ── */}
      {phase === 'buying' && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 backdrop-blur-[2px] bg-black/20 overlay-enter"
            onClick={() => setPhase('viewing')}
          />

          {/* Sheet */}
          <div className="fixed bottom-0 inset-x-0 z-50 sheet-enter">
            <div className="bg-white rounded-t-[24px] shadow-[0_-1px_0_rgba(0,0,0,0.04),0_-20px_60px_rgba(0,0,0,0.12)]">
              <div className="mx-auto max-w-[400px] px-6 pt-3 pb-10">

                {/* Drag handle */}
                <div className="w-8 h-[4px] bg-neutral-200 rounded-full mx-auto mb-7" />

                {/* Business name — subtle context */}
                <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-neutral-400 text-center mb-3">
                  {demo.business_name}
                </p>

                {/* Title */}
                <h2 className="text-[24px] font-semibold text-neutral-900 tracking-[-0.03em] text-center leading-[1.15] mb-1.5">
                  Get this website
                </h2>

                {/* Pricing */}
                <div className="flex items-center justify-center gap-3 mb-8">
                  <div className="text-center">
                    <p className="text-[15px] font-medium text-neutral-900 tracking-[-0.01em]">
                      {'\u00A3'}299
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">setup</p>
                  </div>
                  <div className="w-px h-6 bg-neutral-200" />
                  <div className="text-center">
                    <p className="text-[15px] font-medium text-neutral-900 tracking-[-0.01em]">
                      {'\u00A3'}25<span className="text-neutral-400 font-normal">/mo</span>
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">ongoing</p>
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  <div className="space-y-2 mb-5">
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      required
                      autoFocus
                      className="w-full bg-neutral-50 border border-neutral-200/80 rounded-[14px] py-3.5 px-4 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-400 focus:bg-white transition-all"
                    />
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Phone number"
                      required
                      className="w-full bg-neutral-50 border border-neutral-200/80 rounded-[14px] py-3.5 px-4 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-400 focus:bg-white transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !name.trim() || !phone.trim()}
                    className="w-full bg-neutral-900 text-white text-[15px] font-medium py-3.5 rounded-[14px] hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-25 transition-colors tracking-[-0.01em]"
                  >
                    {submitting ? 'Sending\u2026' : 'Continue'}
                  </button>

                  <p className="text-[12px] text-neutral-400 text-center mt-4 leading-relaxed">
                    We&apos;ll call to confirm. No payment taken now.
                  </p>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes sheetEnter {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .sheet-enter {
          animation: sheetEnter 0.5s cubic-bezier(0.32, 0.72, 0, 1);
        }

        @keyframes overlayEnter {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .overlay-enter {
          animation: overlayEnter 0.3s ease;
        }

        @keyframes confirmEnter {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(6px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
        }
        .confirm-enter {
          animation: confirmEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, ArrowRight, Check } from 'lucide-react';

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
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchDemo();
  }, [code]);

  useEffect(() => {
    if (phase === 'viewing' && demo) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [phase, demo]);

  const fetchDemo = async () => {
    // Test mode: /demo/test shows a sample demo without DB
    if (code === 'test') {
      setDemo({
        business_name: 'The Corner Café',
        demo_domain: null,
        status: 'active',
      });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/demo-links/${code}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Demo not found');
        setLoading(false);
        return;
      }

      setDemo(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load demo');
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      submitPurchase();
    }
  };

  const handleSkipNotes = () => {
    setNotes('');
    setStep(4);
  };

  const submitPurchase = async () => {
    setSubmitting(true);

    try {
      const res = await fetch(`/api/demo-links/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, notes }),
      });

      if (res.ok) {
        setPhase('done');
      } else {
        alert('Something went wrong. Please try again.');
      }
    } catch (err) {
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (error || !demo?.demo_domain) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[15px] text-slate-600">{error || 'Demo site not ready yet'}</p>
        </div>
      </div>
    );
  }

  const demoUrl = `/demo-sites/${demo.demo_domain}.html`;

  return (
    <div className="fixed inset-0 bg-white">
      {/* Demo Site (Full Screen) */}
      <iframe
        src={demoUrl}
        className="w-full h-full border-0"
        title={`${demo.business_name} Demo Site`}
      />

      {/* Overlay (when buying) */}
      {phase === 'buying' && (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-[1px]" onClick={() => setPhase('viewing')} />
      )}

      {/* Floating CTA Button (viewing phase) */}
      {phase === 'viewing' && (
        <button
          onClick={() => {
            setPhase('buying');
            setStep(0);
          }}
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 bg-slate-900 text-white rounded-full text-[15px] font-medium shadow-2xl hover:bg-slate-800 transition-all ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          } duration-500`}
        >
          Get this website
        </button>
      )}

      {/* Purchase Card (buying phase) */}
      {phase === 'buying' && (
        <div
          className="fixed bottom-4 right-4 w-[380px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden card-enter"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress Dots */}
          <div className="flex gap-1.5 justify-center pt-4 pb-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-slate-900' : 'w-1.5 bg-slate-200'
                }`}
              />
            ))}
          </div>

          {/* Card Content */}
          <div className="p-6">
            {/* Step 0: Intro */}
            {step === 0 && (
              <div className="step-enter">
                <h2 className="text-[24px] font-semibold text-slate-900 mb-3">Make it yours</h2>
                <p className="text-[15px] text-slate-600 mb-6">
                  This website is ready to go live for your business
                </p>

                <div className="bg-slate-50 rounded-xl p-5 mb-6">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-[36px] font-semibold text-slate-900">£299</span>
                    <span className="text-[15px] text-slate-500">one-time</span>
                  </div>
                  <div className="text-[13px] text-slate-600">
                    Or <span className="font-semibold text-slate-900">£25/month</span>
                  </div>
                </div>

                <button
                  onClick={handleNext}
                  className="w-full px-6 py-4 bg-slate-900 text-white rounded-xl text-[15px] font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 group"
                >
                  I'm interested
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            )}

            {/* Step 1: Name */}
            {step === 1 && (
              <div className="step-enter">
                <h2 className="text-[24px] font-semibold text-slate-900 mb-2">What's your name?</h2>
                <p className="text-[13px] text-slate-500 mb-6">So we know who to contact</p>

                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                  className="w-full text-[17px] text-slate-900 placeholder:text-slate-300 bg-transparent border-b-2 border-slate-200 focus:border-slate-900 outline-none pb-3 mb-8 transition-colors"
                />

                <button
                  onClick={handleNext}
                  disabled={!name.trim()}
                  className="w-full px-6 py-4 bg-slate-900 text-white rounded-xl text-[15px] font-medium hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            )}

            {/* Step 2: Phone */}
            {step === 2 && (
              <div className="step-enter">
                <h2 className="text-[24px] font-semibold text-slate-900 mb-2">Best number to reach you?</h2>
                <p className="text-[13px] text-slate-500 mb-6">We'll send order confirmation here</p>

                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07xxx xxxxxx"
                  autoFocus
                  className="w-full text-[17px] text-slate-900 placeholder:text-slate-300 bg-transparent border-b-2 border-slate-200 focus:border-slate-900 outline-none pb-3 mb-8 transition-colors"
                />

                <button
                  onClick={handleNext}
                  disabled={!phone.trim()}
                  className="w-full px-6 py-4 bg-slate-900 text-white rounded-xl text-[15px] font-medium hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            )}

            {/* Step 3: Changes */}
            {step === 3 && (
              <div className="step-enter">
                <h2 className="text-[24px] font-semibold text-slate-900 mb-2">Any changes you'd like?</h2>
                <p className="text-[13px] text-slate-500 mb-6">Optional - we can tweak anything</p>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. different photos, add opening hours..."
                  rows={4}
                  autoFocus
                  className="w-full text-[15px] text-slate-900 placeholder:text-slate-300 bg-slate-50 border border-slate-200 focus:border-slate-900 outline-none p-4 rounded-lg mb-4 transition-colors resize-none"
                />

                <div className="flex gap-3">
                  <button
                    onClick={handleSkipNotes}
                    className="flex-1 px-6 py-4 bg-slate-100 text-slate-700 rounded-xl text-[15px] font-medium hover:bg-slate-200 transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex-1 px-6 py-4 bg-slate-900 text-white rounded-xl text-[15px] font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 group"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Confirm */}
            {step === 4 && (
              <div className="step-enter">
                <h2 className="text-[24px] font-semibold text-slate-900 mb-6">Confirm your order</h2>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between items-center py-3 border-b border-slate-100">
                    <span className="text-[13px] text-slate-600">Website for {demo.business_name}</span>
                    <span className="text-[15px] font-semibold text-slate-900">£299</span>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Order Details</p>
                    <div className="space-y-1.5 text-[13px]">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Name:</span>
                        <span className="text-slate-900 font-medium">{name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Phone:</span>
                        <span className="text-slate-900 font-medium">{phone}</span>
                      </div>
                      {notes && (
                        <div className="pt-2 mt-2 border-t border-slate-200">
                          <span className="text-slate-600 block mb-1">Requested changes:</span>
                          <span className="text-slate-900">{notes}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleNext}
                  disabled={submitting}
                  className="w-full px-6 py-4 bg-slate-900 text-white rounded-xl text-[15px] font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Purchase
                    </>
                  )}
                </button>

                <p className="text-[11px] text-slate-500 text-center mt-3">
                  Someone will call you within 24 hours to arrange payment
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Done Confirmation Pill */}
      {phase === 'done' && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 bg-emerald-600 text-white rounded-full shadow-2xl confirm-enter">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
            <span className="text-[15px] font-medium">Order received! We'll be in touch soon.</span>
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes cardEnter {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .card-enter { animation: cardEnter 0.3s ease-out; }

        @keyframes stepEnter {
          from { opacity: 0; transform: translateX(8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .step-enter { animation: stepEnter 0.25s ease-out; }

        @keyframes confirmEnter {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .confirm-enter { animation: confirmEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import './landing-brand.css';

type Business = {
  name: string;
  slug: string;
  cat: string;
  headline: string;
  copy: string;
  cta: [string, string];
  grad: string;
  items: [string, string][];
  city: string;
};

const businesses: Business[] = [
  { name: "Mario's Deli", slug: 'marios-deli', cat: 'Deli · Hackney', headline: 'Fresh from the <span class="acc">counter.</span>', copy: "Handmade sandwiches, traybakes and proper coffee on the high street since '94.", cta: ['Order →', 'Menu'], grad: 'linear-gradient(135deg, rgb(184 134 11), rgb(60 40 25))', items: [['Salt beef', '£8.50'], ['Focaccia', '£6.00'], ['Flat white', '£3.20'], ['Traybake', '£2.80']], city: 'Hackney' },
  { name: "Rosa's Barbers", slug: 'rosas', cat: 'Barbers · Peckham', headline: 'Sharp fades, <span class="acc">every time.</span>', copy: 'Third-generation barbers. Walk-ins welcome, bookings honoured. Proper cut, proper chat.', cta: ['Book →', 'Prices'], grad: 'linear-gradient(135deg, rgb(80 60 40), rgb(30 25 20))', items: [['Fade', '£18'], ['Beard trim', '£10'], ['Full set', '£24'], ['Kids cut', '£14']], city: 'Peckham' },
  { name: 'The Well Bakery', slug: 'the-well', cat: 'Bakery · Islington', headline: 'Baked before you <span class="acc">are up.</span>', copy: 'Sourdough, pastries and coffee from 6am. If we have it, it was in the oven this morning.', cta: ['Order →', 'Hours'], grad: 'linear-gradient(135deg, rgb(200 150 80), rgb(80 50 30))', items: [['Sourdough', '£4.50'], ['Croissant', '£3.20'], ['Cruffin', '£4.00'], ['Banana bread', '£3.50']], city: 'Islington' },
  { name: 'Vinyl Hollow', slug: 'vinyl-hollow', cat: 'Records · Dalston', headline: 'New stock <span class="acc">every Thursday.</span>', copy: 'Soul, funk, house, and a back room of dusty bargain bins. Listening decks in.', cta: ['Browse →', 'Events'], grad: 'linear-gradient(135deg, rgb(120 90 60), rgb(40 30 25))', items: [['7" singles', '£6'], ['LP (used)', '£14'], ['LP (new)', '£28'], ['Cassettes', '£4']], city: 'Dalston' },
  { name: 'Fern & Flock', slug: 'fern-flock', cat: 'Florist · Stoke Newington', headline: 'Flowers from <span class="acc">this morning.</span>', copy: 'Weekly market-fresh bunches, wedding arrangements, and a Sunday class.', cta: ['Shop →', 'Classes'], grad: 'linear-gradient(135deg, rgb(160 110 50), rgb(60 40 20))', items: [['Bunch', '£18'], ['Bouquet', '£32'], ['Arrangement', '£65'], ['Class', '£45']], city: 'Stoke Newington' },
];

function renderSiteHTML(b: Business) {
  return `
    <div class="hero-img" style="background:${b.grad}"><span class="badge">Live</span></div>
    <div class="tag">/ ${b.cat}</div>
    <h3>${b.headline}</h3>
    <p>${b.copy}</p>
    <div class="ctas"><span class="btn-sm">${b.cta[0]}</span><span class="btn-sm ghost">${b.cta[1]}</span></div>
    <div class="grid2">${b.items.map(([n, p]) => `<div class="item"><span class="n">${n}</span><span class="p">${p}</span></div>`).join('')}</div>
  `;
}

function buildLogLines(b: Business) {
  return [
    { t: '~ init ' + b.slug + '.shop', c: false, ok: '○' },
    { t: '→ fetch instagram @' + b.slug, c: true, ok: 'ok' },
    { t: '→ scrape google listing', c: true, ok: 'ok' },
    { t: '→ match hero · ' + b.cat.toLowerCase(), c: false, ok: 'ok' },
    { t: '→ copy pass · voice-matched', c: false, ok: 'ok' },
    { t: '◆ ready to ship', c: true, ok: '●' },
  ];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STEP_DUR = 4200;

export default function LandingPage() {
  const demoSiteRef = useRef<HTMLDivElement>(null);
  const demoUrlRef = useRef<HTMLSpanElement>(null);
  const demoBizRef = useRef<HTMLSpanElement>(null);
  const liveCityRef = useRef<HTMLSpanElement>(null);
  const buildLogRef = useRef<HTMLDivElement>(null);
  const liveCountRef = useRef<HTMLSpanElement>(null);

  const [tlActive, setTlActive] = useState(0);
  const [tlFill, setTlFill] = useState(0);
  const [claimed, setClaimed] = useState<number | null>(null);
  const [walletBal, setWalletBal] = useState(350);

  const [sDays, setSDays] = useState(4);
  const [sClaims, setSClaims] = useState(12);
  const [sRate, setSRate] = useState(25);

  const closes = Math.round((sDays * sClaims * sRate) / 100);
  const earn = closes * 50;

  // HERO demo cycle
  useEffect(() => {
    let cancelled = false;
    let idx = 0;

    if (demoSiteRef.current) {
      demoSiteRef.current.innerHTML = renderSiteHTML(businesses[0]);
    }

    async function cycle() {
      while (!cancelled) {
        const b = businesses[idx];
        const siteEl = demoSiteRef.current;
        const logEl = buildLogRef.current;
        if (!siteEl || !logEl) return;
        siteEl.classList.remove('active');
        logEl.innerHTML = '';
        if (demoUrlRef.current) demoUrlRef.current.textContent = b.slug;
        if (demoBizRef.current) demoBizRef.current.textContent = b.name;
        if (liveCityRef.current) liveCityRef.current.textContent = b.city;

        const lines = buildLogLines(b);
        for (let i = 0; i < lines.length; i++) {
          await wait(240);
          if (cancelled) return;
          const l = lines[i];
          const el = document.createElement('div');
          el.className = 'line' + (i === 0 ? ' muted' : '');
          el.innerHTML = `<span class="${l.c ? 'c' : ''}">${l.t}</span><span class="ok">${l.ok}</span>`;
          logEl.appendChild(el);
        }
        await wait(250);
        if (cancelled) return;
        siteEl.innerHTML = renderSiteHTML(b);
        siteEl.classList.add('active');
        await wait(3400);
        idx = (idx + 1) % businesses.length;
      }
    }
    const t = setTimeout(cycle, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  // Live count drift
  useEffect(() => {
    let cnt = 11847;
    if (liveCountRef.current) liveCountRef.current.textContent = cnt.toLocaleString();
    const iv = setInterval(() => {
      cnt += Math.floor(Math.random() * 3) + 1;
      if (liveCountRef.current) liveCountRef.current.textContent = cnt.toLocaleString();
    }, 4200);
    return () => clearInterval(iv);
  }, []);

  // Timeline autoplay + progress
  const autoTimerRef = useRef<number | null>(null);
  const progTimerRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);

  const setStep = (i: number, auto: boolean) => {
    setTlActive(i);
    setTlFill(0);
    if (progTimerRef.current) {
      clearInterval(progTimerRef.current);
      progTimerRef.current = null;
    }
    if (auto) {
      const start = performance.now();
      progTimerRef.current = window.setInterval(() => {
        const p = Math.min(100, ((performance.now() - start) / STEP_DUR) * 100);
        setTlFill(p);
        if (p >= 100 && progTimerRef.current) {
          clearInterval(progTimerRef.current);
          progTimerRef.current = null;
        }
      }, 50);
    }
    if (i === 0) {
      setClaimed(null);
      window.setTimeout(() => setClaimed(2), 800);
    }
    if (i === 3) {
      let v = 300;
      setWalletBal(v);
      const tick = window.setInterval(() => {
        v += 5;
        setWalletBal(v);
        if (v >= 350) clearInterval(tick);
      }, 30);
    }
  };

  const startAuto = () => {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    autoTimerRef.current = window.setInterval(() => {
      if (hoveredRef.current) return;
      setTlActive((prev) => {
        const next = (prev + 1) % 4;
        // trigger side effects via setStep-like logic inline
        setTlFill(0);
        if (progTimerRef.current) clearInterval(progTimerRef.current);
        const start = performance.now();
        progTimerRef.current = window.setInterval(() => {
          const p = Math.min(100, ((performance.now() - start) / STEP_DUR) * 100);
          setTlFill(p);
          if (p >= 100 && progTimerRef.current) {
            clearInterval(progTimerRef.current);
            progTimerRef.current = null;
          }
        }, 50);
        if (next === 0) {
          setClaimed(null);
          window.setTimeout(() => setClaimed(2), 800);
        }
        if (next === 3) {
          let v = 300;
          setWalletBal(v);
          const tick = window.setInterval(() => {
            v += 5;
            setWalletBal(v);
            if (v >= 350) clearInterval(tick);
          }, 30);
        }
        return next;
      });
    }, STEP_DUR);
  };

  useEffect(() => {
    setStep(0, true);
    startAuto();
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      if (progTimerRef.current) clearInterval(progTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onStepEnter = (i: number) => {
    hoveredRef.current = true;
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setStep(i, false);
  };

  const onStageLeave = () => {
    hoveredRef.current = false;
    startAuto();
  };

  const navLinks = [
    { href: '/site/product.html', label: 'How it works' },
    { href: '/site/contractors.html', label: 'For contractors' },
    { href: '/site/pricing.html', label: 'Earnings' },
    { href: '/site/blog.html', label: 'Resources' },
    { href: '/site/company.html', label: 'Company' },
  ];

  return (
    <div className="sf-landing">
      {/* TOP NAV */}
      <nav className="top-nav">
        <div className="inner">
          <a href="/" className="brand-mark">
            SalesFlow<span className="dot"></span>
          </a>
          <div className="nav-links">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </div>
          <div className="nav-right">
            <a href="/site/login.html" className="btn btn-ghost">
              Log in
            </a>
            <a href="/site/apply.html" className="btn btn-primary">
              Apply
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg">
          <div className="glow1"></div>
          <div className="glow2"></div>
        </div>
        <div className="container-xl hero-inner">
          <div className="hero-l">
            <div className="live-row">
              <span className="pulse"></span>
              <span>
                Live · <span ref={liveCityRef}>Hackney</span> ·{' '}
                <span ref={liveCountRef}>11,847</span> pitches this month
              </span>
            </div>
            <h1>
              <span className="line">Paid on</span>
              <span className="line">
                <span className="acc">signature.</span>
              </span>
              <span className="line">
                <span className="stroke">Not</span> on install.
              </span>
            </h1>
            <p className="lead">
              Local leads in your pocket. A working demo in the owner&apos;s hand. £50 in your
              wallet before you leave the shop.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-primary btn-lg" href="/site/apply.html">
                Apply to contract →
              </a>
              <a className="arrow-link" href="/site/product.html">
                How it works ↗
              </a>
            </div>
          </div>

          <div className="demo-stage">
            <div className="screen">
              <div className="screen-head">
                <div className="dot3">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <div className="url">
                  <span className="lock"></span>
                  <span ref={demoUrlRef}>marios-deli</span>
                  <span>.shop</span>
                  <span className="cursor"></span>
                </div>
                <span>09:24</span>
              </div>
              <div className="screen-body">
                <span className="biz-chip">
                  <span className="s"></span>
                  <span>
                    Generating · <span ref={demoBizRef}>Mario&apos;s Deli</span>
                  </span>
                </span>
                <div className="demo-site" ref={demoSiteRef}></div>
                <div className="demo-build">
                  <div className="scan"></div>
                  <div className="log" ref={buildLogRef}></div>
                </div>
              </div>
            </div>
            <div className="demo-footer">
              <span>/ Demo engine · Live</span>
              <span className="on">● 20k+ pitches trained</span>
            </div>
          </div>
        </div>
      </section>

      {/* RIBBON */}
      <section className="ribbon">
        <div className="container-xl ribbon-inner">
          <div className="ribbon-cell">
            <div className="n">
              <span className="acc">£</span>50
            </div>
            <div className="l">Per close, paid on signature</div>
          </div>
          <div className="ribbon-cell">
            <div className="n">
              <span className="acc">£</span>350
            </div>
            <div className="l">Client upfront · one time</div>
          </div>
          <div className="ribbon-cell">
            <div className="n">
              ~<span className="acc">£</span>27.50
            </div>
            <div className="l">Client subscription · monthly</div>
          </div>
          <div className="ribbon-cell">
            <div className="n">
              <span className="acc">0</span>
            </div>
            <div className="l">Clawback on closed deals</div>
          </div>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="timeline container-xl">
        <div className="head">
          <div className="eyebrow">/ The loop</div>
          <h2>
            Four steps. <span className="acc">That&apos;s the job.</span>
          </h2>
          <p className="sub">
            Hover any step to play it. No pipeline, no stand-ups, no post-sale admin. You
            knock, you show, you close, you withdraw.
          </p>
        </div>
        <div className="tl-stage" onMouseLeave={onStageLeave}>
          <div className="tl-steps">
            {[
              { tag: '01 /', t: 'Claim', h: 'Lead in your <span class="acc">pocket.</span>', p: 'Local businesses scraped from Google, Instagram, Facebook. Tap claim — it’s yours for the window.' },
              { tag: '02 /', t: 'Walk', h: 'Demo on the <span class="acc">walk.</span>', p: 'A real site — personalised to their shop — generates while you head over. No script. No brochure.' },
              { tag: '03 /', t: 'Show', h: 'Hand over the <span class="acc">phone.</span>', p: 'The owner scrolls. Silence does the work. Price reveal at fifteen seconds.' },
              { tag: '04 /', t: 'Paid', h: 'Signature → <span class="acc">£50.</span>', p: 'Wallet updates on signature. Withdraw in one tap. Post-sale isn’t your problem.' },
            ].map((s, i) => (
              <div
                key={i}
                className={'tl-step' + (tlActive === i ? ' active' : '')}
                onMouseEnter={() => onStepEnter(i)}
                onClick={() => {
                  onStepEnter(i);
                  setTimeout(() => {
                    hoveredRef.current = false;
                    startAuto();
                  }, 100);
                }}
              >
                <div className="tag">
                  <span>{s.tag}</span>
                  <span className="t">{s.t}</span>
                </div>
                <h4 dangerouslySetInnerHTML={{ __html: s.h }} />
                <p>{s.p}</p>
              </div>
            ))}
          </div>

          <div className="tl-visual">
            <div className="tl-stepnum">STEP 0{tlActive + 1} / 04</div>

            {/* Panel 1: Claim */}
            <div className={'tl-panel' + (tlActive === 0 ? ' on' : '')}>
              <div className="k">/ Lead queue · Hackney</div>
              <h5>
                Four open <span className="acc">within 800m.</span>
              </h5>
              <div className="claim-list">
                {[
                  ["Rosa's Barbers", 'Mare St · 320m'],
                  ['The Well Bakery', 'Broadway Mkt · 410m'],
                  ["Mario's Deli", 'Wilton Way · 520m'],
                  ['Vinyl Hollow', 'Kingsland · 680m'],
                ].map(([nm, mt], i) => (
                  <div key={i} className={'claim-row' + (claimed === i ? ' claimed' : '')}>
                    <div>
                      <div className="nm">{nm}</div>
                      <div className="mt">{mt}</div>
                    </div>
                    <span className="act">{claimed === i ? 'Yours' : 'Claim'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Panel 2: Walk */}
            <div className={'tl-panel' + (tlActive === 1 ? ' on' : '')}>
              <div className="k">/ Demo build · on walk</div>
              <h5>
                Generating <span className="acc">while you move.</span>
              </h5>
              <div className="walk-map">
                <svg viewBox="0 0 300 320" preserveAspectRatio="xMidYMid slice">
                  <defs>
                    <pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgb(255 255 255 / 0.05)" strokeWidth="0.5" />
                    </pattern>
                    <linearGradient id="pathg" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0" stopColor="rgb(184 134 11)" />
                      <stop offset="1" stopColor="rgb(184 134 11 / 0.3)" />
                    </linearGradient>
                  </defs>
                  <rect width="300" height="320" fill="url(#g)" />
                  <path d="M0 80 L300 80" stroke="rgb(255 255 255 / 0.08)" strokeWidth="14" />
                  <path d="M0 200 L300 200" stroke="rgb(255 255 255 / 0.08)" strokeWidth="10" />
                  <path d="M90 0 L90 320" stroke="rgb(255 255 255 / 0.08)" strokeWidth="12" />
                  <path d="M210 0 L210 320" stroke="rgb(255 255 255 / 0.06)" strokeWidth="8" />
                  <path id="walkPath" d="M55 260 L55 200 L90 200 L90 80 L210 80" stroke="url(#pathg)" strokeWidth="2" fill="none" strokeDasharray="4 4">
                    <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.2s" repeatCount="indefinite" />
                  </path>
                  <circle cx="55" cy="260" r="6" fill="rgb(255 255 255 / 0.7)" />
                  <text x="66" y="264" fill="rgb(255 255 255 / 0.6)" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1">YOU</text>
                  <circle r="5" fill="rgb(184 134 11)">
                    <animateMotion dur="4s" repeatCount="indefinite">
                      <mpath href="#walkPath" />
                    </animateMotion>
                    <animate attributeName="opacity" values="1;1;0.6;1;1" dur="4s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="210" cy="80" r="8" fill="rgb(184 134 11)" />
                  <circle cx="210" cy="80" r="12" fill="none" stroke="rgb(184 134 11)" strokeWidth="1">
                    <animate attributeName="r" values="12;22;12" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <text x="196" y="70" fill="rgb(184 134 11)" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1">MARIO&apos;S</text>
                </svg>
              </div>
            </div>

            {/* Panel 3: Show */}
            <div className={'tl-panel' + (tlActive === 2 ? ' on' : '')}>
              <div className="k">/ At the counter</div>
              <h5>
                Their shop, on <span className="acc">their phone.</span>
              </h5>
              <div className="tl-phone-wrap">
                <div className="tl-phone">
                  <div className="tl-phone-screen">
                    <div className="hi"></div>
                    <div className="tg">/ Mario&apos;s Deli</div>
                    <h6>
                      Fresh from the <span className="acc">counter.</span>
                    </h6>
                    <div className="ln"></div>
                    <div className="ln s"></div>
                    <div className="ln"></div>
                    <div className="bb">Order →</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Panel 4: Paid */}
            <div className={'tl-panel' + (tlActive === 3 ? ' on' : '')}>
              <div className="k">/ Contractor wallet</div>
              <h5>
                Wallet updates <span className="acc">on signature.</span>
              </h5>
              <div className="wallet-box">
                <div className="wallet-card">
                  <div className="bal-lab">Available balance</div>
                  <div className="bal">
                    <span className="acc">£</span>
                    <span>{walletBal}</span>
                  </div>
                </div>
                <div className="wallet-txn">
                  <div className="lft">
                    <div className="nm">+ Mario&apos;s Deli · close</div>
                    <div className="dt">Just now · Hackney</div>
                  </div>
                  <div className="amt">+£50</div>
                </div>
              </div>
            </div>

            <div className="tl-progress">
              <div className="fill" style={{ width: tlFill + '%' }}></div>
            </div>
          </div>
        </div>
      </section>

      {/* EARNINGS */}
      <section className="earn">
        <div className="container-xl earn-grid">
          <div>
            <div className="eyebrow">/ The maths</div>
            <h2>
              Drag the sliders. <span className="acc">See the number move.</span>
            </h2>
            <p className="sub">
              No cap, no quota, no clawback. Just £50 × how often you close. Contractors on
              our busiest patches close three to five a day.
            </p>
          </div>
          <div className="earn-calc">
            <div className="earn-controls">
              <div className="slider-row">
                <span className="lab">Days worked per week</span>
                <span className="val">{sDays} day{sDays > 1 ? 's' : ''}</span>
                <input type="range" min={1} max={7} value={sDays} onChange={(e) => setSDays(+e.target.value)} />
              </div>
              <div className="slider-row">
                <span className="lab">Claims per day</span>
                <span className="val">{sClaims} claims</span>
                <input type="range" min={4} max={30} value={sClaims} onChange={(e) => setSClaims(+e.target.value)} />
              </div>
              <div className="slider-row">
                <span className="lab">Close rate</span>
                <span className="val">{sRate}%</span>
                <input type="range" min={5} max={60} value={sRate} onChange={(e) => setSRate(+e.target.value)} />
              </div>
            </div>
            <div className="earn-out">
              <div className="cell">
                <div className="l">Weekly closes</div>
                <div className="v">{closes}</div>
              </div>
              <div className="cell">
                <div className="l">Weekly earnings</div>
                <div className="v">
                  <span className="acc">£</span>
                  <span>{earn.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="earn-foot">/ Illustrative · No cap · No tiers · No bonus to chase</div>
          </div>
        </div>
      </section>

      {/* SIDES */}
      <section className="sides container-xl">
        <div className="head">
          <div className="eyebrow">/ Why this works</div>
          <h2>
            A better deal — on <span className="acc">every side.</span>
          </h2>
        </div>
        <div className="sides-grid">
          <div className="side">
            <div className="n">01 / The closer</div>
            <h3>
              One price. <span className="acc">Paid now.</span>
            </h3>
            <p>No tiers. No bonus to chase. No install wait. £50 per close, into your wallet the moment the owner signs.</p>
            <div className="kv">
              <span>Per close</span>
              <b>£50</b>
            </div>
          </div>
          <div className="side">
            <div className="n">02 / The owner</div>
            <h3>
              Site that <span className="acc">shipped today.</span>
            </h3>
            <p>They didn&apos;t brief an agency. They didn&apos;t pick a template. They saw a site that was already theirs, and said yes.</p>
            <div className="kv">
              <span>Upfront</span>
              <b>£350 · ~£27.50/mo</b>
            </div>
          </div>
          <div className="side">
            <div className="n">03 / The platform</div>
            <h3>
              Every pitch <span className="acc">teaches.</span>
            </h3>
            <p>Every outcome — closed, soft-no, hard-no — feeds the generator. The moat gets deeper with every walk.</p>
            <div className="kv">
              <span>Outcomes logged</span>
              <b>20k+</b>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL */}
      <section className="final">
        <div className="container-xl final-grid">
          <div>
            <div className="eyebrow">/ Apply</div>
            <h2>
              Knock. Show. <span className="acc">Close.</span>
            </h2>
          </div>
          <div>
            <p>Approval in days. No seat fee, no subscription, no small print.</p>
            <a className="btn btn-signal btn-lg" href="/site/apply.html">
              Apply to contract →
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container-xl">
          <div className="footer-grid">
            <div>
              <a href="/" className="brand-mark" style={{ fontSize: 22 }}>
                SalesFlow<span className="dot"></span>
              </a>
              <p style={{ maxWidth: 280, fontSize: 13, color: 'rgb(210 200 185)', lineHeight: 1.55, margin: '16px 0 0' }}>
                Claim a lead. Walk in. Show the demo. Close. Paid on signature.
              </p>
            </div>
            <div>
              <h4>Platform</h4>
              <ul>
                <li><a href="/site/product.html">How it works</a></li>
                <li><a href="/site/contractors.html">For contractors</a></li>
                <li><a href="/site/pricing.html">Earnings</a></li>
                <li><a href="/site/apply.html">Apply</a></li>
              </ul>
            </div>
            <div>
              <h4>Resources</h4>
              <ul>
                <li><a href="/site/blog.html">Field reports</a></li>
                <li><a href="/site/guides.html">Guides</a></li>
                <li><a href="/site/case-studies.html">Contractor stories</a></li>
                <li><a href="/site/help.html">Help centre</a></li>
                <li><a href="/site/changelog.html">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4>Company</h4>
              <ul>
                <li><a href="/site/company.html">About</a></li>
                <li><a href="/site/careers.html">Careers</a></li>
                <li><a href="/site/contact.html">Contact</a></li>
                <li><a href="/site/security.html">Security</a></li>
                <li><a href="/site/status.html">Status</a></li>
              </ul>
            </div>
            <div>
              <h4>Legal</h4>
              <ul>
                <li><a href="/site/legal-terms.html">Terms</a></li>
                <li><a href="/site/legal-privacy.html">Privacy</a></li>
                <li><a href="/site/legal-contractor-agreement.html">Contractor</a></li>
                <li><a href="/site/legal-cookies.html">Cookies</a></li>
                <li><a href="/site/legal-accessibility.html">Accessibility</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <div>/ SalesFlow · [TBD]</div>
            <div>Made in the UK</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

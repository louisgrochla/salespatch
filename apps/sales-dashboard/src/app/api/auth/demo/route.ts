import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { queryAll, run } from '@/lib/db';
import { hashPin, createToken } from '@/lib/auth';
import { findUserByName, createUser, updateUserPinHash, touchLastActive, isSupabaseMode } from '@/lib/auth-db';

const TOKEN_EXPIRY_DAYS = 30;

/**
 * Demo-account endpoint: idempotently creates a well-known sales user, seeds
 * a handful of sample lead assignments, and issues a session. Hit
 * POST /api/auth/demo and you're logged in as "Demo Account" (PIN 0000, E8).
 */
const DEMO_NAME = 'Demo Account';
const DEMO_PIN = '0000';
const DEMO_POSTCODE = 'E8';
const DEMO_PHONE = '07700900001';

// ---------- Mock lead seed data ----------
// Each entry creates one lead_assignments row for the demo user. The richest
// data goes in `notes` as JSON since that's what the lead APIs read from.
type SeedStatus = 'new' | 'visited' | 'pitched' | 'sold' | 'rejected';
interface SeedLead {
  slug: string; // stable id so reseeding is idempotent
  status: SeedStatus;
  daysAgo: number;
  visitedDaysAgo?: number;
  pitchedDaysAgo?: number;
  soldDaysAgo?: number;
  rejectedDaysAgo?: number;
  followUpDaysAhead?: number;
  followUpNote?: string;
  contactName?: string;
  contactRole?: string;
  commission?: number;
  notes: Record<string, unknown>;
}

const DEMO_LEADS: SeedLead[] = [
  {
    slug: 'demo-marios-deli',
    status: 'new',
    daysAgo: 0,
    notes: {
      business_name: "Mario's Deli",
      business_type: 'Italian deli & cafe',
      address: '142 Wilton Way, London E8 3BA',
      postcode: 'E8',
      phone: '+44 20 7249 0214',
      email: 'mario@mariosdeli.co.uk',
      website_url: null,
      google_rating: 4.7,
      google_review_count: 184,
      has_website: false,
      website_quality_score: null,
      description: "Family-run Italian deli on Wilton Way since 1994. Sandwiches, fresh pasta, wine, and espresso. Strong local following, weekday lunch queues out the door.",
      services: ['Handmade sandwiches', 'Fresh pasta', 'Italian coffee', 'Wine & deli goods', 'Catering'],
      pain_points: [
        "No website — customers find them on Instagram or word-of-mouth only",
        "Can't take pre-orders; lunch queue turns customers away",
        "No way to show today's specials online"
      ],
      opening_hours: ['Mon–Fri 7:00–18:00', 'Sat 8:00–17:00', 'Sun closed'],
      best_reviews: [
        { author: 'Sarah M.', rating: 5, text: "Best salt beef sandwich in Hackney, genuinely. Mario remembers your order from three visits ago." },
        { author: 'James T.', rating: 5, text: "Proper Italian deli, not a concept. The coffee alone is worth the walk." }
      ],
      brand_colours: { primary: '#B8860B', accent: '#8B1A1A', neutral: '#3C2820' },
      hero_headline: 'Fresh from the counter.',
      cta_text: 'Order ahead →',
      trust_badges: ['Est. 1994', 'Family-owned', 'Hackney favourite'],
      avoid_topics: ['Chain comparisons', 'Franchising'],
      demo_site_domain: 'marios-deli.shop',
      demo_site_qa_score: 92,
    },
  },
  {
    slug: 'demo-rosas-barbers',
    status: 'visited',
    daysAgo: 2,
    visitedDaysAgo: 1,
    contactName: 'Rosa Gallinaro',
    contactRole: 'Owner',
    notes: {
      business_name: "Rosa's Barbers",
      business_type: 'Barbershop',
      address: '88 Mare Street, London E8 3SG',
      postcode: 'E8',
      phone: '+44 20 7254 9918',
      email: null,
      website_url: null,
      google_rating: 4.9,
      google_review_count: 312,
      has_website: false,
      website_quality_score: null,
      description: "Third-generation East London barbershop. Walk-ins and bookings, classic fades and beard work. Tight local reputation — almost entirely Instagram bookings.",
      services: ['Fade (£18)', 'Beard trim (£10)', 'Full set (£24)', 'Kids cut (£14)'],
      pain_points: [
        "Takes all bookings through Instagram DMs — Rosa's daughter manages them manually",
        "Loses weekend walk-ins because customers can't see wait times",
        "No online gallery of cuts — relies on customers scrolling the IG feed"
      ],
      opening_hours: ['Tue–Fri 9:00–19:00', 'Sat 8:00–17:00', 'Sun–Mon closed'],
      best_reviews: [
        { author: 'Daniel K.', rating: 5, text: "Been going to Rosa's for eight years. Proper cut, proper chat, never disappointed." },
        { author: 'Amara O.', rating: 5, text: "They got me in at 4pm on a Saturday without a booking. That never happens anywhere else." }
      ],
      brand_colours: { primary: '#1F2937', accent: '#D4A574', neutral: '#F4EFE6' },
      hero_headline: 'Sharp fades, every time.',
      cta_text: 'Book a chair →',
      trust_badges: ['3rd generation', 'Walk-ins welcome', '300+ Google reviews'],
      avoid_topics: ['Online-only bookings (Rosa hates them)'],
      demo_site_domain: 'rosas-barbers.shop',
      demo_site_qa_score: 88,
    },
  },
  {
    slug: 'demo-the-well-bakery',
    status: 'pitched',
    daysAgo: 4,
    visitedDaysAgo: 3,
    pitchedDaysAgo: 1,
    followUpDaysAhead: 1,
    followUpNote: "Ben asked for a night to think. Swing by at 10am — he's in before the morning rush.",
    contactName: 'Ben Whittaker',
    contactRole: 'Head baker / co-owner',
    notes: {
      business_name: 'The Well Bakery',
      business_type: 'Artisan bakery & coffee',
      address: '21 Broadway Market, London E8 4PH',
      postcode: 'E8',
      phone: '+44 20 7923 7781',
      email: 'hello@thewellbakery.co',
      website_url: 'https://thewellbakery.co',
      google_rating: 4.6,
      google_review_count: 528,
      has_website: true,
      website_quality_score: 42,
      description: "Sourdough-first bakery on Broadway Market. 6am opening, pastries out by 7. Current site exists but is a static brochure — no ordering, no hours sync, mobile broken.",
      services: ['Sourdough loaves', 'Viennoiserie', 'Filter coffee', 'Sunday brunch'],
      pain_points: [
        "Current website is 4 years old, looks dated next to their physical brand",
        "Can't take pre-orders for loaves — they sell out by 10am on Saturdays",
        "Opening hours on Google are wrong half the time"
      ],
      opening_hours: ['Wed–Fri 6:00–15:00', 'Sat–Sun 7:00–16:00', 'Mon–Tue closed'],
      best_reviews: [
        { author: 'Priya S.', rating: 5, text: "Their cruffin is unreasonably good. The queue moves fast, don't be put off." },
        { author: 'Tom B.', rating: 5, text: "Ben knows sourdough like a chemist knows their lab. Ask him about hydration." }
      ],
      brand_colours: { primary: '#C9964F', accent: '#3E2E1F', neutral: '#F8F1E5' },
      hero_headline: 'Baked before you are up.',
      cta_text: 'Reserve a loaf →',
      trust_badges: ['Broadway Market since 2017', 'Real Bread Campaign member'],
      avoid_topics: ['DIY website comparisons — Ben built theirs himself'],
      demo_site_domain: 'the-well.shop',
      demo_site_qa_score: 95,
    },
  },
  {
    slug: 'demo-vinyl-hollow',
    status: 'sold',
    daysAgo: 9,
    visitedDaysAgo: 8,
    pitchedDaysAgo: 8,
    soldDaysAgo: 7,
    commission: 50,
    contactName: 'Jay Desai',
    contactRole: 'Owner',
    notes: {
      business_name: 'Vinyl Hollow',
      business_type: 'Independent record shop',
      address: '214 Kingsland Road, London E8 4DG',
      postcode: 'E8',
      phone: '+44 20 7923 1144',
      email: 'jay@vinylhollow.shop',
      website_url: 'https://vinylhollow.shop',
      google_rating: 4.8,
      google_review_count: 97,
      has_website: true,
      website_quality_score: 72,
      description: "Closed deal. New stock drops Thursdays. Jay's already pushing the Instagram link — signed on the first visit after seeing the preview.",
      services: ['New & used vinyl', 'Listening decks', 'Discogs fulfilment', 'Thursday drops'],
      pain_points: [
        "Discogs takes 15% — migrating sales to his own site",
        "Listing new stock is manual, wants a feed"
      ],
      opening_hours: ['Tue–Sat 11:00–19:00', 'Sun 12:00–17:00', 'Mon closed'],
      best_reviews: [
        { author: 'Chloe R.', rating: 5, text: "Jay's recommendations are a cheat code. Walked in asking for 'something new', walked out with three records I now can't stop playing." }
      ],
      brand_colours: { primary: '#785A3C', accent: '#D4A574', neutral: '#282019' },
      hero_headline: 'New stock every Thursday.',
      cta_text: 'Browse crate →',
      trust_badges: ['Closed deal · £50', 'Live since ' + new Date(Date.now() - 6*86400000).toLocaleDateString('en-GB')],
      avoid_topics: [],
      demo_site_domain: 'vinyl-hollow.shop',
      demo_site_qa_score: 94,
    },
  },
  {
    slug: 'demo-fern-and-flock',
    status: 'new',
    daysAgo: 0,
    notes: {
      business_name: 'Fern & Flock',
      business_type: 'Florist & flower school',
      address: '55 Stoke Newington Church St, London N16 0AR',
      postcode: 'N16',
      phone: '+44 20 7249 5533',
      email: 'hello@fernandflock.co',
      website_url: null,
      google_rating: 4.9,
      google_review_count: 63,
      has_website: false,
      website_quality_score: null,
      description: "Market-fresh florist on Church Street. Weekly bunches, wedding work, and a Sunday arrangement class. Books classes via email — has a waiting list.",
      services: ['Weekly bunches', 'Bouquets', 'Wedding arrangements', 'Sunday classes'],
      pain_points: [
        "Class bookings go via email, misses half of them",
        "Weddings come in via Instagram DMs and get lost in the thread",
        "No online way to show the Sunday class schedule"
      ],
      opening_hours: ['Tue–Fri 9:00–17:00', 'Sat 9:00–16:00', 'Sun 10:00–14:00'],
      best_reviews: [
        { author: 'Lucy H.', rating: 5, text: "Took the Sunday class on a whim. Came home with the best arrangement I've ever made and a new hobby." },
        { author: 'Marcus O.', rating: 5, text: "Did our wedding flowers on a tight brief. Every guest asked who did them." }
      ],
      brand_colours: { primary: '#A66E32', accent: '#3C2814', neutral: '#F0E8D6' },
      hero_headline: 'Flowers from this morning.',
      cta_text: 'Reserve a bunch →',
      trust_badges: ['Church Street since 2019', 'Small-batch florist'],
      avoid_topics: [],
      demo_site_domain: 'fern-flock.shop',
      demo_site_qa_score: 90,
    },
  },
  {
    slug: 'demo-kent-and-son',
    status: 'rejected',
    daysAgo: 6,
    visitedDaysAgo: 5,
    rejectedDaysAgo: 5,
    contactName: 'Alan Kent',
    contactRole: 'Owner',
    notes: {
      business_name: 'Kent & Son Butchers',
      business_type: 'Traditional butcher',
      address: '12 Lower Clapton Road, London E5 0PD',
      postcode: 'E5',
      phone: '+44 20 8985 2044',
      email: null,
      website_url: 'https://kentandson.co.uk',
      google_rating: 4.5,
      google_review_count: 78,
      has_website: true,
      website_quality_score: 38,
      description: "Soft no — Alan said they 'already have a guy'. Polite, took the card. Worth checking back in 6 months if the current site hasn't moved.",
      services: ['Daily-cut meat', 'Sausages', 'Sunday roast boxes'],
      pain_points: [
        "Current site looks untouched since 2015",
        "'Already has a guy' but site hasn't changed in 4 years"
      ],
      opening_hours: ['Tue–Fri 8:00–18:00', 'Sat 7:00–16:00'],
      best_reviews: [
        { author: 'Helen P.', rating: 5, text: "Best sausages in east London. Been a customer for 20 years." }
      ],
      brand_colours: null,
      hero_headline: null,
      cta_text: null,
      trust_badges: ['Since 1963', '3rd-generation butcher'],
      avoid_topics: ['Existing web guy — be polite, bring it up indirectly'],
      demo_site_domain: null,
      demo_site_qa_score: null,
    },
  },
];

function seedDemoLeads(userId: string) {
  const existing = queryAll<{ lead_id: string }>(
    'SELECT lead_id FROM lead_assignments WHERE user_id = ?',
    userId,
  );
  const have = new Set(existing.map((r) => r.lead_id));

  for (const seed of DEMO_LEADS) {
    if (have.has(seed.slug)) continue; // already seeded

    const now = Date.now();
    const assignedAt = new Date(now - seed.daysAgo * 86400_000).toISOString();
    const visitedAt =
      seed.visitedDaysAgo != null ? new Date(now - seed.visitedDaysAgo * 86400_000).toISOString() : null;
    const pitchedAt =
      seed.pitchedDaysAgo != null ? new Date(now - seed.pitchedDaysAgo * 86400_000).toISOString() : null;
    const soldAt =
      seed.soldDaysAgo != null ? new Date(now - seed.soldDaysAgo * 86400_000).toISOString() : null;
    const rejectedAt =
      seed.rejectedDaysAgo != null
        ? new Date(now - seed.rejectedDaysAgo * 86400_000).toISOString()
        : null;
    const followUpAt =
      seed.followUpDaysAhead != null
        ? new Date(now + seed.followUpDaysAhead * 86400_000).toISOString()
        : null;

    try {
      run(
        `INSERT INTO lead_assignments
           (id, lead_id, user_id, assigned_at, status, visited_at, pitched_at, sold_at, rejected_at,
            rejection_reason, notes, commission_amount, follow_up_at, follow_up_note, contact_name, contact_role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        seed.slug,
        userId,
        assignedAt,
        seed.status,
        visitedAt,
        pitchedAt,
        soldAt,
        rejectedAt,
        seed.status === 'rejected' ? 'Already has a web provider' : null,
        JSON.stringify(seed.notes),
        seed.commission ?? null,
        followUpAt,
        seed.followUpNote ?? null,
        seed.contactName ?? null,
        seed.contactRole ?? null,
      );
    } catch (e) {
      console.warn('[Demo seed] insert failed for', seed.slug, e);
    }
  }
}

export async function POST(_req: NextRequest) {
  try {
    const pinHash = hashPin(DEMO_PIN);

    // Find-or-create demo user (dual-mode: Supabase in prod, SQLite locally)
    let user = await findUserByName(DEMO_NAME);

    if (!user) {
      const id = randomUUID();
      await createUser({
        id,
        name: DEMO_NAME,
        pin_hash: pinHash,
        phone: DEMO_PHONE,
        area_postcode: DEMO_POSTCODE,
      });
      user = await findUserByName(DEMO_NAME);
    } else if (user.pin_hash !== pinHash) {
      // Reset drifted PIN so the demo PIN always works
      await updateUserPinHash(user.id, pinHash);
    }

    if (!user) {
      return NextResponse.json({ error: 'Failed to create demo account' }, { status: 500 });
    }

    // Seed demo leads — SQLite only. Supabase doesn't have the lead_assignments
    // table yet; when it does, move seedDemoLeads behind the dual-mode helper too.
    if (!isSupabaseMode()) {
      try {
        seedDemoLeads(user.id);
      } catch (e) {
        console.warn('[Demo] seed failed (non-fatal):', e);
      }
    }

    await touchLastActive(user.id);

    const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
    const token = createToken({ user_id: user.id, name: user.name, exp });

    const response = NextResponse.json({
      data: {
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          area_postcode: user.area_postcode,
          commission_rate: user.commission_rate,
          active: true,
        },
        token,
        note: 'Demo account — data resets independently of real users.',
      },
    });

    response.cookies.set('sd_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    console.error('[Auth] Demo login error:', err);
    return NextResponse.json(
      { error: 'Demo account is temporarily unavailable.', code: 'DEMO_ERROR' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

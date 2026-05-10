/**
 * Brief Generator — creates a structured context document BEFORE site generation.
 *
 * The brief is built from ALL scraped data and acts as the single source of truth
 * for the composer. No more generic assumptions — every piece of content is
 * derived from what we actually know about the business.
 *
 * The brief is saved as a .md file in the lead's asset directory for review.
 */

import { AgentHandler } from "../../pipeline/agentRuntime.js";
import { ensureLeadDir, getLeadDir } from "../../lib/assetStore.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrandAnalysis } from "./brandAnalyser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SiteBrief {
  // Identity
  businessName: string;
  businessType: string;
  vertical: string;
  specificCategory: string; // "barber", "plumber", not just "health"

  // What this business actually does (scraped, not guessed)
  description: string;
  services: ServiceItem[];
  priceRange?: string;

  // Contact & location
  phone: string;
  email: string;
  address: string;
  lat?: number;
  lng?: number;
  mapsEmbedUrl?: string;
  openingHours: string[];

  // Social proof
  googleRating?: number;
  googleReviewCount?: number;
  bestReviews: ReviewItem[];

  // Brand
  hasLogo: boolean;
  hasHeroImage: boolean;
  galleryImageCount: number;
  brandColourSource: string;

  // Copy directives — what the site SHOULD say
  heroHeadline: string;
  heroSubtext: string;
  ctaPrimary: CtaDirective;
  ctaSecondary?: CtaDirective;
  aboutCopy: string;
  trustBadges: string[];
  sectionOrder: string[];

  // What the site should NOT say
  avoidTopics: string[];

  // Menu (food only)
  menuItems?: Array<{ name: string; price?: string; description?: string }>;

  // Raw markdown for review
  markdown: string;
}

export interface ServiceItem {
  name: string;
  description: string;
  isScraped: boolean;
}

export interface ReviewItem {
  author: string;
  rating: number;
  text: string;
}

export interface CtaDirective {
  text: string;
  action: "tel" | "email" | "link" | "scroll";
  target: string;
  why: string;
}

// ---------------------------------------------------------------------------
// Business type knowledge base
// ---------------------------------------------------------------------------

interface BusinessProfile {
  typicalServices: Array<{ name: string; desc: string }>;
  ctaAction: CtaDirective["action"];
  ctaText: string;
  ctaWhy: string;
  secondaryCta?: { text: string; action: CtaDirective["action"]; why: string };
  trustBadges: string[];
  avoidTopics: string[];
  heroStyle: string;
  typicalPricing?: string;
}

const BUSINESS_PROFILES: Record<string, BusinessProfile> = {
  // --- Health & Beauty ---
  barber: {
    typicalServices: [
      { name: "Skin Fade", desc: "Precision skin fades from low to high — clean, sharp, and tailored to your style." },
      { name: "Beard Trim & Shape", desc: "Expert beard trimming, shaping, and hot towel finishes." },
      { name: "Scissor Cut", desc: "Classic scissor cuts for a natural, textured look." },
      { name: "Kids Cuts", desc: "Friendly, patient cuts for the little ones." },
      { name: "Hot Towel Shave", desc: "Traditional hot towel wet shave — the full barbershop experience." },
      { name: "Hair Design", desc: "Custom hair designs and patterns for a unique look." },
    ],
    ctaAction: "tel",
    ctaText: "Book Your Cut",
    ctaWhy: "Walk-ins welcome but booking guarantees your slot",
    secondaryCta: { text: "View Services", action: "scroll", why: "Show range before committing" },
    trustBadges: ["Walk-Ins Welcome", "Experienced Barbers", "All Styles Catered For"],
    avoidTopics: ["free quotes", "emergency", "installation", "fully insured", "no-obligation"],
    heroStyle: "Confident, masculine, clean",
  },
  salon: {
    typicalServices: [
      { name: "Cut & Blow Dry", desc: "Expert cutting and styling for your perfect look." },
      { name: "Colour & Highlights", desc: "Full colour, highlights, balayage, and ombré treatments." },
      { name: "Hair Treatments", desc: "Deep conditioning, keratin, and repair treatments." },
      { name: "Bridal & Occasion", desc: "Special occasion styling for your big day." },
    ],
    ctaAction: "tel",
    ctaText: "Book An Appointment",
    ctaWhy: "Appointments ensure you get the stylist and time you want",
    trustBadges: ["Qualified Stylists", "Premium Products", "Relaxing Atmosphere"],
    avoidTopics: ["free quotes", "emergency", "installation", "fully insured"],
    heroStyle: "Elegant, warm, inviting",
  },
  dentist: {
    typicalServices: [
      { name: "Check-Ups & Cleans", desc: "Routine examinations and professional cleaning." },
      { name: "Cosmetic Dentistry", desc: "Whitening, veneers, and smile makeovers." },
      { name: "Emergency Dental", desc: "Same-day appointments for dental emergencies." },
      { name: "Family Dentistry", desc: "Gentle, patient care for the whole family." },
    ],
    ctaAction: "tel",
    ctaText: "Book An Appointment",
    ctaWhy: "New patients welcome — call to register",
    trustBadges: ["NHS & Private", "New Patients Welcome", "Family Friendly"],
    avoidTopics: ["free quotes", "installation"],
    heroStyle: "Clean, professional, reassuring",
  },
  spa: {
    typicalServices: [
      { name: "Massage Therapy", desc: "Swedish, deep tissue, and hot stone massage." },
      { name: "Facials", desc: "Rejuvenating facial treatments for all skin types." },
      { name: "Body Treatments", desc: "Wraps, scrubs, and body contouring." },
      { name: "Packages", desc: "Curated spa day packages for the ultimate relaxation." },
    ],
    ctaAction: "tel",
    ctaText: "Book Your Treatment",
    ctaWhy: "Reserve your preferred time and therapist",
    trustBadges: ["Qualified Therapists", "Premium Products", "Luxury Setting"],
    avoidTopics: ["free quotes", "emergency", "fully insured"],
    heroStyle: "Serene, luxurious, calming",
  },

  // --- Food & Drink ---
  restaurant: {
    typicalServices: [
      { name: "Dine In", desc: "Enjoy a meal in our welcoming restaurant." },
      { name: "Takeaway", desc: "All your favourites, ready to take home." },
      { name: "Private Dining", desc: "Host your event in our private dining space." },
      { name: "Catering", desc: "Let us bring the food to your event." },
    ],
    ctaAction: "tel",
    ctaText: "Reserve A Table",
    ctaWhy: "Guarantee your table, especially on weekends",
    secondaryCta: { text: "View Menu", action: "scroll", why: "Menu drives dining decisions" },
    trustBadges: ["Fresh Ingredients", "Daily Specials", "Licensed"],
    avoidTopics: ["free quotes", "emergency", "installation", "fully insured", "no-obligation quote"],
    heroStyle: "Warm, appetising, atmospheric",
  },
  cafe: {
    typicalServices: [
      { name: "Coffee & Drinks", desc: "Expertly crafted coffee, teas, and cold drinks." },
      { name: "Breakfast", desc: "Start your day right with our breakfast menu." },
      { name: "Lunch", desc: "Fresh sandwiches, salads, and hot lunches." },
      { name: "Cakes & Treats", desc: "Homemade cakes, pastries, and sweet treats." },
    ],
    ctaAction: "link",
    ctaText: "Visit Us Today",
    ctaWhy: "Cafes are walk-in — CTA drives footfall",
    trustBadges: ["Freshly Made Daily", "Free WiFi", "Dog Friendly"],
    avoidTopics: ["free quotes", "emergency", "installation", "booking required"],
    heroStyle: "Cosy, inviting, warm colours",
  },
  takeaway: {
    typicalServices: [
      { name: "Collection", desc: "Order ahead and skip the queue." },
      { name: "Delivery", desc: "Hot food delivered to your door." },
      { name: "Meal Deals", desc: "Great value combos and family deals." },
    ],
    ctaAction: "tel",
    ctaText: "Order Now",
    ctaWhy: "Phone orders are the primary conversion",
    trustBadges: ["Fast Delivery", "Fresh & Hot", "Family Deals"],
    avoidTopics: ["free quotes", "installation", "booking", "appointment"],
    heroStyle: "Bold, appetising, quick",
  },
  bakery: {
    typicalServices: [
      { name: "Bread & Rolls", desc: "Freshly baked bread, rolls, and loaves — daily." },
      { name: "Cakes & Celebration", desc: "Custom cakes for birthdays, weddings, and every occasion." },
      { name: "Pastries & Savouries", desc: "Croissants, sausage rolls, pies, and more." },
      { name: "Wholesale & Events", desc: "Bulk orders for cafes, events, and offices." },
    ],
    ctaAction: "tel",
    ctaText: "Order Fresh Today",
    ctaWhy: "Pre-orders ensure availability",
    trustBadges: ["Baked Fresh Daily", "Custom Orders Welcome", "Local Ingredients"],
    avoidTopics: ["free quotes", "emergency", "installation", "appointment"],
    heroStyle: "Warm, artisan, golden tones",
  },

  // --- Trades ---
  plumber: {
    typicalServices: [
      { name: "Emergency Plumbing", desc: "24/7 emergency callout for leaks, bursts, and blockages." },
      { name: "Boiler Repair & Install", desc: "Gas Safe registered boiler servicing, repair, and new installations." },
      { name: "Bathroom Fitting", desc: "Complete bathroom design, supply, and installation." },
      { name: "General Plumbing", desc: "Taps, toilets, pipes, radiators — no job too small." },
    ],
    ctaAction: "tel",
    ctaText: "Call Now — Free Quote",
    ctaWhy: "Plumbing is often urgent — phone is fastest",
    trustBadges: ["Gas Safe Registered", "Free Quotes", "No Call-Out Fee"],
    avoidTopics: ["booking appointments", "menu", "dine in"],
    heroStyle: "Trustworthy, reliable, bold blue",
  },
  electrician: {
    typicalServices: [
      { name: "Electrical Testing", desc: "EICR testing, PAT testing, and landlord certificates." },
      { name: "Rewiring", desc: "Full and partial rewiring for homes and businesses." },
      { name: "Fault Finding", desc: "Fast diagnosis and repair of electrical faults." },
      { name: "New Installations", desc: "Sockets, lighting, consumer units, and EV chargers." },
    ],
    ctaAction: "tel",
    ctaText: "Get A Free Quote",
    ctaWhy: "Customers want a price before committing",
    trustBadges: ["NICEIC Approved", "Part P Certified", "Free Estimates"],
    avoidTopics: ["booking appointments", "menu", "dine in"],
    heroStyle: "Professional, safety-focused",
  },
  builder: {
    typicalServices: [
      { name: "Extensions", desc: "Single and double storey extensions to expand your space." },
      { name: "Renovations", desc: "Full house renovations, from planning to completion." },
      { name: "Loft Conversions", desc: "Transform your loft into valuable living space." },
      { name: "New Builds", desc: "Bespoke new build projects managed from start to finish." },
    ],
    ctaAction: "tel",
    ctaText: "Get A Free Quote",
    ctaWhy: "Building work requires a quote — phone starts the process",
    trustBadges: ["Fully Insured", "Free Estimates", "Local & Trusted"],
    avoidTopics: ["menu", "dine in", "appointment"],
    heroStyle: "Solid, trustworthy, project-focused",
  },

  // --- Professional ---
  accountant: {
    typicalServices: [
      { name: "Tax Returns", desc: "Self-assessment and company tax returns — accurate and on time." },
      { name: "Bookkeeping", desc: "Monthly bookkeeping and management accounts." },
      { name: "Business Advice", desc: "Strategic advice to help your business grow." },
      { name: "Payroll", desc: "Reliable payroll processing for your team." },
    ],
    ctaAction: "tel",
    ctaText: "Book A Free Consultation",
    ctaWhy: "Consultation builds trust before signing up",
    trustBadges: ["Qualified & Accredited", "Fixed Fee Pricing", "Free Initial Chat"],
    avoidTopics: ["emergency", "walk-ins welcome", "menu"],
    heroStyle: "Professional, clean, authoritative",
  },

  // --- Retail ---
  shop: {
    typicalServices: [
      { name: "In-Store Shopping", desc: "Browse our range in a friendly, welcoming setting." },
      { name: "Click & Collect", desc: "Order online, pick up at your convenience." },
      { name: "Special Orders", desc: "Can't see what you want? We'll source it for you." },
      { name: "Gift Cards", desc: "The perfect gift — available in any amount." },
    ],
    ctaAction: "link",
    ctaText: "Visit Us Today",
    ctaWhy: "Drive footfall — retail is about physical visits",
    trustBadges: ["Friendly Service", "Quality Products", "Supporting Local"],
    avoidTopics: ["free quotes", "emergency", "no-obligation"],
    heroStyle: "Welcoming, product-focused",
  },
  pub: {
    typicalServices: [
      { name: "Food & Dining", desc: "Freshly prepared meals in a warm, welcoming setting." },
      { name: "Drinks & Cocktails", desc: "A carefully curated selection of beers, wines, and spirits." },
      { name: "Private Hire", desc: "Book our space for birthdays, events, and celebrations." },
      { name: "Live Entertainment", desc: "Regular live music, quizzes, and social events." },
    ],
    ctaAction: "tel",
    ctaText: "Book a Table",
    ctaWhy: "Drive reservations — pubs compete on atmosphere and experience",
    trustBadges: ["Dog Friendly", "Real Ales", "Family Welcome", "Beer Garden"],
    avoidTopics: ["free quotes", "emergency", "installation"],
    heroStyle: "Warm, inviting, atmospheric",
  },
  nail_bar: {
    typicalServices: [
      { name: "Manicures", desc: "Classic, gel, and luxury manicure treatments." },
      { name: "Pedicures", desc: "Relaxing pedicure treatments for beautiful feet." },
      { name: "Nail Art", desc: "Express yourself with creative, hand-painted nail designs." },
      { name: "Acrylics & Extensions", desc: "Long-lasting acrylic and gel nail extensions." },
    ],
    ctaAction: "tel",
    ctaText: "Book Your Appointment",
    ctaWhy: "Appointment-driven — phone booking is the primary conversion",
    trustBadges: ["Hygiene Certified", "Licensed Technicians", "Walk-Ins Welcome"],
    avoidTopics: ["free quotes", "emergency", "installation"],
    heroStyle: "Elegant, clean, feminine",
  },
  tattoo: {
    typicalServices: [
      { name: "Custom Tattoos", desc: "Bespoke designs created with you from concept to skin." },
      { name: "Cover-Ups", desc: "Expert cover-up work to transform existing tattoos." },
      { name: "Piercings", desc: "Professional piercings with premium jewellery." },
      { name: "Consultations", desc: "Free consultations to discuss your ideas and placement." },
    ],
    ctaAction: "tel",
    ctaText: "Book a Consultation",
    ctaWhy: "Consultations build trust — tattoos are high-commitment purchases",
    trustBadges: ["Licensed & Insured", "Award-Winning Artists", "Sterile Environment"],
    avoidTopics: ["cheap", "discount", "rush job", "walk-in specials"],
    heroStyle: "Bold, artistic, edgy",
  },
  gym: {
    typicalServices: [
      { name: "Gym Membership", desc: "Full access to our modern equipment and facilities." },
      { name: "Personal Training", desc: "One-to-one sessions tailored to your fitness goals." },
      { name: "Group Classes", desc: "Motivating group sessions from HIIT to yoga." },
      { name: "Free Trial", desc: "Try us out with a free day pass — no commitment." },
    ],
    ctaAction: "link",
    ctaText: "Start Your Free Trial",
    ctaWhy: "Free trials convert browsers to members",
    trustBadges: ["No Contract Options", "Qualified Trainers", "Modern Equipment"],
    avoidTopics: ["emergency", "installation", "free quotes"],
    heroStyle: "Energetic, motivational, strong",
  },
  pet_shop: {
    typicalServices: [
      { name: "Pet Food & Nutrition", desc: "Premium and specialist pet food from trusted brands." },
      { name: "Pet Accessories", desc: "Everything your pet needs — beds, toys, leads, and more." },
      { name: "Grooming", desc: "Professional grooming services to keep your pet looking their best." },
      { name: "Expert Advice", desc: "Friendly, knowledgeable staff to help with any pet question." },
    ],
    ctaAction: "link",
    ctaText: "Visit Us",
    ctaWhy: "Pet owners browse in-store — footfall is the goal",
    trustBadges: ["Locally Owned", "Expert Staff", "Quality Brands"],
    avoidTopics: ["free quotes", "emergency", "installation"],
    heroStyle: "Warm, friendly, playful",
  },
};

// Aliases
const ALIASES: Record<string, string> = {
  "hair salon": "salon", hairdresser: "salon", beauty: "salon",
  coffee: "cafe", "coffee shop": "cafe",
  pizza: "takeaway", burger: "takeaway", kebab: "takeaway", "fish and chips": "takeaway",
  pub: "pub", bar: "pub", "wine bar": "pub", "sports bar": "pub",
  bistro: "restaurant", grill: "restaurant", brasserie: "restaurant",
  physio: "spa", chiropractor: "spa", massage: "spa",
  gym: "gym", fitness: "gym", yoga: "gym", pilates: "gym", crossfit: "gym",
  "nail bar": "nail_bar", "nail salon": "nail_bar", nails: "nail_bar",
  "tattoo studio": "tattoo", "tattoo parlour": "tattoo", piercing: "tattoo",
  "pet shop": "pet_shop", "pet store": "pet_shop", pets: "pet_shop",
  solicitor: "accountant", lawyer: "accountant", consultant: "accountant",
  florist: "shop", boutique: "shop", grocer: "shop", "vape shop": "shop",
  "phone repair": "shop", "phone shop": "shop",
  roofer: "builder", painter: "builder", decorator: "builder",
  carpenter: "builder", fencer: "builder", tiler: "builder",
  gardener: "builder", handyman: "builder", cleaner: "builder",
  locksmith: "plumber", mechanic: "plumber",
};

function getBusinessProfile(businessType: string): BusinessProfile {
  const lower = businessType.toLowerCase().trim();
  if (BUSINESS_PROFILES[lower]) return BUSINESS_PROFILES[lower];
  if (ALIASES[lower] && BUSINESS_PROFILES[ALIASES[lower]]) return BUSINESS_PROFILES[ALIASES[lower]];

  // Fuzzy match
  for (const [key, profile] of Object.entries(BUSINESS_PROFILES)) {
    if (lower.includes(key)) return profile;
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (lower.includes(alias) && BUSINESS_PROFILES[target]) return BUSINESS_PROFILES[target];
  }

  // Fallback
  return BUSINESS_PROFILES.shop;
}

// ---------------------------------------------------------------------------
// Brief Builder
// ---------------------------------------------------------------------------

export function buildBrief(
  lead: {
    business_name: string;
    business_type?: string;
    phone?: string;
    email?: string;
    address?: string;
    google_rating?: number;
    google_review_count?: number;
    reviews_json?: string;
    opening_hours_json?: string;
    maps_embed_url?: string;
    lat?: number;
    lng?: number;
    business_description_raw?: string;
  },
  brand: BrandAnalysis | undefined,
  vertical: string,
): SiteBrief {
  const businessType = lead.business_type ?? "business";
  const profile = getBusinessProfile(businessType);

  const businessName = lead.business_name;
  const phone = lead.phone ?? "";
  const email = lead.email ?? `info@${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.co.uk`;
  const address = lead.address ?? "";

  // --- Services: prefer scraped, fall back to profile defaults ---
  const services: ServiceItem[] = [];
  if (brand?.services && brand.services.length > 0) {
    for (const s of brand.services.slice(0, 6)) {
      // Try to find a matching default for a better description
      const matchingDefault = profile.typicalServices.find(
        (d) => d.name.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(d.name.toLowerCase())
      );
      services.push({
        name: s,
        description: matchingDefault?.desc ?? `Professional ${s.toLowerCase()} tailored to your needs.`,
        isScraped: true,
      });
    }
  }
  // Fill remaining with profile defaults (but only ones not already covered)
  if (services.length < 4) {
    for (const d of profile.typicalServices) {
      if (services.length >= 6) break;
      if (services.some((s) => s.name.toLowerCase().includes(d.name.toLowerCase()))) continue;
      services.push({ name: d.name, description: d.desc, isScraped: false });
    }
  }

  // --- Reviews ---
  const reviews = safeJsonParse<ReviewItem[]>(lead.reviews_json, []);
  const bestReviews = reviews
    .filter((r) => r.rating >= 4 && r.text.length > 20)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 3);

  // --- Description ---
  let description = "";
  if (brand?.description && brand.description.length > 20) {
    description = brand.description;
  } else if (lead.business_description_raw && lead.business_description_raw.length > 20) {
    description = lead.business_description_raw;
  } else {
    const locationBit = address ? ` Based in ${address}, we serve` : " We serve";
    const ratingBit = lead.google_rating && lead.google_review_count && lead.google_review_count > 5
      ? ` With a ${lead.google_rating}-star rating from ${lead.google_review_count} reviews, we've built a reputation for quality.`
      : "";
    description = `${businessName} is your local ${businessType}.${locationBit} customers across the area with care and professionalism.${ratingBit}`;
  }

  // --- Hero copy ---
  const heroHeadline = generateSmartHeadline(businessName, businessType, profile, lead.google_rating);
  const heroSubtext = generateSmartSubtext(businessName, businessType, description, lead, profile);

  // --- CTA ---
  const ctaPrimary: CtaDirective = {
    text: profile.ctaText,
    action: profile.ctaAction,
    target: profile.ctaAction === "tel" ? phone
      : profile.ctaAction === "email" ? email
      : profile.ctaAction === "scroll" ? "#services"
      : "#contact",
    why: profile.ctaWhy,
  };

  const ctaSecondary = profile.secondaryCta
    ? {
        text: profile.secondaryCta.text,
        action: profile.secondaryCta.action,
        target: profile.secondaryCta.action === "scroll" ? "#services" : "#contact",
        why: profile.secondaryCta.why,
      }
    : undefined;

  // --- About copy ---
  const aboutCopy = generateAboutCopy(businessName, businessType, description, lead, profile);

  // --- Opening hours ---
  const openingHours = safeJsonParse<string[]>(lead.opening_hours_json, []);

  // --- Section ordering ---
  const sectionOrder: string[] = ["hero"];
  if (brand?.menu_items && brand.menu_items.length > 0 && ["food", "restaurant", "cafe", "takeaway", "bakery"].some((t) => businessType.toLowerCase().includes(t))) {
    sectionOrder.push("menu");
  }
  sectionOrder.push("services");
  if (bestReviews.length > 0) sectionOrder.push("reviews");
  if (brand?.photo_inventory && brand.photo_inventory.filter((p) => p.usable_for.includes("gallery")).length >= 2) {
    sectionOrder.push("gallery");
  }
  sectionOrder.push("about");
  if (openingHours.length > 0) sectionOrder.push("hours");
  sectionOrder.push("cta", "contact");
  if (lead.maps_embed_url) sectionOrder.push("map");

  // --- Build the brief ---
  const brief: SiteBrief = {
    businessName,
    businessType,
    vertical,
    specificCategory: businessType.toLowerCase(),
    description,
    services,
    phone,
    email,
    address,
    lat: lead.lat,
    lng: lead.lng,
    mapsEmbedUrl: lead.maps_embed_url,
    openingHours,
    googleRating: lead.google_rating,
    googleReviewCount: lead.google_review_count,
    bestReviews,
    hasLogo: !!(brand?.logo_path),
    hasHeroImage: !!(brand?.photo_inventory?.some((p) => p.usable_for.includes("hero"))),
    galleryImageCount: brand?.photo_inventory?.filter((p) => p.usable_for.includes("gallery")).length ?? 0,
    brandColourSource: brand?.colours?.palette_source ?? "vertical_default",
    heroHeadline,
    heroSubtext,
    ctaPrimary,
    ctaSecondary,
    aboutCopy,
    trustBadges: profile.trustBadges,
    sectionOrder,
    avoidTopics: profile.avoidTopics,
    menuItems: brand?.menu_items,
    markdown: "", // will be filled below
  };

  brief.markdown = generateMarkdown(brief);
  return brief;
}

// ---------------------------------------------------------------------------
// Smart copy generators
// ---------------------------------------------------------------------------

function generateSmartHeadline(
  name: string,
  type: string,
  profile: BusinessProfile,
  rating?: number,
): string {
  const cap = capitalize(type);

  // Rating-led headline for highly rated businesses
  if (rating && rating >= 4.5) {
    return `${name} — Rated ${rating} Stars`;
  }

  // Type-specific headlines
  const headlines: Record<string, string[]> = {
    barber: [`Fresh Cuts at ${name}`, `Your Style, Perfected`, `The Barber Shop Experience`],
    salon: [`Beautiful Hair Starts Here`, `Welcome to ${name}`, `Your Style, Our Passion`],
    restaurant: [`Welcome to ${name}`, `A Taste of Something Special`, `Great Food, Great Company`],
    cafe: [`Your Neighbourhood Coffee Spot`, `Welcome to ${name}`, `Good Coffee, Good Vibes`],
    takeaway: [`Hot Food, Fast Delivery`, `Order from ${name}`, `Your Favourites, Delivered`],
    plumber: [`Reliable ${cap} You Can Trust`, `${cap} Done Right`, `Your Local ${cap}`],
    electrician: [`Safe, Certified Electrical Work`, `Your Trusted ${cap}`, `Electrical Services Done Right`],
    builder: [`Quality Building Work`, `Your Trusted Local Builder`, `Building Your Vision`],
    accountant: [`Expert Financial Guidance`, `${cap} Services You Can Trust`, `Numbers Made Simple`],
    dentist: [`Gentle, Professional Dental Care`, `Smile With Confidence`, `Your Family ${cap}`],
    shop: [`Welcome to ${name}`, `Discover Something Special`, `Quality Products, Personal Service`],
  };

  const options = headlines[type.toLowerCase()] ?? headlines[profile.ctaText.includes("Quote") ? "plumber" : "shop"] ?? [`Welcome to ${name}`];
  return options[hashString(name) % options.length];
}

function generateSmartSubtext(
  name: string,
  type: string,
  description: string,
  lead: { google_rating?: number; google_review_count?: number; address?: string },
  _profile: BusinessProfile,
): string {
  // Use scraped description if available and good
  if (description.length > 30 && description.length < 200) {
    return description;
  }

  const parts: string[] = [];
  parts.push(`${name} — your local ${type}`);
  if (lead.address) parts.push(`serving ${lead.address} and surrounding areas`);
  if (lead.google_rating && lead.google_review_count && lead.google_review_count > 5) {
    parts.push(`Rated ${lead.google_rating} stars by ${lead.google_review_count} customers`);
  }

  return parts.join(". ") + ".";
}

function generateAboutCopy(
  name: string,
  type: string,
  description: string,
  lead: { google_rating?: number; google_review_count?: number; address?: string },
  _profile: BusinessProfile,
): string {
  if (description.length > 50) return description;

  const parts: string[] = [];
  parts.push(`${name} is a dedicated local ${type}`);
  if (lead.address) parts.push(`based in ${lead.address}`);
  parts.push("We take pride in delivering excellent results every time");
  if (lead.google_review_count && lead.google_review_count > 10) {
    parts.push(`With over ${lead.google_review_count} positive reviews, our reputation speaks for itself`);
  }

  return parts.join(". ") + ".";
}

// ---------------------------------------------------------------------------
// Markdown generator
// ---------------------------------------------------------------------------

function generateMarkdown(brief: SiteBrief): string {
  const lines: string[] = [];

  lines.push(`# Site Brief: ${brief.businessName}`);
  lines.push(`> Generated ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Business Identity");
  lines.push(`- **Name:** ${brief.businessName}`);
  lines.push(`- **Type:** ${brief.businessType} (${brief.vertical} vertical)`);
  lines.push(`- **Category:** ${brief.specificCategory}`);
  lines.push(`- **Phone:** ${brief.phone}`);
  lines.push(`- **Email:** ${brief.email}`);
  lines.push(`- **Address:** ${brief.address}`);
  lines.push("");

  lines.push("## Brand Assets");
  lines.push(`- Logo: ${brief.hasLogo ? "✅ Available" : "❌ Not found"}`);
  lines.push(`- Hero image: ${brief.hasHeroImage ? "✅ Available" : "❌ Not found"}`);
  lines.push(`- Gallery images: ${brief.galleryImageCount}`);
  lines.push(`- Colour source: ${brief.brandColourSource}`);
  lines.push("");

  lines.push("## Copy Directives");
  lines.push("");
  lines.push(`### Hero`);
  lines.push(`- **Headline:** ${brief.heroHeadline}`);
  lines.push(`- **Subtext:** ${brief.heroSubtext}`);
  lines.push("");

  lines.push("### CTAs");
  lines.push(`- **Primary:** "${brief.ctaPrimary.text}" → ${brief.ctaPrimary.action}:${brief.ctaPrimary.target}`);
  lines.push(`  - *Why:* ${brief.ctaPrimary.why}`);
  if (brief.ctaSecondary) {
    lines.push(`- **Secondary:** "${brief.ctaSecondary.text}" → ${brief.ctaSecondary.action}:${brief.ctaSecondary.target}`);
    lines.push(`  - *Why:* ${brief.ctaSecondary.why}`);
  }
  lines.push("");

  lines.push("### Trust Badges");
  for (const badge of brief.trustBadges) {
    lines.push(`- ✓ ${badge}`);
  }
  lines.push("");

  lines.push("### About Copy");
  lines.push(brief.aboutCopy);
  lines.push("");

  lines.push("## Services");
  for (const s of brief.services) {
    lines.push(`- **${s.name}** ${s.isScraped ? "(scraped)" : "(default)"}`);
    lines.push(`  ${s.description}`);
  }
  lines.push("");

  if (brief.bestReviews.length > 0) {
    lines.push("## Best Reviews");
    for (const r of brief.bestReviews) {
      lines.push(`- ⭐${r.rating} **${r.author}**: "${r.text.slice(0, 150)}${r.text.length > 150 ? "…" : ""}"`);
    }
    lines.push("");
  }

  if (brief.openingHours.length > 0) {
    lines.push("## Opening Hours");
    for (const h of brief.openingHours) {
      lines.push(`- ${h}`);
    }
    lines.push("");
  }

  if (brief.menuItems && brief.menuItems.length > 0) {
    lines.push("## Menu");
    for (const item of brief.menuItems.slice(0, 15)) {
      lines.push(`- ${item.name}${item.price ? ` — ${item.price}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Section Order");
  for (let i = 0; i < brief.sectionOrder.length; i++) {
    lines.push(`${i + 1}. ${brief.sectionOrder[i]}`);
  }
  lines.push("");

  lines.push("## Avoid Topics");
  lines.push(`Do NOT mention: ${brief.avoidTopics.join(", ")}`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Brief Generator Agent
// ---------------------------------------------------------------------------

export const briefGeneratorAgent: AgentHandler = async (input) => {
  const upstream = input.upstreamArtifacts as Record<string, {
    profiles?: Array<Record<string, unknown>>;
    analyses?: BrandAnalysis[];
  }>;

  // Support _upstream_inject from config (used when brief is the first pipeline node)
  const injected = (input.config as Record<string, unknown> | undefined)?._upstream_inject as {
    profiles?: Array<Record<string, unknown>>;
    analyses?: BrandAnalysis[];
  } | undefined;

  const profiles: Array<Record<string, unknown>> = [];
  const brandAnalyses = new Map<string, BrandAnalysis>();

  // Merge upstream artifacts
  for (const nodeOutput of Object.values(upstream)) {
    if (nodeOutput?.profiles) profiles.push(...nodeOutput.profiles);
    if (nodeOutput?.analyses) {
      for (const a of nodeOutput.analyses) brandAnalyses.set(a.lead_id, a);
    }
  }

  // Merge injected data (from pipeline config when brief is first node)
  if (injected?.profiles) profiles.push(...injected.profiles);
  if (injected?.analyses) {
    for (const a of injected.analyses) brandAnalyses.set(a.lead_id, a);
  }

  const briefs: SiteBrief[] = [];

  // Track per-lead context for decision attribution.
  const briefMeta: Array<{ lead_id: string; vertical: string; specificCategory: string; hasScrapedServices: boolean; hasReviews: boolean; brandColourSource: string }> = [];

  for (const profile of profiles) {
    const leadId = (profile.lead_id as string) ?? `lead-${Date.now()}`;
    const vertical = resolveVertical((profile.business_type as string) ?? "general");
    const brand = brandAnalyses.get(leadId);

    const brief = buildBrief(
      profile as Parameters<typeof buildBrief>[0],
      brand,
      vertical,
    );

    // Save the markdown brief to the asset directory
    try {
      ensureLeadDir(leadId);
      const briefPath = join(getLeadDir(leadId), "site-brief.md");
      writeFileSync(briefPath, brief.markdown);
    } catch { /* non-fatal */ }

    briefs.push(brief);
    briefMeta.push({
      lead_id: leadId,
      vertical,
      specificCategory: brief.specificCategory,
      hasScrapedServices: brief.services.some((s) => s.isScraped),
      hasReviews: brief.bestReviews.length > 0,
      brandColourSource: brief.brandColourSource,
    });
  }

  return {
    summary: `Generated ${briefs.length} site briefs. ${briefs.filter((b) => b.bestReviews.length > 0).length} with reviews, ${briefs.filter((b) => b.services.some((s) => s.isScraped)).length} with scraped services.`,
    artifacts: {
      briefs,
      profiles, // pass through
      analyses: [...brandAnalyses.values()],
      // Per-lead decisions tied to each brief — outcome attribution finds
      // these via `lead_id:<id>` and the design choices encoded in tags.
      _decisions: briefMeta.map((m) => ({
        lead_id: m.lead_id,
        reasoning: `Brief built for ${m.specificCategory}: vertical=${m.vertical}, scrapedServices=${m.hasScrapedServices}, reviewsCaptured=${m.hasReviews}, brandColourSource=${m.brandColourSource}`,
        alternatives: [],
        confidence: m.hasScrapedServices && m.hasReviews ? 0.85 : 0.6,
        tags: [
          `vertical:${m.vertical}`,
          `category:${m.specificCategory}`,
          `brand_source:${m.brandColourSource}`,
          ...(m.hasReviews ? ["has_reviews:true"] : ["has_reviews:false"]),
          ...(m.hasScrapedServices ? ["scraped_services:true"] : ["scraped_services:false"]),
        ],
      })),
    },
  };
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function resolveVertical(businessType: string): string {
  const lower = (businessType ?? "").toLowerCase();
  const trades = ["plumber", "electrician", "builder", "roofer", "painter", "decorator", "carpenter", "locksmith", "mechanic", "gardener", "cleaner", "handyman", "fencer", "tiler"];
  const food = ["restaurant", "cafe", "takeaway", "caterer", "baker", "bakery", "butcher", "pub", "bar", "bistro", "pizza", "coffee", "kitchen", "grill"];
  const health = ["dentist", "salon", "barber", "physio", "chiropractor", "spa", "gym", "fitness", "yoga", "beauty", "massage", "therapist", "clinic"];
  const professional = ["accountant", "lawyer", "solicitor", "architect", "consultant", "tutor", "financial", "estate agent"];
  const retail = ["shop", "store", "florist", "grocer", "pet", "nursery", "boutique", "jeweller"];

  if (trades.some((t) => lower.includes(t))) return "trades";
  if (food.some((t) => lower.includes(t))) return "food";
  if (health.some((t) => lower.includes(t))) return "health";
  if (professional.some((t) => lower.includes(t))) return "professional";
  if (retail.some((t) => lower.includes(t))) return "retail";
  return "trades";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function safeJsonParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

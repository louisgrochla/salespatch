import { createLogger } from "../../lib/logger.js";
import { pLimit } from "../../lib/concurrency.js";
import { ensureLeadDir, saveFromUrl } from "../../lib/assetStore.js";
import { AgentHandler } from "../../pipeline/agentRuntime.js";

const log = createLogger("lead-scout");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface LeadScoutConfig {
  campaign_id?: string;
  vertical?: string;
  verticals?: string[];
  location: string;
  max_results?: number;
  max_results_per_vertical?: number;
  sources?: string[];
  /** Skip Place Details enrichment (faster, less data) */
  skip_details?: boolean;
  /** Max photos to download per lead */
  max_photos_per_lead?: number;
}

// ---------------------------------------------------------------------------
// Vertical classification
// ---------------------------------------------------------------------------

export type VerticalCategory = "food" | "beauty" | "retail" | "professional" | "trades" | "unknown";

const PREFERRED_VERTICALS = [
  // Food & drink
  "restaurant", "cafe", "takeaway", "bakery", "pub", "bar", "deli", "juice bar",
  // Beauty
  "barber", "salon", "hairdresser", "spa", "nail bar", "tanning", "tattoo",
  // Health
  "dentist", "physio", "chiropractor", "optician", "vet", "pharmacy",
  // Trades
  "plumber", "electrician", "roofer", "locksmith", "painter", "gardener", "builder", "handyman",
  // Automotive
  "garage", "MOT centre", "car wash", "tyre shop", "auto repair",
  // Fitness
  "gym", "fitness",
  // Retail
  "florist", "pet shop", "dry cleaner", "tailor", "gift shop", "jeweller", "boutique", "shop",
  // Services
  "accountant", "solicitor", "estate agent", "tutor", "photographer",
];

const TRADES_KEYWORDS = [
  "plumb", "electri", "build", "roof", "locksmith", "garden",
  "landscap", "decorator", "painter", "carpenter", "joiner",
  "glazier", "tiler", "paving", "fenc", "gutter", "pest control",
  "handyman", "removal", "clean", "window clean", "drain",
];

const KNOWN_CHAINS = [
  // Fast food
  "mcdonald", "burger king", "kfc", "subway", "domino", "pizza hut", "five guys",
  "taco bell", "wendy", "papa john",
  // Coffee
  "costa", "starbucks", "caffe nero", "pret a manger", "pret ",
  // High street food
  "greggs", "nando", "wagamama", "zizzi", "pizza express", "yo sushi",
  "frankie & benny", "tgi friday", "ask italian", "prezzo", "bella italia",
  "harvester", "beefeater", "toby carvery", "hungry horse",
  // Pubs
  "wetherspoon", "slug and lettuce", "all bar one", "greene king",
  // Hair
  "toni & guy", "toni&guy", "supercuts", "rush hair", "headmasters",
  // Retail
  "tesco", "sainsbury", "asda", "aldi", "lidl", "morrisons", "waitrose",
  "boots", "superdrug", "the body shop",
  // Fitness
  "anytime fitness", "puregym", "pure gym", "the gym group", "david lloyd",
  "nuffield health", "virgin active", "bannatyne",
  // Bakery / specialty
  "cake box", "black sheep coffee", "gail's",
  // Other
  "specsavers", "vision express", "halfords", "kwik fit",
];

const GOOGLE_TYPE_TO_CATEGORY: Record<string, VerticalCategory> = {
  restaurant: "food", food: "food", cafe: "food", bakery: "food",
  bar: "food", meal_takeaway: "food", meal_delivery: "food", night_club: "food",
  hair_care: "beauty", beauty_salon: "beauty", spa: "beauty", gym: "beauty", health: "beauty",
  store: "retail", shopping_mall: "retail", clothing_store: "retail",
  shoe_store: "retail", pet_store: "retail", florist: "retail",
  book_store: "retail", electronics_store: "retail",
  jewelry_store: "retail", furniture_store: "retail", home_goods_store: "retail",
  dentist: "professional", doctor: "professional", lawyer: "professional",
  accounting: "professional", real_estate_agency: "professional",
  veterinary_care: "professional", pharmacy: "professional",
  plumber: "trades", electrician: "trades", roofing_contractor: "trades",
  locksmith: "trades", painter: "trades", moving_company: "trades",
  general_contractor: "trades",
};

function classifyVertical(name: string, type: string | undefined, googleTypes: string[]): VerticalCategory {
  for (const gType of googleTypes) {
    const cat = GOOGLE_TYPE_TO_CATEGORY[gType];
    if (cat) return cat;
  }
  const combined = `${name} ${type ?? ""}`.toLowerCase();
  for (const kw of TRADES_KEYWORDS) {
    if (combined.includes(kw)) return "trades";
  }
  if (/restaurant|cafe|coffee|pizza|burger|kebab|takeaway|bakery|pub|bar|grill|kitchen|diner|bistro|sushi|thai|indian|chinese|chippy|fish/i.test(combined)) return "food";
  if (/barber|salon|hair|beauty|spa|nail|tattoo|gym|fitness|yoga|pilates|wax/i.test(combined)) return "beauty";
  if (/shop|store|boutique|florist|pet|phone|repair|vape|jewel|gift|book|cloth/i.test(combined)) return "retail";
  if (/dentist|doctor|solicitor|accountant|estate agent|vet|pharmacy|optician|physio/i.test(combined)) return "professional";
  return "unknown";
}

function hasPremisesSignal(googleTypes: string[]): boolean {
  const premisesTypes = [
    "store", "restaurant", "cafe", "bar", "bakery", "salon",
    "beauty_salon", "hair_care", "spa", "gym", "shopping_mall",
    "clothing_store", "pet_store", "florist", "establishment",
    "food", "meal_takeaway", "night_club", "dentist", "pharmacy",
    "veterinary_care", "book_store",
  ];
  return googleTypes.some((t) => premisesTypes.includes(t));
}

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  return KNOWN_CHAINS.some((chain) => lower.includes(chain));
}

// ---------------------------------------------------------------------------
// Apify Google Maps scraper result shape
// ---------------------------------------------------------------------------

interface ApifyPlaceResult {
  title?: string;
  address?: string;
  phone?: string;
  website?: string;
  categoryName?: string;
  totalScore?: number;
  reviewsCount?: number;
  url?: string;
  placeId?: string;
  location?: { lat: number; lng: number };
  openingHours?: Array<{ day: string; hours: string }>;
  description?: string;
  imageUrls?: string[];
  reviews?: Array<{
    name?: string;
    text?: string;
    stars?: number;
    publishedAtDate?: string;
  }>;
  priceLevel?: string;
  isAdvertisement?: boolean;
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const leadScoutAgent: AgentHandler = async (input) => {
  const config = (input.config ?? {}) as Partial<LeadScoutConfig>;
  const location = config.location ?? "unknown";
  const campaignId = config.campaign_id ?? input.run_id;
  const maxPerVertical = config.max_results_per_vertical ?? config.max_results ?? 5;
  const maxPhotosPerLead = config.max_photos_per_lead ?? 5;

  const verticals = config.verticals ?? (config.vertical ? [config.vertical] : PREFERRED_VERTICALS.slice(0, 6));

  const leads: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();

  const apifyToken = process.env.APIFY_API_TOKEN;

  if (apifyToken) {
    // ── Apify Google Maps scraper ──
    // Build search queries — one per vertical
    const searchStrings = verticals.map((v) => `${v} in ${location}`);

    log.info("starting Apify Google Maps scrape", {
      queries: searchStrings.length,
      maxPerSearch: maxPerVertical,
      location,
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000); // 3 min timeout

      const response = await fetch(
        `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${apifyToken}&timeout=120`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchStringsArray: searchStrings,
            maxCrawledPlacesPerSearch: maxPerVertical,
            language: "en",
            deeperCityScrape: false,
            onePerQuery: false,
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text();
        errors.push(`Apify Google Maps error: ${response.status} — ${body.slice(0, 200)}`);
      } else {
        const results = (await response.json()) as ApifyPlaceResult[];

        log.info(`Apify returned ${results.length} places`);

        for (const place of results) {
          if (!place.title) continue;
          if (place.isAdvertisement) continue;

          // Deduplicate by name
          const nameKey = place.title.toLowerCase().trim();
          if (seenNames.has(nameKey)) continue;
          seenNames.add(nameKey);

          // Determine vertical from the search query that found this result
          const matchedVertical = verticals.find((v) =>
            (place.categoryName ?? "").toLowerCase().includes(v.toLowerCase()),
          ) ?? verticals[0];

          const googleTypes = place.categoryName ? [place.categoryName.toLowerCase().replace(/\s+/g, "_")] : [];
          const verticalCategory = classifyVertical(place.title, matchedVertical, googleTypes);

          const leadId = `lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          // Parse opening hours into weekday_text format
          const openingHours = place.openingHours
            ? place.openingHours.map((h) => `${h.day}: ${h.hours}`)
            : undefined;

          // Parse reviews
          const reviews = place.reviews
            ? place.reviews.slice(0, 5).map((r) => ({
                author: r.name ?? "Anonymous",
                rating: r.stars ?? 5,
                text: r.text ?? "",
                time: r.publishedAtDate ? new Date(r.publishedAtDate).getTime() / 1000 : 0,
                relative_time: "",
              }))
            : undefined;

          // Download photos
          let photosDownloaded = 0;
          const photoFilenames: string[] = [];
          if (place.imageUrls && place.imageUrls.length > 0) {
            ensureLeadDir(leadId);
            for (let i = 0; i < Math.min(place.imageUrls.length, maxPhotosPerLead); i++) {
              const filename = `google_photo_${i + 1}.jpg`;
              try {
                const meta = await saveFromUrl(leadId, filename, place.imageUrls[i], "gallery");
                if (meta) {
                  photoFilenames.push(filename);
                  photosDownloaded++;
                }
              } catch { /* non-fatal */ }
            }
          }

          leads.push({
            lead_id: leadId,
            business_name: place.title,
            address: place.address ?? "",
            google_place_id: place.placeId ?? "",
            google_maps_url: place.url ?? "",
            google_rating: place.totalScore,
            google_review_count: place.reviewsCount,
            website_url: place.website ?? null,
            has_website: place.website ? 1 : 0,
            business_type: matchedVertical,
            vertical_category: verticalCategory,
            has_premises: hasPremisesSignal(googleTypes) || verticalCategory !== "trades",
            is_chain: isChain(place.title),
            google_types: googleTypes,
            lat: place.location?.lat,
            lng: place.location?.lng,
            source: "apify_google_maps",
            phone: place.phone,
            description: place.description,
            opening_hours: openingHours,
            reviews,
            review_count_detailed: reviews?.length,
            google_photos_downloaded: photosDownloaded,
            google_photo_filenames: photoFilenames,
            price_level: place.priceLevel ? parsePriceLevel(place.priceLevel) : undefined,
            business_status: "OPERATIONAL",
          });
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        errors.push("Apify Google Maps scrape timed out after 3 minutes");
      } else {
        errors.push(`Apify Google Maps scrape failed: ${String(err)}`);
      }
    }

    log.info("Apify scrape complete", {
      total: leads.length,
      with_website: leads.filter((l) => l.website_url).length,
      with_phone: leads.filter((l) => l.phone).length,
      with_photos: leads.filter((l) => (l.google_photos_downloaded as number) > 0).length,
    });
  }

  // Companies House (UK)
  if (!config.sources || config.sources.includes("companies_house")) {
    const chApiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (chApiKey) {
      try {
        for (const vertical of verticals.slice(0, 3)) {
          const query = encodeURIComponent(`${vertical} ${location}`);
          const url = `https://api.company-information.service.gov.uk/search/companies?q=${query}&items_per_page=10`;
          const response = await fetch(url, {
            headers: { Authorization: `Basic ${Buffer.from(`${chApiKey}:`).toString("base64")}` },
          });
          if (response.ok) {
            const data = (await response.json()) as {
              items?: Array<{ company_number: string; title: string; address_snippet: string; company_status: string }>;
            };
            for (const company of (data.items ?? []).filter((c) => c.company_status === "active")) {
              const exists = leads.some((l) => (l.business_name as string).toLowerCase() === company.title.toLowerCase());
              if (!exists) {
                leads.push({
                  lead_id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  business_name: company.title,
                  address: company.address_snippet,
                  companies_house_number: company.company_number,
                  has_website: 0,
                  business_type: vertical,
                  vertical_category: classifyVertical(company.title, vertical, []),
                  has_premises: false,
                  is_chain: isChain(company.title),
                  source: "companies_house",
                });
              }
            }
          }
        }
      } catch (err) {
        errors.push(`Companies House fetch failed: ${String(err)}`);
      }
    }
  }

  // Mock fallback
  if (leads.length === 0 && errors.length === 0) {
    const mockVerticals = verticals.length > 0 ? verticals : ["restaurant", "barber", "cafe"];
    let idx = 0;
    for (const v of mockVerticals) {
      for (let i = 1; i <= 3; i++) {
        idx++;
        const category = classifyVertical(v, v, []);
        leads.push({
          lead_id: `lead-mock-${idx}`,
          business_name: `${v.charAt(0).toUpperCase() + v.slice(1)} Business ${idx}`,
          address: `${idx * 10} High Street, ${location}`,
          business_type: v,
          vertical_category: category,
          has_premises: category !== "trades",
          is_chain: false,
          has_website: idx % 3 === 0 ? 1 : 0,
          source: "mock",
          google_rating: Number((3.5 + Math.random() * 1.5).toFixed(1)),
          google_review_count: Math.floor(Math.random() * 150),
        });
      }
    }
  }

  // Summary stats
  const byCategory = new Map<string, number>();
  for (const lead of leads) {
    const cat = (lead.vertical_category as string) ?? "unknown";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }
  const categoryBreakdown = Object.fromEntries(byCategory);
  const withPhotos = leads.filter((l) => (l.google_photos_downloaded as number) > 0).length;
  const withWebsite = leads.filter((l) => l.website_url).length;
  const chains = leads.filter((l) => l.is_chain).length;

  return {
    summary: `Scouted ${leads.length} leads in "${location}". Categories: ${JSON.stringify(categoryBreakdown)}. ${withWebsite} with websites. ${withPhotos} with photos. ${chains} chains.`,
    artifacts: {
      campaign_id: campaignId,
      verticals,
      location,
      leads,
      lead_count: leads.length,
      category_breakdown: categoryBreakdown,
      enrichment: { with_website: withWebsite, with_photos: withPhotos, chains },
      errors: errors.length > 0 ? errors : undefined,
      _decision: {
        reasoning: `Searched ${verticals.length} verticals via Google Places. Found ${leads.length} leads. Enriched with Place Details: ${withWebsite} websites, ${withPhotos} with photos. ${chains} identified as chains.`,
        alternatives: ["Could use Google Places Nearby Search for radius", "Could add Yelp/TripAdvisor as sources"],
        confidence: leads.length >= 10 ? 0.85 : 0.5,
        tags: [`location:${location}`, ...verticals.map((v) => `vertical:${v}`)],
      },
    },
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePriceLevel(priceStr: string): number | undefined {
  // Apify returns "$", "$$", "$$$", "$$$$" or similar
  const dollarCount = (priceStr.match(/[$£]/g) ?? []).length;
  return dollarCount > 0 ? dollarCount : undefined;
}

export { classifyVertical, hasPremisesSignal, isChain };

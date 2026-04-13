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
// Google Places API types
// ---------------------------------------------------------------------------

interface PlaceSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry?: { location?: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  website?: string;
  types?: string[];
}

interface PlaceDetails {
  name?: string;
  formatted_phone_number?: string;
  website?: string;
  url?: string;
  price_level?: number;
  business_status?: string;
  editorial_summary?: { overview?: string };
  opening_hours?: { weekday_text?: string[] };
  reviews?: Array<{
    author_name: string;
    rating: number;
    text: string;
    time: number;
    relative_time_description: string;
  }>;
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
    html_attributions: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const leadScoutAgent: AgentHandler = async (input) => {
  const config = (input.config ?? {}) as Partial<LeadScoutConfig>;
  const location = config.location ?? "unknown";
  const campaignId = config.campaign_id ?? input.run_id;
  const maxPerVertical = config.max_results_per_vertical ?? config.max_results ?? 5;
  const skipDetails = config.skip_details ?? false;
  const maxPhotosPerLead = config.max_photos_per_lead ?? 5;

  const verticals = config.verticals ?? (config.vertical ? [config.vertical] : PREFERRED_VERTICALS.slice(0, 6));

  const leads: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const seenPlaceIds = new Set<string>();

  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (googleApiKey) {
    // ── Step 1: Text Search per vertical ──
    for (const vertical of verticals) {
      try {
        const query = encodeURIComponent(`${vertical} in ${location}`);
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${googleApiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
          errors.push(`Google Places error for "${vertical}": ${response.status}`);
          continue;
        }

        const data = (await response.json()) as { results?: PlaceSearchResult[]; status?: string };

        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
          errors.push(`Google Places status for "${vertical}": ${data.status}`);
          continue;
        }

        for (const place of (data.results ?? []).slice(0, maxPerVertical)) {
          if (seenPlaceIds.has(place.place_id)) continue;
          seenPlaceIds.add(place.place_id);

          const googleTypes = place.types ?? [];
          const verticalCategory = classifyVertical(place.name, vertical, googleTypes);

          leads.push({
            lead_id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            business_name: place.name,
            address: place.formatted_address,
            google_place_id: place.place_id,
            google_maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            google_rating: place.rating,
            google_review_count: place.user_ratings_total,
            website_url: place.website ?? null,
            has_website: place.website ? 1 : 0,
            business_type: vertical,
            vertical_category: verticalCategory,
            has_premises: hasPremisesSignal(googleTypes),
            is_chain: isChain(place.name),
            google_types: googleTypes,
            lat: place.geometry?.location?.lat,
            lng: place.geometry?.location?.lng,
            source: "google_places",
          });
        }

        log.info(`searched "${vertical}" in ${location}`, {
          results: (data.results ?? []).length,
          total: leads.length,
        });
      } catch (err) {
        errors.push(`Google Places fetch failed for "${vertical}": ${String(err)}`);
      }
    }

    // ── Step 2: Place Details enrichment ──
    if (!skipDetails && leads.length > 0) {
      const run = pLimit(3);
      log.info("enriching leads with Place Details API", { count: leads.length });

      await Promise.all(
        leads.map((lead) =>
          run(async () => {
            const placeId = lead.google_place_id as string;
            const leadId = lead.lead_id as string;
            if (!placeId) return;

            try {
              const details = await fetchPlaceDetails(placeId, googleApiKey);
              if (!details) return;

              // Enrich lead with details data
              if (details.website && !lead.website_url) {
                lead.website_url = details.website;
                lead.has_website = 1;
              }
              if (details.formatted_phone_number) {
                lead.phone = details.formatted_phone_number;
              }
              if (details.price_level !== undefined) {
                lead.price_level = details.price_level;
              }
              if (details.business_status) {
                lead.business_status = details.business_status;
              }
              if (details.editorial_summary?.overview) {
                lead.description = details.editorial_summary.overview;
              }
              if (details.opening_hours?.weekday_text) {
                lead.opening_hours = details.opening_hours.weekday_text;
              }
              if (details.url) {
                lead.google_maps_url = details.url;
              }

              // Reviews
              if (details.reviews && details.reviews.length > 0) {
                lead.reviews = details.reviews.map((r) => ({
                  author: r.author_name,
                  rating: r.rating,
                  text: r.text,
                  time: r.time,
                  relative_time: r.relative_time_description,
                }));
                lead.review_count_detailed = details.reviews.length;
              }

              // Photo download
              if (details.photos && details.photos.length > 0) {
                ensureLeadDir(leadId);
                const photoUrls: string[] = [];
                const photosToDownload = details.photos.slice(0, maxPhotosPerLead);

                for (let i = 0; i < photosToDownload.length; i++) {
                  const photo = photosToDownload[i];
                  const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photo.photo_reference}&key=${googleApiKey}`;
                  const filename = `google_photo_${i + 1}.jpg`;
                  try {
                    const meta = await saveFromUrl(leadId, filename, photoUrl, "gallery");
                    if (meta) {
                      photoUrls.push(filename);
                    }
                  } catch {
                    // Photo download failures are non-fatal
                  }
                }

                lead.google_photos_downloaded = photoUrls.length;
                lead.google_photo_filenames = photoUrls;
                log.debug(`downloaded ${photoUrls.length} photos for ${lead.business_name}`);
              }
            } catch (err) {
              log.warn(`Place Details failed for ${lead.business_name}`, { error: String(err) });
            }
          }),
        ),
      );

      const enriched = leads.filter((l) => l.phone || l.description || (l.google_photos_downloaded as number) > 0);
      log.info("enrichment complete", {
        enriched: enriched.length,
        total: leads.length,
        with_website: leads.filter((l) => l.website_url).length,
        with_phone: leads.filter((l) => l.phone).length,
        with_photos: leads.filter((l) => (l.google_photos_downloaded as number) > 0).length,
      });
    }
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
// Google Places Detail API
// ---------------------------------------------------------------------------

async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetails | null> {
  const fields = [
    "name", "formatted_phone_number", "website", "url",
    "price_level", "business_status", "editorial_summary",
    "opening_hours", "reviews", "photos",
  ].join(",");

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = (await response.json()) as { result?: PlaceDetails; status?: string };
  if (data.status !== "OK") return null;

  return data.result ?? null;
}

export { classifyVertical, hasPremisesSignal, isChain };

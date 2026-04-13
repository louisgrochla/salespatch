import { AgentHandler } from "../../pipeline/agentRuntime.js";
import { createLogger } from "../../lib/logger.js";
import { pLimit } from "../../lib/concurrency.js";
import {
  ensureLeadDir,
  saveBuffer,
  saveScreenshot,
  saveFromUrl,
  getManifest,
  type AssetMetadata,
} from "../../lib/assetStore.js";

const log = createLogger("lead-profiler");
const PROFILER_CONCURRENCY = Number(process.env.PROFILER_CONCURRENCY ?? "2");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadToProfile {
  lead_id?: string;
  business_name: string;
  business_type?: string;
  vertical_category?: string;
  website_url?: string | null;
  google_maps_url?: string | null;
  google_place_id?: string;
  google_rating?: number;
  google_review_count?: number;
  address?: string;
  phone?: string;
  email?: string;
  facebook_url?: string | null;
  instagram_url?: string | null;
  // Enriched data from scout (Place Details API)
  description?: string;
  price_level?: number;
  business_status?: string;
  opening_hours?: string[];
  reviews?: Array<{ author: string; rating: number; text: string; time?: number; relative_time?: string }>;
  google_photos_downloaded?: number;
  google_photo_filenames?: string[];
  has_premises?: boolean;
  is_chain?: boolean;
  lat?: number;
  lng?: number;
}

export interface SocialProfile {
  platform: string;
  url: string;
  profile_image_url?: string;
  screenshot_path?: string;
  bio?: string;
  post_images: string[];
  cover_photo_path?: string;
  page_info?: Record<string, string>;
}

export interface GoogleBusinessData {
  photos: string[];           // saved filenames
  reviews: GoogleReview[];
  opening_hours?: string[];
  categories?: string[];
  address_formatted?: string;
  lat?: number;
  lng?: number;
  maps_embed_url?: string;
  screenshot_path?: string;
}

export interface GoogleReview {
  author: string;
  rating: number;
  text: string;
  relative_time?: string;
}

export interface ProfileResult {
  lead_id?: string;
  business_name: string;
  business_type?: string;
  google_rating: number | null;
  google_review_count: number | null;
  address?: string;
  phone?: string;
  email?: string;
  has_website: 0 | 1;
  has_ssl: 0 | 1;
  is_mobile_friendly: 0 | 1;
  has_social_links: 0 | 1;
  social_links_json: string;
  website_tech_stack: string;
  website_quality_score: number;
  pain_points_json: string;
  profiled_at: string;
  // Brand scraping fields
  brand_colours_json: string;
  brand_fonts_json: string;
  brand_assets_json: string;
  social_profiles_json: string;
  business_description_raw?: string;
  services_extracted_json: string;
  menu_items_json?: string;
  screenshot_path?: string;
  logo_path?: string;
  // Google Business data
  google_business_json: string;
  // Opening hours
  opening_hours_json?: string;
  // Reviews for testimonials
  reviews_json?: string;
  // Instagram data (via Apify)
  instagram_json?: string;
  instagram_followers?: number;
  instagram_handle?: string;
  // Scout enrichment pass-through (for qualifier)
  vertical_category?: string;
  has_premises?: boolean;
  is_chain?: boolean;
  price_level?: number;
  google_photos_downloaded?: number;
  // Location
  lat?: number;
  lng?: number;
  maps_embed_url?: string;
}

interface ScrapedBrandColours {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
  source: "css" | "meta" | "default";
}

// ---------------------------------------------------------------------------
// Playwright lazy loader
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _playwright: any | null | undefined;

async function getPlaywright(): Promise<any | null> {
  if (_playwright !== undefined) return _playwright;
  try {
    _playwright = await import("playwright");
    return _playwright;
  } catch {
    _playwright = null;
    return null;
  }
}

const PI_SAFE_ARGS = [
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--single-process",
  "--disable-setuid-sandbox",
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Google Business Profile scraping
// ---------------------------------------------------------------------------

async function scrapeGoogleBusiness(
  businessName: string,
  address: string | undefined,
  leadId: string,
): Promise<GoogleBusinessData | null> {
  const pw = await getPlaywright();
  if (!pw) return null;

  let browser;
  try {
    browser = await pw.chromium.launch({ headless: true, args: PI_SAFE_ARGS });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, userAgent: UA });

    // Search Google Maps for the business
    const query = address
      ? `${businessName} ${address}`
      : businessName;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(4000);

    // Accept cookies if prompted
    try {
      const acceptBtn = await page.$('button[aria-label*="Accept"], form[action*="consent"] button');
      if (acceptBtn) await acceptBtn.click();
      await page.waitForTimeout(1000);
    } catch { /* no consent dialog */ }

    // Click first result if we're on a search results page
    try {
      const firstResult = await page.$('a[href*="/maps/place/"]');
      if (firstResult) {
        await firstResult.click();
        await page.waitForTimeout(3000);
      }
    } catch { /* already on place page */ }

    // Screenshot the Google Maps listing
    let screenshotPath: string | undefined;
    try {
      const buf = await page.screenshot({ type: "png" });
      const meta = await saveScreenshot(leadId, "google_maps.png", buf);
      screenshotPath = meta.filename;
    } catch { /* non-fatal */ }

    // Extract data from the Maps page
    const gData = await page.evaluate(() => {
      const getText = (sel: string): string | null => {
        const el = document.querySelector(sel);
        return el?.textContent?.trim() ?? null;
      };

      // Reviews
      const reviews: Array<{ author: string; rating: number; text: string; relative_time?: string }> = [];
      const reviewEls = document.querySelectorAll('[data-review-id], [jsan*="review"], .MyEned');
      reviewEls.forEach((el) => {
        const authorEl = el.querySelector('[class*="author"], .d4r55, [aria-label]');
        const textEl = el.querySelector('[class*="review-text"], .wiI7pd, .MyEned');
        const starEl = el.querySelector('[role="img"][aria-label*="star"]');
        const timeEl = el.querySelector('[class*="time"], .rsqaWe');

        const author = authorEl?.textContent?.trim() ?? "Local reviewer";
        const text = textEl?.textContent?.trim() ?? "";
        const starLabel = starEl?.getAttribute("aria-label") ?? "";
        const ratingMatch = starLabel.match(/(\d)/);
        const rating = ratingMatch ? parseInt(ratingMatch[1]) : 5;

        if (text.length > 10) {
          reviews.push({
            author,
            rating,
            text: text.slice(0, 300),
            relative_time: timeEl?.textContent?.trim(),
          });
        }
      });

      // Opening hours
      const hours: string[] = [];
      const hoursEls = document.querySelectorAll('[aria-label*="hour" i] table tr, .y0skZc tr');
      hoursEls.forEach((tr) => {
        const text = tr.textContent?.trim();
        if (text) hours.push(text);
      });

      // Also try the aria-label format
      const hoursBtn = document.querySelector('[data-item-id="oh"], [aria-label*="hour" i]');
      const hoursLabel = hoursBtn?.getAttribute("aria-label");
      if (hoursLabel && hours.length === 0) {
        hours.push(hoursLabel);
      }

      // Categories
      const catEl = document.querySelector('[jsaction*="category"], button[jsaction*="category"]');
      const categories = catEl?.textContent?.trim() ? [catEl.textContent.trim()] : [];

      // Formatted address
      const addressEl = document.querySelector('[data-item-id="address"], [aria-label*="Address"]');
      const addressFormatted = addressEl?.textContent?.trim() ??
        addressEl?.getAttribute("aria-label")?.replace("Address: ", "") ?? null;

      // Photos — get URLs and upscale to high-res
      const photoUrls: string[] = [];
      const photoEls = document.querySelectorAll('button[jsaction*="photo"] img, .gallery img, [data-photo-index] img, img[decoding="async"]');
      photoEls.forEach((img) => {
        let src = (img as HTMLImageElement).src;
        if (src && src.startsWith("http") && !src.includes("gstatic") && !src.includes("maps/vt") && !src.includes("data:")) {
          // Google Maps images use =wNNN-hNNN-k-no params for sizing
          // Replace small sizes with larger ones (up to 800px wide)
          src = src.replace(/=w\d+-h\d+/, "=w800-h600");
          src = src.replace(/=s\d+/, "=s800");
          // If no size param, append one
          if (!src.includes("=w") && !src.includes("=s") && src.includes("googleusercontent.com")) {
            src = src + "=w800-h600";
          }
          photoUrls.push(src);
        }
      });

      // Coordinates from URL
      const urlMatch = window.location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      const lat = urlMatch ? parseFloat(urlMatch[1]) : null;
      const lng = urlMatch ? parseFloat(urlMatch[2]) : null;

      return {
        reviews: reviews.slice(0, 8),
        hours,
        categories,
        addressFormatted,
        photoUrls: [...new Set(photoUrls)].slice(0, 12),
        lat,
        lng,
        currentUrl: window.location.href,
      };
    });

    // Download Google photos
    const savedPhotos: string[] = [];
    for (let i = 0; i < gData.photoUrls.length && i < 12; i++) {
      try {
        const meta = await saveFromUrl(leadId, `google_photo_${i + 1}.jpg`, gData.photoUrls[i], "gallery");
        if (meta) savedPhotos.push(meta.filename);
      } catch { /* non-fatal */ }
    }

    // Navigate to the photos tab/gallery for higher-res images
    try {
      // Click the main photo or "Photos" tab to open the gallery view
      const photosEntry = await page.$('[data-tab-index="6"], [aria-label*="Photos"], button:has-text("Photos"), .aoRNLd');
      if (photosEntry) {
        await photosEntry.click();
        await page.waitForTimeout(3000);
      } else {
        // Try clicking the main image/photo area
        const mainPhoto = await page.$('.RZ66Rb, .ZKbJE img, [jsaction*="heroHeaderImage"]');
        if (mainPhoto) {
          await mainPhoto.click();
          await page.waitForTimeout(3000);
        }
      }

      // Now in gallery view — grab all high-res images
      const galleryPhotoUrls = await page.evaluate(() => {
        const urls: string[] = [];
        document.querySelectorAll('img[decoding="async"], [data-photo-index] img, .gallery-image img, div[style*="background-image"]').forEach((el) => {
          let src: string | null = null;
          if (el.tagName === "IMG") {
            src = (el as HTMLImageElement).src;
          } else {
            const bg = (el as HTMLElement).style.backgroundImage;
            const match = bg?.match(/url\(["']?(.*?)["']?\)/);
            if (match) src = match[1];
          }
          if (src && src.startsWith("http") && !src.includes("gstatic") && !src.includes("maps/vt") && !src.includes("data:")) {
            // Upscale to high resolution
            src = src.replace(/=w\d+-h\d+[^&]*/g, "=w800-h600");
            src = src.replace(/=s\d+/g, "=s800");
            if (!src.includes("=w") && !src.includes("=s") && src.includes("googleusercontent.com")) {
              src = src + "=w800-h600";
            }
            urls.push(src);
          }
        });
        return [...new Set(urls)].slice(0, 15);
      });

      // Download any new photos we didn't already get
      const existingUrls = new Set<string>(gData.photoUrls);
      for (const photoUrl of galleryPhotoUrls) {
        if (savedPhotos.length >= 12) break;
        // Check if this is a genuinely new image (not just a resized version of one we have)
        const baseUrl = photoUrl.replace(/=w\d+-h\d+[^&]*/g, "").replace(/=s\d+/g, "");
        const isDuplicate = [...existingUrls].some((u: string) => u.replace(/=w\d+-h\d+[^&]*/g, "").replace(/=s\d+/g, "") === baseUrl);
        if (isDuplicate) continue;

        try {
          const meta = await saveFromUrl(leadId, `google_photo_${savedPhotos.length + 1}.jpg`, photoUrl, "gallery");
          if (meta && (meta.size_bytes ?? 0) > 2000) {
            savedPhotos.push(meta.filename);
          }
        } catch { /* non-fatal */ }
      }

      // If photos are still tiny, try screenshotting the gallery grid as a fallback
      if (savedPhotos.length > 0 && savedPhotos.length < 4) {
        try {
          const galleryBuf = await page.screenshot({ fullPage: false, type: "png" });
          await saveScreenshot(leadId, "google_gallery.png", galleryBuf);
        } catch { /* non-fatal */ }
      }
    } catch { /* non-fatal — photo gallery scrape is best-effort */ }

    // Re-download any existing photos that are too small (< 5KB = thumbnail)
    for (let i = 0; i < savedPhotos.length; i++) {
      const origUrl = gData.photoUrls[i];
      if (!origUrl) continue;
      const existingMeta = getManifest(leadId).assets.find((a) => a.filename === savedPhotos[i]);
      if (existingMeta && (existingMeta.size_bytes ?? 0) < 5000) {
        // Try to get a bigger version
        let bigUrl = origUrl;
        bigUrl = bigUrl.replace(/=w\d+-h\d+[^&]*/g, "=w1200-h900");
        bigUrl = bigUrl.replace(/=s\d+/g, "=s1200");
        if (!bigUrl.includes("=w") && !bigUrl.includes("=s") && bigUrl.includes("googleusercontent.com")) {
          bigUrl = bigUrl + "=w1200-h900";
        }
        try {
          const meta = await saveFromUrl(leadId, savedPhotos[i], bigUrl, "gallery");
          if (meta && (meta.size_bytes ?? 0) > (existingMeta.size_bytes ?? 0)) {
            // Successfully replaced with bigger version
          }
        } catch { /* keep the small one */ }
      }
    }

    // Build maps embed URL
    let mapsEmbedUrl: string | undefined;
    if (gData.lat && gData.lng) {
      mapsEmbedUrl = `https://maps.google.com/maps?q=${gData.lat},${gData.lng}&output=embed`;
    }

    await browser.close();

    return {
      photos: savedPhotos,
      reviews: gData.reviews,
      opening_hours: gData.hours.length > 0 ? gData.hours : undefined,
      categories: gData.categories.length > 0 ? gData.categories : undefined,
      address_formatted: gData.addressFormatted ?? undefined,
      lat: gData.lat ?? undefined,
      lng: gData.lng ?? undefined,
      maps_embed_url: mapsEmbedUrl,
      screenshot_path: screenshotPath,
    };
  } catch {
    try { browser?.close(); } catch { /* ignore */ }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Website scraping with Playwright (multi-page)
// ---------------------------------------------------------------------------

interface WebsiteScrapeResult {
  screenshot_path?: string;
  logo_path?: string;
  colours: ScrapedBrandColours;
  fonts: string[];
  hero_images: string[];
  gallery_images: string[];
  social_links: string[];
  description?: string;
  services: string[];
  opening_hours: string[];
  has_ssl: 0 | 1;
  is_mobile_friendly: 0 | 1;
  tech_stack: string[];
  quality_score: number;
  pain_points: string[];
  html_length: number;
  sub_page_screenshots: string[];
}

async function scrapeWebsiteWithPlaywright(
  url: string,
  leadId: string,
): Promise<WebsiteScrapeResult | null> {
  const pw = await getPlaywright();
  if (!pw) return null;

  let browser;
  try {
    browser = await pw.chromium.launch({
      headless: true,
      args: PI_SAFE_ARGS,
    });

    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      userAgent: UA,
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(2000);

    // 1. Full-page screenshot
    let screenshotPath: string | undefined;
    try {
      const buf = await page.screenshot({ fullPage: true, type: "png" });
      const meta = await saveScreenshot(leadId, "screenshot.png", buf);
      screenshotPath = meta.filename;
    } catch { /* non-fatal */ }

    // 2. Extract data from page context
    const pageData = await page.evaluate(() => {
      const doc = document;

      // Logo detection
      const logoSelectors = [
        'img[src*="logo" i]', 'img[alt*="logo" i]', 'img[class*="logo" i]',
        'img[id*="logo" i]', 'a[class*="logo" i] img', 'header img:first-of-type',
        '.logo img', '#logo img',
      ];
      let logoUrl: string | null = null;
      for (const sel of logoSelectors) {
        const el = doc.querySelector(sel) as HTMLImageElement | null;
        if (el?.src) { logoUrl = el.src; break; }
      }
      if (!logoUrl) {
        const icon =
          doc.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement ??
          doc.querySelector('link[rel="icon"][sizes]') as HTMLLinkElement ??
          doc.querySelector('meta[property="og:image"]') as HTMLMetaElement;
        if (icon) logoUrl = (icon as HTMLLinkElement).href ?? (icon as unknown as HTMLMetaElement).content;
      }

      // Brand colours from CSS
      const colours: Record<string, string | undefined> = {};
      const themeColor = doc.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (themeColor?.content) colours.primary = themeColor.content;

      const headerEl = doc.querySelector("header") ?? doc.querySelector("nav");
      if (headerEl) {
        const cs = getComputedStyle(headerEl);
        if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") {
          colours.background = cs.backgroundColor;
        }
        if (cs.color) colours.text = cs.color;
      }

      const heroEl = doc.querySelector(".hero, [class*='hero'], section:first-of-type, .banner");
      if (heroEl) {
        const cs = getComputedStyle(heroEl);
        if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && !colours.primary) {
          colours.primary = cs.backgroundColor;
        }
      }

      const rootStyle = getComputedStyle(doc.documentElement);
      const cssVarNames = ["--primary-color", "--primary", "--brand-color", "--main-color", "--accent-color", "--accent"];
      for (const v of cssVarNames) {
        const val = rootStyle.getPropertyValue(v).trim();
        if (val) {
          if (v.includes("accent")) colours.accent = val;
          else if (!colours.primary) colours.primary = val;
        }
      }

      // Fonts
      const bodyFont = getComputedStyle(doc.body).fontFamily;
      const h1 = doc.querySelector("h1");
      const headingFont = h1 ? getComputedStyle(h1).fontFamily : bodyFont;
      const fonts = [...new Set([headingFont, bodyFont].filter(Boolean))];

      // Hero images
      const heroImages: string[] = [];
      const firstSection = doc.querySelector("section:first-of-type, .hero, [class*='hero'], .banner, header");
      if (firstSection) {
        const imgs = firstSection.querySelectorAll("img");
        imgs.forEach((img) => {
          if (img.src && img.naturalWidth > 200) heroImages.push(img.src);
        });
        const bg = getComputedStyle(firstSection).backgroundImage;
        if (bg && bg !== "none") {
          const match = bg.match(/url\(["']?(.*?)["']?\)/);
          if (match?.[1]) heroImages.push(match[1]);
        }
      }

      // ALL images on the page > 150px (gallery candidates) — prefer srcset for higher-res
      const allImages: string[] = [];
      doc.querySelectorAll("img").forEach((img) => {
        if (img.naturalWidth < 150 && !img.getAttribute("srcset")) return;
        if (img.src.includes("data:")) return;

        // Check srcset for higher resolution
        const srcset = img.getAttribute("srcset");
        if (srcset) {
          const parts = srcset.split(",").map(s => s.trim());
          let bestUrl = "";
          let bestWidth = 0;
          for (const part of parts) {
            const [url, widthStr] = part.split(/\s+/);
            const w = parseInt(widthStr) || 0;
            if (w > bestWidth && url) { bestWidth = w; bestUrl = url; }
          }
          if (bestUrl && bestWidth >= 400) { allImages.push(bestUrl); return; }
        }
        if (img.src && img.naturalWidth > 150) {
          allImages.push(img.src);
        }
      });
      // Also background images on major sections
      doc.querySelectorAll("section, div[class*='gallery'], div[class*='portfolio'], div[class*='work']").forEach((el) => {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== "none") {
          const match = bg.match(/url\(["']?(.*?)["']?\)/);
          if (match?.[1]) allImages.push(match[1]);
        }
      });

      // Social links
      const socialLinks: string[] = [];
      const socialPatterns = [
        /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?twitter\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?tiktok\.com\/[^\s"'<>]+/gi,
        /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+/gi,
      ];
      const html = doc.documentElement.outerHTML;
      for (const pattern of socialPatterns) {
        const matches = html.match(pattern);
        if (matches) socialLinks.push(...matches.slice(0, 2));
      }

      // Description
      const metaDesc =
        (doc.querySelector('meta[name="description"]') as HTMLMetaElement)?.content ??
        (doc.querySelector('meta[property="og:description"]') as HTMLMetaElement)?.content;
      let description = metaDesc ?? "";
      if (!description) {
        const aboutSection = doc.querySelector("#about, .about, [class*='about']");
        const firstP = (aboutSection ?? doc.body).querySelector("p");
        if (firstP?.textContent) description = firstP.textContent.trim().slice(0, 500);
      }

      // Services
      const services: string[] = [];
      const serviceEls = doc.querySelectorAll(
        ".service-card, .service, [class*='service'] h3, [class*='service'] h4, ul.services li"
      );
      serviceEls.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length < 100) services.push(text);
      });

      // Opening hours
      const openingHours: string[] = [];
      const hoursEls = doc.querySelectorAll(
        '[class*="hour" i], [class*="opening" i], [class*="schedule" i], [class*="time" i] table tr'
      );
      hoursEls.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length < 200 && /\d/.test(text)) openingHours.push(text);
      });

      // Tech stack
      const techStack: string[] = [];
      const htmlLower = html.toLowerCase();
      if (htmlLower.includes("wordpress")) techStack.push("WordPress");
      if (htmlLower.includes("wix.com")) techStack.push("Wix");
      if (htmlLower.includes("squarespace")) techStack.push("Squarespace");
      if (htmlLower.includes("shopify")) techStack.push("Shopify");
      if (htmlLower.includes("react")) techStack.push("React");
      if (htmlLower.includes("bootstrap")) techStack.push("Bootstrap");
      if (htmlLower.includes("next")) techStack.push("Next.js");
      if (techStack.length === 0) techStack.push("Unknown/Custom");

      // Internal links for sub-page scraping
      const internalLinks: Array<{ href: string; text: string }> = [];
      const baseHost = location.hostname;
      doc.querySelectorAll("a[href]").forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        const text = a.textContent?.trim()?.toLowerCase() ?? "";
        try {
          const u = new URL(href);
          if (u.hostname === baseHost && !href.includes("#")) {
            const relevant = ["about", "service", "menu", "gallery", "portfolio", "contact", "team", "work", "price", "testimonial", "review"];
            if (relevant.some((k) => text.includes(k) || u.pathname.toLowerCase().includes(k))) {
              internalLinks.push({ href, text });
            }
          }
        } catch { /* invalid URL */ }
      });

      const hasViewport = !!doc.querySelector('meta[name="viewport"]');
      const hasSSL = location.protocol === "https:";

      return {
        logoUrl,
        colours,
        fonts,
        heroImages: heroImages.slice(0, 5),
        allImages: [...new Set(allImages)].slice(0, 20),
        socialLinks: [...new Set(socialLinks)],
        description,
        services: services.slice(0, 15),
        openingHours: openingHours.slice(0, 10),
        techStack,
        internalLinks: internalLinks.slice(0, 6),
        hasViewport,
        hasSSL,
        htmlLength: html.length,
      };
    });

    // 3. Download logo
    let logoPath: string | undefined;
    if (pageData.logoUrl) {
      try {
        const logoMeta = await saveFromUrl(leadId, "logo.png", pageData.logoUrl, "logo");
        if (logoMeta) logoPath = logoMeta.filename;
      } catch { /* non-fatal */ }
    }

    // 4. Download hero images
    const heroImages: string[] = [];
    for (let i = 0; i < pageData.heroImages.length && i < 5; i++) {
      try {
        const meta = await saveFromUrl(leadId, `hero_${i + 1}.jpg`, pageData.heroImages[i], "hero");
        if (meta) heroImages.push(meta.filename);
      } catch { /* non-fatal */ }
    }

    // 5. Download ALL gallery-worthy images
    const galleryImages: string[] = [];
    const seenUrls = new Set(pageData.heroImages);
    for (const imgUrl of pageData.allImages) {
      if (seenUrls.has(imgUrl)) continue;
      seenUrls.add(imgUrl);
      if (galleryImages.length >= 15) break;
      try {
        const meta = await saveFromUrl(leadId, `gallery_${galleryImages.length + 1}.jpg`, imgUrl, "gallery");
        if (meta) galleryImages.push(meta.filename);
      } catch { /* non-fatal */ }
    }

    // 6. Scrape sub-pages (about, services, gallery, contact)
    const subPageScreenshots: string[] = [];
    for (const link of pageData.internalLinks.slice(0, 4)) {
      try {
        await page.goto(link.href, { waitUntil: "domcontentloaded", timeout: 10_000 });
        await page.waitForTimeout(1500);

        const pageName = link.text.replace(/[^a-z0-9]/g, "_").slice(0, 20) || "subpage";
        const buf = await page.screenshot({ fullPage: true, type: "png" });
        const meta = await saveScreenshot(leadId, `page_${pageName}.png`, buf);
        subPageScreenshots.push(meta.filename);

        // Extract images from sub-pages too
        const subImages = await page.evaluate(() => {
          const imgs: string[] = [];
          document.querySelectorAll("img").forEach((img) => {
            if (img.src && img.naturalWidth > 150 && !img.src.includes("data:")) {
              imgs.push(img.src);
            }
          });
          return imgs.slice(0, 8);
        });

        for (const subImg of subImages) {
          if (seenUrls.has(subImg)) continue;
          seenUrls.add(subImg);
          if (galleryImages.length >= 20) break;
          try {
            const meta = await saveFromUrl(leadId, `gallery_${galleryImages.length + 1}.jpg`, subImg, "gallery");
            if (meta) galleryImages.push(meta.filename);
          } catch { /* non-fatal */ }
        }

        // Extract extra services from services page
        if (link.text.includes("service") || link.text.includes("work")) {
          const extraServices = await page.evaluate(() => {
            const items: string[] = [];
            document.querySelectorAll("h2, h3, h4, .service-card, [class*='service'] li").forEach((el) => {
              const text = el.textContent?.trim();
              if (text && text.length > 3 && text.length < 100) items.push(text);
            });
            return items.slice(0, 10);
          });
          pageData.services.push(...extraServices);
        }
      } catch { /* non-fatal — sub-page scrape is best-effort */ }
    }

    // 7. Quality score
    let qualityScore = 50;
    if (pageData.hasSSL) qualityScore += 10;
    if (pageData.hasViewport) qualityScore += 15;
    if (pageData.socialLinks.length > 0) qualityScore += 10;
    qualityScore += 15; // page loaded
    qualityScore = Math.min(qualityScore, 100);

    // 8. Pain points
    const painPoints: string[] = [];
    if (!pageData.hasSSL) painPoints.push("No SSL certificate — looks unprofessional and hurts SEO");
    if (!pageData.hasViewport) painPoints.push("Not mobile-friendly — losing mobile customers");
    if (pageData.socialLinks.length === 0) painPoints.push("No social media integration");
    if (pageData.htmlLength < 5000) painPoints.push("Very thin content — may not rank well in search");
    if (pageData.techStack.includes("WordPress")) {
      painPoints.push("Generic WordPress theme — looks like many other sites");
    }

    // Parse colours
    const rawColours = pageData.colours as Record<string, string | undefined>;
    const colours: ScrapedBrandColours = {
      source: rawColours.primary ? "css" : "default",
      primary: rawColours.primary ? (rgbToHex(rawColours.primary) ?? rawColours.primary) : undefined,
      secondary: rawColours.secondary ? (rgbToHex(rawColours.secondary) ?? rawColours.secondary) : undefined,
      accent: rawColours.accent ? (rgbToHex(rawColours.accent) ?? rawColours.accent) : undefined,
      background: rawColours.background ? (rgbToHex(rawColours.background) ?? rawColours.background) : undefined,
      text: rawColours.text ? (rgbToHex(rawColours.text) ?? rawColours.text) : undefined,
    };

    await browser.close();

    return {
      screenshot_path: screenshotPath,
      logo_path: logoPath,
      colours,
      fonts: pageData.fonts,
      hero_images: heroImages,
      gallery_images: galleryImages,
      social_links: pageData.socialLinks,
      description: pageData.description || undefined,
      services: pageData.services,
      opening_hours: pageData.openingHours,
      has_ssl: pageData.hasSSL ? 1 : 0,
      is_mobile_friendly: pageData.hasViewport ? 1 : 0,
      tech_stack: pageData.techStack,
      quality_score: qualityScore,
      pain_points: painPoints,
      html_length: pageData.htmlLength,
      sub_page_screenshots: subPageScreenshots,
    };
  } catch (err) {
    try { browser?.close(); } catch { /* ignore */ }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Social media scraping (improved)
// ---------------------------------------------------------------------------

async function scrapeSocialProfiles(
  socialLinks: string[],
  leadId: string,
): Promise<SocialProfile[]> {
  const pw = await getPlaywright();
  if (!pw || socialLinks.length === 0) return [];

  const profiles: SocialProfile[] = [];
  let browser;

  try {
    browser = await pw.chromium.launch({ headless: true, args: PI_SAFE_ARGS });

    for (const url of socialLinks.slice(0, 5)) {
      const platform = detectPlatform(url);
      if (!platform) continue;
      if (profiles.some((p) => p.platform === platform)) continue;

      const profile: SocialProfile = { platform, url, post_images: [] };

      try {
        if (platform === "facebook") {
          await scrapeFacebook(browser, url, leadId, profile);
        } else if (platform === "instagram") {
          await scrapeInstagram(browser, url, leadId, profile);
        } else {
          // Generic social scrape — screenshot + any images
          await scrapeGenericSocial(browser, url, leadId, profile, platform);
        }
      } catch {
        // Social scraping is best-effort — try screenshot at minimum
        try {
          const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, userAgent: UA });
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
          await page.waitForTimeout(2000);
          const buf = await page.screenshot({ type: "png" });
          const meta = await saveScreenshot(leadId, `${platform}_screenshot.png`, buf);
          profile.screenshot_path = meta.filename;
          await page.close();
        } catch { /* truly non-fatal */ }
      }

      profiles.push(profile);
    }

    await browser.close();
  } catch {
    try { browser?.close(); } catch { /* ignore */ }
  }

  return profiles;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scrapeFacebook(browser: any, url: string, leadId: string, profile: SocialProfile): Promise<void> {
  // Use mobile Facebook — shows more data without login
  const mobileUrl = url.replace("www.facebook.com", "m.facebook.com");

  const page = await browser.newPage({
    viewport: { width: 414, height: 896 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  await page.goto(mobileUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForTimeout(3000);

  // Close login popups
  try {
    const closeBtn = await page.$('[aria-label="Close"], [data-sigil="m-login-upsell-close"]');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(500);
  } catch { /* no popup */ }

  // Screenshot
  try {
    const buf = await page.screenshot({ fullPage: false, type: "png" });
    const meta = await saveScreenshot(leadId, "facebook_screenshot.png", buf);
    profile.screenshot_path = meta.filename;
  } catch { /* non-fatal */ }

  // Extract page info
  const fbData = await page.evaluate(() => {
    const getText = (sel: string): string | null => {
      const el = document.querySelector(sel);
      return el?.textContent?.trim() ?? null;
    };

    // Bio / About text
    const bio =
      getText('[data-sigil="m-profile-cover-intro"]') ??
      getText('.bio') ??
      getText('[data-testid="profile_intro_card"]') ??
      null;

    // Cover photo
    const coverImg = document.querySelector(
      '[data-sigil="m-profile-cover-photo"] img, .cover img, img[data-store*="cover"]'
    ) as HTMLImageElement | null;
    const coverUrl = coverImg?.src ?? null;

    // Profile picture
    const profileImg = document.querySelector(
      '[data-sigil="m-profile-photo"] img, .profpic img, img[alt*="profile"]'
    ) as HTMLImageElement | null;
    const profileUrl = profileImg?.src ?? null;

    // Page info items
    const pageInfo: Record<string, string> = {};
    document.querySelectorAll('[data-sigil="m-profile-field"], ._5cds, ._52jh').forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length < 200) {
        if (text.toLowerCase().includes("hour") || text.toLowerCase().includes("open")) pageInfo.hours = text;
        else if (text.toLowerCase().includes("phone") || /\d{4,}/.test(text)) pageInfo.phone = text;
        else if (text.toLowerCase().includes("@") || text.toLowerCase().includes("email")) pageInfo.email = text;
        else if (!pageInfo.about) pageInfo.about = text;
      }
    });

    // Post images (visible without login) — try to get highest resolution
    const postImgs: string[] = [];
    document.querySelectorAll('img[data-store], img[data-sigil*="photo"], img[src*="scontent"], img[src*="fbcdn"]').forEach((img) => {
      let src = (img as HTMLImageElement).src;
      if (src && src.startsWith("http") && !src.includes("emoji") && !src.includes("rsrc") && !src.includes("static")) {
        // Facebook image URLs: replace small dimensions with larger
        // e.g. s720x720 -> s1080x1080, or p75x225 -> p960x960
        src = src.replace(/\/s\d+x\d+\//, "/s1080x1080/");
        src = src.replace(/\/p\d+x\d+\//, "/p960x960/");
        src = src.replace(/\/c\d+\.\d+\.\d+\.\d+\//, "/"); // remove crop params
        postImgs.push(src);
      }
    });

    return { bio, coverUrl, profileUrl, pageInfo, postImgs: postImgs.slice(0, 9) };
  });

  profile.bio = fbData.bio ?? undefined;
  profile.page_info = Object.keys(fbData.pageInfo).length > 0 ? fbData.pageInfo : undefined;

  // Download cover photo
  if (fbData.coverUrl) {
    try {
      const meta = await saveFromUrl(leadId, "facebook_cover.jpg", fbData.coverUrl, "hero");
      if (meta) profile.cover_photo_path = meta.filename;
    } catch { /* non-fatal */ }
  }

  // Download profile picture
  if (fbData.profileUrl) {
    try {
      const meta = await saveFromUrl(leadId, "facebook_profile.jpg", fbData.profileUrl, "logo");
      if (meta) profile.profile_image_url = meta.filename;
    } catch { /* non-fatal */ }
  }

  // Download post images
  for (let i = 0; i < fbData.postImgs.length && i < 9; i++) {
    try {
      const meta = await saveFromUrl(leadId, `facebook_post_${i + 1}.jpg`, fbData.postImgs[i], "social");
      if (meta) profile.post_images.push(meta.filename);
    } catch { /* non-fatal */ }
  }

  await page.close();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scrapeInstagram(browser: any, url: string, leadId: string, profile: SocialProfile): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: 414, height: 896 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForTimeout(3000);

  // Close login popup
  try {
    const notNowBtn = await page.$('button:has-text("Not Now"), button:has-text("Not now"), [role="dialog"] button');
    if (notNowBtn) await notNowBtn.click();
    await page.waitForTimeout(500);
  } catch { /* no popup */ }

  // Screenshot
  try {
    const buf = await page.screenshot({ fullPage: false, type: "png" });
    const meta = await saveScreenshot(leadId, "instagram_screenshot.png", buf);
    profile.screenshot_path = meta.filename;
  } catch { /* non-fatal */ }

  // Extract profile data
  const igData = await page.evaluate(() => {
    // Bio
    const bioEl = document.querySelector('header section div:not(:first-child) span, .-vDIg span, header section > div');
    const bio = bioEl?.textContent?.trim() ?? null;

    // Profile picture
    const profileImg = document.querySelector('header img, img[data-testid="user-avatar"]') as HTMLImageElement | null;
    const profileUrl = profileImg?.src ?? null;

    // Post images — grab largest available version
    const postImgs: string[] = [];
    document.querySelectorAll('article img, main a img, ._aagv img, img[srcset]').forEach((img) => {
      const imgEl = img as HTMLImageElement;
      // Prefer srcset (has higher-res versions) over src
      const srcset = imgEl.getAttribute("srcset");
      if (srcset) {
        // srcset format: "url1 640w, url2 750w, url3 1080w"
        const parts = srcset.split(",").map(s => s.trim());
        // Get the largest one
        let bestUrl = "";
        let bestWidth = 0;
        for (const part of parts) {
          const [url, widthStr] = part.split(/\s+/);
          const w = parseInt(widthStr) || 0;
          if (w > bestWidth && url) { bestWidth = w; bestUrl = url; }
        }
        if (bestUrl) { postImgs.push(bestUrl); return; }
      }
      const src = imgEl.src;
      if (src && src.startsWith("http") && !src.includes("s150x150") && !src.includes("data:")) {
        postImgs.push(src);
      }
    });

    return { bio, profileUrl, postImgs: [...new Set(postImgs)].slice(0, 9) };
  });

  profile.bio = igData.bio ?? undefined;

  // Download profile picture
  if (igData.profileUrl) {
    try {
      const meta = await saveFromUrl(leadId, "instagram_profile.jpg", igData.profileUrl, "logo");
      if (meta) profile.profile_image_url = meta.filename;
    } catch { /* non-fatal */ }
  }

  // Download post images
  for (let i = 0; i < igData.postImgs.length && i < 9; i++) {
    try {
      const meta = await saveFromUrl(leadId, `instagram_post_${i + 1}.jpg`, igData.postImgs[i], "social");
      if (meta) profile.post_images.push(meta.filename);
    } catch { /* non-fatal */ }
  }

  await page.close();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scrapeGenericSocial(browser: any, url: string, leadId: string, profile: SocialProfile, platform: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, userAgent: UA });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12_000 });
  await page.waitForTimeout(3000);

  // Screenshot
  try {
    const buf = await page.screenshot({ type: "png" });
    const meta = await saveScreenshot(leadId, `${platform}_screenshot.png`, buf);
    profile.screenshot_path = meta.filename;
  } catch { /* non-fatal */ }

  // Try to grab profile image and any visible images
  const socialData = await page.evaluate(() => {
    const imgs: string[] = [];
    document.querySelectorAll("img").forEach((img) => {
      if (img.src && img.naturalWidth > 80 && !img.src.includes("emoji")) {
        imgs.push(img.src);
      }
    });
    const bio = document.querySelector('[data-testid*="bio"], .bio, [class*="description"]')?.textContent?.trim() ?? null;
    return { imgs: imgs.slice(0, 6), bio };
  });

  profile.bio = socialData.bio ?? undefined;

  for (let i = 0; i < socialData.imgs.length && i < 6; i++) {
    try {
      const meta = await saveFromUrl(leadId, `${platform}_img_${i + 1}.jpg`, socialData.imgs[i], "social");
      if (meta) profile.post_images.push(meta.filename);
    } catch { /* non-fatal */ }
  }

  await page.close();
}

// ---------------------------------------------------------------------------
// Menu extraction (food vertical)
// ---------------------------------------------------------------------------

interface MenuItem {
  name: string;
  price?: string;
  description?: string;
}

async function extractMenuFromUrl(
  websiteUrl: string,
  leadId: string,
): Promise<MenuItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(websiteUrl, { signal: controller.signal });
    clearTimeout(timer);
    const html = await res.text();

    const menuLinkMatch = html.match(/href=["']([^"']*menu[^"']*)["']/i);
    if (!menuLinkMatch) return [];

    let menuUrl = menuLinkMatch[1];
    if (menuUrl.startsWith("/")) {
      const base = new URL(websiteUrl);
      menuUrl = `${base.origin}${menuUrl}`;
    }

    if (menuUrl.toLowerCase().endsWith(".pdf")) {
      await saveFromUrl(leadId, "menu.pdf", menuUrl, "menu");
      return [];
    }

    const menuRes = await fetch(menuUrl, { signal: AbortSignal.timeout(10_000) });
    const menuHtml = await menuRes.text();

    const items: MenuItem[] = [];
    const pricePattern = /([A-Z][^£$\n]{2,50})\s*[£$]\s*(\d+(?:\.\d{2})?)/g;
    let match;
    while ((match = pricePattern.exec(menuHtml)) !== null && items.length < 30) {
      items.push({ name: match[1].trim(), price: `£${match[2]}` });
    }

    return items;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fallback: basic fetch profiler (no Playwright)
// ---------------------------------------------------------------------------

async function profileWithFetch(lead: LeadToProfile): Promise<Partial<ProfileResult>> {
  const result: Partial<ProfileResult> = {};

  if (!lead.website_url) {
    return {
      has_website: 0,
      has_ssl: 0,
      is_mobile_friendly: 0,
      website_quality_score: 0,
      pain_points_json: JSON.stringify([
        "No website at all — missing out on online customers",
        "No online presence beyond social media or directory listings",
        "Competitors with websites are capturing their potential customers",
      ]),
      brand_colours_json: JSON.stringify({}),
      brand_fonts_json: JSON.stringify([]),
      brand_assets_json: JSON.stringify({}),
      social_profiles_json: JSON.stringify([]),
      services_extracted_json: JSON.stringify([]),
      google_business_json: JSON.stringify({}),
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(lead.website_url, {
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    const html = await response.text();
    const htmlLower = html.toLowerCase();

    result.has_ssl = lead.website_url.startsWith("https://") ? 1 : 0;
    result.is_mobile_friendly = htmlLower.includes("viewport") ? 1 : 0;

    const socialLinks: string[] = [];
    const socialPatterns = [
      /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?twitter\.com\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi,
    ];
    for (const pattern of socialPatterns) {
      const matches = html.match(pattern);
      if (matches) socialLinks.push(...matches.slice(0, 2));
    }
    result.has_social_links = socialLinks.length > 0 ? 1 : 0;
    result.social_links_json = JSON.stringify(socialLinks);

    const techStack: string[] = [];
    if (htmlLower.includes("wordpress")) techStack.push("WordPress");
    if (htmlLower.includes("wix.com")) techStack.push("Wix");
    if (htmlLower.includes("squarespace")) techStack.push("Squarespace");
    if (htmlLower.includes("shopify")) techStack.push("Shopify");
    if (techStack.length === 0) techStack.push("Unknown/Custom");
    result.website_tech_stack = JSON.stringify(techStack);

    let qualityScore = 50;
    if (result.has_ssl) qualityScore += 10;
    if (result.is_mobile_friendly) qualityScore += 15;
    if (result.has_social_links) qualityScore += 10;
    if (response.status === 200) qualityScore += 15;
    result.website_quality_score = Math.min(qualityScore, 100);

    const painPoints: string[] = [];
    if (!result.has_ssl) painPoints.push("No SSL certificate");
    if (!result.is_mobile_friendly) painPoints.push("Not mobile-friendly");
    if (!result.has_social_links) painPoints.push("No social media integration");
    result.pain_points_json = JSON.stringify(painPoints);

    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i);
    result.business_description_raw = descMatch?.[1] ?? undefined;

    result.brand_colours_json = JSON.stringify({});
    result.brand_fonts_json = JSON.stringify([]);
    result.brand_assets_json = JSON.stringify({});
    result.social_profiles_json = JSON.stringify([]);
    result.services_extracted_json = JSON.stringify([]);
    result.google_business_json = JSON.stringify({});
  } catch {
    result.website_quality_score = 0;
    result.pain_points_json = JSON.stringify(["Website unreachable or very slow"]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectPlatform(url: string): string | null {
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com")) return "facebook";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("youtube.com")) return "youtube";
  return null;
}

function rgbToHex(rgb: string): string | null {
  if (rgb.startsWith("#")) return rgb;
  const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return null;
  const [, r, g, b] = match.map(Number);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Instagram scraping via Apify
// ---------------------------------------------------------------------------

interface InstagramProfile {
  username: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  postsCount?: number;
  profilePicUrlHD?: string;
  externalUrl?: string;
  isBusinessAccount?: boolean;
  businessCategoryName?: string;
  latestPosts: Array<{
    type?: string;
    caption?: string;
    likesCount?: number;
    commentsCount?: number;
    displayUrl?: string;
    hashtags?: string[];
    timestamp?: string;
  }>;
}

async function scrapeInstagramViaApify(
  instagramUrl: string,
  leadId: string,
): Promise<InstagramProfile | null> {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) return null;

  // Extract username from URL
  const match = instagramUrl.match(/instagram\.com\/([^/?#]+)/);
  if (!match) return null;
  const username = match[1].replace(/\/$/, "");
  if (!username || username === "p" || username === "explore") return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const response = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=30`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username], resultsLimit: 1 }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = (await response.json()) as InstagramProfile[];
    if (!data || data.length === 0 || (data[0] as unknown as Record<string, unknown>).error) return null;

    const profile = data[0];

    // Download post images to asset store (max 10 posts)
    const postImages: string[] = [];
    for (let i = 0; i < Math.min(profile.latestPosts?.length ?? 0, 10); i++) {
      const post = profile.latestPosts[i];
      if (post.displayUrl) {
        try {
          const filename = `instagram_post_${i + 1}.jpg`;
          const meta = await saveFromUrl(leadId, filename, post.displayUrl, "social");
          if (meta) postImages.push(filename);
        } catch { /* non-fatal */ }
      }
    }

    // Download profile pic
    if (profile.profilePicUrlHD) {
      try {
        await saveFromUrl(leadId, "instagram_profile.jpg", profile.profilePicUrlHD, "social");
      } catch { /* non-fatal */ }
    }

    log.info(`scraped Instagram @${username}`, {
      followers: profile.followersCount,
      posts: profile.latestPosts?.length ?? 0,
      images_saved: postImages.length,
    });

    return profile;
  } catch (err) {
    log.warn(`Instagram scrape failed for @${username}`, { error: String(err) });
    return null;
  }
}

/** Populate profile fields from Apify Instagram data */
function populateInstagramProfile(profile: ProfileResult, igData: InstagramProfile): void {
  profile.instagram_followers = igData.followersCount;
  profile.instagram_handle = igData.username;
  profile.instagram_json = JSON.stringify({
    username: igData.username,
    full_name: igData.fullName,
    bio: igData.biography,
    followers: igData.followersCount,
    posts_count: igData.postsCount,
    profile_pic: igData.profilePicUrlHD,
    website: igData.externalUrl,
    is_business: igData.isBusinessAccount,
    category: igData.businessCategoryName,
    recent_posts: (igData.latestPosts ?? []).slice(0, 10).map((p, idx) => ({
      type: p.type,
      caption: p.caption?.slice(0, 300),
      likes: p.likesCount,
      comments: p.commentsCount,
      hashtags: p.hashtags,
      image_file: p.displayUrl ? `instagram_post_${idx + 1}.jpg` : undefined,
    })),
    top_hashtags: getTopHashtags(igData.latestPosts ?? []),
    avg_engagement: getAvgEngagement(igData.latestPosts ?? []),
  });
  // Use Instagram bio as description if we don't have one
  if (igData.biography && !profile.business_description_raw) {
    profile.business_description_raw = igData.biography;
  }
}

/** Extract Instagram username from a list of social links */
function findInstagramUrl(socialLinks: string[]): string | undefined {
  return socialLinks.find((l) => l.includes("instagram.com/"));
}

/** Get top hashtags from Instagram posts */
function getTopHashtags(posts: Array<{ hashtags?: string[] }>): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.hashtags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
}

/** Get average engagement from Instagram posts */
function getAvgEngagement(posts: Array<{ likesCount?: number; commentsCount?: number }>): { avg_likes: number; avg_comments: number; total_posts: number } {
  if (posts.length === 0) return { avg_likes: 0, avg_comments: 0, total_posts: 0 };
  const totalLikes = posts.reduce((sum, p) => sum + (p.likesCount ?? 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.commentsCount ?? 0), 0);
  return {
    avg_likes: Math.round(totalLikes / posts.length),
    avg_comments: Math.round(totalComments / posts.length),
    total_posts: posts.length,
  };
}

function isFoodVertical(businessType?: string, businessName?: string): boolean {
  const combined = `${businessType ?? ""} ${businessName ?? ""}`.toLowerCase();
  const foodKeywords = ["restaurant", "cafe", "coffee", "pizza", "burger", "food", "kitchen", "bistro", "grill", "takeaway", "bakery", "pub", "bar"];
  return foodKeywords.some((k) => combined.includes(k));
}

// ---------------------------------------------------------------------------
// Main Agent Handler
// ---------------------------------------------------------------------------

export const leadProfilerAgent: AgentHandler = async (input) => {
  const upstream = input.upstreamArtifacts as Record<string, { leads?: LeadToProfile[] }>;
  const leads: LeadToProfile[] = [];

  for (const nodeOutput of Object.values(upstream)) {
    if (nodeOutput?.leads) leads.push(...nodeOutput.leads);
  }

  if (leads.length === 0) {
    return {
      summary: "No leads to profile.",
      artifacts: { profiles: [], profiled_count: 0 },
    };
  }

  const profiles: ProfileResult[] = [];
  const run = pLimit(PROFILER_CONCURRENCY);

  log.info("starting lead profiling", { lead_count: leads.length, concurrency: PROFILER_CONCURRENCY });

  const results = await Promise.allSettled(
    leads.map((lead) =>
      run(async () => {
        const start = Date.now();
        const profile = await profileSingleLead(lead);
        log.info(`profiled ${lead.business_name}`, { ms: Date.now() - start });
        return profile;
      }),
    ),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      profiles.push(result.value);
    } else {
      log.warn("lead profiling failed", { error: String(result.reason) });
    }
  }

  // Build summary
  const noWebsite = profiles.filter((p) => p.website_quality_score === 0).length;
  const withLogos = profiles.filter((p) => p.logo_path).length;
  const withReviews = profiles.filter((p) => p.reviews_json && p.reviews_json !== "[]").length;
  const withInstagram = profiles.filter((p) => p.instagram_json).length;
  const withSocial = profiles.filter((p) => p.social_profiles_json !== "[]").length;
  const withHours = profiles.filter((p) => p.opening_hours_json).length;

  return {
    summary: `Profiled ${profiles.length} leads. ${noWebsite} no website. ${withLogos} logos. ${withReviews} with reviews. ${withInstagram} Instagram. ${withHours} with hours.`,
    artifacts: {
      profiles,
      profiled_count: profiles.length,
      high_opportunity_count: noWebsite,
      _decision: {
        reasoning: `Profiled ${profiles.length}/${leads.length} leads (${PROFILER_CONCURRENCY} concurrent). ${noWebsite} no website. ${withReviews} with reviews. ${withInstagram} Instagram scraped. ${withLogos} logos found.`,
        alternatives: ["Could increase concurrency on more powerful hardware", "Could skip social scraping for faster results"],
        confidence: profiles.length === leads.length ? 0.85 : 0.6,
        tags: [`leads:${profiles.length}`, `opportunity:${noWebsite}`],
      },
    },
  };
};

// ---------------------------------------------------------------------------
// Single lead profiler (extracted from the old sequential loop)
// ---------------------------------------------------------------------------

async function profileSingleLead(
  lead: LeadToProfile,
): Promise<ProfileResult> {
    const leadId = lead.lead_id ?? `lead-${Date.now()}`;
    ensureLeadDir(leadId);

    // ---------------------------------------------------------------
    // 0. Start with scout's enriched data (Place Details API)
    // ---------------------------------------------------------------
    const hasScoutReviews = (lead.reviews?.length ?? 0) > 0;
    const hasScoutPhotos = (lead.google_photos_downloaded ?? 0) > 0;

    const profile: ProfileResult = {
      lead_id: leadId,
      business_name: lead.business_name,
      business_type: lead.business_type,
      google_rating: lead.google_rating ?? null,
      google_review_count: lead.google_review_count ?? null,
      address: lead.address,
      phone: lead.phone,
      email: lead.email,
      has_website: lead.website_url ? 1 : 0,
      has_ssl: 0,
      is_mobile_friendly: 0,
      has_social_links: 0,
      social_links_json: "[]",
      website_tech_stack: "[]",
      website_quality_score: 0,
      pain_points_json: "[]",
      profiled_at: new Date().toISOString(),
      brand_colours_json: "{}",
      brand_fonts_json: "[]",
      brand_assets_json: "{}",
      social_profiles_json: "[]",
      services_extracted_json: "[]",
      google_business_json: "{}",
      // Pre-populate from scout's Place Details data
      business_description_raw: lead.description,
      reviews_json: lead.reviews ? JSON.stringify(lead.reviews) : undefined,
      opening_hours_json: lead.opening_hours ? JSON.stringify(lead.opening_hours) : undefined,
      lat: lead.lat as number | undefined,
      lng: lead.lng as number | undefined,
      maps_embed_url: lead.lat && lead.lng
        ? `https://maps.google.com/maps?q=${lead.lat},${lead.lng}&output=embed`
        : undefined,
      // Pass through scout enrichment for downstream agents
      vertical_category: lead.vertical_category,
      has_premises: lead.has_premises,
      is_chain: lead.is_chain,
      price_level: lead.price_level,
      google_photos_downloaded: lead.google_photos_downloaded,
    };

    // Build initial asset inventory from scout's downloaded photos
    if (hasScoutPhotos && lead.google_photo_filenames) {
      const photoAssets = lead.google_photo_filenames.map((f: string) => f);
      profile.brand_assets_json = JSON.stringify({
        google_photos: photoAssets,
      });
    }

    // ---------------------------------------------------------------
    // 1. Google Business Profile — SKIP Playwright if scout has data
    // ---------------------------------------------------------------
    if (!hasScoutReviews) {
      // Scout didn't get reviews, try Playwright scraping as fallback
      const googleData = await scrapeGoogleBusiness(
        lead.business_name,
        lead.address,
        leadId,
      );

      if (googleData) {
        profile.google_business_json = JSON.stringify(googleData);
        if (!profile.reviews_json) {
          profile.reviews_json = JSON.stringify(googleData.reviews);
        }
        if (!profile.opening_hours_json && googleData.opening_hours) {
          profile.opening_hours_json = JSON.stringify(googleData.opening_hours);
        }
        if (!profile.lat) profile.lat = googleData.lat;
        if (!profile.lng) profile.lng = googleData.lng;
        if (!profile.maps_embed_url) profile.maps_embed_url = googleData.maps_embed_url;
        if (googleData.address_formatted) {
          profile.address = googleData.address_formatted;
        }
      }
    } else {
      log.debug(`skipping Google scrape for ${lead.business_name} — scout has ${lead.reviews?.length} reviews`);
    }

    // ---------------------------------------------------------------
    // 2. Website scraping (OPTIONAL — only if they have one)
    // ---------------------------------------------------------------
    if (lead.website_url) {
      const scrapeResult = await scrapeWebsiteWithPlaywright(lead.website_url, leadId);

      if (scrapeResult) {
        profile.has_ssl = scrapeResult.has_ssl;
        profile.is_mobile_friendly = scrapeResult.is_mobile_friendly;
        profile.has_social_links = scrapeResult.social_links.length > 0 ? 1 : 0;
        profile.social_links_json = JSON.stringify(scrapeResult.social_links);
        profile.website_tech_stack = JSON.stringify(scrapeResult.tech_stack);
        profile.website_quality_score = scrapeResult.quality_score;
        profile.pain_points_json = JSON.stringify(scrapeResult.pain_points);
        profile.brand_colours_json = JSON.stringify(scrapeResult.colours);
        profile.brand_fonts_json = JSON.stringify(scrapeResult.fonts);
        profile.screenshot_path = scrapeResult.screenshot_path;
        profile.logo_path = scrapeResult.logo_path;
        profile.business_description_raw = scrapeResult.description;
        profile.services_extracted_json = JSON.stringify(scrapeResult.services);

        if (scrapeResult.opening_hours.length > 0 && !profile.opening_hours_json) {
          profile.opening_hours_json = JSON.stringify(scrapeResult.opening_hours);
        }

        // Merge website assets with scout's Google photos
        const existingAssets = JSON.parse(profile.brand_assets_json ?? "{}");
        profile.brand_assets_json = JSON.stringify({
          ...existingAssets,
          screenshot: scrapeResult.screenshot_path,
          logo: scrapeResult.logo_path,
          hero_images: scrapeResult.hero_images,
          gallery_images: scrapeResult.gallery_images,
          sub_page_screenshots: scrapeResult.sub_page_screenshots,
        });

        // Collect social links from website for social scraping
        if (scrapeResult.social_links.length > 0) {
          const socialProfiles = await scrapeSocialProfiles(scrapeResult.social_links, leadId);
          profile.social_profiles_json = JSON.stringify(socialProfiles);

          // Instagram via Apify (much richer than Playwright scraping)
          const igUrl = findInstagramUrl(scrapeResult.social_links);
          if (igUrl) {
            const igData = await scrapeInstagramViaApify(igUrl, leadId);
            if (igData) {
              populateInstagramProfile(profile, igData);
            }
          }
        }

        // Extract menu for food businesses
        if (isFoodVertical(lead.business_type, lead.business_name)) {
          const menuItems = await extractMenuFromUrl(lead.website_url, leadId);
          if (menuItems.length > 0) {
            profile.menu_items_json = JSON.stringify(menuItems);
          }
        }
      } else {
        // Playwright failed on website — use fetch fallback
        const fallback = await profileWithFetch(lead);
        Object.assign(profile, fallback);
      }
    } else {
      // ---------------------------------------------------------------
      // 3. No website — scrape socials directly from lead data or Google
      // ---------------------------------------------------------------
      profile.website_quality_score = 0;
      profile.pain_points_json = JSON.stringify([
        "No website at all — missing out on online customers",
        "No online presence beyond social media or directory listings",
        "Competitors with websites are capturing their potential customers",
      ]);

      // Gather social links from lead data
      const socialLinks: string[] = [];
      if (lead.facebook_url) socialLinks.push(lead.facebook_url);
      if (lead.instagram_url) socialLinks.push(lead.instagram_url);

      // If we got social links from Google Business page, use those too
      // (The Google Maps listing sometimes links to social profiles)

      if (socialLinks.length > 0) {
        profile.has_social_links = 1;
        profile.social_links_json = JSON.stringify(socialLinks);
        const socialProfiles = await scrapeSocialProfiles(socialLinks, leadId);
        profile.social_profiles_json = JSON.stringify(socialProfiles);

        // Instagram via Apify
        const igUrl = findInstagramUrl(socialLinks);
        if (igUrl) {
          const igData = await scrapeInstagramViaApify(igUrl, leadId);
          if (igData) {
            populateInstagramProfile(profile, igData);
            // Use profile pic as logo fallback for no-website leads
            if (!profile.logo_path && igData.profilePicUrlHD) {
              profile.logo_path = "instagram_profile.jpg";
            }
          }
        }

        // Use social bio as business description if we don't have one
        for (const sp of socialProfiles) {
          if (sp.bio && !profile.business_description_raw) {
            profile.business_description_raw = sp.bio;
          }
        }
      }
    }

    // ---------------------------------------------------------------
    // Final: If we found IG links but didn't scrape via Apify, try now
    // ---------------------------------------------------------------
    if (!profile.instagram_json) {
      const allSocialLinks = JSON.parse(profile.social_links_json ?? "[]") as string[];
      const igUrl = findInstagramUrl(allSocialLinks);
      if (igUrl) {
        log.info(`fallback IG scrape for ${lead.business_name}`);
        const igData = await scrapeInstagramViaApify(igUrl, leadId);
        if (igData) {
          populateInstagramProfile(profile, igData);
          if (!profile.logo_path && igData.profilePicUrlHD) {
            profile.logo_path = "instagram_profile.jpg";
          }
        }
      }
    }

    profile.profiled_at = new Date().toISOString();
    return profile;
}

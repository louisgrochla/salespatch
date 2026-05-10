import { AgentHandler } from "../../pipeline/agentRuntime.js";
import { createLogger } from "../../lib/logger.js";
import { pLimit } from "../../lib/concurrency.js";
import { siteTemplates, resolveVertical, processConditionals } from "../../templates/siteTemplates.js";
import { buildAssetUrl } from "../../lib/assetStore.js";
import { makeDesignDecision, generateCss, type DesignInput } from "./designSystem.js";
import { generateSiteWithAI, type AIComposerAssets } from "./aiComposer.js";
import type { BrandAnalysis } from "./brandAnalyser.js";
import type { SiteBrief } from "./briefGenerator.js";

const log = createLogger("site-composer");
const AI_COMPOSER_ENABLED = (process.env.AI_COMPOSER_ENABLED ?? "true") !== "false";
const COMPOSER_CONCURRENCY = Number(process.env.COMPOSER_CONCURRENCY ?? "3");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeadData {
  lead_id?: string;
  business_name: string;
  business_type?: string;
  phone?: string;
  email?: string;
  address?: string;
  google_rating?: number;
  google_review_count?: number;
  qualification_score?: number;
  pain_points_json?: string;
  reviews_json?: string;
  opening_hours_json?: string;
  maps_embed_url?: string;
  lat?: number;
  lng?: number;
  social_profiles_json?: string;
  business_description_raw?: string;
}

interface UpstreamData {
  qualified?: LeadData[];
  leads?: LeadData[];
  analyses?: BrandAnalysis[];
  profiles?: LeadData[];
  briefs?: SiteBrief[];
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const siteComposerAgent: AgentHandler = async (input) => {
  const upstream = input.upstreamArtifacts as Record<string, UpstreamData>;

  const leads: LeadData[] = [];
  const brandAnalyses = new Map<string, BrandAnalysis>();
  const briefsByName = new Map<string, SiteBrief>();

  for (const nodeOutput of Object.values(upstream)) {
    if (nodeOutput?.qualified) leads.push(...nodeOutput.qualified);
    else if (nodeOutput?.leads) leads.push(...nodeOutput.leads);
    else if (nodeOutput?.profiles) leads.push(...nodeOutput.profiles);

    if (nodeOutput?.analyses) {
      for (const analysis of nodeOutput.analyses) {
        brandAnalyses.set(analysis.lead_id, analysis);
      }
    }

    // Collect briefs from the brief generator node
    if (nodeOutput?.briefs) {
      for (const brief of nodeOutput.briefs) {
        briefsByName.set(brief.businessName, brief);
      }
    }
  }

  const config = (input.config ?? {}) as { lead_ids?: string[]; template_id?: string; max_sites?: number };
  const maxSites = config.max_sites ?? 10;
  const targetLeads = config.lead_ids
    ? leads.filter((l) => config.lead_ids!.includes(l.lead_id ?? ""))
    : leads.slice(0, maxSites);

  if (targetLeads.length === 0) {
    return {
      summary: "No qualified leads to generate sites for.",
      artifacts: { sites: [], generated_count: 0 },
    };
  }

  const generatedSites: Array<Record<string, unknown>> = [];
  let totalCost = 0;
  const run = pLimit(COMPOSER_CONCURRENCY);

  log.info("starting site generation", { leads: targetLeads.length, concurrency: COMPOSER_CONCURRENCY, ai: AI_COMPOSER_ENABLED });

  await Promise.all(targetLeads.map((lead) => run(async () => {
    const leadId = lead.lead_id ?? "";
    const vertical = resolveVertical(lead.business_type ?? "general");
    const templateId = config.template_id ?? `${vertical}-v1`;
    // Find by ID first, then fall back to matching by vertical, then first template
    const template = siteTemplates.find((t) => t.id === templateId)
      ?? siteTemplates.find((t) => t.vertical === vertical)
      ?? siteTemplates[0];

    const brand = brandAnalyses.get(leadId);
    const brief = briefsByName.get(lead.business_name);

    const businessName = brief?.businessName ?? lead.business_name;
    const businessType = brief?.businessType ?? lead.business_type ?? "business";
    const phone = brief?.phone ?? lead.phone ?? "";
    const email = brief?.email ?? lead.email ?? `info@${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.co.uk`;
    const address = brief?.address ?? lead.address ?? "";

    // --- Gather asset availability ---
    const heroPhoto = brand?.photo_inventory?.find((p) => p.usable_for.includes("hero"));
    const hasHeroImage = brief?.hasHeroImage ?? !!(heroPhoto && leadId);
    const galleryPhotos = brand?.photo_inventory?.filter(
      (p) => p.usable_for.includes("gallery") && p.filename !== heroPhoto?.filename,
    ) ?? [];
    const socialPhotos = brand?.photo_inventory?.filter((p) => p.category === "social") ?? [];
    const hasGallery = brief?.galleryImageCount ? brief.galleryImageCount >= 2 : galleryPhotos.length >= 2;
    const hasLogo = brief?.hasLogo ?? !!(brand?.logo_path && leadId);
    const hasReviews = brief ? brief.bestReviews.length > 0 : false;
    const hasHours = brief ? brief.openingHours.length > 0 : false;
    const hasMap = !!(brief?.mapsEmbedUrl ?? lead.maps_embed_url);
    const hasMenu = brief?.menuItems ? brief.menuItems.length > 0 : !!(brand?.menu_items && brand.menu_items.length > 0);

    // --- DESIGN SYSTEM: consult the design brain ---
    const designInput: DesignInput = {
      vertical,
      businessName,
      businessType,
      scrapedPrimary: brand?.colours?.primary,
      scrapedSecondary: brand?.colours?.secondary,
      scrapedAccent: brand?.colours?.accent,
      scrapedFonts: brand?.fonts ? [brand.fonts.heading, brand.fonts.body].filter(Boolean) : undefined,
      paletteSource: brand?.colours?.palette_source,
      hasLogo,
      hasHeroImage,
      hasGallery,
      galleryCount: galleryPhotos.length + socialPhotos.length,
      hasReviews,
      reviewCount: brief?.bestReviews.length ?? 0,
      hasHours,
      hasMap,
      hasMenu,
      hasSocialImages: socialPhotos.length > 0,
      socialImageCount: socialPhotos.length,
      googleRating: brief?.googleRating ?? lead.google_rating ?? undefined,
      googleReviewCount: brief?.googleReviewCount ?? lead.google_review_count ?? undefined,
    };

    const design = makeDesignDecision(designInput);
    const designCss = generateCss(design);

    // --- Gather asset URLs ---
    const logoUrl = hasLogo ? buildAssetUrl(leadId, brand?.logo_path ?? "logo.png") : "";
    const heroImageUrl = hasHeroImage && heroPhoto ? buildAssetUrl(leadId, heroPhoto.filename) : "";
    const galleryUrlList = hasGallery
      ? galleryPhotos.slice(0, 8).map((p) => buildAssetUrl(leadId, p.filename))
      : [];

    // ─────────────────────────────────────────────────────────────
    // AI COMPOSER PATH — generates unique HTML via Claude
    // ─────────────────────────────────────────────────────────────
    if (AI_COMPOSER_ENABLED && brief) {
      try {
        const aiAssets: AIComposerAssets = { logoUrl, heroUrl: heroImageUrl, galleryUrls: galleryUrlList };
        const aiResult = await generateSiteWithAI(brief, design, aiAssets, leadId);

        const domain = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
        const siteName = `${businessName} — ${businessType.charAt(0).toUpperCase() + businessType.slice(1)}`;

        const assetsUsed: string[] = [];
        if (hasLogo && brand?.logo_path) assetsUsed.push(brand.logo_path);
        if (hasHeroImage && heroPhoto) assetsUsed.push(heroPhoto.filename);
        galleryPhotos.slice(0, 8).forEach((p) => assetsUsed.push(p.filename));

        totalCost += aiResult.costUsd;

        generatedSites.push({
          lead_id: lead.lead_id,
          template_id: "ai-generated",
          site_name: siteName,
          domain,
          config_json: "{}",
          html_output: aiResult.html,
          css_output: "",
          business_name: businessName,
          vertical,
          assets_used_json: JSON.stringify(assetsUsed),
          brand_source: design.colours.source,
          brief_used: true,
          has_reviews: hasReviews,
          has_map: hasMap,
          has_hours: hasHours,
          has_gallery: hasGallery,
          has_menu: hasMenu,
          sections_count: brief.sectionOrder.length,
          design_rationale: design.rationale,
          component_style: design.componentStyle,
          hero_variant: design.hero.variant,
          font_pairing: `${design.fonts.heading} / ${design.fonts.body}`,
          avoid_topics: brief.avoidTopics,
          ai_generated: true,
          ai_tokens_used: aiResult.tokensUsed,
          ai_cost_usd: aiResult.costUsd,
        });

        return; // Skip template fallback
      } catch (err) {
        log.warn(`AI generation failed for ${businessName}, falling back to template`, { error: String(err) });
        // Fall through to template path below
      }
    }

    // ─────────────────────────────────────────────────────────────
    // TEMPLATE FALLBACK PATH — deterministic template filling
    // ─────────────────────────────────────────────────────────────
    const tagline = brief?.heroHeadline ?? generateFallbackTagline(businessName, businessType, vertical);
    const heroDescription = brief?.heroSubtext ?? generateFallbackHeroDesc(businessName, businessType, lead);
    const aboutText = brief?.aboutCopy ?? generateFallbackAbout(businessName, businessType, lead);

    // --- Services HTML: driven by brief, not generic ---
    const servicesHtml = brief?.services && brief.services.length > 0
      ? brief.services.slice(0, 6).map((s) =>
          `<div class="service-card"><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.description)}</p></div>`
        ).join("\n        ")
      : generateFallbackServicesHtml(businessType, vertical);

    const galleryHtml = hasGallery
      ? galleryPhotos.slice(0, 8).map((p) =>
          `<div class="gallery-item"><img src="${buildAssetUrl(leadId, p.filename)}" alt="${escapeHtml(businessName)}" loading="lazy"></div>`
        ).join("\n        ")
      : "";

    // --- Reviews from brief ---
    const reviewsHtml = brief?.bestReviews && brief.bestReviews.length > 0
      ? brief.bestReviews.slice(0, 3).map((r) => `
        <div class="testimonial-card">
          <p class="testimonial-text">${escapeHtml(smartTruncate(r.text, 200))}</p>
          <p class="testimonial-author">${escapeHtml(r.author)}</p>
          <p class="testimonial-rating">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</p>
        </div>`).join("\n")
      : "";

    const googleRating = brief?.googleRating ?? lead.google_rating;
    const googleReviewCount = brief?.googleReviewCount ?? lead.google_review_count;
    const hasRating = !!(googleRating && googleReviewCount && googleReviewCount > 3);
    const starsHtml = hasRating
      ? "★".repeat(Math.round(googleRating!)) + "☆".repeat(5 - Math.round(googleRating!))
      : "";

    // --- Hours from brief ---
    const hours = brief?.openingHours ?? safeJsonParse<string[]>(lead.opening_hours_json, []);
    const hoursHtml = hours.slice(0, 7).map((h) => {
      const parts = h.match(/^(\w+(?:day)?)\s*[:\s]\s*(.+)$/i);
      if (parts) {
        return `<div class="hours-row"><span class="hours-day">${escapeHtml(parts[1])}</span><span class="hours-time">${escapeHtml(parts[2])}</span></div>`;
      }
      return `<div class="hours-row"><span class="hours-time">${escapeHtml(h)}</span></div>`;
    }).join("\n        ");

    const mapsEmbedUrl = brief?.mapsEmbedUrl ?? lead.maps_embed_url ?? "";

    // --- Menu from brief ---
    const menuItems = brief?.menuItems ?? brand?.menu_items;
    const menuHtml = menuItems && menuItems.length > 0
      ? menuItems.slice(0, 20).map((item) =>
          `<div class="menu-item"><span class="menu-item-name">${escapeHtml(item.name)}</span>${item.price ? `<span class="menu-item-price">${escapeHtml(item.price)}</span>` : ""}${item.description ? `<br><span class="menu-item-desc">${escapeHtml(item.description)}</span>` : ""}</div>`
        ).join("\n        ")
      : "";

    // --- CTA from brief (business-type-appropriate, not generic!) ---
    const ctaText = brief?.ctaPrimary.text ?? "Contact Us";
    const ctaHeading = brief
      ? `Ready? ${brief.ctaPrimary.text}`
      : generateFallbackCtaHeading(businessName, vertical);
    const ctaSubtext = brief
      ? brief.ctaPrimary.why
      : generateFallbackCtaSubtext(businessName, businessType, vertical);

    // --- Trust badges from brief (type-specific, no "Free Quotes" on a barber!) ---
    const trustBadgesHtml = brief?.trustBadges
      ? brief.trustBadges.map((b) => `<div class="trust-item"><span class="trust-check">✓</span> ${escapeHtml(b)}</div>`).join("\n          ")
      : "";

    const templateVars: Record<string, string> = {
      business_name: businessName,
      tagline,
      phone,
      email,
      address,
      hero_description: heroDescription,
      about_text: aboutText,
      services_html: servicesHtml,
      services_subtitle: brief
        ? `What ${businessName} offers`
        : `Professional ${businessType} services tailored to your needs`,
      cta_text: ctaText,
      cta_heading: ctaHeading,
      cta_subtext: ctaSubtext,
      trust_badges_html: trustBadgesHtml,
      // Design system colours
      primary_color: design.colours.primary,
      accent_color: design.colours.secondary,
      heading_font: design.fonts.heading,
      heading_font_import: design.fonts.headingImport,
      body_font: design.fonts.body,
      body_font_import: design.fonts.bodyImport,
      year: new Date().getFullYear().toString(),
      // Data-driven sections
      logo_url: logoUrl,
      hero_image_url: heroImageUrl,
      gallery_html: galleryHtml,
      menu_html: menuHtml,
      reviews_html: reviewsHtml,
      hours_html: hoursHtml,
      maps_embed_url: mapsEmbedUrl,
      google_rating: googleRating?.toString() ?? "",
      google_review_count: googleReviewCount?.toString() ?? "",
      stars_html: starsHtml,
      // Design rationale (for debug)
      design_rationale: design.rationale.join(" | "),
      component_style: design.componentStyle,
      hero_variant: design.hero.variant,
      brief_source: brief ? "brief" : "fallback",
      // Conditional flags
      has_logo: hasLogo ? "true" : "",
      has_hero_image: hasHeroImage ? "true" : "",
      no_hero_image: hasHeroImage ? "" : "true",
      has_gallery: hasGallery ? "true" : "",
      has_menu: hasMenu ? "true" : "",
      has_reviews: hasReviews ? "true" : "",
      has_rating: hasRating ? "true" : "",
      has_hours: hasHours ? "true" : "",
      has_map: hasMap ? "true" : "",
      has_address: address ? "true" : "",
      has_trust_badges: (brief?.trustBadges.length ?? 0) > 0 || design.hero.showTrustBadges ? "true" : "",
    };

    // Use design system CSS instead of template CSS
    let css = designCss;
    let html = template.html_template;

    for (const [key, value] of Object.entries(templateVars)) {
      css = css.replaceAll(`{{${key}}}`, value);
    }
    templateVars.css = css;

    for (const [key, value] of Object.entries(templateVars)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }

    html = processConditionals(html, templateVars);

    const siteName = `${businessName} — ${businessType.charAt(0).toUpperCase() + businessType.slice(1)}`;
    const domain = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

    const assetsUsed: string[] = [];
    if (hasLogo && brand?.logo_path) assetsUsed.push(brand.logo_path);
    if (hasHeroImage && heroPhoto) assetsUsed.push(heroPhoto.filename);
    galleryPhotos.slice(0, 8).forEach((p) => assetsUsed.push(p.filename));

    generatedSites.push({
      lead_id: lead.lead_id,
      template_id: template.id,
      site_name: siteName,
      domain,
      config_json: JSON.stringify(templateVars),
      html_output: html,
      css_output: css,
      business_name: businessName,
      vertical,
      assets_used_json: JSON.stringify(assetsUsed),
      brand_source: design.colours.source,
      brief_used: !!brief,
      // Design system metadata
      has_reviews: hasReviews,
      has_map: hasMap,
      has_hours: hasHours,
      has_gallery: hasGallery,
      has_menu: hasMenu,
      sections_count: countSections(templateVars),
      design_rationale: design.rationale,
      component_style: design.componentStyle,
      hero_variant: design.hero.variant,
      font_pairing: `${design.fonts.heading} / ${design.fonts.body}`,
      avoid_topics: brief?.avoidTopics ?? [],
    });
  })));

  const withBrand = generatedSites.filter((s) => s.brand_source !== "vertical_default").length;
  const withBrief = generatedSites.filter((s) => s.brief_used).length;
  const withAI = generatedSites.filter((s) => s.ai_generated).length;
  const withReviews = generatedSites.filter((s) => s.has_reviews).length;
  const withMaps = generatedSites.filter((s) => s.has_map).length;

  return {
    summary: `Generated ${generatedSites.length} landing pages. ${withAI} AI-generated. ${withBrief} with brief data. ${withBrand} with real brand data. ${withReviews} with testimonials. ${withMaps} with maps.${totalCost > 0 ? ` Cost: $${totalCost.toFixed(4)}` : ""}`,
    artifacts: {
      sites: generatedSites,
      generated_count: generatedSites.length,
      _decision: {
        reasoning: `Generated ${generatedSites.length} sites (${withAI} AI, ${generatedSites.length - withAI} template). ${withBrief} used briefs. ${withBrand} with scraped brand data. Cost: $${totalCost.toFixed(4)}`,
        alternatives: ["Could use cheaper model for template-worthy leads", "Could generate multiple variants per lead for A/B testing"],
        confidence: generatedSites.length > 0 ? 0.8 : 0.3,
        tags: [`ai:${withAI}`, `template:${generatedSites.length - withAI}`],
      },
      // Per-lead decisions: rich pivot tags so the Friday dashboard can group
      // close rates by hero variant, palette, brand source, etc.
      _decisions: generatedSites.map((s) => ({
        lead_id: s.lead_id,
        reasoning: `Composed site for ${s.business_name} — hero=${s.hero_variant}, brand_source=${s.brand_source}, brief_used=${s.brief_used}, ai=${s.ai_generated ?? false}`,
        alternatives: [],
        confidence: s.brief_used && s.brand_source !== "vertical_default" ? 0.85 : 0.6,
        tags: [
          `vertical:${s.vertical}`,
          `hero:${s.hero_variant}`,
          `brand_source:${s.brand_source}`,
          `component_style:${s.component_style}`,
          `font_pairing:${s.font_pairing}`,
          ...(s.has_reviews ? ["proof:review_count"] : []),
          ...(s.has_map ? ["section:map"] : []),
          ...(s.has_gallery ? ["section:gallery"] : []),
          ...(s.has_menu ? ["section:menu"] : []),
        ],
      })),
    },
    cost_usd: totalCost,
  };
};

// ---------------------------------------------------------------------------
// Fallback content generators — only used when no brief is available
// The brief generator should be the primary source of all copy.
// ---------------------------------------------------------------------------

function generateFallbackTagline(name: string, _type: string, _vertical: string): string {
  return `Welcome to ${name}`;
}

function generateFallbackHeroDesc(name: string, type: string, lead: LeadData): string {
  const ratingText = lead.google_rating && lead.google_review_count && lead.google_review_count > 3
    ? ` Rated ${lead.google_rating} stars by ${lead.google_review_count} happy customers.`
    : "";
  const locationText = lead.address ? ` Serving ${lead.address} and surrounding areas.` : "";
  return `${name} — your local ${type}.${ratingText}${locationText}`;
}

function generateFallbackAbout(name: string, type: string, lead: LeadData): string {
  const locationMention = lead.address ? ` Based in ${lead.address}, we serve` : " We serve";
  return `${name} is a dedicated local ${type}.${locationMention} customers across the area.`;
}

function generateFallbackServicesHtml(_type: string, _vertical: string): string {
  return `<div class="service-card"><h3>Our Services</h3><p>Contact us for more information about what we offer.</p></div>`;
}

function generateFallbackCtaHeading(_name: string, _vertical: string): string {
  return "Get In Touch Today";
}

function generateFallbackCtaSubtext(name: string, _type: string, _vertical: string): string {
  return `Contact ${name} today — we'd love to hear from you.`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function countSections(vars: Record<string, string>): number {
  let count = 3; // hero + services + contact always present
  if (vars.has_gallery) count++;
  if (vars.has_reviews) count++;
  if (vars.has_hours) count++;
  if (vars.has_map) count++;
  if (vars.has_menu) count++;
  count++; // CTA section
  return count;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function smartTruncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const truncated = s.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.7 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

function safeJsonParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

/**
 * Composer Workbench — local web UI for iterating on demo site quality.
 *
 * Reads enriched lead data from the Pi's SQLite database (mvp-pi.sqlite),
 * lets you pick a lead, adjust composer settings, generate HTML, and preview
 * side-by-side with the business's real photos.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... npx tsx tools/workbench/server.ts
 *
 * Opens on http://localhost:3456
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Imports from the main codebase
// ---------------------------------------------------------------------------
import { buildBrief, type SiteBrief } from "../../src/agents/outreach/briefGenerator.js";
import { generateSiteWithAI } from "../../src/agents/outreach/aiComposer.js";
import { makeDesignDecision, type DesignInput } from "../../src/agents/outreach/designSystem.js";
import type { BrandAnalysis } from "../../src/agents/outreach/brandAnalyser.js";

// Pipeline agents
import { leadScoutAgent } from "../../src/agents/outreach/leadScoutAgent.js";
import { leadProfilerAgent } from "../../src/agents/outreach/leadProfilerAgent.js";
import { brandAnalyserAgent } from "../../src/agents/outreach/brandAnalyser.js";
import { brandIntelligenceAgent } from "../../src/agents/outreach/brandIntelligence.js";
import { leadQualifierAgent } from "../../src/agents/outreach/leadQualifierAgent.js";
import { briefGeneratorAgent } from "../../src/agents/outreach/briefGenerator.js";
import { siteComposerAgent } from "../../src/agents/outreach/siteComposerAgent.js";
import type { AgentExecutionInput } from "../../src/pipeline/agentRuntime.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = Number(process.env.WORKBENCH_PORT ?? "3456");
const REPO_ROOT = join(__dirname, "../..");
const DB_PATH = process.env.WORKBENCH_DB ?? join(REPO_ROOT, "data/mvp-pi.sqlite");
const ASSETS_ROOT = join(process.env.PROJECTS_PATH ?? join(homedir(), "projects"), ".assets");
const SAVES_DIR = join(REPO_ROOT, "data/workbench-saves");

if (!existsSync(SAVES_DIR)) mkdirSync(SAVES_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
let db: Database.Database;

function openDb() {
  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    console.error("Copy from Pi: scp openclaw@100.93.24.14:/home/openclaw/klaude-repo/data/mvp.sqlite data/mvp-pi.sqlite");
    process.exit(1);
  }
  db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
}

interface ArtifactRow {
  run_id: string;
  node_id: string;
  value_json: string;
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

function getRunIds(): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT run_id FROM agent_task_artifacts
    WHERE node_id = 'scout'
    ORDER BY created_at DESC
  `).all() as Array<{ run_id: string }>;
  return rows.map((r) => r.run_id);
}

function getArtifact(runId: string, nodeId: string): unknown | null {
  const row = db.prepare(
    "SELECT value_json FROM agent_task_artifacts WHERE run_id = ? AND node_id = ?"
  ).get(runId, nodeId) as ArtifactRow | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value_json); } catch { return null; }
}

interface LeadSummary {
  lead_id: string;
  business_name: string;
  business_type: string;
  google_rating?: number;
  google_review_count?: number;
  address?: string;
  phone?: string;
  has_website: number;
  website_quality_score?: number;
  instagram_followers?: number;
  instagram_handle?: string;
  qualification_score?: number;
  qualified: boolean;
  photo_count: number;
  run_id: string;
}

function getAllLeads(): LeadSummary[] {
  const runIds = getRunIds();
  const leads: LeadSummary[] = [];
  const seen = new Set<string>();
  const seenNames = new Set<string>();

  for (const runId of runIds) {
    const scoutData = getArtifact(runId, "scout") as { leads?: Array<Record<string, unknown>> } | null;
    const profileData = getArtifact(runId, "profile") as { profiles?: Array<Record<string, unknown>> } | null;
    const qualifyData = getArtifact(runId, "qualify") as {
      qualified?: Array<Record<string, unknown>>;
      rejected?: Array<Record<string, unknown>>;
    } | null;
    const brandData = getArtifact(runId, "brand-analyse") as { analyses?: BrandAnalysis[] } | null;

    if (!scoutData?.leads) continue;

    const profiles = new Map<string, Record<string, unknown>>();
    for (const p of profileData?.profiles ?? []) {
      if (p.lead_id) profiles.set(p.lead_id as string, p);
    }

    const qualifiedIds = new Set<string>();
    const qualScores = new Map<string, number>();
    for (const q of qualifyData?.qualified ?? []) {
      if (q.lead_id) {
        qualifiedIds.add(q.lead_id as string);
        qualScores.set(q.lead_id as string, (q.qualification_score as number) ?? 0);
      }
    }

    const brandMap = new Map<string, BrandAnalysis>();
    for (const a of brandData?.analyses ?? []) {
      brandMap.set(a.lead_id, a);
    }

    for (const lead of scoutData.leads) {
      const id = lead.lead_id as string;
      if (seen.has(id)) continue;
      seen.add(id);

      // Deduplicate by business name (scheduler ran many times with same search)
      const nameKey = ((lead.business_name as string) ?? "").toLowerCase().trim();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);

      const profile = profiles.get(id);
      const brand = brandMap.get(id);
      const photoCount = brand?.photo_inventory?.length ?? 0;

      // Extract IG data from profile
      let igFollowers: number | undefined;
      let igHandle: string | undefined;
      if (profile?.social_links_json) {
        try {
          const links = JSON.parse(profile.social_links_json as string) as string[];
          const igLink = links.find((l) => l.includes("instagram.com"));
          if (igLink) {
            const match = igLink.match(/instagram\.com\/([^/?]+)/);
            igHandle = match?.[1];
          }
        } catch { /* ignore */ }
      }
      if (profile?.instagram_followers) {
        igFollowers = profile.instagram_followers as number;
      }

      leads.push({
        lead_id: id,
        business_name: (lead.business_name ?? profile?.business_name ?? "Unknown") as string,
        business_type: (lead.business_type ?? profile?.business_type ?? "business") as string,
        google_rating: (profile?.google_rating ?? lead.google_rating) as number | undefined,
        google_review_count: (profile?.google_review_count ?? lead.google_review_count) as number | undefined,
        address: (profile?.address ?? lead.address) as string | undefined,
        phone: (profile?.phone ?? lead.phone) as string | undefined,
        has_website: (profile?.has_website ?? lead.has_website ?? 0) as number,
        website_quality_score: profile?.website_quality_score as number | undefined,
        instagram_followers: igFollowers,
        instagram_handle: igHandle,
        qualification_score: qualScores.get(id),
        qualified: qualifiedIds.has(id),
        photo_count: photoCount,
        run_id: runId,
      });
    }
  }

  return leads;
}

interface LeadDetail {
  lead: LeadSummary;
  profile: Record<string, unknown> | null;
  brandAnalysis: BrandAnalysis | null;
  brandIntelligence: Record<string, unknown> | null;
  photos: string[];
}

function getLeadDetail(leadId: string): LeadDetail | null {
  const allLeads = getAllLeads();
  const lead = allLeads.find((l) => l.lead_id === leadId);
  if (!lead) return null;

  const profileData = getArtifact(lead.run_id, "profile") as { profiles?: Array<Record<string, unknown>> } | null;
  const brandData = getArtifact(lead.run_id, "brand-analyse") as { analyses?: BrandAnalysis[] } | null;
  const intelligenceData = getArtifact(lead.run_id, "brand-intelligence") as { intelligence?: Array<Record<string, unknown>> } | null;

  const profile = profileData?.profiles?.find((p) => p.lead_id === leadId) ?? null;
  const brandAnalysis = brandData?.analyses?.find((a) => a.lead_id === leadId) ?? null;
  const intelligence = intelligenceData?.intelligence?.find((i) => (i as Record<string, unknown>).lead_id === leadId) ?? null;

  // List photos
  const photoDir = join(ASSETS_ROOT, leadId);
  let photos: string[] = [];
  if (existsSync(photoDir)) {
    photos = readdirSync(photoDir)
      .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort();
  }

  return { lead, profile, brandAnalysis, brandIntelligence: intelligence, photos };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface GenerateRequest {
  leadId: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  promptAddition?: string;
  selectedPhotos?: string[];
}

async function generateSite(req: GenerateRequest): Promise<{ html: string; cost: number; tokens: number; briefMarkdown: string }> {
  const detail = getLeadDetail(req.leadId);
  if (!detail) throw new Error(`Lead not found: ${req.leadId}`);

  const { profile, brandAnalysis } = detail;
  if (!profile) throw new Error("No profile data for this lead");

  // Build brief
  const vertical = resolveVertical((profile.business_type as string) ?? "business");
  const brief = buildBrief(
    profile as Parameters<typeof buildBrief>[0],
    brandAnalysis ?? undefined,
    vertical,
  );

  // Build design decision
  const designInput: DesignInput = {
    vertical,
    businessName: brief.businessName,
    businessType: brief.businessType,
    scrapedPrimary: brandAnalysis?.colours?.primary,
    scrapedSecondary: brandAnalysis?.colours?.secondary,
    scrapedAccent: brandAnalysis?.colours?.accent,
    scrapedFonts: brandAnalysis?.fonts ? [brandAnalysis.fonts.heading, brandAnalysis.fonts.body].filter(Boolean) : undefined,
    paletteSource: brandAnalysis?.colours?.palette_source,
    hasLogo: brief.hasLogo,
    hasHeroImage: brief.hasHeroImage,
    hasGallery: brief.galleryImageCount > 0,
    galleryCount: brief.galleryImageCount,
    hasReviews: brief.bestReviews.length > 0,
    reviewCount: brief.bestReviews.length,
    hasHours: brief.openingHours.length > 0,
    hasMap: !!brief.mapsEmbedUrl,
    hasMenu: !!(brief.menuItems && brief.menuItems.length > 0),
    hasSocialImages: detail.photos.length > 0,
  };
  const design = makeDesignDecision(designInput);

  // Build asset URLs — use local file:// paths for the workbench
  const photoDir = join(ASSETS_ROOT, req.leadId);
  const availablePhotos = req.selectedPhotos ?? detail.photos;

  const assets = {
    logoUrl: "",
    heroUrl: "",
    galleryUrls: [] as string[],
  };

  for (const photo of availablePhotos) {
    const path = join(photoDir, photo);
    if (!existsSync(path)) continue;
    // Serve via our local server
    const url = `/api/leads/${req.leadId}/photos/${photo}`;
    if (photo.includes("logo")) {
      assets.logoUrl = url;
    } else if (!assets.heroUrl && (photo.includes("hero") || photo.includes("gallery_1") || photo.includes("google_photo_1"))) {
      assets.heroUrl = url;
    } else {
      assets.galleryUrls.push(url);
    }
  }

  // Override model/temp if specified
  if (req.model) process.env.AI_COMPOSER_MODEL = req.model;
  if (req.temperature !== undefined) process.env.AI_COMPOSER_TEMPERATURE = String(req.temperature);
  if (req.maxTokens) process.env.AI_COMPOSER_MAX_TOKENS = String(req.maxTokens);

  const result = await generateSiteWithAI(brief, design, assets, req.leadId);

  return {
    html: result.html,
    cost: result.costUsd,
    tokens: result.tokensUsed,
    briefMarkdown: brief.markdown,
  };
}

function resolveVertical(businessType: string): string {
  const lower = (businessType ?? "").toLowerCase();
  const trades = ["plumber", "electrician", "builder", "roofer", "painter", "decorator", "carpenter", "locksmith", "mechanic", "gardener", "cleaner", "handyman"];
  const food = ["restaurant", "cafe", "takeaway", "bakery", "pub", "bar", "bistro", "pizza", "coffee", "grill"];
  const health = ["dentist", "salon", "barber", "physio", "spa", "gym", "beauty", "massage"];
  const professional = ["accountant", "lawyer", "solicitor", "consultant", "tutor"];
  const retail = ["shop", "store", "florist", "pet", "boutique"];

  if (trades.some((t) => lower.includes(t))) return "trades";
  if (food.some((t) => lower.includes(t))) return "food";
  if (health.some((t) => lower.includes(t))) return "health";
  if (professional.some((t) => lower.includes(t))) return "professional";
  if (retail.some((t) => lower.includes(t))) return "retail";
  return "trades";
}

// ---------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------

function saveOutput(leadId: string, html: string, meta: Record<string, unknown>) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(SAVES_DIR, leadId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${ts}.html`), html);
  writeFileSync(join(dir, `${ts}.json`), JSON.stringify(meta, null, 2));
  return { path: join(dir, `${ts}.html`) };
}

function listSaves(): Array<{ leadId: string; files: string[] }> {
  if (!existsSync(SAVES_DIR)) return [];
  return readdirSync(SAVES_DIR)
    .filter((d) => existsSync(join(SAVES_DIR, d)) && readdirSync(join(SAVES_DIR, d)).length > 0)
    .map((d) => ({
      leadId: d,
      files: readdirSync(join(SAVES_DIR, d)).filter((f) => f.endsWith(".html")),
    }));
}

// ---------------------------------------------------------------------------
// Secure Key Storage
// ---------------------------------------------------------------------------

const ENV_FILE = join(REPO_ROOT, "data/.env.workbench");
const MANAGED_KEYS = ["OPENROUTER_API_KEY", "APIFY_API_TOKEN"];

function loadKeys(): void {
  if (!existsSync(ENV_FILE)) return;
  const content = readFileSync(ENV_FILE, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (MANAGED_KEYS.includes(key) && value) {
      process.env[key] = value;
    }
  }
}

function saveKeys(keys: Record<string, string>): void {
  // Merge with existing
  const existing: Record<string, string> = {};
  if (existsSync(ENV_FILE)) {
    const content = readFileSync(ENV_FILE, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      existing[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }

  for (const [key, value] of Object.entries(keys)) {
    if (MANAGED_KEYS.includes(key) && value) {
      existing[key] = value;
      process.env[key] = value;
    }
  }

  const lines = Object.entries(existing)
    .filter(([k]) => MANAGED_KEYS.includes(k))
    .map(([k, v]) => `${k}=${v}`);
  writeFileSync(ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
}

function getMaskedKeys(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of MANAGED_KEYS) {
    const val = process.env[key];
    if (val && val.length > 8) {
      result[key] = val.slice(0, 4) + "..." + val.slice(-4);
    } else {
      result[key] = "";
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pipeline Execution
// ---------------------------------------------------------------------------

const STAGES = ["scout", "profile", "brand-analyse", "brand-intelligence", "qualify", "brief", "compose"] as const;
type StageName = typeof STAGES[number];

const STAGE_AGENTS: Record<StageName, string> = {
  scout: "lead-scout-agent",
  profile: "lead-profiler-agent",
  "brand-analyse": "brand-analyser-agent",
  "brand-intelligence": "brand-intelligence-agent",
  qualify: "lead-qualifier-agent",
  brief: "brief-generator-agent",
  compose: "site-composer-agent",
};

const STAGE_HANDLERS: Record<StageName, (input: AgentExecutionInput) => Promise<{ summary: string; artifacts: Record<string, unknown>; cost_usd?: number }>> = {
  scout: leadScoutAgent,
  profile: leadProfilerAgent,
  "brand-analyse": brandAnalyserAgent,
  "brand-intelligence": brandIntelligenceAgent,
  qualify: leadQualifierAgent,
  brief: briefGeneratorAgent,
  compose: siteComposerAgent,
};

// Maps upstream stage dependencies
function getUpstreamKeys(stage: StageName): StageName[] {
  switch (stage) {
    case "scout": return [];
    case "profile": return ["scout"];
    case "brand-analyse": return ["scout", "profile"];
    case "brand-intelligence": return ["profile", "brand-analyse"];
    case "qualify": return ["profile", "brand-analyse", "brand-intelligence"];
    case "brief": return ["qualify", "profile", "brand-analyse"];
    case "compose": return ["brief", "qualify", "brand-analyse"];
  }
}

interface PipelineRun {
  id: string;
  config: { location: string; verticals: string[]; maxPerVertical: number };
  currentStage: number;
  stages: Array<{
    name: StageName;
    status: "pending" | "running" | "done" | "error";
    startedAt?: number;
    finishedAt?: number;
    summary?: string;
    error?: string;
    leadCount?: number;
    costUsd?: number;
    artifacts?: Record<string, unknown>;
  }>;
}

const activeRuns = new Map<string, PipelineRun>();
const sseClients = new Map<string, ServerResponse[]>();

function makeInput(
  runId: string, nodeId: string, agentId: string,
  upstream: Record<string, unknown>, config?: Record<string, unknown>,
): AgentExecutionInput {
  return { run_id: runId, node_id: nodeId, agent_id: agentId as AgentExecutionInput["agent_id"], config, upstreamArtifacts: upstream };
}

function broadcastSSE(runId: string, data: unknown): void {
  const clients = sseClients.get(runId) ?? [];
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try { client.write(msg); } catch { /* client disconnected */ }
  }
}

function createPipelineRun(config: PipelineRun["config"]): PipelineRun {
  const id = `wb-${Date.now()}`;
  const run: PipelineRun = {
    id,
    config,
    currentStage: -1,
    stages: STAGES.map((name) => ({ name, status: "pending" as const })),
  };
  activeRuns.set(id, run);
  return run;
}

async function runNextStage(runId: string): Promise<PipelineRun["stages"][0]> {
  const run = activeRuns.get(runId);
  if (!run) throw new Error("Run not found");

  const nextIdx = run.currentStage + 1;
  if (nextIdx >= STAGES.length) throw new Error("Pipeline complete — no more stages");

  const stage = run.stages[nextIdx];
  const stageName = stage.name;
  run.currentStage = nextIdx;

  stage.status = "running";
  stage.startedAt = Date.now();
  broadcastSSE(runId, { type: "stage_start", stage: stageName, index: nextIdx });

  try {
    // Build upstream artifacts
    const upstream: Record<string, unknown> = {};
    for (const dep of getUpstreamKeys(stageName)) {
      const depStage = run.stages.find((s) => s.name === dep);
      if (depStage?.artifacts) upstream[dep] = depStage.artifacts;
    }

    // Build config for scout
    const config = stageName === "scout"
      ? { verticals: run.config.verticals, location: run.config.location, max_results_per_vertical: run.config.maxPerVertical }
      : undefined;

    const handler = STAGE_HANDLERS[stageName];
    const result = await handler(makeInput(runId, stageName, STAGE_AGENTS[stageName], upstream, config));

    stage.status = "done";
    stage.finishedAt = Date.now();
    stage.summary = result.summary;
    stage.costUsd = result.cost_usd;
    stage.artifacts = result.artifacts;

    // Count leads/items
    const a = result.artifacts;
    stage.leadCount = (a.leads as unknown[])?.length
      ?? (a.profiles as unknown[])?.length
      ?? (a.analyses as unknown[])?.length
      ?? (a.intelligence as unknown[])?.length
      ?? (a.qualified as unknown[])?.length
      ?? (a.briefs as unknown[])?.length
      ?? (a.sites as unknown[])?.length
      ?? 0;

    broadcastSSE(runId, { type: "stage_done", stage: stageName, index: nextIdx, summary: stage.summary, leadCount: stage.leadCount, ms: (stage.finishedAt - stage.startedAt!), cost: stage.costUsd });
  } catch (err) {
    stage.status = "error";
    stage.finishedAt = Date.now();
    stage.error = err instanceof Error ? err.message : String(err);
    broadcastSSE(runId, { type: "stage_error", stage: stageName, index: nextIdx, error: stage.error });
  }

  return stage;
}

/** Format stage output for display — summarize leads/profiles/etc into cards */
function formatStageOutput(stage: PipelineRun["stages"][0]): unknown {
  if (!stage.artifacts) return null;
  const a = stage.artifacts;

  // Return a display-friendly summary per stage
  switch (stage.name) {
    case "scout":
      return (a.leads as Array<Record<string, unknown>> ?? []).map((l) => ({
        lead_id: l.lead_id, name: l.business_name, type: l.business_type,
        rating: l.google_rating, reviews: l.google_review_count,
        address: l.address, phone: l.phone, website: l.website_url,
        photos: l.google_photos_downloaded ?? 0,
      }));
    case "profile":
      return (a.profiles as Array<Record<string, unknown>> ?? []).map((p) => ({
        lead_id: p.lead_id, name: p.business_name, type: p.business_type,
        rating: p.google_rating, reviews: p.google_review_count,
        website_score: p.website_quality_score, has_website: p.has_website,
        phone: p.phone, address: p.address,
        ig_followers: p.instagram_followers, ig_handle: p.instagram_handle,
        has_ig: !!p.instagram_json, logo: p.logo_path,
        social_count: p.has_social_links,
        services: p.services_extracted_json ? JSON.parse(p.services_extracted_json as string).length : 0,
      }));
    case "brand-analyse":
      return (a.analyses as Array<Record<string, unknown>> ?? []).map((ba) => ({
        lead_id: ba.lead_id,
        colours: ba.colours, fonts: ba.fonts,
        photos: (ba.photo_inventory as unknown[])?.length ?? 0,
        services: (ba.services as unknown[])?.length ?? 0,
        description: (ba.description as string)?.slice(0, 150),
      }));
    case "brand-intelligence":
      return (a.intelligence as Array<Record<string, unknown>> ?? []).map((bi) => ({
        lead_id: bi.lead_id,
        tone: bi.tone, personality: bi.personality,
        usps: bi.unique_selling_points,
        headline: bi.suggested_headline,
      }));
    case "qualify":
      return {
        qualified: (a.qualified as Array<Record<string, unknown>> ?? []).map((q) => ({
          lead_id: q.lead_id, name: q.business_name, type: q.business_type,
          score: q.qualification_score, reasons: q.qualification_reasons,
        })),
        rejected: (a.rejected as Array<Record<string, unknown>> ?? []).map((r) => ({
          lead_id: r.lead_id, name: r.business_name, type: r.business_type,
          reason: r.rejection_reason,
        })),
        stats: { qualified: (a.qualified as unknown[])?.length ?? 0, rejected: (a.rejected as unknown[])?.length ?? 0, avg_score: a.avg_score },
      };
    case "brief":
      return (a.briefs as Array<Record<string, unknown>> ?? []).map((b) => ({
        name: b.businessName, type: b.businessType,
        headline: b.heroHeadline, subtext: b.heroSubtext,
        services: (b.services as unknown[])?.length ?? 0,
        reviews: (b.bestReviews as unknown[])?.length ?? 0,
        sections: b.sectionOrder,
      }));
    case "compose":
      return (a.sites as Array<Record<string, unknown>> ?? []).map((s) => ({
        lead_id: s.lead_id, name: s.business_name,
        html_length: (s.html as string)?.length ?? 0,
        cost: s.cost_usd,
      }));
    default:
      return a;
  }
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function sendJson(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 500) {
  sendJson(res, { error: message }, status);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
  });
}

const PUBLIC_DIR = join(__dirname, "public");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    // --- API routes ---
    if (path === "/api/leads" && req.method === "GET") {
      const leads = getAllLeads();
      sendJson(res, leads);
      return;
    }

    const leadDetailMatch = path.match(/^\/api\/leads\/([^/]+)$/);
    if (leadDetailMatch && req.method === "GET") {
      const detail = getLeadDetail(leadDetailMatch[1]);
      if (!detail) return sendError(res, "Lead not found", 404);
      sendJson(res, detail);
      return;
    }

    const photoMatch = path.match(/^\/api\/leads\/([^/]+)\/photos\/(.+)$/);
    if (photoMatch) {
      const photoPath = join(ASSETS_ROOT, photoMatch[1], photoMatch[2]);
      if (!existsSync(photoPath)) return sendError(res, "Photo not found", 404);
      const ext = extname(photoPath).toLowerCase();
      const mime = MIME_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "max-age=3600" });
      res.end(readFileSync(photoPath));
      return;
    }

    if (path === "/api/generate" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as GenerateRequest;
      console.log(`[Workbench] Generating site for ${body.leadId}...`);
      const result = await generateSite(body);
      console.log(`[Workbench] Done — ${result.tokens} tokens, $${result.cost.toFixed(4)}`);
      sendJson(res, result);
      return;
    }

    if (path === "/api/save" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as { leadId: string; html: string; meta?: Record<string, unknown> };
      const result = saveOutput(body.leadId, body.html, body.meta ?? {});
      sendJson(res, result);
      return;
    }

    if (path === "/api/saves" && req.method === "GET") {
      sendJson(res, listSaves());
      return;
    }

    // --- Key management ---
    if (path === "/api/keys" && req.method === "GET") {
      sendJson(res, getMaskedKeys());
      return;
    }

    if (path === "/api/keys" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as Record<string, string>;
      saveKeys(body);
      sendJson(res, getMaskedKeys());
      return;
    }

    // --- Pipeline ---
    if (path === "/api/pipeline/start" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as { location: string; verticals: string[]; maxPerVertical: number };
      const run = createPipelineRun(body);
      sendJson(res, { runId: run.id, stages: run.stages.map((s) => ({ name: s.name, status: s.status })) });
      return;
    }

    if (path === "/api/pipeline/step" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as { runId: string };
      const stage = await runNextStage(body.runId);
      const run = activeRuns.get(body.runId)!;
      sendJson(res, {
        stage: { ...stage, artifacts: undefined },
        formatted: formatStageOutput(stage),
        currentStage: run.currentStage,
        allStages: run.stages.map((s) => ({ name: s.name, status: s.status, summary: s.summary, leadCount: s.leadCount, costUsd: s.costUsd, ms: s.finishedAt && s.startedAt ? s.finishedAt - s.startedAt : undefined })),
      });
      return;
    }

    if (path === "/api/pipeline/run-all" && req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as { runId: string };
      const run = activeRuns.get(body.runId);
      if (!run) return sendError(res, "Run not found", 404);

      // Run all remaining stages
      const results: unknown[] = [];
      while (run.currentStage < STAGES.length - 1) {
        const stage = await runNextStage(body.runId);
        results.push({ ...stage, artifacts: undefined });
        if (stage.status === "error") break;
      }
      sendJson(res, {
        stages: run.stages.map((s) => ({ name: s.name, status: s.status, summary: s.summary, leadCount: s.leadCount, costUsd: s.costUsd })),
        complete: run.currentStage >= STAGES.length - 1,
      });
      return;
    }

    const pipelineStatusMatch = path.match(/^\/api\/pipeline\/status\/([^/]+)$/);
    if (pipelineStatusMatch && req.method === "GET") {
      const runId = pipelineStatusMatch[1];
      // SSE stream
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      const clients = sseClients.get(runId) ?? [];
      clients.push(res);
      sseClients.set(runId, clients);
      req.on("close", () => {
        const remaining = (sseClients.get(runId) ?? []).filter((c) => c !== res);
        if (remaining.length > 0) sseClients.set(runId, remaining);
        else sseClients.delete(runId);
      });
      // Send current state
      const run = activeRuns.get(runId);
      if (run) {
        res.write(`data: ${JSON.stringify({ type: "init", stages: run.stages.map((s) => ({ name: s.name, status: s.status, summary: s.summary, leadCount: s.leadCount })) })}\n\n`);
      }
      return;
    }

    const pipelineOutputMatch = path.match(/^\/api\/pipeline\/output\/([^/]+)\/([^/]+)$/);
    if (pipelineOutputMatch && req.method === "GET") {
      const run = activeRuns.get(pipelineOutputMatch[1]);
      if (!run) return sendError(res, "Run not found", 404);
      const stage = run.stages.find((s) => s.name === pipelineOutputMatch[2]);
      if (!stage) return sendError(res, "Stage not found", 404);
      sendJson(res, {
        stage: { ...stage, artifacts: undefined },
        formatted: formatStageOutput(stage),
        raw: stage.artifacts,
      });
      return;
    }

    // --- Static files ---
    let filePath = path === "/" ? "/index.html" : path;
    const fullPath = join(PUBLIC_DIR, filePath);

    if (existsSync(fullPath)) {
      const ext = extname(fullPath).toLowerCase();
      const mime = MIME_TYPES[ext] ?? "text/plain";
      res.writeHead(200, { "Content-Type": mime });
      res.end(readFileSync(fullPath));
      return;
    }

    sendError(res, "Not found", 404);
  } catch (err) {
    console.error("[Workbench] Error:", err);
    sendError(res, err instanceof Error ? err.message : "Internal error", 500);
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

openDb();
loadKeys();
console.log(`
╔════════════════════════════════════════════╗
║   Composer Workbench                       ║
║   http://localhost:${PORT}                    ║
║                                            ║
║   DB: ${DB_PATH.slice(-40).padEnd(37)}║
║   Assets: ${ASSETS_ROOT.slice(-34).padEnd(33)}║
╚════════════════════════════════════════════╝
`);

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

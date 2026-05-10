import { MultiAgentRuntime } from "../../pipeline/agentRuntime.js";
import { AgentCapabilityRegistry, type AgentCapability } from "../../runtime/agentRegistry.js";
import { leadScoutAgent } from "./leadScoutAgent.js";
import { leadProfilerAgent } from "./leadProfilerAgent.js";
import { brandAnalyserAgent } from "./brandAnalyser.js";
import { brandIntelligenceAgent } from "./brandIntelligence.js";
import { leadQualifierAgent } from "./leadQualifierAgent.js";
import { briefGeneratorAgent } from "./briefGenerator.js";
import { siteComposerAgent } from "./siteComposerAgent.js";
import { siteQaAgent } from "./siteQaAgent.js";
import { leadAssignerAgent } from "./leadAssignerAgent.js";

/**
 * Capability metadata for the 9 outreach agents. Each entry is a static
 * description of what the agent can do, what it costs, and whether the
 * critic/reflection loop should grade its outputs.
 */
const OUTREACH_CAPABILITIES: AgentCapability[] = [
  {
    id: "lead-scout-agent",
    name: "Lead Scout",
    description: "Discovers UK local businesses via Google Places + Apify Maps.",
    capabilities: ["lead_discovery", "google_places", "data_scraping"],
    requires_approval_for: [],
    model_provider: "local",
    max_retries: 1,
    timeout_ms: 120_000,
    cost_per_run_estimate_usd: 0.05,
    reflection_enabled: false,
  },
  {
    id: "lead-profiler-agent",
    name: "Lead Profiler",
    description: "Scrapes a lead's website + Instagram, merges into a single profile.",
    capabilities: ["data_scraping", "playwright", "apify"],
    requires_approval_for: [],
    model_provider: "local",
    max_retries: 1,
    timeout_ms: 180_000,
    cost_per_run_estimate_usd: 0.02,
    reflection_enabled: false,
  },
  {
    id: "brand-analyser-agent",
    name: "Brand Analyser",
    description: "Extracts colour palette, fonts, asset inventory from photos.",
    capabilities: ["image_analysis", "colour_extraction"],
    requires_approval_for: [],
    model_provider: "local",
    max_retries: 1,
    timeout_ms: 60_000,
    cost_per_run_estimate_usd: 0.0,
    reflection_enabled: false,
  },
  {
    id: "brand-intelligence-agent",
    name: "Brand Intelligence",
    description: "AI analysis of brand tone, USPs, headline, services.",
    capabilities: ["brand_analysis", "ai_inference"],
    requires_approval_for: [],
    model_provider: "openrouter",
    max_retries: 1,
    timeout_ms: 60_000,
    cost_per_run_estimate_usd: 0.05,
    reflection_enabled: false,
  },
  {
    id: "lead-qualifier-agent",
    name: "Lead Qualifier",
    description: "Vertical-weighted scoring + chain detection + premises check.",
    capabilities: ["lead_scoring", "qualification"],
    requires_approval_for: [],
    model_provider: "rule",
    max_retries: 0,
    timeout_ms: 30_000,
    cost_per_run_estimate_usd: 0.0,
    reflection_enabled: false,
  },
  {
    id: "lead-assigner-agent",
    name: "Lead Assigner",
    description: "Postcode-proximity match between qualified leads and salespeople.",
    capabilities: ["lead_assignment", "geo_matching"],
    requires_approval_for: [],
    model_provider: "rule",
    max_retries: 0,
    timeout_ms: 10_000,
    cost_per_run_estimate_usd: 0.0,
    reflection_enabled: false,
  },
  {
    id: "brief-generator-agent",
    name: "Brief Generator",
    description: "Composes a SiteBrief from profile + brand analysis.",
    capabilities: ["copy_generation", "brief_authoring"],
    requires_approval_for: [],
    model_provider: "openrouter",
    max_retries: 1,
    timeout_ms: 60_000,
    cost_per_run_estimate_usd: 0.10,
    reflection_enabled: false, // raise once a brief-quality critic exists
  },
  {
    id: "site-composer-agent",
    name: "Site Composer",
    description: "Generates a single-file HTML demo from a SiteBrief.",
    capabilities: ["html_generation", "css_generation", "responsive_design"],
    requires_approval_for: [],
    model_provider: "openrouter",
    max_retries: 1,
    timeout_ms: 120_000,
    cost_per_run_estimate_usd: 0.15,
    reflection_enabled: true,
    critic_implementation: "heuristic",
  },
  {
    id: "site-qa-agent",
    name: "Site QA",
    description: "Static analysis of generated demos: HTML validity, contrast, accessibility.",
    capabilities: ["qa_analysis", "html_validation", "accessibility_check"],
    requires_approval_for: [],
    model_provider: "rule",
    max_retries: 0,
    timeout_ms: 30_000,
    cost_per_run_estimate_usd: 0.0,
    reflection_enabled: false,
  },
];

/**
 * Register all outreach pipeline agents with the runtime, optionally also
 * recording their capability metadata in a registry.
 *
 * Pipeline: scout → profile → brand-analyse → brand-intelligence (AI) →
 *           qualify → assign + brief → compose → qa
 */
export function registerOutreachAgents(
  runtime: MultiAgentRuntime,
  registry?: AgentCapabilityRegistry,
): void {
  runtime.register("lead-scout-agent", leadScoutAgent);
  runtime.register("lead-profiler-agent", leadProfilerAgent);
  runtime.register("brand-analyser-agent", brandAnalyserAgent);
  runtime.register("brand-intelligence-agent", brandIntelligenceAgent);
  runtime.register("lead-qualifier-agent", leadQualifierAgent);
  runtime.register("lead-assigner-agent", leadAssignerAgent);
  runtime.register("brief-generator-agent", briefGeneratorAgent);
  runtime.register("site-composer-agent", siteComposerAgent);
  runtime.register("site-qa-agent", siteQaAgent);

  if (registry) {
    for (const cap of OUTREACH_CAPABILITIES) {
      registry.setCapability(cap);
    }
  }
}

export { OUTREACH_CAPABILITIES };

export { leadScoutAgent } from "./leadScoutAgent.js";
export { leadProfilerAgent } from "./leadProfilerAgent.js";
export { brandAnalyserAgent } from "./brandAnalyser.js";
export { leadQualifierAgent } from "./leadQualifierAgent.js";
export { briefGeneratorAgent } from "./briefGenerator.js";
export { siteComposerAgent } from "./siteComposerAgent.js";
export { siteQaAgent } from "./siteQaAgent.js";
export { leadAssignerAgent } from "./leadAssignerAgent.js";

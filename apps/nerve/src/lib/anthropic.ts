// Claude client for /ask. Uses the Messages API with retrieved RAG
// context injected into the system prompt.
//
// Spec: claude-sonnet-4-20250514. (Newer Sonnets exist; the spec is
// explicit so we honour it.)

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import type { SearchHit } from "./embeddings";
import { resolveSource, sectionPathFor, type ResolvedSource } from "./source-resolver";

const MODEL = "claude-sonnet-4-20250514";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  _client = new Anthropic({ apiKey });
  return _client;
}

export function isAskAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 10;
}

// Build the system prompt fresh per turn from the current vault state.
// Includes academic framing, current phase, RQ — so the model reasons in
// the right register every time.
async function buildSystemPrompt(): Promise<string> {
  const [meta, phases] = await Promise.all([
    prisma.dissertationMeta.findUnique({ where: { id: "main" } }),
    prisma.phaseBoundary.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  const now = new Date();
  const currentPhase =
    phases.find(
      (p) => p.startDate <= now && (p.endDate == null || p.endDate >= now),
    )?.name ?? "Phase 1";

  const lines: string[] = [];
  lines.push(
    "You are NERVE, a research and operational assistant for SL-MAS — a self-learning AI-augmented multi-agent sales platform run by a single founder.",
    "",
    "You have two simultaneous purposes:",
    "1. Operational intelligence — answer questions about the business: pitches, costs, demos, prompts, contractors, conversion patterns.",
    "2. Dissertation research support — the founder is writing an undergraduate dissertation evaluating SL-MAS. You can reason across operational data and academic content (literature, methodology, dissertation chapters) at the same time.",
    "",
    `The current operational phase is ${currentPhase}. Phase boundaries:`,
  );
  for (const p of phases) {
    lines.push(
      `- ${p.name}: ${p.startDate.toISOString().slice(0, 10)} → ${p.endDate ? p.endDate.toISOString().slice(0, 10) : "current"}. ${p.operationalDescription}`,
    );
  }
  lines.push("");

  if (meta) {
    lines.push(`Dissertation working title: ${meta.workingTitle}`);
    lines.push(`Research question: ${meta.researchQuestion}`);
    if (meta.degree) lines.push(`Degree: ${meta.degree}${meta.institution ? ` (${meta.institution})` : ""}`);
    if (meta.wordCountTargetMin && meta.wordCountTargetMax) {
      lines.push(`Word count target: ${meta.wordCountTargetMin.toLocaleString()}–${meta.wordCountTargetMax.toLocaleString()}.`);
    }
    if (meta.academicFraming) {
      lines.push("");
      lines.push("Academic framing (use this register when discussing the research):");
      lines.push(meta.academicFraming);
    }
    lines.push("");
  }

  lines.push(
    "Behaviour:",
    "- Always answer using the provided context blocks below. If the context is insufficient, say so plainly and identify what additional data would close the gap.",
    "- When citing a source, reference it by its display title and sourceType — e.g. 'PitchLog: The Bothy Bar' or 'LiteratureEntry: Sundararajan (2017)'.",
    "- For research framing, prefer the academic register from the framing paragraph above.",
    "- For operational questions, be concrete and direct.",
    "- Today is " + now.toISOString().slice(0, 10) + ".",
  );

  return lines.join("\n");
}

export interface RetrievedContext {
  hits: SearchHit[];
  resolved: ResolvedSource[]; // parallel to hits
}

// Format the retrieved chunks as labelled context blocks. Stable IDs make
// it easy for Claude to cite by reference, and the token ceiling prevents
// runaway prompts.
const MAX_CONTEXT_CHARS = 28_000;

export async function buildContextBlock(
  hits: SearchHit[],
): Promise<{ block: string; resolved: ResolvedSource[] }> {
  const resolved = await Promise.all(hits.map((h) => resolveSource(h.sourceType, h.sourceId)));

  const parts: string[] = [];
  parts.push("Below are vault chunks retrieved by semantic similarity to the user's query. Each block is preceded by a [REF n] label you can cite.");
  parts.push("");

  let totalChars = 0;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const r = resolved[i];
    const header = `[REF ${i + 1}] ${sectionPathFor(h.sourceType)} / ${h.sourceType} — ${r.title}${r.date ? ` (${r.date.toISOString().slice(0, 10)})` : ""} · phase: ${h.phaseLabel} · distance: ${h.distance.toFixed(3)}`;
    const block = `${header}\n${h.chunkText}\n`;
    if (totalChars + block.length > MAX_CONTEXT_CHARS) break;
    parts.push(block);
    totalChars += block.length;
  }
  return { block: parts.join("\n"), resolved };
}

export interface AskResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
}

// Calls Claude with the system prompt + prior chat turns + retrieved
// context as the latest user message. Returns the assistant's reply plus
// usage so we can attribute cost later.
export async function askClaude(
  query: string,
  context: string,
  priorTurns: { role: "user" | "assistant"; content: string }[] = [],
): Promise<AskResult> {
  const system = await buildSystemPrompt();
  const userMessage = `Context:\n\n${context}\n\n---\n\nQuestion: ${query}`;
  const messages = [
    ...priorTurns.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: userMessage },
  ];

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages,
  });

  // Concatenate text blocks. (We don't use tool use for this — pure text out.)
  const text = res.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  return {
    text,
    inputTokens: res.usage?.input_tokens ?? null,
    outputTokens: res.usage?.output_tokens ?? null,
    model: MODEL,
  };
}

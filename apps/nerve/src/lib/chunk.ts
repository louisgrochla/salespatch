// Semantic chunking for embeddings. The goal is meaningful units, not
// arbitrary character splits — we'd rather have one paragraph become one
// chunk than slice mid-sentence at character N.
//
// Strategy:
//  1. Split on blank lines (paragraphs).
//  2. Sentences within an oversized paragraph become their own chunks.
//  3. Tiny adjacent fragments are merged so we don't waste embedding calls
//     on 5-token chunks.
//
// Targets ~250 tokens per chunk (~1000 chars) — well-suited to
// text-embedding-3-small's 8191 limit and dense vault content.

const TARGET_CHARS = 1000;
const MAX_CHARS = 1500;
const MIN_CHARS = 200;

export interface Chunk {
  text: string;
  index: number;
}

export function semanticChunk(input: string): Chunk[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (trimmed.length <= TARGET_CHARS) return [{ text: trimmed, index: 0 }];

  const paragraphs = trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const expanded: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= MAX_CHARS) {
      expanded.push(para);
      continue;
    }
    expanded.push(...splitBySentence(para));
  }

  const merged: string[] = [];
  let buf = "";
  for (const part of expanded) {
    if (!buf) {
      buf = part;
      continue;
    }
    if (buf.length + part.length + 2 <= TARGET_CHARS) {
      buf = `${buf}\n\n${part}`;
    } else {
      merged.push(buf);
      buf = part;
    }
  }
  if (buf) {
    if (buf.length < MIN_CHARS && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${buf}`;
    } else {
      merged.push(buf);
    }
  }

  return merged.map((text, index) => ({ text, index }));
}

function splitBySentence(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if (!buf) {
      buf = piece;
      continue;
    }
    if (buf.length + piece.length + 1 <= MAX_CHARS) {
      buf = `${buf} ${piece}`;
    } else {
      out.push(buf);
      buf = piece;
    }
  }
  if (buf) out.push(buf);
  return out;
}

// Builds the chunk corpus for a structured record. The record's labelled
// fields are joined with field headings so each chunk carries enough
// context to be useful in isolation. Empty/null fields are dropped.
export function chunkRecord(
  fields: Record<string, string | number | boolean | Date | null | undefined>,
): Chunk[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    const formatted =
      value instanceof Date ? value.toISOString() : String(value);
    lines.push(`${key}: ${formatted}`);
  }
  return semanticChunk(lines.join("\n"));
}

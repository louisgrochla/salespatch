// Markdown-aware word counter. Strips fenced code blocks, inline code,
// and image/link/heading punctuation before counting — so "## Findings"
// counts as one word, not two, and code blocks don't pad the count.
//
// Approximation, not academic precision. Good enough for "are we 60% of
// the way to 12,000?".

const FENCED = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`]*`/g;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]+)\]\([^)]*\)/g;
const HEADING_HASH = /^#{1,6}\s+/gm;
const LIST_BULLET = /^\s*[-*+]\s+/gm;
const NUMBERED_LIST = /^\s*\d+\.\s+/gm;

export function countWords(markdown: string): number {
  if (!markdown) return 0;
  const cleaned = markdown
    .replace(FENCED, " ")
    .replace(INLINE_CODE, " ")
    .replace(IMAGE, " ")
    .replace(LINK, "$1")
    .replace(HEADING_HASH, "")
    .replace(LIST_BULLET, "")
    .replace(NUMBERED_LIST, "");
  const tokens = cleaned.trim().split(/\s+/);
  return tokens.filter((t) => t.length > 0).length;
}

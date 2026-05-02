// Stable, irreversible-ish anonymisation for contractor IDs shown in the
// supervisor view. Same input always maps to the same display token in
// this process — supervisor sees patterns ("the same SP keeps closing
// hospitality") without ever seeing names.
//
// We use a fast non-crypto hash (FNV-1a 32-bit) plus a base36 cap so the
// tokens are short. Reversibility doesn't matter; only stability does.

const CACHE = new Map<string, string>();

export function anonContractor(raw: string | null | undefined): string {
  if (!raw) return "—";
  const cached = CACHE.get(raw);
  if (cached) return cached;
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const tok = "sp-" + (h >>> 0).toString(36).slice(0, 5);
  CACHE.set(raw, tok);
  return tok;
}

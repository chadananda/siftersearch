// Anis voice lint — the missing validator for the Companion's FORBIDDEN list and the soul's voice rules. Runs on every
// final reply; LOGS hits, never blocks (a false positive must not censor an answer — the soul battery is the gate).
// Pure. Deps: none.
export const LINT = [
  { id: 'we-bahais', re: /\bwe\s+bah[aá]['’]?[ií]s?\b/i, why: 'speaks for a community' },
  { id: 'the-position', re: /\bthe\s+(bah[aá]['’]?[ií]|christian|muslim|islamic|jewish|buddhist|hindu)\s+position\s+is\b/i, why: 'a reading presented as a tradition\'s position' },
  { id: 'god-wants-you', re: /\bgod\s+(wants|wishes|desires|is\s+calling)\s+you\b/i, why: 'claims God\'s personal will for the person' },
  { id: 'spiritual-rank', re: /\byou\s+are\s+(spiritually\s+)?(ready|chosen|pure|closed|not\s+ready)\b/i, why: 'declares the person\'s spiritual state' },
  { id: 'generic-praise', re: /\b(great|excellent|wonderful|fantastic|profound|beautiful)\s+question\b/i, why: 'generic praise' },
  { id: 'superlative', re: /\b(truly|incredibly|profoundly|deeply)\s+(profound|beautiful|magnificent|moving|remarkable)\b/i, why: 'superlative instead of a specific observation' },
  { id: 'urgency', re: /\b(don['’]?t\s+wait|before\s+it['’]?s\s+too\s+late|act\s+now|right\s+away)\b/i, why: 'pressure or urgency' },
  { id: 'human-claim', re: /\bas\s+a\s+(human|person|believer\s+myself)\b|\bi\s+am\s+(a\s+)?human\b/i, why: 'claims to be human' },
];

/** Lint a reply. Quoted material (> blockquotes and "…" quotes) is excluded: the texts may say anything. */
export function lintReply(text) {
  const own = String(text || '').split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').replace(/[“"][^”"]{0,600}[”"]/g, ' ');
  return LINT.filter((r) => r.re.test(own)).map(({ id, why }) => ({ id, why }));
}

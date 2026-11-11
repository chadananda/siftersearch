// Widget link pattern: [text](https://…). A URL may hold balanced parens — Ocean of Lights range links end "#(start)(end)"
// (ool-range.js) — so it never ends at the first ")" (11-10: "Tafsir-i-Suratu'l-Kawthar(%DA%A9…))" shown as text). Pure.
export const RICH_LINK = /\[([^\]]{1,600})\]\((https:\/\/(?:[^\s()"]|\([^\s()"]*\))+)\)/g;
export const richLinks = (s) => s.replace(RICH_LINK, '<a href="$2" target="_blank" rel="noopener">$1</a>');

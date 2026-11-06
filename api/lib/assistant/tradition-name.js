// A tradition NAME as a model or caller writes it → the stored `religion` value (pure, no deps). The index holds "Buddhist",
// "Christian", "Hindu"…; a filter of "Buddhism" matched nothing and emptied the search (fused_search Dhammapada, 11-05).
// The model chose the tradition; this only resolves its spelling. Unknown names pass through unchanged.

export const RELIGIONS = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Zoroastrian', 'Hindu', 'Buddhist', 'Jain', 'Sikh', 'Tao', 'Confucian', 'Other'];
const ALIASES = {
  bahai: "Baha'i", 'bahai faith': "Baha'i", bahaism: "Baha'i",
  islamic: 'Islam', muslim: 'Islam', muslims: 'Islam',
  christianity: 'Christian', christians: 'Christian',
  jewish: 'Judaism', judaic: 'Judaism', jews: 'Judaism',
  zoroastrianism: 'Zoroastrian', hinduism: 'Hindu', buddhism: 'Buddhist', jainism: 'Jain', sikhism: 'Sikh',
  taoism: 'Tao', taoist: 'Tao', daoism: 'Tao', confucianism: 'Confucian',
};
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’‘`ʼ]/g, '').replace(/^the\s+/i, '').trim().toLowerCase().replace(/\s+/g, ' ');
const BY_FOLD = new Map(RELIGIONS.map((r) => [fold(r), r]));

/** "Buddhism" / "buddhist" / "the Bahá’í Faith" → the stored religion value; unknown names unchanged. Pure. */
export function canonicalTradition(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return raw;
  const k = fold(raw);
  return BY_FOLD.get(k) || ALIASES[k] || raw;
}

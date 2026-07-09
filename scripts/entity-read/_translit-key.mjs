// Re-export of the canonical transliteration-invariant recall key (api/lib/translit-key.js) + a CLI self-test.
// Coarse recall bucketing ONLY — never a fold/identity decision (those are evidence-based). See feedback_no_literal_name_binding.
export { skeletonKeys, shareKey } from '../../api/lib/translit-key.js';
import { skeletonKeys, shareKey } from '../../api/lib/translit-key.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  const pairs = [['Kawthar', 'Kosar'], ['Riḍván', 'Rezvan'], ['Ṣádiq', 'Sadeq'], ['Ṣádiq', 'Sadegh'], ['Ḥusayn', 'Hossein'], ['Muḥammad', 'Mohammad'], ['Ṭáhirih', 'Tahereh'], ['Vaḥíd', 'Wahid'], ['Quddús', 'Ghoddus'], ['Mírzá Aḥmad-i-Azghandí', 'Mirza Ahmad Azgandi'], ['Kawthar', 'Ridvan']];
  for (const [a, b] of pairs) console.log(`${shareKey(a, b) ? '✓ MATCH ' : '✗ no    '} ${a}  ~  ${b}`);
  process.exit(0);
}

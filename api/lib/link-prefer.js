// The reader's site for one Anís tool call (Chad 11-14): withPrefer(hosts, fn) runs fn with every linkFor inside it ranking those
// hosts first (source-links.js usePreferSource). Node only; the store itself is prefer-store.js (pure), the edge passes prefer explicitly.
import { usePreferSource } from './source-links.js';
import { currentPrefer, withPrefer } from './prefer-store.js';

export { currentPrefer, withPrefer };
usePreferSource(currentPrefer);

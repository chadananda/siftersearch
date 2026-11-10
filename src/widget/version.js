// This bundle's build hash, read from its own ?v=<hash> URL while the IIFE runs (currentScript is only set then).
// '' = loaded without a version (a copied bundle); such a widget registers plain <sifter-chat> and never self-updates.
export const BUILD = (() => { try { return new URL(document.currentScript.src).searchParams.get('v') || ''; } catch { return ''; } })();
export const tagFor = (v) => (v ? `sifter-chat-${v}` : 'sifter-chat');

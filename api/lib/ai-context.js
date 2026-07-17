// ai-context — ambient attribution for AI calls: which document / stage / language a call belongs to, and
// which subsystem made it. Callers deep in a pipeline don't thread this through every function signature, so
// it rides an AsyncLocalStorage scope opened once by the driver (e.g. run-grounding per stage) and read by the
// ONE logging point (ai.js chatCompletion). That is how a model call's cost finds its book.
// Zero deps ON PURPOSE: both the low-level client (ai.js) and the rag adapter import it, so it must sit under both.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

/** Run `fn` with attribution attached to every AI call it makes (nested scopes merge, inner wins). */
export const withAIContext = (ctx, fn) => store.run({ ...store.getStore(), ...ctx }, fn);

/** Current attribution, or {} outside any scope. */
export const currentAIContext = () => store.getStore() || {};

/**
 * Update the LIVE scope in place — for a long run whose attribution changes as it advances (the executor
 * setting the current stage). withAIContext SPREADS its argument into a fresh store, so mutating the object
 * you passed in does NOT reach the store; this writes to the store itself. No-op outside a scope.
 */
export const setAIContext = (patch) => { const s = store.getStore(); if (s) Object.assign(s, patch); };

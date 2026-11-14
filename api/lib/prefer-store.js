// The reader's site for the current Anís tool call: pure AsyncLocalStorage, no server imports, so agent-core stays Worker-bundleable.
// link-prefer.js wires it into source-links.js on tower.
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
export const currentPrefer = () => als.getStore() ?? null;
export const withPrefer = (prefer, fn) => (Array.isArray(prefer) && prefer.length ? als.run(prefer, fn) : fn());

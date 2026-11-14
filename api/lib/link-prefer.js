// The reader's site for one Anís tool call (Chad 11-14): withPrefer(hosts, fn) runs fn with every linkFor inside it ranking those
// hosts first (source-links.js usePreferSource). Node only (AsyncLocalStorage); the edge passes prefer explicitly.
import { AsyncLocalStorage } from 'node:async_hooks';
import { usePreferSource } from './source-links.js';

const als = new AsyncLocalStorage();
export const currentPrefer = () => als.getStore() ?? null;
export const withPrefer = (prefer, fn) => (Array.isArray(prefer) && prefer.length ? als.run(prefer, fn) : fn());
usePreferSource(currentPrefer);

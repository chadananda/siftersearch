// Every route — the API before the split (api/server.js, tests). Order: search, then Anís, then ops.
import { SEARCH_ROUTES } from './search.js';
import { ANIS_ROUTES } from './anis.js';
import { OPS_ROUTES } from './ops.js';

export const ALL_ROUTES = [...SEARCH_ROUTES, ...ANIS_ROUTES, ...OPS_ROUTES];

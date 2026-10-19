// The SEARCH API's routes (siftersearch-api): search, library, documents, the public and admin APIs — everything that is
// not Anís or ops.
import authRoutes from '../auth.js';
import searchRoutes from '../search.js';
import sessionRoutes from '../session.js';
import userRoutes from '../user.js';
import adminRoutes from '../admin.js';
import docsRepoRoutes from '../docs.js';
import entityReviewRoutes from '../entity-review.js';
import groundingRoutes from '../grounding.js';
import tabletAdminRoutes, { tabletPublicRoutes } from '../tablets.js';
import assistantAdminRoutes from '../assistant-admin.js';
import workplanAdminRoutes from '../workplan-admin.js';
import ingestRoutes from '../ingest.js';
import bookNotesRoutes from '../book-notes.js';
import companionRoutes from '../companion.js';
import documentsRoutes from '../documents.js';
import coverRoutes from '../covers.js';
import servicesRoutes from '../services.js';
import anonymousRoutes from '../anonymous.js';
import librarianRoutes from '../librarian.js';
import deweyRoutes from '../dewey.js';
import publicApiRoutes from '../public-api.js';
import contentRoutes from '../content.js';
import deployRoutes from '../deploy.js';
import forumRoutes from '../forum.js';
import donationRoutes from '../donations.js';
import apiKeyRoutes from '../api-keys.js';
import libraryRoutes from '../library.js';
import observatoryRoutes from '../observatory.js';
import graphRoutes from '../graph.js';
import peopleRoutes from '../people.js';
import deepResearchRoutes from '../deep-research.js';

export const SEARCH_ROUTES = [
  [authRoutes, { prefix: '/api/auth' }],
  [searchRoutes, { prefix: '/api/search' }],
  [sessionRoutes, { prefix: '/api/session' }],
  [userRoutes, { prefix: '/api/user' }],
  [adminRoutes, { prefix: '/api/admin' }],
  [docsRepoRoutes, { prefix: '/api/admin' }],   // the ONE document surface (docs-repo)
  [entityReviewRoutes, { prefix: '/api/admin' }],
  [groundingRoutes, { prefix: '/api/admin' }],
  [tabletAdminRoutes, { prefix: '/api/admin' }],   // tablet metadata (Phelps + oceanoflights)
  [assistantAdminRoutes, { prefix: '/api/admin' }],   // the Anís hub (/admin/anis)
  [workplanAdminRoutes, { prefix: '/api/admin' }],   // the WorkPlan page (D1 via the edge)
  [ingestRoutes, { prefix: '/api/admin' }],
  [bookNotesRoutes, { prefix: '/api/admin' }],
  [companionRoutes, { prefix: '/api/admin' }],
  [documentsRoutes, { prefix: '/api/documents' }],
  [coverRoutes, { prefix: '/api/covers' }],   // book covers (api/lib/covers.js), edge-cached by the Worker
  [tabletPublicRoutes, { prefix: '/api/documents' }],   // GET /:id/about
  [servicesRoutes, { prefix: '/api/services' }],
  [anonymousRoutes, { prefix: '/api/anonymous' }],
  [librarianRoutes, { prefix: '/api/librarian' }],
  [deweyRoutes, { prefix: '/api/dewey' }],
  [publicApiRoutes, { prefix: '/api/v1' }],
  [contentRoutes, { prefix: '/api/v1' }],
  [deployRoutes, { prefix: '/api/deploy' }],
  [forumRoutes, { prefix: '/api/forum' }],
  [donationRoutes, { prefix: '/api/donations' }],
  [apiKeyRoutes, { prefix: '/api/api-keys' }],
  [libraryRoutes, { prefix: '/api/library' }],
  [observatoryRoutes, { prefix: '/api/observatory' }],   // home-page Observatory: telemetry + activity (public)
  [graphRoutes, { prefix: '/api/graph' }],
  [peopleRoutes, { prefix: '/api/v1' }],
  [deepResearchRoutes, { prefix: '/api/v1' }],
];

// The OPS service's routes (siftersearch-ops): ops reports and the service health/coordination view — tiny, rarely
// changed, so health stays visible through every other service's update.
import opsReportRoutes from '../ops-reports.js';
import anisToolsAdminRoutes from '../anis-tools-admin.js';
import impliedAdminRoutes from '../implied-admin.js';

export const OPS_ROUTES = [
  [opsReportRoutes, { prefix: '/api/admin' }],   // ops reports (run by siftersearch-reports)
  [anisToolsAdminRoutes, { prefix: '/api/admin' }],   // the Anís tool catalog: list, register HTTP tools, credentials, test (anis-tools-repo)
  [impliedAdminRoutes, { prefix: '/api/admin' }],   // Implication browser: premise items, HyPE editor, graph, spend (implied-repo + the implied-overview report)
];

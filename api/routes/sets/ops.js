// The OPS service's routes (siftersearch-ops): ops reports and the service health/coordination view — tiny, rarely
// changed, so health stays visible through every other service's update.
import opsReportRoutes from '../ops-reports.js';

export const OPS_ROUTES = [
  [opsReportRoutes, { prefix: '/api/admin' }],   // ops reports (run by siftersearch-reports)
];

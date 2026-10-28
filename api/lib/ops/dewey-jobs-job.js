// dewey-jobs ops report (read-only): the Dewey job registry's health — jobs by kind and state, stuck jobs, oldest open job, top failure
// reasons, cost by day, today's usage per person, the spend ceiling and the pause flag. system-checks reads the latest run.
import * as repo from '../repos/dewey-jobs-repo.js';
import { globalCeilingUsd } from '../dewey/jobs/policy.js';

export async function deweyJobsReport() {
  const [s, usage, total, paused] = await Promise.all([repo.summary(), repo.usageByWho(), repo.usageTotal(), repo.getFlag('paused')]);
  return { at: new Date().toISOString(), ...s, usage_today: usage, spend_today_usd: total, ceiling_usd: globalCeilingUsd(), paused: paused && paused !== '0' ? paused : null,
    valve_env: process.env.DEWEY_V2 === '0' ? 'off' : 'on' };
}

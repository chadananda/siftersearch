// Which pushed files a running pm2 process loads (scripts/update-server.js). 10-19: a push that changed only a battery
// script reloaded the API and the writer and killed every in-flight 40-70 s Anís research answer with a 502. Tests, docs,
// planning, the frontend (deployed to Cloudflare by npm run deploy), markdown and hand-run scripts are pulled without a
// reload; anything else — or an empty list — counts as runtime. Pure.
const NON_RUNTIME = /^(tests\/|docs\/|planning\/|tmp\/|src\/|worker\/|public\/|\.claude\/|scripts\/(anis|wip)\/|[^/]+\.md$|.+\/(CLAUDE|README)\.md$)/;
// Edge Worker modules that tower ALSO imports are runtime (10-31: worker/queue/core.js — the queue core the LAN queue and the pod plan run —
// was pulled "touching no runtime code", so the media lane kept the old plan). tests/api/updater-runtime-files.test.js keeps this list complete.
export const SHARED_WITH_TOWER = ['worker/queue/core.js', 'worker/queue/last-words.js', 'worker/dewey-upload.js'];
export const touchesRuntime = (files) => !files.length || files.some((f) => SHARED_WITH_TOWER.includes(f) || !NON_RUNTIME.test(f));

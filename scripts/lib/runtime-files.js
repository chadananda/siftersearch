// Which pushed files a running pm2 process loads (scripts/update-server.js). 10-19: a push that changed only a battery
// script reloaded the API and the writer and killed every in-flight 40-70 s Anís research answer with a 502. Tests, docs,
// planning, the frontend (deployed to Cloudflare by npm run deploy), markdown and hand-run scripts are pulled without a
// reload; anything else — or an empty list — counts as runtime. Pure.
const NON_RUNTIME = /^(tests\/|docs\/|planning\/|tmp\/|src\/|worker\/|public\/|\.claude\/|scripts\/(anis|wip)\/|[^/]+\.md$|.+\/(CLAUDE|README)\.md$)/;
export const touchesRuntime = (files) => !files.length || files.some((f) => !NON_RUNTIME.test(f));

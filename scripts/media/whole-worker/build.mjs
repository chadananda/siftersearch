// Build a DB-free, credential-free runtime from the same processing code used
// by the server. Unused server-only dynamic imports stay unresolved and cannot
// enter the worker image; the worker injects every processing dependency.
import {build} from 'esbuild';
// Every relative dynamic import left OUT of the bundle must be named here as server-only. A new one fails the build: if the worker path reaches it,
// the image dies at the end of a 40-min job with ERR_MODULE_NOT_FOUND (10-30: ./quiet-repair.js) — bundle it or make it static instead.
// ./quiet-repair.js is server-only since 10-31: the item.js `quiet` stage (ssh to a home host) never runs on the worker (phases.mjs `only` lists omit it; post.py does quiet).
const SERVER_ONLY=new Set(['../drain.js','../model-roles.js','../ops/media-jobs.js','../repos/media-ledger-repo.js','../repos/media-repo.js','../repos/ops-report-repo.js',
 './assess.js','./biography-candidates.js','./edge-purge.js','./item.js','./headings.js','./quiet-repair.js','./identity.js','./ingest.js','./links.js','./llm.js','./preview.js','./quotes.js','./tools.js','./youtube.js']);
const unlisted=new Set();
// argv[2] = the whole job's bundle; the typed jobs' bundles go beside it (job-types.json `cmd`: /opt/sifter/api/lib/media/{cpu-prep,gpu,cpu-finish}.mjs)
const whole=process.argv[2]||'tmp/whole-worker/api/lib/media/whole-recording.mjs';
const ENTRIES={'whole-recording':'recording','cpu-prep':'cpu-prep','gpu':'gpu','cpu-finish':'cpu-finish'};
for(const [out,src] of Object.entries(ENTRIES)){
const outfile=whole.replace(/whole-recording\.mjs$/,out+'.mjs');
// a CommonJS dependency (10-31: yaml via item.js → authority.js → config.js) calls require('process') etc.: an ESM bundle has no require, so every
// job died at load ("Dynamic require of \"process\" is not supported") — give the bundle a real one
const result=await build({entryPoints:[`scripts/media/whole-worker/${src}.mjs`],outfile,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,
 banner:{js:"import {createRequire as __sifterRequire} from 'node:module';const require=__sifterRequire(import.meta.url);"},
 plugins:[{name:'worker-boundary',setup(b){b.onResolve({filter:/.*/},args=>{
  if(args.kind==='dynamic-import' && !/^(node:)?(fs(\/promises)?|os|path)$/.test(args.path) && !/^\.\/(trim|spkmerge)\.js$/.test(args.path)){if(/^\.\.?\//.test(args.path)&&!SERVER_ONLY.has(args.path))unlisted.add(`${args.path} (from ${args.importer.replace(process.cwd()+'/','')})`);return {path:args.path,external:true};}
 });}}]});
if(unlisted.size)throw Error(`Dynamic import left out of the worker bundle but not listed server-only: ${[...unlisted].join(', ')}`);
const inputs=Object.keys(result.metafile.inputs);
if(inputs.some(p=>/\/repos\/|\/db\.js$|\/llm\.js$|\/ops\//.test(p)))throw Error('Server dependency entered worker bundle');
console.log(JSON.stringify({outfile,modules:inputs.length,bytes:Object.values(result.metafile.outputs)[0].bytes}));
}

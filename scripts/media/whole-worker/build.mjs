// Build a DB-free, credential-free runtime from the same processing code used
// by the server. Unused server-only dynamic imports stay unresolved and cannot
// enter the worker image; the worker injects every processing dependency.
import {build} from 'esbuild';
const outfile=process.argv[2]||'tmp/whole-worker/api/lib/media/whole-recording.mjs';
const result=await build({entryPoints:['scripts/media/whole-worker/recording.mjs'],outfile,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,
 plugins:[{name:'worker-boundary',setup(b){b.onResolve({filter:/.*/},args=>{
  if(args.kind==='dynamic-import' && !/^(node:)?(fs(\/promises)?|os|path)$/.test(args.path) && !/^\.\/(trim|spkmerge)\.js$/.test(args.path))return {path:args.path,external:true};
 });}}]});
const inputs=Object.keys(result.metafile.inputs);
if(inputs.some(p=>/\/repos\/|\/db\.js$|\/llm\.js$|\/ops\//.test(p)))throw Error('Server dependency entered worker bundle');
console.log(JSON.stringify({outfile,modules:inputs.length,bytes:Object.values(result.metafile.outputs)[0].bytes}));

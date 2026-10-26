import {mkdir,copyFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const context=resolve(process.argv[2]||'tmp/whole-recording-image');
const root=join(context,'rootfs');
const bundle=join(root,'opt/sifter/api/lib/media/whole-recording.mjs');
execFileSync(process.execPath,['scripts/media/whole-worker/build.mjs',bundle],{stdio:'inherit'});
for(const dest of ['opt/sifter/media','opt/sifter/scripts/media']){
 await mkdir(join(root,dest,'worker'),{recursive:true});
 for(const f of ['runpod_worker.py','remaster_guard.py','media_tool.py'])await copyFile(join('scripts/media',f),join(root,dest,f));
 for(const f of await readdir('scripts/media/worker'))if(f.endsWith('.py'))await copyFile(join('scripts/media/worker',f),join(root,dest,'worker',f));
}
await copyFile('scripts/media/whole-worker/farm_worker.py',join(root,'opt/sifter/media/worker/farm_worker.py'));
await mkdir(join(root,'opt/sifter/data'),{recursive:true});
for(const f of ['media-exclusions.json','media-speaker-people.json'])await copyFile(join('data',f),join(root,'opt/sifter/data',f));
await copyFile('docker/media-worker/Dockerfile.whole',join(context,'Dockerfile'));
await copyFile('scripts/media/whole-worker/speaker-models.sha256',join(context,'speaker-models.sha256'));
console.log(context);

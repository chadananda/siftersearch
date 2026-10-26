import {it,expect} from 'vitest';import {mkdtemp,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {homeRecording} from '../../api/lib/media/home-recording.js';import {run} from '../../api/lib/media/tools.js';
it('passes rsync protected paths as raw arguments rather than literal shell quotes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'home-transport-'));await writeFile(join(dir,'transcript.work.json'),'{}');let transfer;
 const T={run:async(cmd,args)=>{if(cmd==='rsync'){transfer=args;throw Error('end of transport fixture');}return{stdout:args[1]?.includes('inspect')?'null':''};}};
 await expect(homeRecording('aorus',{id:1,dir},{slug:'test',original:'original/a.mp3'},{T,image:'test-image'})).rejects.toThrow('end of transport fixture');
 expect(transfer).toContain('--protect-args');expect(transfer.at(-1)).toMatch(/^aorus:\/data\/sifter-whole-home\/recording-.*\/in.mp3$/);expect(transfer.at(-1)).not.toContain("'");
});
it('streams transfer input from disk through the process runner',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worker-input-')),file=join(dir,'source');await writeFile(file,'streamed file input');
 expect((await run('cat',[],{inputFile:file,timeoutMs:5000})).stdout).toBe('streamed file input');
 await expect(run('cat',[],{inputFile:file+'-missing',timeoutMs:5000})).rejects.toThrow('ENOENT');
});
it('counts only production recording containers when admitting a whole job',async()=>{
 const {homeWholeRecording}=await import('../../api/lib/media/home-recording.js');
 const dir=await mkdtemp(join(tmpdir(),'whole-capacity-'));await writeFile(join(dir,'in.mp3'),'original');let launched=false,command='';
 const T={run:async(cmd,args)=>{const text=args.at(-1);if(cmd==='ssh'&&text.includes('docker inspect'))return{stdout:launched?'{"Running":true}':'null'};if(cmd==='ssh'&&text.includes('flock -x')){command=text;launched=true;}return{stdout:''};}};
 await expect(homeWholeRecording({id:1,dir},{slug:'test',original:'in.mp3',stages:{archive:{at:'now'}}},{T,image:'image',legacyLock:false,stop:()=>launched})).rejects.toMatchObject({code:'DRAIN'});
 expect(command).toContain('name=^/whole-[0-9]+-');
});

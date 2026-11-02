import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it, vi } from 'vitest';
import { requireOperatorChallenge } from '../../../scripts/operator-corpus-proof.js';
const require=createRequire(import.meta.url);
const rehearsal=require('../../../.github/scripts/operator-handoff-rehearsal.cjs');
const authority=require('../../../.github/scripts/operator-authorization.cjs');
const now=Date.parse('2026-11-01T15:00:00Z');
const names=['Select Validation','Test & Build','Fresh Checkout & Data','Worker Runtime & D1','Node HTTP E2E','Applicable MCP Conformance','Validation Complete'];
function setup() {
  const directory=mkdtempSync(join(tmpdir(),'handoff-rehearsal-'));
  const r={schemaVersion:rehearsal.REQUEST,mode:'publish',pullRequestNumber:172,ordinaryRunId:'900',sourceCommit:'a'.repeat(40),baseCommit:'b'.repeat(40),sourceTree:'c'.repeat(40),nonce:'d'.repeat(64)};
  const branch='ci/another-rehearsal';
  const owner={id:40179660};
  const producer={id:500,actor:{...owner},triggering_actor:{...owner},run_attempt:1,event:'workflow_dispatch',path:'.github/workflows/pr.yml',head_sha:r.sourceCommit,head_branch:branch,created_at:new Date(now-1000).toISOString(),status:'completed',conclusion:'success'};
  const consumer={...producer,id:501,actor:{...owner},triggering_actor:{...owner}};
  const ordinary={id:900,event:'pull_request',run_attempt:1,path:'.github/workflows/pr.yml',head_sha:r.sourceCommit,head_branch:branch,status:'completed',conclusion:'success',pull_requests:[{number:172,head:{sha:r.sourceCommit},base:{sha:r.baseCommit}}]};
  const pr={state:'open',draft:true,labels:[] as {name:string}[],base:{ref:'main',sha:r.baseCommit},head:{sha:r.sourceCommit,ref:branch,repo:{full_name:'TJ-Frederick/TheologAI'}}};
  const main={object:{sha:r.baseCommit}},commit={tree:{sha:r.sourceTree}};
  const jobs=names.map((name,i)=>({name,id:30+i,status:'completed',conclusion:'success'}));
  const producerJobs=[{name:'Retain operator operation authorization (no cloud credentials)',status:'completed',conclusion:'success'},...names.map(name=>({name:'Operator metadata / '+name,status:'completed',conclusion:'skipped'}))];
  const classifier={text:'timestamp {"mode":"full","data":true,"serving":true,"reason":"unknown-path"}\n'};
  const native={artifacts:[] as any[],bytes:Buffer.alloc(0)};
  const github={rest:{pulls:{get:vi.fn(async()=>({data:pr}))},git:{getRef:vi.fn(async()=>({data:main})),getCommit:vi.fn(async()=>({data:commit}))},actions:{
    getWorkflowRun:vi.fn(async({run_id}:any)=>({data:Number(run_id)===900?ordinary:Number(run_id)===500?producer:consumer})),
    listJobsForWorkflowRun:vi.fn(async({run_id}:any)=>({data:{total_count:Number(run_id)===900?jobs.length:producerJobs.length,jobs:Number(run_id)===900?jobs:producerJobs}})),
    downloadJobLogsForWorkflowRun:vi.fn(async()=>({data:classifier.text})),
    listWorkflowRunArtifacts:vi.fn(async()=>({data:{total_count:native.artifacts.length,artifacts:native.artifacts}})),
    downloadArtifact:vi.fn(async()=>({data:native.bytes}))}}};
  const context={repo:{owner:'TJ-Frederick',repo:'TheologAI'},eventName:'workflow_dispatch',runId:500,sha:r.sourceCommit};
  const environment={GITHUB_ACTOR_ID:'40179660',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/'+branch,RUNNER_TEMP:directory,OPERATOR_AUTHORIZATION_JSON:JSON.stringify(r)};
  const output=vi.fn(),core={setOutput:output};
  const input={github,context,environment,core,now:()=>now};
  const publish=()=>rehearsal.prepare(input);
  async function handoff() {
    const p=await publish();execFileSync('zip',['-q','rehearsal.zip',rehearsal.FILE],{cwd:directory});native.bytes=readFileSync(join(directory,'rehearsal.zip'));
    const digest='sha256:'+authority.hash(native.bytes);
    native.artifacts.push({id:700,name:'operator-handoff-rehearsal-500-attempt-1',digest,expired:false,expires_at:new Date(now+86400000).toISOString(),workflow_run:{id:500,head_sha:r.sourceCommit}});
    const consume={...r,mode:'consume',producerRunId:'500',artifactId:'700',digest};
    return {p,consume,input:{...input,context:{...context,runId:501},environment:{...environment,OPERATOR_AUTHORIZATION_JSON:JSON.stringify(consume)}}};
  }
  return {directory,r,producer,consumer,ordinary,pr,main,commit,jobs,producerJobs,classifier,native,github,input,output,publish,handoff,close:()=>rmSync(directory,{recursive:true,force:true})};
}

describe('zero-authority handoff rehearsal',()=>{
  it('publishes only disjoint zero-budget metadata and every operational consumer rejects it',async()=>{
    const f=setup();try{
      const p=await f.publish();expect(p.allowance).toEqual({reads:0,writes:0,diagnosticCommands:0});expect(p.grantsOperation).toBe(false);
      expect(Date.parse(p.expiresAt)-Date.parse(p.createdAt)).toBe(300000);
      expect(readdirSync(f.directory)).toEqual([rehearsal.FILE]);
      expect(f.output).toHaveBeenCalledWith('rehearsal_artifact_name','operator-handoff-rehearsal-500-attempt-1');
      expect(f.output.mock.calls.some(([name]:string[])=>/authorization|ledger|envelope|challenge/.test(name))).toBe(false);
      expect(()=>authority.requireAuthorization(p,{},now)).toThrow();expect(()=>authority.requirePackage(p,{},now)).toThrow();expect(()=>requireOperatorChallenge(p,now)).toThrow();
      expect(rehearsal.kind(f.input.environment.OPERATOR_AUTHORIZATION_JSON)).toBe('rehearsal');
    }finally{f.close();}
  });
  it('decodes native binary job logs before enforcing the full ordinary selection',async()=>{
    const f=setup();try{f.github.rest.actions.downloadJobLogsForWorkflowRun.mockImplementation(async()=>({data:Buffer.from(f.classifier.text) as any}));await expect(f.publish()).resolves.toHaveProperty('grantsOperation',false);}finally{f.close();}
  });
  for(const schemaVersion of ['theologai-operator-authorization.v1','theologai-operator-corpus-envelope.v1','theologai-operator-corpus-challenge.v2'])it('refuses real '+schemaVersion+' on rehearsal path',()=>{
    expect(()=>rehearsal.request(JSON.stringify({schemaVersion}))).toThrow('rehearsal request schema');expect(rehearsal.kind(JSON.stringify({schemaVersion}))).toBe('operation');
  });
  for(const fault of ['actor','triggering-actor','attempt','ref','caller-source','not-draft','label','moved-head','moved-base','moved-main','tree','ordinary-source','ordinary-attempt','ordinary-result','missing-check','failed-check','duplicate-check','serving-only'])it('stops publication before artifacts for '+fault,async()=>{
    const f=setup();try{
      if(fault==='actor')f.producer.actor.id=1;if(fault==='triggering-actor')f.producer.triggering_actor.id=1;if(fault==='attempt')f.input.environment.GITHUB_RUN_ATTEMPT='2';if(fault==='ref')f.input.environment.GITHUB_REF='refs/heads/main';if(fault==='caller-source')f.input.context.sha='f'.repeat(40);
      if(fault==='not-draft')f.pr.draft=false;if(fault==='label')f.pr.labels.push({name:'deploy-preview'});if(fault==='moved-head')f.pr.head.sha='f'.repeat(40);if(fault==='moved-base')f.pr.base.sha='f'.repeat(40);if(fault==='moved-main')f.main.object.sha='f'.repeat(40);if(fault==='tree')f.commit.tree.sha='f'.repeat(40);
      if(fault==='ordinary-source')f.ordinary.head_sha='f'.repeat(40);if(fault==='ordinary-attempt')f.ordinary.run_attempt=2;if(fault==='ordinary-result')f.ordinary.conclusion='failure';if(fault==='missing-check')f.jobs.pop();if(fault==='failed-check')f.jobs[1]!.conclusion='failure';if(fault==='duplicate-check')f.jobs.push({...f.jobs[1]!});if(fault==='serving-only')f.classifier.text='timestamp {"mode":"serving","data":false,"serving":true}\n';
      await expect(f.publish()).rejects.toThrow();expect(readdirSync(f.directory)).toHaveLength(0);expect(f.output).not.toHaveBeenCalled();
    }finally{f.close();}
  });
  it('authenticates native ZIP and compares actual downloaded bytes, with no real artifact outputs',async()=>{
    const f=setup();try{
      const h=await f.handoff();await rehearsal.prepare(h.input);
      expect(()=>authority.readArchive(f.native.bytes,h.consume.digest)).toThrow('archive roster');
      Object.assign(f.github.rest.actions,{listArtifactsForRepo:async()=>({data:{artifacts:f.native.artifacts}})});
      await expect(authority.findAuthorization({github:f.github,expected:{targetRunId:'999'},now})).rejects.toThrow('archive roster');
      mkdirSync(join(f.directory,'operator-handoff-rehearsal-download'));writeFileSync(join(f.directory,'operator-handoff-rehearsal-download',rehearsal.FILE),readFileSync(join(f.directory,rehearsal.FILE)));
      const digest=authority.hash(readFileSync(join(f.directory,rehearsal.FILE)));
      await expect(rehearsal.compareDownload({...h.input,environment:{...h.input.environment,EXPECTED_REHEARSAL_PAYLOAD_SHA256:digest}})).resolves.toEqual(h.p);
      writeFileSync(join(f.directory,'operator-handoff-rehearsal-download',rehearsal.FILE),JSON.stringify(h.p));
      await expect(rehearsal.compareDownload({...h.input,environment:{...h.input.environment,EXPECTED_REHEARSAL_PAYLOAD_SHA256:digest}})).rejects.toThrow('pinned download bytes');
    }finally{f.close();}
  });
  for(const fault of ['producer-owner','producer-attempt','producer-failed','executed-extra-job','duplicate-uploader','extra-artifact','wrong-artifact-name','wrong-artifact-id','wrong-digest','native-expired','archive-corrupt','nonce','draft-revoked','source-moved'])it('rejects consume '+fault,async()=>{
    const f=setup();try{const h=await f.handoff();
      if(fault==='producer-owner')f.producer.triggering_actor.id=1;if(fault==='producer-attempt')f.producer.run_attempt=2;if(fault==='producer-failed')f.producer.conclusion='failure';if(fault==='executed-extra-job')f.producerJobs[1]!.conclusion='success';if(fault==='duplicate-uploader')f.producerJobs.push({...f.producerJobs[0]!});if(fault==='extra-artifact')f.native.artifacts.push({...f.native.artifacts[0]});if(fault==='wrong-artifact-name')f.native.artifacts[0].name='operator-authorization-500-attempt-1';if(fault==='wrong-artifact-id')h.consume.artifactId='701';if(fault==='wrong-digest')h.consume.digest='sha256:'+'f'.repeat(64);if(fault==='native-expired')f.native.artifacts[0].expired=true;if(fault==='archive-corrupt')f.native.bytes=Buffer.from('altered');if(fault==='nonce')h.consume.nonce='f'.repeat(64);if(fault==='draft-revoked')f.pr.draft=false;if(fault==='source-moved')f.pr.head.sha='f'.repeat(40);
      h.input.environment.OPERATOR_AUTHORIZATION_JSON=JSON.stringify(h.consume);await expect(rehearsal.prepare(h.input)).rejects.toThrow();
    }finally{f.close();}
  });
  it('accepts precisely authenticated expiry, after all native and source checks',async()=>{
    const f=setup();try{const h=await f.handoff();h.consume.mode='expect-expired';h.input.environment.OPERATOR_AUTHORIZATION_JSON=JSON.stringify(h.consume);
      await expect(rehearsal.prepare(h.input)).rejects.toThrow('expected expiry not observed');
      const expired={...h.input,now:()=>now+rehearsal.TTL+1};await expect(rehearsal.prepare(expired)).resolves.toEqual(h.p);
      expect(f.output).toHaveBeenCalledWith('rehearsal_result','authenticated-expiry-rejected');
      f.native.bytes=Buffer.from('altered');await expect(rehearsal.prepare(expired)).rejects.toThrow('native archive digest');
    }finally{f.close();}
  });
  it('does not count network or permission failures as successful expiry rejection',async()=>{
    const f=setup();try{const h=await f.handoff();h.consume.mode='expect-expired';h.input.environment.OPERATOR_AUTHORIZATION_JSON=JSON.stringify(h.consume);
      f.github.rest.actions.downloadArtifact.mockRejectedValueOnce(Error('HTTP 403'));
      await expect(rehearsal.prepare({...h.input,now:()=>now+rehearsal.TTL+1})).rejects.toThrow('HTTP 403');
    }finally{f.close();}
  });
  for(const key of ['authorizationId','ledgerId','role','challenge','proof','approval','allowance'])it('rejects extra authority field '+key,()=>{
    const f=setup();try{expect(()=>rehearsal.request(JSON.stringify({...f.r,[key]:'unapproved'}))).toThrow('request shape');}finally{f.close();}
  });
});

describe('rehearsal workflow boundary',()=>{
  it('reuses the exact existing read permissions, has no cloud/environment path, and isolates artifacts',()=>{
    const workflow=parse(readFileSync('.github/workflows/pr.yml','utf8')),job=workflow.jobs['operator-authorization-upload'];
    expect(job.permissions).toEqual({contents:'read',actions:'read','pull-requests':'read'});expect(job['timeout-minutes']).toBe(3);expect(job.environment).toBeUndefined();
    expect(JSON.stringify(job)).not.toMatch(/secrets\.|CLOUDFLARE|wrangler|release-toolchain|npm (?:ci|install)/);
    const operational=job.steps.filter((s:any)=>s.with?.path==='${{ runner.temp }}/operator-authorization.json');expect(operational).toHaveLength(2);
    for(const step of operational)expect(step.if).toBe("steps.request.outputs.kind == 'operation'");
    expect(job.steps.find((s:any)=>s.id==='authorization').if).toBe("steps.request.outputs.kind == 'operation'");
    const publish=job.steps.find((s:any)=>s.name==='Retain rehearsal metadata only');expect(publish.with.path).toBe('${{ runner.temp }}/operator-handoff-rehearsal.json');expect(publish.with['retention-days']).toBe(1);
    const download=job.steps.find((s:any)=>s.name==='Download authenticated rehearsal artifact with the pinned action');expect(download.with['digest-mismatch']).toBe('error');expect(download.with['artifact-ids']).toContain('rehearsal_artifact_id');
    expect(job.steps.find((s:any)=>s.name==='Compare pinned download with authenticated native bytes').with.script).toContain('compareDownload');
    const request=JSON.stringify({schemaVersion:rehearsal.REQUEST});
    for(const id of ['test-and-build','fresh-checkout-data','worker-runtime','node-http-e2e','mcp-conformance']) {
      const job=workflow.jobs[id];const name=new Function('github','inputs','return ('+job.name.slice(3,-2)+')')({event_name:'workflow_dispatch'},{operator_authorization_json:request,operator_proof_json:''});expect(name).toMatch(/^Operator metadata \/ /);
      const enabled=new Function('github','inputs','cancelled','return ('+job.if.slice(3,-2)+')')({event_name:'workflow_dispatch'},{operator_authorization_json:request,operator_proof_json:''},()=>false);expect(enabled).toBe(false);
    }
  });
});

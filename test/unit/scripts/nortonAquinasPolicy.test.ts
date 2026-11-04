import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {POLICY,ACCOUNT,TARGETS,requireProofApproval,assertReviewedActivationEntries,verifyFreshCorpusReceipt} from '../../../scripts/norton-aquinas-release-policy.mjs';
import {classifyEntries as classifyApplicationEntries} from '../../../scripts/application-release-policy.mjs';
import {admitCorpusBudget} from '../../../scripts/corpus-proof-transport.js';
import {assertDefinitiveJournal} from '../../../scripts/norton-aquinas-preparation.js';
const authority=createRequire(import.meta.url)('../../../.github/scripts/operator-authorization.cjs');
const now=Date.parse('2026-11-03T12:00:00Z');
const digest='a'.repeat(64),commit='b'.repeat(40),tree='c'.repeat(40);
const approval=()=>({schemaVersion:'theologai-fresh-corpus-proof-approval.v1',releasePolicy:POLICY.policy,liveControlReserve:100000,expectedLedgerSha256:digest,role:'preview',accountId:ACCOUNT,databaseId:TARGETS.preview.databaseId,sourceCommit:commit,sourceTree:tree,expiresAt:'2026-11-03T14:00:00Z',maxReads:3560000,integrityCommands:4,exclusiveDataWritesDuringProof:true});
const grant=()=>({schemaVersion:'theologai-operator-authorization.v1',scope:'new-additional-operation',exclusiveDataWritesDuringWindow:true,candidateWriteJobsPaused:true,repository:'TJ-Frederick/TheologAI',ownerActorId:40179660,role:'preview',pullRequestNumber:176,headBranch:'codex/norton-aquinas-successor',sourceCommit:commit,sourceTree:tree,baseCommit:'d'.repeat(40),sourcePlanSha256:digest,targetRunId:'12345',targetRunAttempt:1,authorizationId:'operation-corpus-preview-test',ledgerId:'operation-corpus-preview-test',notBefore:'2026-11-03T11:00:00Z',expiresAt:'2026-11-03T15:00:00Z',reservedReads:3560000,hardReadCap:3560000,diagnosticCommands:4,maxWrites:4,previousReadsSpentOrReserved:0,previousWritesSpentOrReserved:0,previousDiagnosticCommands:0,outstandingPriorReservationsAccepted:true,releasePolicy:POLICY.policy,liveControlReserve:100000,expectedLedgerSha256:digest});
describe('closed Norton/Aquinas release policy',()=>{
 it('deliberately uses equal3.56M reservation and hard cap, plus100K for later phases',()=>{
  expect(POLICY.reservedReads).toBe(3560000);expect(POLICY.hardReadCap).toBe(3560000);
  expect(requireProofApproval(approval(),{role:'preview',sourceCommit:commit,sourceTree:tree},now)).toEqual(approval());
  expect(authority.requireAuthorization(grant(),{},now)).toEqual(grant());
 });
 it.each([
  {releasePolicy:'application-only'}, {databaseId:TARGETS.production.databaseId}, {maxReads:3510997}, {maxReads:3800000}, {liveControlReserve:0}, {expectedLedgerSha256:'unknown'}, {expiresAt:'2026-11-03T11:59:59Z'}, {sourceTree:'d'.repeat(40)},
 ])('rejects altered/expired approval%j',change=>expect(()=>requireProofApproval({...approval(),...change},{role:'preview',sourceCommit:commit,sourceTree:tree},now)).toThrow());
 it.each([{exclusiveDataWritesDuringWindow:false},{candidateWriteJobsPaused:false},{releasePolicy:'application-only'},{reservedReads:3510997},{hardReadCap:3800000},{liveControlReserve:0},{previousReadsSpentOrReserved:1},{previousWritesSpentOrReserved:1},{outstandingPriorReservationsAccepted:false},{expectedLedgerSha256:'unknown'}])('rejects grant substitution or lost historical accounting%j',change=>expect(()=>authority.requireAuthorization({...grant(),...change},{},now)).toThrow());
 it('retains100K across the phase boundary and preserves the ordinary uncertainty margin',()=>{
  expect(()=>admitCorpusBudget(140000,3560000,140000,0,4000000,100000)).not.toThrow();
  expect(()=>admitCorpusBudget(140001,3560000,140001,0,4000000,100000)).toThrow();
  expect(()=>admitCorpusBudget(0,3560000,0,0,4000000,100001)).toThrow();
 });
 it('never admits an unmatched intent as a resumable preparation prefix',()=>{
  expect(()=>assertDefinitiveJournal([{index:0,sqlSha256:digest,state:'intent'}])).toThrow();
  expect(()=>assertDefinitiveJournal([{index:0,sqlSha256:digest,state:'intent'},{index:0,sqlSha256:'b'.repeat(64),state:'complete',result:{rowsRead:1,rowsWritten:1,responseSha256:digest}}])).toThrow();
 });
 it('allows only reviewed activation blobs and leaves application-only classification strict',()=>{
  const declaration=JSON.parse(readFileSync('release/norton-aquinas.json','utf8'));
  const raw=execFileSync('/opt/homebrew/bin/git',['ls-tree','-r','-z',declaration.baseline]).toString();
  const before=new Map<string,{mode:string;blob:string}>(raw.split('\0').filter(Boolean).map(entry=>{const [metadata,path]=entry.split('\t');const [mode,,blob]=metadata!.split(' ');return [path!,{mode:mode!,blob:blob!}];}));
  const after=new Map(before);for(const [path,blob]of Object.entries(declaration.files))after.set(path,{mode:'100644',blob:blob as string});
  expect(()=>assertReviewedActivationEntries(declaration,before,after)).not.toThrow();
  expect(classifyApplicationEntries(before,after,{}).applicationOnly).toBe(false);
  for(const changed of [new Map(after).set('src/http/requestLimitBypass.ts',{mode:'100644',blob:commit}),new Map(after).set('src/mcp/server.ts',{mode:'100644',blob:commit}),new Map(after).set('package-lock.json',{mode:'100644',blob:commit})])expect(()=>assertReviewedActivationEntries(declaration,before,changed)).toThrow();
  expect(()=>assertReviewedActivationEntries({...declaration,policy:'application-only'},before,after)).toThrow();
 });
 it('rejects partial/source-schema/budget/reserve receipt substitution',()=>{
  const tables=Object.fromEntries(Array.from({length:39},(_,i)=>['table'+i,{rows:1,sha256:digest}]));
  const receipt={schemaVersion:'theologai-fresh-complete-corpus-proof.v1',releasePolicy:POLICY.policy,liveControlReserve:100000,role:'preview',accountId:ACCOUNT,...TARGETS.preview,sourceCommit:commit,sourceTree:tree,corpusIdentity:POLICY.corpus,schema:POLICY.schema,startedAt:'2026-11-03T11:45:00Z',completedAt:'2026-11-03T11:59:00Z',sourcePlanSha256:digest,approvalSha256:digest,readBudget:3560000,metering:{rowsRead:100,rowsWritten:4,requests:44,integrityCommands:4,retries:0,unknownAttempts:0},controlsUnchanged:true,operationalAssumption:'owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease',proof:{method:'fresh_complete_cells_physical_and_rank1_fts.v1',tables,quickCheck:'ok',ftsIntegrity:['strongs_fts','sections_fts','historical_edition_sections_fts','historical_edition_hierarchy_bodies_fts'],foreignKeys:{method:'local_clean_raw_schema_plus_all_child_parent_cells',witnessSha256:digest},catalogSha256:digest,ledgerSha256:digest,sourceRows:39}};
  const expected={role:'preview' as const,sourceCommit:commit,sourceTree:tree,sourcePlanSha256:digest,tables,foreignKeyWitnessSha256:digest};
  expect(()=>verifyFreshCorpusReceipt(receipt,expected,now)).not.toThrow();
  for(const change of [{schema:'0009_candidate_c_sectioned_publications'},{databaseId:TARGETS.production.databaseId},{releasePolicy:'application-only'},{liveControlReserve:0},{readBudget:3800000},{proof:{...receipt.proof,ftsIntegrity:receipt.proof.ftsIntegrity.slice(1)}},{metering:{...receipt.metering,unknownAttempts:1}}])expect(()=>verifyFreshCorpusReceipt({...receipt,...change},expected,now)).toThrow();
 });
});

import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classifyApplicationRelease} from '../../../scripts/norton-aquinas-release-policy.mjs';
it('accepts the existing separately locked release link while rejecting source dirt and substituted trust sets',()=>{
 const dir=mkdtempSync(join(tmpdir(),'corpus-source-link-')),root=join(dir,'source'),toolchain=join(dir,'toolchain');
 try{
  execFileSync('git',['clone','--shared','--no-checkout',process.cwd(),root],{stdio:'pipe'});
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
  git('sparse-checkout','init','--cone');git('sparse-checkout','set','scripts','release','src','data','migrations','.github');git('checkout','--detach','HEAD');
  mkdirSync(join(toolchain,'node_modules'),{recursive:true});
  for(const name of ['package.json','package-lock.json'])writeFileSync(join(toolchain,name),git('show',POLICY.baseline+':.github/release-toolchain/'+name));
  symlinkSync(join(toolchain,'node_modules'),join(root,'node_modules'),'dir');
  expect(()=>classifyApplicationRelease(root)).not.toThrow();
  writeFileSync(join(root,'README.md'),'unreviewed');expect(()=>classifyApplicationRelease(root)).toThrow('dirty');git('restore','README.md');
  writeFileSync(join(root,'untracked-source.ts'),'unreviewed');expect(()=>classifyApplicationRelease(root)).toThrow('dirty');rmSync(join(root,'untracked-source.ts'));
  writeFileSync(join(toolchain,'package-lock.json'),'{}');expect(()=>classifyApplicationRelease(root)).toThrow('dirty');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

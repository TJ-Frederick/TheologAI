import {it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CorpusProofTransport,admitCorpusBudget} from '../../../scripts/corpus-proof-transport.js';
import {createOperatorChallenge,requireOperatorChallenge} from '../../../scripts/operator-corpus-proof.js';
import {corpusGrant,corpusTransportFixture} from '../../helpers/corpusTransportFixture.js';
const authority=createRequire(import.meta.url)('../../../.github/scripts/operator-authorization.cjs');
const start=Date.parse('2026-11-06T00:05:00Z');

it.each([
  {accountReadCeilingDay:'2026-11-07'},{accountReadCeiling:4_600_001},{accountReadsHeld:50_001},{accountWritesHeld:79_997},
  {databaseId:'wrong'},{candidateWriteJobsPaused:false},{outstandingPriorReservationsAccepted:false},
  {expiresAt:'2026-11-07T01:00:00Z'},{expiresAt:'2026-11-06T00:04:59Z'},
])('requires a valid native budget and isolated target for %j',patch=>{
  const {package:p}=corpusGrant({role:'production',now:start,overrides:{reservedReads:3_450_000,liveControlReserve:300_000,...patch}});
  expect(()=>authority.requirePackage(p,{role:'production',targetRunId:'123'},start)).toThrow();
});

it('includes the held floor, entire proof, live reservation and uncertainty in the approval',()=>{
  expect(()=>admitCorpusBudget(100,3_450_000,50_000,0,4_000_000,300_000)).not.toThrow();
  expect(()=>admitCorpusBudget(100,3_450_000,50_001,0,4_000_000,300_000)).toThrow('headroom');
  expect(()=>admitCorpusBudget(100,3_450_000,650_000,0,4_600_000,300_000)).not.toThrow();
  expect(()=>admitCorpusBudget(100,3_450_000,650_001,0,4_600_000,300_000)).toThrow('headroom');
  expect(()=>admitCorpusBudget(100,3_450_000,100,0,4_600_001,300_000)).toThrow('policy');
});

it('threads account floors through production admission and rejects detached claims',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(start);
  const directory=mkdtempSync(join(tmpdir(),'production-budget-'));
  try {
    const auth=corpusGrant({role:'production',overrides:{accountReadsHeld:40_000,accountWritesHeld:12}});
    const a=auth.package.authorization;
    const provider=corpusTransportFixture({role:'production',advance:()=>vi.setSystemTime(Date.now()+1000)});
    const transport=new CorpusProofTransport({role:'production',token:'synthetic',readBudget:a.reservedReads,eventFile:join(directory,'events'),fetch:provider.fetch,authorization:auth});
    await transport.start();
    const admission=transport.protectedAdmission();
    expect(admission).toMatchObject({accountReadCeiling:a.accountReadCeiling,rowsRead:40_000,rowsWritten:12});
    const challenge=createOperatorChallenge('production',a,a.sourcePlanSha256,{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:a.repository,GITHUB_RUN_ATTEMPT:'1',
      GITHUB_RUN_ID:a.targetRunId,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',OPERATOR_BASE_COMMIT:a.baseCommit},Date.now(),admission,auth.package);
    expect(()=>requireOperatorChallenge({...challenge,accountReadCeiling:3_999_999})).toThrow('owner-bound');
    const integrity=new CorpusProofTransport({role:'production',token:'synthetic',readBudget:16_384,eventFile:join(directory,'integrity'),fetch:provider.fetch,authorization:auth});
    await expect(integrity.startIntegrity({...admission,accountReadCeiling:3_999_999})).rejects.toThrow('matching protected account ceiling');
  }finally{vi.useRealTimers();rmSync(directory,{recursive:true,force:true});}
});

it('withholds completed controls when closing usage consumes the live reserve',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(start);
  const directory=mkdtempSync(join(tmpdir(),'production-closing-budget-'));
  try {
    const role='production', readBudget=3_450_000;
    const authorization=corpusGrant({role,overrides:{reservedReads:readBudget,liveControlReserve:300_000}});
    const provider=corpusTransportFixture({role,advance:()=>vi.setSystemTime(Date.now()+1000)});
    let closing=false;
    const fetcher:typeof fetch=async (url,init)=>{
      const response=await provider.fetch(url,init);
      if (!closing || !String(url).endsWith('/graphql')) return response;
      const body=await response.json() as {data:{viewer:{accounts:{d1AnalyticsAdaptiveGroups?:{sum:{rowsRead:number}}[]}[]}}};
      const group=body.data.viewer.accounts[0]?.d1AnalyticsAdaptiveGroups?.[0];
      if(group)group.sum.rowsRead=3_500_001;
      return Response.json(body);
    };
    const reader=new CorpusProofTransport({role,readBudget,token:'synthetic',eventFile:join(directory,'events'),fetch:fetcher,authorization});
    await reader.start();
    closing=true;
    await expect(reader.finish()).rejects.toThrow('insufficient account headroom');
  }finally{vi.useRealTimers();rmSync(directory,{recursive:true,force:true});}
});

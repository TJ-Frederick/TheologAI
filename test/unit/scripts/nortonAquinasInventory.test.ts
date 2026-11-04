import {it,expect} from 'vitest';
import {captureUnboundCorpusControl} from '../../../scripts/corpus-release-control.js';
import {TARGETS as targets,POLICY} from '../../../scripts/norton-aquinas-release-policy.mjs';
import {corpusControlFixture,corpusPagesControlFixture} from '../../helpers/corpusControlFixture.js';
const TARGETS={preview:{id:targets.preview.databaseId},rollback:{id:POLICY.rollback.databaseId}};
const NOW=Date.parse('2026-10-28T12:00:00Z');
it('covers every post-database Pages deployment with an unambiguous D1-free version witness', async () => {
    const fixture = corpusPagesControlFixture();
    const result = await captureUnboundCorpusControl({ role: 'preview', api: fixture.api, now: () => NOW });
    const histories = result.inventory.pages[0]!.functionAuthority!.histories;
    expect(histories).toHaveLength(2);
    for (const history of histories) {
        expect(history.coverage).toHaveLength(2);
        expect(new Set(history.coverage.map(item => item.versionId)).size).toBe(2);
    }
    expect(fixture.requests.filter(path => path.includes('/corpus-pages-') && path.includes('/versions/'))).toHaveLength(8);
});
it.each(['old-version-d1', 'settings-d1', 'missing-interval-witness', 'overlap', 'unfinished', 'history-gap', 'second-scan-drift'])('refuses Pages authority defect %s before SQL', async (defect) => {
    const fixture = corpusPagesControlFixture((value, path, scan) => {
        if (defect === 'old-version-d1' && /corpus-pages-production\/versions\/33333330/.test(path))
            value.result.resources.bindings.push({ type: 'd1', database_id: TARGETS.preview.id });
        if (defect === 'settings-d1' && path.includes('corpus-pages-') && path.endsWith('/settings'))
            value.result.bindings.push({ type: 'd1', database_id: TARGETS.rollback.id });
        if (defect === 'history-gap' && path.includes('corpus-pages-') && path.includes('/versions?'))
            value.result.items[0].number = 3;
        if (path.startsWith('/pages/projects/corpus-site/deployments?')) {
            if (defect === 'missing-interval-witness') {
                value.result[0].stages[0].started_on = value.result[0].latest_stage.started_on = '2026-10-25T12:00:01Z';
            }
            if (defect === 'overlap') {
                value.result[1].stages[0].started_on = value.result[1].latest_stage.started_on = '2026-10-25T12:00:00Z';
            }
            if (defect === 'unfinished')
                value.result[0].latest_stage.status = 'active';
            if (defect === 'second-scan-drift' && scan === 2)
                value.result[0].modified_on = '2026-10-25T12:03:00Z';
        }
    });
    await expect(captureUnboundCorpusControl({ role: 'preview', api: fixture.api, now: () => NOW })).rejects.toThrow('Corpus control capture refused:');
});

it('refuses any Worker binding to the candidate',async()=>{const f=corpusControlFixture();f.setBound(true);await expect(captureUnboundCorpusControl({role:'preview',api:f.api,now:()=>NOW})).rejects.toThrow('candidate_database_is_bound');});
it.each(['failed-workers','missing-pages-pagination','short-worker-page','duplicate-worker','unknown-target'])('refuses incomplete inventory%s',async fault=>{const f=corpusControlFixture();const api={...f.api,get:async(path:string)=>{const r=await f.api.get(path),v=await r.json() as any;if(fault==='failed-workers'&&path==='/workers/scripts')v.success=false;if(fault==='missing-pages-pagination'&&path.startsWith('/pages/projects?'))delete v.result_info;if(fault==='short-worker-page'&&path==='/workers/scripts')v.result_info={page:1,per_page:100,count:1,total_count:101,total_pages:2};if(fault==='duplicate-worker'&&path==='/workers/scripts')v.result.push({...v.result[0]});if(fault==='unknown-target'&&path.startsWith('/d1/database/'))v.result.uuid=targets.production.databaseId;return Response.json(v);}};await expect(captureUnboundCorpusControl({role:'preview',api,now:()=>NOW})).rejects.toThrow();});
it('rejects a capture exceeding its bounded freshness interval',async()=>{let n=0;const f=corpusControlFixture();await expect(captureUnboundCorpusControl({role:'preview',api:f.api,now:()=>NOW+(n++>4?121000:0)})).rejects.toThrow();});

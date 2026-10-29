import { CORPUS_ACCOUNT_ID } from '../../scripts/corpus-release-control.js';
import { TARGETS } from '../../scripts/corpus-release.js';
export function corpusControlFixture(now = Date.parse('2026-10-28T12:00:00Z')) {
    let bound = false;
    const version = '11111111-1111-4111-8111-111111111111', deployment = '22222222-2222-4222-8222-222222222222';
    const result = (data: unknown, info?: unknown) => Response.json({ success: true, errors: [], messages: [], result: data, ...(info ? { result_info: info } : {}) });
    const page = (count: number) => ({ page: 1, per_page: 100, count, total_count: count, total_pages: count ? 1 : 0 });
    return { setBound: (value: boolean) => { bound = value; }, api: {
            get: async (path: string) => {
                if (path.startsWith('/d1/database/'))
                    return result({ uuid: TARGETS.preview.id, name: TARGETS.preview.name, file_size: 348463104, created_at: '2026-07-28T00:00:00Z' });
                if (path === '/workers/scripts')
                    return result([{ id: 'theologai' }]);
                if (path === '/workers/scripts/theologai/settings')
                    return result({ bindings: [{ type: 'd1', name: 'THEOLOGAI_DB', id: bound ? TARGETS.preview.id : TARGETS.rollback.id }] });
                if (path.startsWith('/workers/scripts/theologai/deployments'))
                    return result({ deployments: [{ id: deployment, created_on: '2026-10-27T00:00:00Z', versions: [{ version_id: version, percentage: 100 }] }] }, page(1));
                if (path === '/workers/scripts/theologai/versions/' + version)
                    return result({ id: version, number: 1, resources: { bindings: [{ type: 'd1', name: 'THEOLOGAI_DB', id: bound ? TARGETS.preview.id : TARGETS.rollback.id }] } });
                if (path.startsWith('/pages/projects?'))
                    return result([], page(0));
                throw Error('Unplanned fixture path ' + path);
            },
            graphql: async () => Response.json({ data: { viewer: { accounts: [{ accountTag: CORPUS_ACCOUNT_ID, databases: [{ dimensions: { databaseId: TARGETS.rollback.id }, sum: { rowsRead: 0, rowsWritten: 0 }, avg: { sampleInterval: 1 } }] }] } } })
        } };
}
/** Two completed post-database Functions deployments in each Pages environment. */
export function corpusPagesControlFixture(mutate?: (value: any, path: string, scan: number) => void) {
    const fixture = corpusControlFixture(), requests: string[] = [];
    const deployments: any[] = [], versions: Record<string, any[]> = {};
    for (const [environment, digit] of [['production', '3'], ['preview', '4']]) {
        versions[environment] = [];
        for (const [index, day] of ['25', '26'].entries()) {
            const id = `${digit.repeat(7)}${index}-1111-4111-8111-111111111111`;
            const versionId = `${digit.repeat(7)}${index}-2222-4222-8222-222222222222`;
            const stage = { name: 'deploy', status: 'success', started_on: `2026-10-${day}T11:59:00Z`, ended_on: `2026-10-${day}T12:01:00Z` };
            deployments.push({ id, environment, uses_functions: true, is_skipped: false,
                created_on: `2026-10-${day}T11:58:00Z`, modified_on: `2026-10-${day}T12:02:00Z`, stages: [stage], latest_stage: stage });
            versions[environment].push({ id: versionId, number: index + 1,
                metadata: { created_on: `2026-10-${day}T12:00:00Z`, source: 'api', author_email: 'Cloudflare Pages' } });
        }
    }
    let scan = 0;
    const get = async (path: string) => {
        requests.push(path);
        if (path === '/workers/scripts')
            scan++;
        const route = new URL(path, 'https://local.invalid').pathname;
        const result = (value: unknown, pageSize = 10) => ({ success: true, errors: [], messages: [], result: value,
            ...(Array.isArray(value) ? { result_info: { page: 1, per_page: pageSize, count: value.length, total_count: value.length, total_pages: value.length ? 1 : 0 } } : {}) });
        let value: any;
        if (route === '/pages/projects')
            value = result([{ name: 'corpus-site' }]);
        else if (route === '/pages/projects/corpus-site')
            value = result({ name: 'corpus-site', deployment_configs: { production: {}, preview: {} },
                production_script_name: 'corpus-pages-production', preview_script_name: 'corpus-pages-preview',
                canonical_deployment: deployments[1], latest_deployment: deployments[1] });
        else if (route === '/pages/projects/corpus-site/deployments')
            value = result(deployments);
        else if (route.startsWith('/workers/scripts/corpus-pages-')) {
            const environment = route.includes('corpus-pages-production') ? 'production' : 'preview';
            if (route.endsWith('/settings'))
                value = result({ bindings: [] });
            else if (route.endsWith('/versions'))
                value = { ...result({ items: [...versions[environment]].reverse() }), result_info: { page: 1, per_page: 100, count: 2, total_count: 2 } };
            else {
                const version = versions[environment].find(item => item.id === route.split('/').at(-1));
                if (!version)
                    throw Error('Unplanned fixture version');
                value = result({ ...version, resources: { bindings: [] } });
            }
        }
        else
            value = await (await fixture.api.get(path)).json();
        value = structuredClone(value);
        mutate?.(value, path, scan);
        return Response.json(value);
    };
    return { ...fixture, requests, api: { ...fixture.api, get } };
}

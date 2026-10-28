/** Bounded control collector reused from the existing release tooling; only the two corpus targets are selectable. */
import { createHash } from 'node:crypto';
import { canonicalJson } from './audit-historical-core-preview.js';
import { TARGETS } from './corpus-release.js';
export const CORPUS_ACCOUNT_ID = '0594ed1e4c9fe35ab7d9f47991e99f3e';
export const CORPUS_CONTROL_LIMITS = Object.freeze({
    durationMs: 120000, requestMs: 30000, exchanges: 256,
    responseBytes: 1250000, aggregateBytes: 16 * 1024 * 1024,
    pages: 32, items: 1000, pageSize: 100, pagesPageSize: 10,
});
type Row = Record<string, unknown>;
export type CorpusControlApi = {
    get(path: string): Promise<Response>;
    graphql(body: {
        query: string;
        variables: Record<string, unknown>;
    }): Promise<Response>;
};
type Dependencies = {
    api: CorpusControlApi;
    role: 'preview' | 'production';
    now?: () => number;
};
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
function check(value: unknown, code: string): asserts value {
    if (!value)
        throw new Error(`Corpus control capture refused: ${code}`);
}
function row(value: unknown): Row {
    check(value !== null && typeof value === 'object' && !Array.isArray(value), 'malformed_object');
    return value as Row;
}
function array(value: unknown): unknown[] {
    check(Array.isArray(value), 'malformed_list');
    return value;
}
function count(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function name(value: unknown): string {
    check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value), 'malformed_resource_name');
    return value;
}
function uuid(value: unknown): string {
    check(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 'malformed_database_or_version_id');
    return value.toLowerCase();
}
class ReadOnlyApi {
    readonly now: () => number;
    readonly started: number;
    readonly target: {
        databaseId: string;
        databaseName: string;
    };
    exchanges = 0;
    aggregateBytes = 0;
    readonly observations: Array<{
        requestSha256: string;
        responseSha256: string;
    }> = [];
    constructor(private readonly dependencies: Dependencies) {
        this.now = dependencies.now ?? Date.now;
        this.started = this.now();
        this.target = { databaseId: TARGETS[dependencies.role].id, databaseName: TARGETS[dependencies.role].name };
    }
    async request(path: string, query?: Row): Promise<Row> {
        check(++this.exchanges <= CORPUS_CONTROL_LIMITS.exchanges, 'exchange_limit');
        const remaining = this.started + CORPUS_CONTROL_LIMITS.durationMs - this.now();
        check(remaining > 0, 'duration_limit');
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const expired = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('bounded_request_timeout')), Math.min(remaining, CORPUS_CONTROL_LIMITS.requestMs));
        });
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
            const url = `https://api.cloudflare.com/client/v4${path}`;
            const response = await Promise.race([query
                    ? this.dependencies.api.graphql(query as {
                        query: string;
                        variables: Row;
                    })
                    : this.dependencies.api.get(path.replace(`/accounts/${CORPUS_ACCOUNT_ID}`, '')), expired]);
            check(response.status === 200 && !response.redirected && (!response.url || response.url === url), 'http_or_redirect_failure');
            check(/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? ''), 'non_json_response');
            check(response.body, 'missing_response_body');
            reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            for (;;) {
                const item = await Promise.race([reader.read(), expired]);
                if (item.done)
                    break;
                bytes += item.value.byteLength;
                this.aggregateBytes += item.value.byteLength;
                check(bytes <= CORPUS_CONTROL_LIMITS.responseBytes && this.aggregateBytes <= CORPUS_CONTROL_LIMITS.aggregateBytes, 'response_byte_limit');
                check(this.now() < this.started + CORPUS_CONTROL_LIMITS.durationMs, 'duration_limit');
                chunks.push(item.value);
            }
            const text = Buffer.concat(chunks).toString('utf8');
            const parsed = row(JSON.parse(text));
            this.observations.push({ requestSha256: hash({ path, query: query ?? null }), responseSha256: createHash('sha256').update(text).digest('hex') });
            return parsed;
        }
        catch {
            // Fetch/JSON errors can contain URLs, response bodies, or authentication headers.
            throw new Error('Corpus control capture refused: bounded_request_failed');
        }
        finally {
            clearTimeout(timeout);
            if (reader)
                void reader.cancel().catch(() => { });
        }
    }
    async rest(path: string): Promise<Row> {
        const result = await this.request(path);
        // The observed version service returns explicit null diagnostics on
        // success, which Wrangler also accepts. Keep this compatibility limited to
        // list/detail endpoints; result completeness and bindings are checked separately.
        const nullableVersionEndpoint = new RegExp(`^/accounts/${CORPUS_ACCOUNT_ID}/workers/scripts/[A-Za-z0-9_-]+/versions(?:\\?page=\\d+&per_page=${CORPUS_CONTROL_LIMITS.pageSize}|/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`, 'i').test(path);
        check(result.success === true
            && ((Array.isArray(result.errors) && result.errors.length === 0) || (nullableVersionEndpoint && result.errors === null))
            && (!Object.hasOwn(result, 'messages') || (Array.isArray(result.messages) && result.messages.length === 0)
                || (nullableVersionEndpoint && result.messages === null)), 'rest_errors_or_partial_result');
        return result;
    }
    async list(path: string, select: (result: unknown) => unknown[], documentedFlat = false): Promise<Row[]> {
        const all: Row[] = [];
        const pageSize = path.startsWith(`/accounts/${CORPUS_ACCOUNT_ID}/pages/`)
            ? CORPUS_CONTROL_LIMITS.pagesPageSize : CORPUS_CONTROL_LIMITS.pageSize;
        let total: number | undefined;
        let pages: number | undefined;
        for (let page = 1; page <= CORPUS_CONTROL_LIMITS.pages; page++) {
            const response = await this.rest(page === 1 && documentedFlat ? path : `${path}?page=${page}&per_page=${pageSize}`);
            const items = select(response.result).map(row);
            check(all.length + items.length <= CORPUS_CONTROL_LIMITS.items, 'inventory_item_limit');
            all.push(...items);
            if (!Object.hasOwn(response, 'result_info')) {
                check(documentedFlat && page === 1, 'pagination_completeness_unavailable');
                return all;
            }
            const info = row(response.result_info);
            check(info.page === page && count(info.count) && info.count === items.length && count(info.per_page) && info.per_page > 0
                && items.length <= info.per_page && count(info.total_count) && count(info.total_pages), 'malformed_pagination');
            check(info.total_pages <= CORPUS_CONTROL_LIMITS.pages && info.total_count <= CORPUS_CONTROL_LIMITS.items
                && (info.total_count === 0 ? info.total_pages <= 1 : info.total_pages === Math.ceil(info.total_count / info.per_page)), 'truncated_pagination');
            if (total === undefined) {
                total = info.total_count;
                pages = info.total_pages;
            }
            check(total === info.total_count && pages === info.total_pages, 'pagination_changed');
            if (page >= Math.max(1, info.total_pages)) {
                check(all.length === total, 'incomplete_pagination');
                return all;
            }
            check(items.length === info.per_page, 'short_nonterminal_page');
        }
        throw new Error('Corpus control capture refused: page_limit');
    }
    /** Worker versions omit total_pages; derive it from the authoritative count. */
    async versions(path: string): Promise<Row[]> {
        const all: Row[] = [];
        let total: number | undefined;
        let pageSize: number | undefined;
        for (let page = 1; page <= CORPUS_CONTROL_LIMITS.pages; page++) {
            const response = await this.rest(`${path}/versions?page=${page}&per_page=${CORPUS_CONTROL_LIMITS.pageSize}`);
            const items = array(row(response.result).items).map(row);
            const info = row(response.result_info);
            check(info.page === page && count(info.count) && info.count === items.length && count(info.per_page)
                && info.per_page > 0 && info.per_page <= CORPUS_CONTROL_LIMITS.pageSize && items.length <= info.per_page
                && count(info.total_count) && info.total_count > 0 && info.total_count <= CORPUS_CONTROL_LIMITS.items, 'malformed_version_pagination');
            const pages = Math.ceil(info.total_count / info.per_page);
            check(pages <= CORPUS_CONTROL_LIMITS.pages && (!Object.hasOwn(info, 'total_pages') || info.total_pages === pages), 'truncated_version_pagination');
            if (total === undefined) {
                total = info.total_count;
                pageSize = info.per_page;
            }
            check(total === info.total_count && pageSize === info.per_page, 'version_pagination_changed');
            all.push(...items);
            if (page === pages) {
                check(all.length === total, 'incomplete_version_pagination');
                unique(all.map(item => uuid(item.id)));
                const numbers = all.map(item => { check(count(item.number) && item.number > 0, 'unknown_version_number'); return item.number; }).sort((a, b) => a - b);
                check(numbers.every((number, index) => number === index + 1), 'version_history_has_gaps');
                return all.sort((a, b) => Number(a.number) - Number(b.number));
            }
            check(items.length === info.per_page, 'short_version_page');
        }
        throw new Error('Corpus control capture refused: version_page_limit');
    }
}
function workerD1Bindings(value: unknown): string[] {
    const ids: string[] = [];
    for (const item of array(value)) {
        const binding = row(item);
        check(typeof binding.type === 'string', 'unknown_worker_binding_type');
        if (binding.type !== 'd1')
            continue;
        // The official Wrangler reader also consumes the historical `id` spelling.
        const id = uuid(Object.hasOwn(binding, 'database_id') ? binding.database_id : binding.id);
        check(!Object.hasOwn(binding, 'id') || uuid(binding.id) === id, 'conflicting_d1_binding');
        ids.push(id);
    }
    return ids.sort();
}
function pagesD1Bindings(value: unknown): string[] {
    if (value === undefined)
        return []; // Documented optional map in authoritative project configuration.
    return Object.values(row(value)).map(binding => uuid(row(binding).id)).sort();
}
function unique(items: string[]): void {
    check(new Set(items).size === items.length, 'duplicate_inventory_identity');
}
function timestamp(value: unknown, now: number): number {
    check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value), 'unknown_provider_timestamp');
    const time = Date.parse(value);
    check(Number.isFinite(time) && time <= now && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19), 'invalid_provider_timestamp');
    return time;
}
function finishedPagesDeployment(deployment: Row, now: number, databaseCreated: number) {
    const created = timestamp(deployment.created_on, now);
    const modified = timestamp(deployment.modified_on, now);
    check(modified >= created && deployment.is_skipped === false, 'pages_deployment_not_completed');
    const stages = array(deployment.stages).map(value => {
        const stage = row(value);
        check(['queued', 'initialize', 'clone_repo', 'build', 'deploy'].includes(String(stage.name))
            && ['success', 'skipped', 'active', 'idle'].includes(String(stage.status)), 'pages_deployment_not_completed');
        const started = stage.started_on === null ? null : timestamp(stage.started_on, now);
        const ended = stage.ended_on === null ? null : timestamp(stage.ended_on, now);
        // Queue bookkeeping can precede creation of the deployment record; all
        // observed activity must nevertheless finish by its authoritative modified time.
        check((started === null || started <= modified)
            && (ended === null || ended <= modified)
            && (started === null || ended === null || started <= ended), 'invalid_pages_stage_interval');
        return { name: stage.name, status: stage.status, started, ended, startedOn: stage.started_on, endedOn: stage.ended_on };
    });
    unique(stages.map(stage => String(stage.name)));
    const deploy = stages.find(stage => stage.name === 'deploy');
    const latest = row(deployment.latest_stage);
    check(deploy?.status === 'success' && deploy.ended !== null
        && latest.name === 'deploy' && latest.status === 'success'
        && latest.started_on === deploy.startedOn && latest.ended_on === deploy.endedOn, 'pages_deployment_not_completed');
    const triggerType = deployment.deployment_trigger === undefined ? null : row(deployment.deployment_trigger).type;
    let completion: 'completed_stage_interval' | 'terminal_direct_upload' = 'completed_stage_interval';
    if (deploy.started === null) {
        // The observed historical ad_hoc direct upload has a terminal deploy status
        // while the unused build pipeline retains queued/idle bookkeeping. This
        // exact shape can establish pre-database completion, never a deploy interval.
        const queued = stages.find(stage => stage.name === 'queued');
        check(triggerType === 'ad_hoc' && modified > created && modified < databaseCreated
            && stages.length === 5 && deploy.endedOn === deployment.modified_on
            && queued?.status === 'active' && queued.startedOn === deployment.created_on && queued.ended === null
            && ['initialize', 'clone_repo', 'build'].every(stageName => {
                const stage = stages.find(item => item.name === stageName);
                return stage?.status === 'idle' && stage.started === null && stage.ended === null;
            }), 'pages_terminal_direct_upload_not_historical');
        completion = 'terminal_direct_upload';
    }
    else {
        check(stages.every(stage => (stage.status === 'success' || stage.status === 'skipped')
            && (stage.status === 'skipped' || (stage.started !== null && stage.ended !== null))), 'pages_deployment_not_completed');
    }
    return { id: uuid(deployment.id), environment: deployment.environment, created, modified,
        createdOn: deployment.created_on, modifiedOn: deployment.modified_on, completion, triggerType,
        latestStage: { name: latest.name, status: latest.status, startedOn: latest.started_on, endedOn: latest.ended_on },
        stages, deployStarted: deploy.started, deployEnded: deploy.ended };
}
/** A D1-free superset of every version under provider-returned environment scripts. */
async function pagesFunctionAuthority(api: ReadOnlyApi, account: string, project: Row, deployments: Row[]) {
    check(typeof project.production_script_name === 'string' && typeof project.preview_script_name === 'string', 'pages_actual_function_bindings_unavailable');
    const scripts = { production: name(project.production_script_name), preview: name(project.preview_script_name) };
    check(scripts.production !== scripts.preview, 'ambiguous_pages_environment_scripts');
    const database = row((await api.rest(`${account}/d1/database/${api.target.databaseId}`)).result);
    check(database.name === api.target.databaseName && uuid(database.uuid) === api.target.databaseId, 'candidate_database_identity_changed');
    const databaseCreated = timestamp(database.created_at, api.now());
    const completed = deployments.filter(deployment => deployment.uses_functions === true).map(deployment => finishedPagesDeployment(deployment, api.now(), databaseCreated));
    const histories = [];
    for (const environment of ['production', 'preview'] as const) {
        const path = `${account}/workers/scripts/${encodeURIComponent(scripts[environment])}`;
        const settings = row((await api.rest(`${path}/settings`)).result);
        check(workerD1Bindings(settings.bindings).length === 0, 'pages_function_script_has_d1_binding');
        const listed = await api.versions(path);
        const versions: Array<{
            id: string;
            number: number;
            created: number;
            createdOn: unknown;
        }> = [];
        for (const item of listed) {
            const version = row((await api.rest(`${path}/versions/${uuid(item.id)}`)).result);
            check(version.id === item.id && count(version.number) && version.number === item.number, 'version_identity_changed');
            const metadata = row(version.metadata);
            const listedMetadata = row(item.metadata);
            check(metadata.source === 'api' && metadata.author_email === 'Cloudflare Pages'
                && metadata.created_on === listedMetadata.created_on && metadata.source === listedMetadata.source
                && metadata.author_email === listedMetadata.author_email, 'pages_version_metadata_changed');
            const created = timestamp(metadata.created_on, api.now());
            check(workerD1Bindings(row(version.resources).bindings).length === 0, 'pages_function_version_has_d1_binding');
            versions.push({ id: uuid(version.id), number: version.number, created, createdOn: metadata.created_on });
        }
        check(versions.every((version, index) => index === 0 || versions[index - 1]!.created < version.created), 'ambiguous_pages_version_history');
        const forEnvironment = completed.filter(deployment => deployment.environment === environment).sort((a, b) => b.created - a.created);
        const afterCreation = forEnvironment.filter(deployment => deployment.modified >= databaseCreated);
        // Each still-routable post-database deployment must have its own
        // unambiguous version witness under the provider-returned environment
        // script. Every version above remains independently checked D1-free.
        const coverage: Array<{
            deploymentId: string;
            versionId: string;
        }> = [];
        for (const [index, deployment] of afterCreation.entries()) {
            check(deployment.deployStarted !== null, 'pages_function_deploy_interval_unavailable');
            if (index > 0)
                check(deployment.deployEnded < afterCreation[index - 1]!.deployStarted!, 'pages_function_deploy_intervals_overlap');
            const matches = versions.filter(version => version.created > deployment.deployStarted! && version.created < deployment.deployEnded);
            check(matches.length === 1, 'pages_historical_function_binding_authority_unavailable');
            coverage.push({ deploymentId: deployment.id, versionId: matches[0]!.id });
        }
        unique(coverage.map(item => item.versionId));
        if (afterCreation.length) {
            const deployment = afterCreation[0]!;
            const allEnvironment = deployments.filter(item => item.environment === environment);
            check(allEnvironment.every(item => uuid(item.id) === deployment.id || timestamp(item.created_on, api.now()) < deployment.created)
                && forEnvironment[0]?.id === deployment.id, 'pages_post_creation_deployment_not_newest');
            check(coverage[0]!.versionId === versions.at(-1)!.id, 'pages_newest_version_outside_deploy_interval');
        }
        histories.push({ environment, script: scripts[environment], versions, coverage });
    }
    return { databaseCreated, databaseCreatedAt: database.created_at, deployments: completed.sort((a, b) => a.id.localeCompare(b.id)), histories };
}
async function inventory(api: ReadOnlyApi) {
    const account = `/accounts/${CORPUS_ACCOUNT_ID}`;
    const scripts = await api.list(`${account}/workers/scripts`, array, true);
    const names = scripts.map(script => name(script.id)).sort();
    unique(names);
    const workers = [];
    for (const script of names) {
        const path = `${account}/workers/scripts/${encodeURIComponent(script)}`;
        const settings = row((await api.rest(`${path}/settings`)).result);
        const configuredD1 = workerD1Bindings(settings.bindings);
        // Pin the page size from the first request; the provider defaults to 10.
        const deployments = await api.list(`${path}/deployments`, value => array(row(value).deployments));
        check(deployments.length > 0, 'worker_active_deployment_unavailable');
        const times = deployments.map(deployment => Date.parse(String(deployment.created_on)));
        check(times.every(time => Number.isFinite(time) && time <= api.now()) && times.every((time, index) => index === 0 || times[index - 1]! > time), 'ambiguous_active_deployment');
        const active = deployments[0]!;
        const deploymentId = uuid(active.id);
        const assignments = array(active.versions).map(value => {
            const assignment = row(value);
            check(typeof assignment.percentage === 'number' && Number.isFinite(assignment.percentage)
                && assignment.percentage >= 0 && assignment.percentage <= 100, 'invalid_traffic_assignment');
            return { versionId: uuid(assignment.version_id), percentage: assignment.percentage };
        });
        unique(assignments.map(value => value.versionId));
        check(assignments.length > 0 && Math.abs(assignments.reduce((sum, value) => sum + value.percentage, 0) - 100) < 1e-9, 'incomplete_traffic_assignment');
        const versions = [];
        for (const assignment of assignments.filter(value => value.percentage > 0).sort((a, b) => a.versionId.localeCompare(b.versionId))) {
            const version = row((await api.rest(`${path}/versions/${assignment.versionId}`)).result);
            check(version.id === assignment.versionId, 'version_identity_changed');
            versions.push({ ...assignment, databases: workerD1Bindings(row(version.resources).bindings) });
        }
        workers.push({ name: script, deploymentId, configuredD1, versions });
    }
    const projects = await api.list(`${account}/pages/projects`, array);
    const projectNames = projects.map(project => name(project.name)).sort();
    unique(projectNames);
    const pages = [];
    for (const projectName of projectNames) {
        const path = `${account}/pages/projects/${encodeURIComponent(projectName)}`;
        const project = row((await api.rest(path)).result);
        check(project.name === projectName, 'pages_project_identity_changed');
        const configs = row(project.deployment_configs);
        const production = pagesD1Bindings(row(configs.production).d1_databases);
        const preview = pagesD1Bindings(row(configs.preview).d1_databases);
        const deployments = await api.list(`${path}/deployments`, array);
        unique(deployments.map(deployment => uuid(deployment.id)));
        const coveredDeployments = deployments.map(deployment => {
            check(typeof deployment.uses_functions === 'boolean', 'pages_actual_function_bindings_unavailable');
            check(deployment.environment === 'production' || deployment.environment === 'preview', 'unknown_pages_deployment_environment');
            return { id: uuid(deployment.id), environment: deployment.environment, usesFunctions: deployment.uses_functions };
        }).sort((a, b) => a.id.localeCompare(b.id));
        const activeDeployments = [];
        for (const field of ['canonical_deployment', 'latest_deployment']) {
            if (project[field] !== null && project[field] !== undefined) {
                const deployment = row(project[field]);
                check(coveredDeployments.some(item => item.id === uuid(deployment.id) && item.usesFunctions === deployment.uses_functions), 'pages_active_deployment_not_covered');
                activeDeployments.push({ field, id: uuid(deployment.id), usesFunctions: deployment.uses_functions });
            }
        }
        const functionAuthority = deployments.some(deployment => deployment.uses_functions === true)
            ? await pagesFunctionAuthority(api, account, project, deployments) : null;
        pages.push({ name: projectName, production, preview, coveredDeployments, activeDeployments, functionAuthority });
    }
    const result = { workers, pages };
    const bindingCount = workers.reduce((sum, worker) => sum + [...worker.configuredD1, ...worker.versions.flatMap(version => version.databases)].filter(id => id === api.target.databaseId).length, 0)
        + pages.reduce((sum, project) => sum + [...project.production, ...project.preview].filter(id => id === api.target.databaseId).length, 0);
    check(bindingCount === 0, 'candidate_database_is_bound');
    return result;
}
export const CORPUS_USAGE_QUERY = `query CorpusReleaseUsage($accountTag: string!, $start: Date!, $end: Date!) {
  viewer { accounts(filter: { accountTag: $accountTag }) { accountTag
    databases: d1AnalyticsAdaptiveGroups(limit: 1001, filter: { date_geq: $start, date_leq: $end }) {
      dimensions { databaseId } sum { rowsRead rowsWritten } avg { sampleInterval }
    }
  } }
}`;
/** Complete observed database groups; zero observations do not establish zero actual usage. */
export async function captureCorpusUsage(dependencies: Dependencies) {
    return observeExclusiveUsage(new ReadOnlyApi(dependencies));
}
/** Shared bounded transport keeps group parsing inside its complete capture budget. */
async function observeExclusiveUsage(api: ReadOnlyApi) {
    const day = new Date(api.started).toISOString().slice(0, 10);
    const query = { query: CORPUS_USAGE_QUERY, variables: { accountTag: CORPUS_ACCOUNT_ID, start: day, end: day } };
    const response = await api.request('/graphql', query);
    check((!Object.hasOwn(response, 'errors') || response.errors === null || (Array.isArray(response.errors) && response.errors.length === 0))
        && !Object.hasOwn(response, 'extensions'), 'graphql_partial_or_error_response');
    const accounts = array(row(row(response.data).viewer).accounts);
    check(accounts.length === 1 && row(accounts[0]).accountTag === CORPUS_ACCOUNT_ID, 'account_usage_scope_changed');
    const groups = array(row(accounts[0]).databases);
    check(groups.length <= 1000, 'truncated_exclusive_usage_groups');
    const candidate = { rowsRead: 0, rowsWritten: 0 };
    const otherDatabases = { rowsRead: 0, rowsWritten: 0 };
    const ids = new Set<string>();
    for (const value of groups) {
        const group = row(value);
        const id = uuid(row(group.dimensions).databaseId);
        check(!ids.has(id), 'duplicate_usage_partition_database');
        ids.add(id);
        check(row(group.avg).sampleInterval === 1, 'sampled_or_unknown_account_usage');
        const sum = row(group.sum);
        check(count(sum.rowsRead) && count(sum.rowsWritten), 'invalid_account_usage');
        const target = id === api.target.databaseId ? candidate : otherDatabases;
        target.rowsRead += sum.rowsRead;
        target.rowsWritten += sum.rowsWritten;
        check(count(target.rowsRead) && count(target.rowsWritten), 'usage_partition_overflow');
    }
    check(count(candidate.rowsRead + otherDatabases.rowsRead) && count(candidate.rowsWritten + otherDatabases.rowsWritten), 'usage_partition_overflow');
    const capturedAt = new Date(api.now()).toISOString();
    check(capturedAt.slice(0, 10) === day && api.now() - api.started <= CORPUS_CONTROL_LIMITS.durationMs, 'utc_rollover_or_stale_capture');
    return { accountId: CORPUS_ACCOUNT_ID, databaseId: api.target.databaseId, capturedAt, windowStart: `${day}T00:00:00.000Z`,
        candidate, otherDatabases, aggregation: 'database_groups', completeDatabaseGroups: true, watermarkUnavailable: true,
        evidenceSha256: hash({ query, responseSha256: hash(response), capturedAt }) };
}
export async function captureUnboundCorpusControl(dependencies: Dependencies) {
    const api = new ReadOnlyApi(dependencies);
    const before = await inventory(api);
    const metadata = row((await api.rest('/accounts/' + CORPUS_ACCOUNT_ID + '/d1/database/' + api.target.databaseId)).result);
    check(metadata.uuid === api.target.databaseId && metadata.name === api.target.databaseName, 'candidate_database_identity_changed');
    check(count(metadata.file_size) && metadata.file_size <= 367001600, 'candidate_size_unknown_or_over_budget');
    const exclusiveUsage = await observeExclusiveUsage(api);
    const after = await inventory(api);
    check(hash(before) === hash(after), 'bindings_or_deployments_changed_during_capture');
    const capturedAt = new Date(api.now()).toISOString();
    check(api.now() - api.started <= CORPUS_CONTROL_LIMITS.durationMs && capturedAt.slice(0, 10) === new Date(api.started).toISOString().slice(0, 10), 'utc_rollover_or_stale_capture');
    return { capturedAt, databaseId: api.target.databaseId, databaseName: api.target.databaseName, databaseBytes: metadata.file_size, inventorySha256: hash(after), inventory: after, exclusiveUsage,
        accountUsage: { windowStart: exclusiveUsage.windowStart, observedAt: exclusiveUsage.capturedAt, rowsRead: exclusiveUsage.candidate.rowsRead + exclusiveUsage.otherDatabases.rowsRead, rowsWritten: exclusiveUsage.candidate.rowsWritten + exclusiveUsage.otherDatabases.rowsWritten },
        evidenceSha256: hash(api.observations), httpExchanges: api.exchanges, responseBytes: api.aggregateBytes };
}

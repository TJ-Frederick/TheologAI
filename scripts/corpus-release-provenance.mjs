/** The existing production artifact selector uses this exact corpus producer predicate. */
export function trustedCorpusPreviewRun(artifact, run, jobs, pull, repository, now = Date.now()) {
    const deploymentJobs = jobs.filter(job => job.name === 'Deploy Preview');
    return pull.head?.repo?.full_name === repository && pull.base?.ref === 'main' &&
        artifact.name === `preview-release-audit-${pull.number}-${pull.head.sha}` && !artifact.expired &&
        artifact.workflow_run?.id === run.id && artifact.workflow_run?.head_sha === pull.head.sha &&
        run.event === 'pull_request' && run.status === 'completed' && run.conclusion === 'success' &&
        run.head_sha === pull.head.sha && run.head_repository?.full_name === repository &&
        String(run.path).split('@')[0] === '.github/workflows/pr.yml' &&
        run.pull_requests?.some(pr => pr.number === pull.number) &&
        deploymentJobs.length === 1 && deploymentJobs[0].conclusion === 'success' &&
        Number.isFinite(Date.parse(artifact.created_at)) && Date.parse(artifact.created_at) >= Date.parse(run.run_started_at) &&
        Date.parse(artifact.created_at) <= now + 30000 && now - Date.parse(artifact.created_at) <= 7 * 24 * 60 * 60 * 1000;
}

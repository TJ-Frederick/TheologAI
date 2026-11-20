// Recheck the current PR immediately before protected access or mutation.
module.exports = async function requirePreviewAuthorization({github, context}) {
  const { data: pr } = await github.rest.pulls.get({
    ...context.repo, pull_number: context.issue.number,
  });
  const initial = context.payload.pull_request;
  if (!initial || pr.state !== 'open' || pr.draft ||
      pr.base.ref !== 'main' || pr.base.sha !== initial.base.sha ||
      pr.head.repo?.full_name !== `${context.repo.owner}/${context.repo.repo}` ||
      pr.head.sha !== initial.head.sha ||
      !pr.labels.some(label => label.name === 'deploy-preview')) {
    throw new Error('Preview authorization was revoked or the candidate changed');
  }
};

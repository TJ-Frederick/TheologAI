#!/usr/bin/env bash
# Control-plane checks around a single, no-bundle mutation. Keep raw Wrangler
# output outside the uploaded evidence directory.
set -euo pipefail

phase="${1:?phase required}"
role="${2:?role required}"
mode="${3:?release mode required}"
case "$role" in
  preview) other=production; domain=preview-mcp.theologai.xyz; role_flags=(--env preview) ;;
  production) other=preview; domain=mcp.theologai.xyz; role_flags=(--env=) ;;
  *) exit 2 ;;
esac
case "$mode" in application|corpus) ;; *) exit 2 ;; esac

work="${RUNNER_TEMP:?}/release-control"
evidence="$RUNNER_TEMP/release-evidence"
anchor="$evidence/$role-worker-predecessor-anchor.json"
cutover="$evidence/$role-worker-candidate-cutover.json"
pre_audit="$evidence/$role-worker-deployment-pre-audit-identity.json"
config="$RUNNER_TEMP/corpus-wrangler.toml"
baseline="$RUNNER_TEMP/production-baseline.json"
refuse() {
  printf 'Release stopped in %s: %s\n' "$phase" "$1" >&2
  exit 1
}
wrangler() {
  npx --no-install wrangler "$@" --config "$config" --env-file /dev/null
}
reconcile() {
  local target="$1"
  shift
  npx --no-install tsx "scripts/$target-release-reconciliation.ts" "$@"
}
sample() {
  local target="$1" stage="$2" active
  local flags=(--env=)
  if [[ "$target" == preview ]]; then flags=(--env preview); fi
  wrangler deployments list "${flags[@]}" --json > "$work/$target-$stage-deployments.json"
  active="$(reconcile "$target" active-version-id --deployments "$work/$target-$stage-deployments.json")"
  wrangler versions view "$active" "${flags[@]}" --json > "$work/$target-$stage-version.json"
}
control() {
  local stage="$1" command=capture-control
  local prior=()
  if [[ "$stage" != predecessor ]]; then
    command=verify-control
    prior=(--control "$evidence/$other-control-predecessor.json")
  fi
  sample "$other" "$stage"
  reconcile "$other" "$command" ${prior[@]+"${prior[@]}"} \
    --deployments "$work/$other-$stage-deployments.json" \
    --active-version-view "$work/$other-$stage-version.json" \
    --wrangler-config "$config" --d1-inventory "$work/inventory.json" \
    --output "$evidence/$other-control-$stage.json"
}
observe() {
  local stage="$1" command="$2" output="$3"
  sample "$role" "$stage"
  reconcile "$role" "$command" --predecessor-anchor "$anchor" \
    --deployments "$work/$role-$stage-deployments.json" \
    --observed-active-version-view "$work/$role-$stage-version.json" \
    --wrangler-config "$config" --output "$output"
}
deployment_identity() {
  npx --no-install tsx "scripts/verify-$role-worker-deployment.ts" "$@"
}
require_production_baseline() {
  local observed="$anchor"
  if [[ "$role" == preview ]]; then observed="$evidence/production-control-predecessor.json"; fi
  jq -e --slurpfile record "$baseline" --slurpfile inventory "$work/inventory.json" '
    $record[0].productionAssignment as $expected |
    $record[0].targets.production == {databaseId: $expected.databaseId, databaseName: $expected.databaseName} and
    (.predecessorD1.databaseId // .d1.databaseId) == $expected.databaseId and
    any($inventory[0][]; .uuid == $expected.databaseId and .name == $expected.databaseName)
  ' "$observed" >/dev/null || refuse 'active production D1 differs from the accepted baseline'
  jq -e --slurpfile record "$baseline" '
    $record[0].productionAssignment as $expected |
    (.predecessorVersionId // .workerVersionId) == $expected.versionId and
    (.predecessorDeploymentId // .deploymentId) == $expected.deploymentId
  ' "$observed" >/dev/null || refuse 'active production Worker version or deployment differs from the accepted baseline'
  if jq -e '.requireVersionTag == true' "$baseline" >/dev/null; then
    jq -e --slurpfile record "$baseline" '
      .annotations["workers/tag"] == $record[0].productionSource
    ' "$work/production-predecessor-version.json" >/dev/null ||
      refuse 'active production Worker does not have the accepted source tag'
  else
    jq -e --slurpfile release release/serving.json --slurpfile record "$baseline" '
      $release[0].predecessors.production as $expected |
      $record[0].requireVersionTag == false and $record[0].productionSource == $release[0].productionSource and
      $record[0].productionAssignment == {
        versionId: $expected.versionId, deploymentId: $expected.deploymentId,
        databaseId: $expected.databaseId, databaseName: $expected.databaseName
      }
    ' "$observed" >/dev/null || refuse 'active production differs from the reviewed initial baseline'
  fi
}
require_corpus_authority() {
  local authority="$RUNNER_TEMP/operator-authorization.json"
  env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID node - "$authority" "$role" <<'NODE'
const fs = require('node:fs');
const {requirePackage} = require('./.github/scripts/operator-authorization.cjs');
const packagePath = process.argv[2];
requirePackage(JSON.parse(fs.readFileSync(packagePath, 'utf8')), {
  role: process.argv[3], targetRunId: process.env.GITHUB_RUN_ID, targetRunAttempt: 1,
  sourcePlanSha256: process.env.CORPUS_PLAN_SHA256,
});
NODE
  jq -e --arg role "$role" --arg other "$other" \
    --slurpfile own "$anchor" --slurpfile peer "$evidence/$other-control-predecessor.json" '
    .authorization as $approved |
    $approved.databaseId == $own[0].candidateD1.databaseId and
    $approved.assignments[$role] == {
      databaseId: $own[0].predecessorD1.databaseId,
      versionId: $own[0].predecessorVersionId,
      deploymentId: $own[0].predecessorDeploymentId
    } and
    $approved.assignments[$other] == {
      databaseId: $peer[0].d1.databaseId,
      versionId: $peer[0].workerVersionId,
      deploymentId: $peer[0].deploymentId
    }
  ' "$authority" > /dev/null || refuse 'live assignments or target differ from owner approval'
}

case "$phase" in
  preflight)
    mkdir -p "$work" "$evidence"
    # Changes to the public route or workers.dev exposure require a separate operation.
    jq -e --arg domain "$domain" '
      .routes == [{pattern: $domain, custom_domain: true}] and .workers_dev == true
    ' "$RUNNER_TEMP/worker-release.json" > /dev/null || refuse 'public route change requires separate approval'
    wrangler d1 list --json > "$work/inventory.json"
    sample "$role" predecessor
    reconcile "$role" capture-predecessor \
      --deployments "$work/$role-predecessor-deployments.json" \
      --predecessor-version-view "$work/$role-predecessor-version.json" \
      --wrangler-config "$config" --d1-inventory "$work/inventory.json" --output "$anchor"
    control predecessor
    require_production_baseline

    # A routine release must preserve the databases that are already serving.
    if [[ "$mode" == application ]]; then
      jq -e '.d1Changed == false' "$anchor" > /dev/null || refuse 'routine release would change the active D1 binding'
    else
      require_corpus_authority
    fi
    if [[ "$role" == production ]]; then
      jq -e --slurpfile receipt "$RUNNER_TEMP/verified-preview.json" '
        .d1.databaseId == $receipt[0].databaseId and
        .workerVersionId == $receipt[0].versionId and
        .deploymentId == $receipt[0].deploymentId
      ' "$evidence/preview-control-predecessor.json" > /dev/null || refuse 'the accepted preview assignment changed'
    fi
    # The exact upload configuration must select the previously checked target.
    jq -e --arg role "$role" --arg entry "$RUNNER_TEMP/worker-bundle/worker.js" \
      --slurpfile serving release/serving.json --slurpfile anchor "$anchor" '
      $serving[0].targets[$role] as $target |
      .main == $entry and .no_bundle == true and .find_additional_modules == false and
      .name == $anchor[0].worker and (.d1_databases | length == 1) and
      .d1_databases[0].binding == "THEOLOGAI_DB" and
      .d1_databases[0].database_name == $anchor[0].candidateD1.databaseName and .d1_databases[0].database_name == $target.databaseName and
      .d1_databases[0].database_id == $anchor[0].candidateD1.databaseId and .d1_databases[0].database_id == $target.databaseId
    ' "$RUNNER_TEMP/worker-release.json" > /dev/null || refuse 'upload settings differ from the reviewed Worker or D1 target'
    shasum -a 256 "$RUNNER_TEMP/worker-release.json" "$config" "$baseline" > "$work/config-digests.txt"
    wrangler versions list "${role_flags[@]}" --json > "$work/$role-versions-before.json"
    jq -r '"\n### Matched rollback pair\nWorker version `\(.predecessorVersionId)`, deployment `\(.predecessorDeploymentId)`, D1 `\(.predecessorD1.databaseId)`. Candidate D1 `\(.candidateD1.databaseId)`."' "$anchor" >> "$GITHUB_STEP_SUMMARY"
    ;;
  deploy)
    shasum -a 256 --check "$work/config-digests.txt" >/dev/null || refuse 'release configuration changed after preflight'
    env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID node scripts/worker-release-artifact.mjs \
      verify "$role" "$RUNNER_TEMP/worker-bundle" "$WORKER_SHA256"
    # A changed assignment needs reconciliation before another mutation.
    wrangler deployments list "${role_flags[@]}" --json > "$work/$role-deploy-boundary.json"
    cmp -s "$work/$role-predecessor-deployments.json" "$work/$role-deploy-boundary.json" ||
      refuse 'serving assignment changed after preflight'
    local_flags=(--env=)
    if [[ "$other" == preview ]]; then local_flags=(--env preview); fi
    wrangler deployments list "${local_flags[@]}" --json > "$work/$other-deploy-boundary.json"
    cmp -s "$work/$other-predecessor-deployments.json" "$work/$other-deploy-boundary.json" ||
      refuse 'other environment changed after preflight'
    if [[ "$mode" == corpus ]]; then
      require_corpus_authority
      jq -e --arg role "$role" --arg plan "$CORPUS_PLAN_SHA256" --slurpfile own "$anchor" '
        .role == $role and .databaseId == $own[0].candidateD1.databaseId and
        .databaseName == $own[0].candidateD1.databaseName and .sourcePlanSha256 == $plan and
        .controlsUnchanged == true
      ' "$evidence/corpus-readiness.json" > /dev/null || refuse 'complete readiness evidence no longer matches the approved target'
    fi
    test ! -e "$work/mutation-started" || refuse 'mutating request was already attempted'
    # Preserve the existing secret bindings without reading or rotating values.
    printf '{}\n' > "$work/preserve-secrets.json"
    tag=()
    if [[ "$role" == production ]]; then tag=(--tag "$(git rev-parse HEAD)"); fi
    touch "$work/mutation-started"
    npx --no-install wrangler deploy --config "$RUNNER_TEMP/worker-release.json" \
      --no-bundle --env-file /dev/null --secrets-file "$work/preserve-secrets.json" ${tag[@]+"${tag[@]}"} |
      tee "$work/deploy-output.txt"
    ;;
  confirm)
    observe cutover reconcile-post-mutation "$cutover"
    wrangler versions list "${role_flags[@]}" --json > "$work/$role-versions-after.json"
    deployment_identity verify-deploy \
      --before-versions "$work/$role-versions-before.json" \
      --after-versions "$work/$role-versions-after.json" \
      --after-deployments "$work/$role-cutover-deployments.json" \
      --command-output "$work/deploy-output.txt" --output "$pre_audit" --github-output "$work/deploy.outputs"
    control cutover
    ;;
  audit-corpus)
    [[ "$mode" == corpus ]] || exit 2
    test -f "$pre_audit" || refuse 'the verified cutover identity is required'
    npx --no-install tsx scripts/norton-aquinas-live.ts "$role" \
      "$RUNNER_TEMP/corpus-source" "$CORPUS_PLAN_SHA256" \
      "$RUNNER_TEMP/operator-corpus-challenge.json" "$evidence/corpus-readiness.json" \
      "$cutover" "$evidence"
    ;;
  finish)
    observe final reconcile-post-mutation "$evidence/$role-final-routing.json"
    deployment_identity verify-audit-stability --pre-audit-identity "$pre_audit" \
      --post-audit-deployments "$work/$role-final-deployments.json" \
      --output "$evidence/$role-worker-deployment-identity.json" --github-output "$work/finish.outputs"
    control final
    jq -r '"\n### Verified serving assignment\nWorker version `\(.observedActiveVersionId)`, deployment `\(.observedActiveDeploymentId)`, D1 `\(.observedActiveD1.databaseId)`."' \
      "$evidence/$role-final-routing.json" >> "$GITHUB_STEP_SUMMARY"
    ;;
  reconcile)
    if [[ -f "$work/mutation-started" ]]; then
      observe stop observe-post-mutation "$evidence/$role-post-mutation-observation.json"
      echo "Release stopped after a mutation request. Review the routing observation and matched predecessor before another attempt." >> "$GITHUB_STEP_SUMMARY"
    fi
    ;;
  record)
    [[ "$role" == production ]] || exit 2
    source="$(git rev-parse HEAD)"
    jq -e --arg source "$source" '.annotations["workers/tag"] == $source' \
      "$work/production-final-version.json" >/dev/null || refuse 'accepted active Worker lacks the exact source tag'
    jq --arg source "$source" --arg tree "$(git rev-parse HEAD^{tree})" '
      {productionSource: $source, sourceTree: $tree, versionId: .observedActiveVersionId,
       deploymentId: .observedActiveDeploymentId, databaseId: .observedActiveD1.databaseId,
       databaseName: .candidateD1.databaseName}
    ' "$evidence/production-final-routing.json" > "$evidence/accepted-production.json"
    ;;
  *) exit 2 ;;
esac

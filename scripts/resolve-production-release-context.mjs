const SHA = /^[0-9a-f]{40}$/;
const MAIN_REF = 'refs/heads/main';

function requireSha(value, name) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new Error(`${name} must be a lowercase 40-character commit SHA`);
  }
  return value;
}

/**
 * Selects only the workflow context used as a production-release comparison
 * baseline. Git reachability and object validation remain workflow guards.
 */
export function resolveProductionReleaseContext(input) {
  const keys = ['eventName', 'ref', 'pushBefore', 'firstParent'];
  if (
    typeof input !== 'object' || input === null || Array.isArray(input) ||
    Object.keys(input).length !== keys.length ||
    keys.some(key => !Object.hasOwn(input, key))
  ) {
    throw new Error('production release context input must contain exactly eventName, ref, pushBefore, and firstParent');
  }
  const { eventName, ref, pushBefore, firstParent } = input;
  if (eventName === 'workflow_dispatch') {
    if (ref !== MAIN_REF) {
      throw new Error('workflow_dispatch is restricted to refs/heads/main');
    }
    return Object.freeze({
      before: requireSha(firstParent, 'firstParent'),
      mode: 'manual',
      forceDeploy: true,
      customDomainRequired: true,
      reason: 'manual-main-dispatch',
    });
  }

  if (eventName === 'push') {
    if (ref !== MAIN_REF) {
      throw new Error('push is restricted to refs/heads/main');
    }
    return Object.freeze({
      before: requireSha(pushBefore, 'pushBefore'),
      mode: 'push',
      forceDeploy: false,
      customDomainRequired: false,
      reason: 'push-before',
    });
  }

  throw new Error(`unsupported production release event: ${String(eventName)}`);
}

const CLI_ENV = [
  'PRODUCTION_RELEASE_EVENT_NAME',
  'PRODUCTION_RELEASE_REF',
  'PRODUCTION_RELEASE_PUSH_BEFORE',
  'PRODUCTION_RELEASE_FIRST_PARENT',
];

function readCliInput(environment) {
  return Object.fromEntries(CLI_ENV.map(name => [name, environment[name]]));
}

function resolveManualWorkflowContext(environment) {
  if (environment.PRODUCTION_RELEASE_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('manual production workflow requires workflow_dispatch');
  }
  return {
    context: resolveProductionReleaseContext({
      eventName: environment.PRODUCTION_RELEASE_EVENT_NAME,
      ref: environment.PRODUCTION_RELEASE_REF,
      pushBefore: '',
      firstParent: environment.PRODUCTION_RELEASE_FIRST_PARENT,
    }),
    head: requireSha(environment.PRODUCTION_RELEASE_HEAD, 'head'),
  };
}

function manualContextOutput(context) {
  const values = {
    release_context_json: JSON.stringify(context),
    before: context.before,
    custom_domain_required: String(context.customDomainRequired),
  };
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
}

function manualClassificationOutput(environment) {
  const { context, head } = resolveManualWorkflowContext(environment);
  const values = {
    classification_succeeded: 'true',
    deploy_required: 'true',
    decision: 'deploy',
    reason: context.reason,
    base: context.before,
    head,
    changed_path_evidence_json: '[]',
  };
  return `${manualContextOutput(context)}${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv.length === 2) {
      const input = readCliInput(process.env);
      const resolved = resolveProductionReleaseContext({
        eventName: input.PRODUCTION_RELEASE_EVENT_NAME,
        ref: input.PRODUCTION_RELEASE_REF,
        pushBefore: input.PRODUCTION_RELEASE_PUSH_BEFORE,
        firstParent: input.PRODUCTION_RELEASE_FIRST_PARENT,
      });
      process.stdout.write(`${JSON.stringify(resolved)}\n`);
    } else if (process.argv.length === 3 && process.argv[2] === 'manual-context-output') {
      process.stdout.write(manualContextOutput(resolveManualWorkflowContext(process.env).context));
    } else if (process.argv.length === 3 && process.argv[2] === 'manual-classification-output') {
      process.stdout.write(manualClassificationOutput(process.env));
    } else {
      throw new Error('invalid-command');
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

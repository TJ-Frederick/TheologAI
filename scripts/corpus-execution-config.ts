/** Render an operation-local full config using the desired target for this role. */
import {parse,stringify} from 'smol-toml';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {POLICY, type Role} from './application-release-policy.mjs';

type DatabaseTarget = {databaseId: string; databaseName: string};

export function corpusExecutionConfig(original: string, role: Role, root: string, baseline?: DatabaseTarget): string {
  const config = parse(original) as any;
  if (config.name !== 'theologai' || config.d1_databases?.length !== 1 ||
      config.env?.preview?.name !== 'theologai-preview' || config.env.preview.d1_databases?.length !== 1) {
    throw Error('Corpus config refused: exact Worker and binding scope');
  }
  const bindings = {production:config.d1_databases[0], preview:config.env.preview.d1_databases[0]};
  const {targets, predecessors} = POLICY.serving(root);
  for (const binding of Object.values(bindings)) {
    if (binding.binding !== 'THEOLOGAI_DB' || !POLICY.uuid.test(binding.database_id)) {
      throw Error('Corpus config refused: exact database binding');
    }
    if (binding.migrations_dir) binding.migrations_dir = resolve(root, binding.migrations_dir);
  }
  const production = role === 'production' ? targets.production : baseline ?? predecessors.production;
  if (!POLICY.uuid.test(production.databaseId) || !/^[a-z0-9_-]{1,80}$/.test(production.databaseName)) {
    throw Error('Release config refused: invalid production baseline binding');
  }
  Object.assign(bindings.preview, {database_id:targets.preview.databaseId, database_name:targets.preview.databaseName});
  Object.assign(bindings.production, {database_id:production.databaseId, database_name:production.databaseName});
  config.main = resolve(root, config.main);
  return stringify(config);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [role, output, baselinePath, ...extra] = process.argv.slice(2);
  if ((role !== 'preview' && role !== 'production') || !output || extra.length) {
    throw Error('Usage: corpus-execution-config.ts preview|production OUTPUT [BASELINE]');
  }
  const baseline = baselinePath ? JSON.parse(readFileSync(baselinePath, 'utf8')).targets.production : undefined;
  writeFileSync(output,corpusExecutionConfig(readFileSync('wrangler.toml','utf8'),role,process.cwd(),baseline),{flag:'wx',mode:0o600});
}

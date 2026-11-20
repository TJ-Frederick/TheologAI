// Account-wide safeguards and checked-in target declarations. Limits grant no authority.
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const account = '0594ed1e4c9fe35ab7d9f47991e99f3e';
const policy = 'corpus.v1';
const hardReadCap = 3_800_000;
const accountReadCeiling = 4_600_000;
const uncertaintyMargin = 200_000;
const controlReads = 10_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const roles = ['preview', 'production'];
function serving(root = join(__dirname, '../..')) {
  const value = JSON.parse(readFileSync(join(root, 'release/serving.json'), 'utf8'));
  const validTarget = v => v && uuid.test(v.databaseId) && /^[a-z0-9_-]{1,80}$/.test(v.databaseName);
  if (!/^[0-9a-f]{40}$/.test(value.productionSource) || !roles.every(role =>
    validTarget(value.targets?.[role]) && validTarget(value.predecessors?.[role]) &&
    uuid.test(value.predecessors[role].deploymentId) && uuid.test(value.predecessors[role].versionId)
  ) || value.targets.preview.databaseId === value.targets.production.databaseId) {
    throw Error('Corpus policy refused: exact reviewed target and predecessor declarations');
  }
  return value;
}
module.exports = {account, policy, hardReadCap, accountReadCeiling, uncertaintyMargin, controlReads, serving, uuid};

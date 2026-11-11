// Fixed release scope. Proposal only: constants grant no operation or allowance.
const policy=({
  "policy": "norton-aquinas.v1",
  productionReleasePR: 177,
  productMerge: "959d6535f3ffb87a00633b208e2ca10d5090fe5f",
  "baseline": "328168d5b817e9eaa0e702de382adc2c46c858ef",
  "account": "0594ed1e4c9fe35ab7d9f47991e99f3e",
  "corpus": "ef42dfff4fda29d708f2bd340bbd4463ab4a128408651cea887a97bc28199bb1",
  "schema": "0010_active_aquinas_hierarchy_publication",
  "reservedReads": 3560000,
  "hardReadCap": 3560000,
  "liveReads": 90000,
  "controlReads": 10000,
  liveControlReserve(role) {
    if (role === 'production') return 500000;
    if (role === 'preview') return this.liveReads + this.controlReads;
    throw new Error('Unknown corpus release role');
  },
  // Sole serving assignments at the end of the accepted 6c43cbc preview.
  predecessors: Object.freeze({
    preview: Object.freeze({deploymentId: '62da1803-b313-4dc7-94bf-80d3394957b1', versionId: '8fb1be2c-72f7-4a4e-bbd6-117adfc30410'}),
    production: Object.freeze({deploymentId: 'f6c9a995-0940-4758-a9a9-14f1389a9ab3', versionId: 'd2e2bd87-1213-4ba5-891d-e0f9b3293cb9'}),
  }),
  "targets": {
    "preview": {
      "databaseName": "theologai-preview-20260728-transform11-a",
      "databaseId": "62b871a6-5b4d-4d9b-8f52-301f6c878f48"
    },
    "production": {
      "databaseName": "theologai-preview-20260811-schema0009-a",
      "databaseId": "74f456e2-6951-4003-bb6f-91951342bf8f"
    }
  },
  "rollback": {
    "databaseName": "theologai-production-20260811-schema0009-a",
    "databaseId": "9bc79346-338b-439e-a2a5-424f4418eb21"
  }
});
for(const target of Object.values(policy.targets))Object.freeze(target);
Object.freeze(policy.targets);Object.freeze(policy.rollback);module.exports=Object.freeze(policy);

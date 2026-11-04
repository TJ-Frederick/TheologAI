// Fixed release scope. Proposal only: constants grant no operation or allowance.
const policy=({
  "policy": "norton-aquinas.v1",
  "baseline": "328168d5b817e9eaa0e702de382adc2c46c858ef",
  "account": "0594ed1e4c9fe35ab7d9f47991e99f3e",
  "corpus": "ef42dfff4fda29d708f2bd340bbd4463ab4a128408651cea887a97bc28199bb1",
  "schema": "0010_active_aquinas_hierarchy_publication",
  "reservedReads": 3560000,
  "hardReadCap": 3560000,
  "liveReads": 90000,
  "controlReads": 10000,
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

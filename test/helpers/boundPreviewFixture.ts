/** Fixed dated identities for synthetic local tests; grants no remote authority. */
export const boundPreview = {
  mode: 'already-bound-preview.v1' as const,
  databaseId: '62b871a6-5b4d-4d9b-8f52-301f6c878f48',
  previewDeploymentId: 'aad541f2-7102-41ee-8da1-d8efce7fcf97',
  previewVersionId: 'eb16fe17-764d-4ccc-8a95-a2098470372c',
  productionDatabaseId: '9bc79346-338b-439e-a2a5-424f4418eb21',
  productionDeploymentId: 'f6c9a995-0940-4758-a9a9-14f1389a9ab3',
  productionVersionId: 'd2e2bd87-1213-4ba5-891d-e0f9b3293cb9',
};
export const cumulativeTask = {
  previousReadsHeld: 4200000, previousDiagnosticWritesActual: 7, previousDiagnosticWritesHeld: 8,
  newProofReads: 3560000, newLiveReads: 90000, newControlReads: 10000, newDiagnosticWritesHeld: 4,
  totalReadsHeld: 7860000, uncertaintyMargin: 200000, cumulativeReadCeiling: 8060000, totalDiagnosticWritesHeld: 12,
};

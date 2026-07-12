export interface LocalDocumentResource {
  documentId: string;
  sectionId?: string;
}

const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SECTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function buildLocalDocumentResourceUri(documentId: string, sectionId?: string): string | undefined {
  if (!DOCUMENT_ID.test(documentId) || documentId === '.' || documentId === '..'
    || (sectionId !== undefined && (!SECTION_ID.test(sectionId) || sectionId === '.' || sectionId === '..'))) return undefined;
  const document = encodeURIComponent(documentId);
  return sectionId === undefined
    ? `theologai://documents/${document}`
    : `theologai://documents/${document}#section-${encodeURIComponent(sectionId)}`;
}

/** Parse only canonical whole-document and exact-section resource URIs. */
export function parseLocalDocumentResourceUri(uri: string): LocalDocumentResource | undefined {
  if (typeof uri !== 'string' || uri.length > 384) return undefined;
  const match = /^theologai:\/\/documents\/([^/#?]+)(?:#section-([^#?]+))?$/.exec(uri);
  if (!match) return undefined;
  let documentId: string;
  let sectionId: string | undefined;
  try {
    documentId = decodeURIComponent(match[1]);
    sectionId = match[2] === undefined ? undefined : decodeURIComponent(match[2]);
  } catch {
    return undefined;
  }
  const canonical = buildLocalDocumentResourceUri(documentId, sectionId);
  if (canonical !== uri) return undefined;
  return { documentId, ...(sectionId === undefined ? {} : { sectionId }) };
}

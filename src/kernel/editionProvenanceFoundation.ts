import { sha256Hex } from './sha256.js';

/**
 * Inactive foundation for a future, rights-reviewed local corpus pipeline.
 *
 * This module is deliberately not exported from the kernel barrel or wired to
 * any service. A historical work and a particular edition/transcription are
 * different records: the age or rights status of the former never authorizes
 * redistribution of the latter.
 */

export const EDITION_PROVENANCE_LIMITS = Object.freeze({
  creators: 32,
  contributorsPerRole: 32,
  sections: 2_000,
  sectionUtf8Bytes: 131_072,
  /** Provisional per-package release bound, not a universal maximum edition size. */
  packageContentUtf8Bytes: 4_194_304,
  /** Provisional per-package release bound; larger works require reviewed volume splitting or a new contract. */
  compiledPackageUtf8Bytes: 4_718_592,
  sourceArtifactBytes: 67_108_864,
  shortTextCharacters: 512,
  longTextCharacters: 4_096,
} as const);

/**
 * The only invisible format characters retained in corpus bodies. ZWNJ and
 * ZWJ are required for faithful joining behavior in some scripts; metadata
 * identifiers and labels permit no Cf characters.
 */
export const EDITION_PROVENANCE_ALLOWED_CONTENT_FORMAT_CHARACTERS = Object.freeze([
  '\u200c', // ZERO WIDTH NON-JOINER
  '\u200d', // ZERO WIDTH JOINER
] as const);

export type WorkCreatorRole =
  | 'author'
  | 'issuing_body'
  | 'drafting_body'
  | 'revising_body'
  | 'compiler';

export type WorkCreatorMetadataStatus = 'reviewed' | 'anonymous' | 'collective' | 'unknown';

export interface WorkCreator {
  name: string;
  role: WorkCreatorRole;
}

export interface HistoricalWorkIdentity {
  workId: string;
  title: string;
  /** Collective may be empty/incomplete; populated records use body roles only. */
  creatorMetadataStatus: WorkCreatorMetadataStatus;
  creators: WorkCreator[];
}

export interface ImmutableSourceArtifact {
  locator: string;
  pin: {
    kind: 'sha256' | 'git_commit';
    value: string;
  };
  sha256: string;
  bytes: number;
  acquiredAt: string;
}

export type RightsStatus = 'public_domain' | 'open_license' | 'documented_permission';

interface RightsEvidenceInstrumentCommon {
  instrumentId: string;
  label: string;
  url: string;
}

export type RightsEvidenceInstrument =
  | (RightsEvidenceInstrumentCommon & { kind: 'public_domain_statement' })
  | (RightsEvidenceInstrumentCommon & { kind: 'license' })
  | (RightsEvidenceInstrumentCommon & { kind: 'permission_record' });

interface UnderlyingWorkRightsCommon {
  basis: string;
  jurisdiction: string;
  reviewedAt: string;
}

export type UnderlyingWorkRights = UnderlyingWorkRightsCommon & (
  | { status: 'public_domain'; evidenceInstrument: Extract<RightsEvidenceInstrument, { kind: 'public_domain_statement' }> }
  | { status: 'open_license'; evidenceInstrument: Extract<RightsEvidenceInstrument, { kind: 'license' }> }
  | { status: 'documented_permission'; evidenceInstrument: Extract<RightsEvidenceInstrument, { kind: 'permission_record' }> }
);

export type ArtifactRightsInstrument = RightsEvidenceInstrument;

export type AttributionRequirement =
  | 'license_required'
  | 'permission_required'
  | 'project_policy'
  | 'none';

interface ExactArtifactRightsCommon {
  basis: string;
  /** Legal jurisdiction used for the exact artifact rights determination. */
  jurisdiction: string;
  /** Territory in which redistribution is approved (for example, worldwide). */
  territorialScope: string;
  attributionNotice: string;
  attributionRequirement: AttributionRequirement;
  shareAlike: 'required' | 'not_required';
  modifications: 'permitted' | 'prohibited' | 'permission_required';
  modificationTerms: string;
  /** Required per edition; a familiar license label never substitutes for this approval. */
  redistributionApproved: true;
  /** UTC calendar date on which redistribution was approved; date-only and inclusive. */
  redistributionApprovedAsOf: string;
  reviewedAt: string;
}

export type ExactArtifactRights = ExactArtifactRightsCommon & (
  | {
    status: 'public_domain';
    rightsInstrument: Extract<ArtifactRightsInstrument, { kind: 'public_domain_statement' }>;
    attributionRequirement: 'project_policy' | 'none';
    shareAlike: 'not_required';
    modifications: 'permitted';
  }
  | {
    status: 'open_license';
    rightsInstrument: Extract<ArtifactRightsInstrument, { kind: 'license' }>;
    attributionRequirement: 'license_required' | 'project_policy' | 'none';
  }
  | {
    status: 'documented_permission';
    rightsInstrument: Extract<ArtifactRightsInstrument, { kind: 'permission_record' }>;
    attributionRequirement: 'permission_required' | 'project_policy' | 'none';
    permissionTerms: {
      /** Uses actually authorized by the documented permission. */
      scope: string;
      expiry:
        | { status: 'does_not_expire'; expiresOn: null }
        /** Release readiness must also compare this date with the deployment date. */
        | { status: 'expires_on'; expiresOn: string };
    };
  }
);

export type EditionContributorMetadataStatus =
  | 'reviewed'
  | 'none'
  | 'anonymous'
  | 'collective'
  | 'unknown';

export type EditionContributorRole =
  | 'translator'
  | 'translation_body'
  | 'editor'
  | 'editorial_body'
  | 'reviser'
  | 'revision_body';

export interface EditionContributor {
  name: string;
  role: EditionContributorRole;
}

export interface EditionContributorGroup {
  /** Anonymous/unknown/none stay empty; collective may be empty or name only a role-specific body. */
  metadataStatus: EditionContributorMetadataStatus;
  contributors: EditionContributor[];
}

export interface EditionContributorGroups {
  translation: EditionContributorGroup;
  editing: EditionContributorGroup;
  revision: EditionContributorGroup;
}

export interface EditionProvenanceReview {
  status: 'verified' | 'verified_with_uncertainty';
  uncertainty: string | null;
  reviewedAt: string;
}

export interface EditionTranscriptionIdentity {
  editionId: string;
  workId: string;
  language: string;
  contributorGroups: EditionContributorGroups;
  publication: string;
  version: string;
  source: ImmutableSourceArtifact;
  underlyingWorkRights: UnderlyingWorkRights;
  exactArtifactRights: ExactArtifactRights;
  provenance: EditionProvenanceReview;
}

export interface FrozenEditionSection {
  /** Reviewed, one-based source reading order; section keys are not sortable citations. */
  sourceOrdinal: number;
  sectionKey: string;
  displayLabel: string;
  heading: string;
  /**
   * Stored plain text. Any future Markdown renderer MUST pass this exact value
   * through escapeEditionPlainTextForMarkdown; validation does not interpret
   * Markdown-looking source prose as executable syntax.
   */
  content: string;
}

export interface EditionCompilationPackage {
  schemaVersion: 'edition-provenance-foundation.v1';
  sectionKeyPolicy: 'frozen_reviewed_v1';
  /** Corpus bodies are plain text; future Markdown presentation requires the exported escaping boundary. */
  contentFormat: 'plain_text';
  work: HistoricalWorkIdentity;
  edition: EditionTranscriptionIdentity;
  sections: FrozenEditionSection[];
}

export interface CompiledEditionPackage {
  package: EditionCompilationPackage;
  canonicalJson: string;
  utf8: Uint8Array;
  sha256: string;
}

export class EditionProvenanceValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'EditionProvenanceValidationError';
  }
}

/** Strictly validate unknown input and return a normalized, detached value. */
export function validateEditionCompilationPackage(input: unknown): EditionCompilationPackage {
  const root = objectAt(input, '$', ['schemaVersion', 'sectionKeyPolicy', 'contentFormat', 'work', 'edition', 'sections']);
  literalAt(root.schemaVersion, '$.schemaVersion', 'edition-provenance-foundation.v1');
  literalAt(root.sectionKeyPolicy, '$.sectionKeyPolicy', 'frozen_reviewed_v1');
  literalAt(root.contentFormat, '$.contentFormat', 'plain_text');

  const work = validateWork(root.work);
  const edition = validateEdition(root.edition);
  if (edition.workId !== work.workId) {
    fail('$.edition.workId', 'must exactly match $.work.workId');
  }
  const sections = arrayAt(root.sections, '$.sections', 1, EDITION_PROVENANCE_LIMITS.sections)
    .map((section, index) => validateSection(section, `$.sections[${index}]`));
  const sectionKeys = new Set<string>();
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    if (section.sourceOrdinal !== index + 1) {
      fail(`$.sections[${index}].sourceOrdinal`, `must preserve contiguous one-based source order; expected ${index + 1}`);
    }
    if (sectionKeys.has(section.sectionKey)) fail('$.sections', `contains duplicate frozen section key ${section.sectionKey}`);
    sectionKeys.add(section.sectionKey);
  }
  const totalContentBytes = sections.reduce(
    (total, section) => total + utf8Length(section.content),
    0,
  );
  if (totalContentBytes > EDITION_PROVENANCE_LIMITS.packageContentUtf8Bytes) {
    fail('$.sections', `content exceeds provisional package bound of ${EDITION_PROVENANCE_LIMITS.packageContentUtf8Bytes} UTF-8 bytes`);
  }
  return {
    schemaVersion: 'edition-provenance-foundation.v1',
    sectionKeyPolicy: 'frozen_reviewed_v1',
    contentFormat: 'plain_text',
    work,
    edition,
    sections,
  };
}

/**
 * Pure deterministic compiler boundary. It performs no I/O and no registration.
 * Equivalent Unicode input produces the same canonical UTF-8 package identity.
 */
export function compileEditionPackage(input: unknown): CompiledEditionPackage {
  const packageValue = validateEditionCompilationPackage(input);
  const canonicalJson = canonicalStringify(packageValue);
  const utf8 = new TextEncoder().encode(canonicalJson);
  if (utf8.byteLength > EDITION_PROVENANCE_LIMITS.compiledPackageUtf8Bytes) {
    fail('$', `compiled package exceeds provisional package bound of ${EDITION_PROVENANCE_LIMITS.compiledPackageUtf8Bytes} UTF-8 bytes`);
  }
  return {
    package: packageValue,
    canonicalJson,
    utf8,
    sha256: sha256Hex(canonicalJson),
  };
}

function validateWork(input: unknown): HistoricalWorkIdentity {
  const record = objectAt(input, '$.work', ['workId', 'title', 'creatorMetadataStatus', 'creators']);
  const creatorMetadataStatus = enumAt(
    record.creatorMetadataStatus,
    '$.work.creatorMetadataStatus',
    ['reviewed', 'anonymous', 'collective', 'unknown'] as const,
  );
  const creators = arrayAt(record.creators, '$.work.creators', 0, EDITION_PROVENANCE_LIMITS.creators)
    .map((creator, index) => {
      const path = `$.work.creators[${index}]`;
      const value = objectAt(creator, path, ['name', 'role']);
      return {
        name: safeTextAt(value.name, `${path}.name`, EDITION_PROVENANCE_LIMITS.shortTextCharacters),
        role: enumAt(
          value.role,
          `${path}.role`,
          ['author', 'issuing_body', 'drafting_body', 'revising_body', 'compiler'] as const,
        ),
      };
    })
    .sort((left, right) => compareCanonical(`${left.role}\u0000${left.name}`, `${right.role}\u0000${right.name}`));
  const identities = new Set(creators.map(creator => `${creator.role}\u0000${creator.name}`));
  if (identities.size !== creators.length) fail('$.work.creators', 'contains duplicate creator identities');
  if ((creatorMetadataStatus === 'anonymous' || creatorMetadataStatus === 'unknown') && creators.length !== 0) {
    fail('$.work.creators', `${creatorMetadataStatus} creator metadata must not invent creator records`);
  }
  if (creatorMetadataStatus === 'reviewed' && creators.length === 0) {
    fail('$.work.creators', 'reviewed creator metadata must include its reviewed creator records');
  }
  const collectiveBodyRoles = new Set<WorkCreatorRole>(['issuing_body', 'drafting_body', 'revising_body']);
  if (creatorMetadataStatus === 'collective' && creators.some(creator => !collectiveBodyRoles.has(creator.role))) {
    fail('$.work.creators', 'collective creator metadata must use issuing_body, drafting_body, or revising_body');
  }
  return {
    workId: idAt(record.workId, '$.work.workId'),
    title: safeTextAt(record.title, '$.work.title', EDITION_PROVENANCE_LIMITS.shortTextCharacters),
    creatorMetadataStatus,
    creators,
  };
}

function validateEdition(input: unknown): EditionTranscriptionIdentity {
  const path = '$.edition';
  const record = objectAt(input, path, [
    'editionId', 'workId', 'language', 'contributorGroups', 'publication', 'version',
    'source', 'underlyingWorkRights', 'exactArtifactRights', 'provenance',
  ]);
  return {
    editionId: idAt(record.editionId, `${path}.editionId`),
    workId: idAt(record.workId, `${path}.workId`),
    language: languageAt(record.language, `${path}.language`),
    contributorGroups: validateContributorGroups(record.contributorGroups),
    publication: safeTextAt(record.publication, `${path}.publication`, EDITION_PROVENANCE_LIMITS.longTextCharacters),
    version: safeTextAt(record.version, `${path}.version`, EDITION_PROVENANCE_LIMITS.shortTextCharacters),
    source: validateSource(record.source),
    underlyingWorkRights: validateUnderlyingWorkRights(record.underlyingWorkRights),
    exactArtifactRights: validateExactArtifactRights(record.exactArtifactRights),
    provenance: validateProvenance(record.provenance),
  };
}

function validateSource(input: unknown): ImmutableSourceArtifact {
  const path = '$.edition.source';
  const record = objectAt(input, path, ['locator', 'pin', 'sha256', 'bytes', 'acquiredAt']);
  const pin = objectAt(record.pin, `${path}.pin`, ['kind', 'value']);
  const kind = enumAt(pin.kind, `${path}.pin.kind`, ['sha256', 'git_commit'] as const);
  const sha256 = sha256At(record.sha256, `${path}.sha256`);
  const pinValue = stringAt(pin.value, `${path}.pin.value`);
  if (kind === 'sha256' && pinValue !== sha256) fail(`${path}.pin.value`, 'sha256 pin must equal the source artifact hash');
  if (kind === 'git_commit' && !/^[0-9a-f]{40}$/.test(pinValue)) {
    fail(`${path}.pin.value`, 'git_commit pin must be a lowercase 40-character commit identity');
  }
  return {
    locator: immutableLocatorAt(record.locator, `${path}.locator`),
    pin: { kind, value: pinValue },
    sha256,
    bytes: integerAt(record.bytes, `${path}.bytes`, 1, EDITION_PROVENANCE_LIMITS.sourceArtifactBytes),
    acquiredAt: instantAt(record.acquiredAt, `${path}.acquiredAt`),
  };
}

function validateUnderlyingWorkRights(input: unknown): UnderlyingWorkRights {
  const path = '$.edition.underlyingWorkRights';
  const record = objectAt(input, path, ['status', 'basis', 'jurisdiction', 'evidenceInstrument', 'reviewedAt']);
  const status = rightsStatusAt(record.status, `${path}.status`);
  const evidenceInstrument = validateRightsInstrument(
    record.evidenceInstrument,
    `${path}.evidenceInstrument`,
    status,
  );
  return {
    status,
    basis: safeTextAt(record.basis, `${path}.basis`, EDITION_PROVENANCE_LIMITS.longTextCharacters),
    jurisdiction: safeTextAt(record.jurisdiction, `${path}.jurisdiction`, EDITION_PROVENANCE_LIMITS.shortTextCharacters),
    evidenceInstrument,
    reviewedAt: dateAt(record.reviewedAt, `${path}.reviewedAt`),
  } as UnderlyingWorkRights;
}

function validateRightsInstrument(
  input: unknown,
  path: string,
  status: RightsStatus,
): RightsEvidenceInstrument {
  const instrument = objectAt(input, path, ['instrumentId', 'kind', 'label', 'url']);
  const kind = enumAt(
    instrument.kind,
    `${path}.kind`,
    ['public_domain_statement', 'license', 'permission_record'] as const,
  );
  const expected = {
    public_domain: 'public_domain_statement',
    open_license: 'license',
    documented_permission: 'permission_record',
  } as const;
  if (kind !== expected[status]) fail(`${path}.kind`, `must be ${expected[status]} when status is ${status}`);
  return {
    kind,
    instrumentId: idAt(instrument.instrumentId, `${path}.instrumentId`),
    label: safeTextAt(instrument.label, `${path}.label`, EDITION_PROVENANCE_LIMITS.shortTextCharacters),
    url: httpsUrlAt(instrument.url, `${path}.url`),
  } as RightsEvidenceInstrument;
}

function validateExactArtifactRights(input: unknown): ExactArtifactRights {
  const path = '$.edition.exactArtifactRights';
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail(path, 'must be an object');
  const status = rightsStatusAt((input as Record<string, unknown>).status, `${path}.status`);
  const commonKeys = [
    'status', 'basis', 'jurisdiction', 'territorialScope', 'rightsInstrument', 'attributionNotice',
    'attributionRequirement', 'shareAlike', 'modifications', 'modificationTerms',
    'redistributionApproved', 'redistributionApprovedAsOf', 'reviewedAt',
  ];
  const record = objectAt(input, path, status === 'documented_permission'
    ? [...commonKeys, 'permissionTerms']
    : commonKeys);
  if (record.redistributionApproved !== true) {
    fail(`${path}.redistributionApproved`, 'must be explicitly true for this exact edition/transcription');
  }
  const rightsInstrument = validateRightsInstrument(record.rightsInstrument, `${path}.rightsInstrument`, status);
  const attributionRequirement = enumAt(
    record.attributionRequirement,
    `${path}.attributionRequirement`,
    ['license_required', 'permission_required', 'project_policy', 'none'] as const,
  );
  const shareAlike = enumAt(record.shareAlike, `${path}.shareAlike`, ['required', 'not_required'] as const);
  const modifications = enumAt(
    record.modifications,
    `${path}.modifications`,
    ['permitted', 'prohibited', 'permission_required'] as const,
  );
  if (status === 'public_domain') {
    if (!['project_policy', 'none'].includes(attributionRequirement)) {
      fail(`${path}.attributionRequirement`, 'public-domain artifacts cannot claim a legal attribution requirement');
    }
    if (shareAlike !== 'not_required') fail(`${path}.shareAlike`, 'public-domain artifacts cannot require ShareAlike');
    if (modifications !== 'permitted') fail(`${path}.modifications`, 'public-domain artifacts cannot prohibit or condition modifications');
  } else if (status === 'open_license' && attributionRequirement === 'permission_required') {
    fail(`${path}.attributionRequirement`, 'open-license attribution cannot be permission-required');
  } else if (status === 'documented_permission' && attributionRequirement === 'license_required') {
    fail(`${path}.attributionRequirement`, 'documented-permission attribution cannot be license-required');
  }
  const reviewedAt = dateAt(record.reviewedAt, `${path}.reviewedAt`);
  const redistributionApprovedAsOf = dateAt(
    record.redistributionApprovedAsOf,
    `${path}.redistributionApprovedAsOf`,
  );
  if (redistributionApprovedAsOf < reviewedAt) {
    fail(`${path}.redistributionApprovedAsOf`, 'must be on or after the rights review date');
  }
  const permissionTerms = status === 'documented_permission'
    ? validatePermissionTerms(
      record.permissionTerms,
      `${path}.permissionTerms`,
      redistributionApprovedAsOf,
    )
    : undefined;
  return {
    status,
    basis: safeTextAt(record.basis, `${path}.basis`, EDITION_PROVENANCE_LIMITS.longTextCharacters),
    jurisdiction: safeTextAt(record.jurisdiction, `${path}.jurisdiction`, EDITION_PROVENANCE_LIMITS.shortTextCharacters),
    territorialScope: safeTextAt(
      record.territorialScope,
      `${path}.territorialScope`,
      EDITION_PROVENANCE_LIMITS.shortTextCharacters,
    ),
    rightsInstrument,
    attributionNotice: safeTextAt(record.attributionNotice, `${path}.attributionNotice`, EDITION_PROVENANCE_LIMITS.longTextCharacters),
    attributionRequirement,
    shareAlike,
    modifications,
    modificationTerms: safeTextAt(
      record.modificationTerms,
      `${path}.modificationTerms`,
      EDITION_PROVENANCE_LIMITS.longTextCharacters,
    ),
    redistributionApproved: true,
    redistributionApprovedAsOf,
    reviewedAt,
    ...(permissionTerms === undefined ? {} : { permissionTerms }),
  } as ExactArtifactRights;
}

function validatePermissionTerms(
  input: unknown,
  path: string,
  redistributionApprovedAsOf: string,
): Extract<ExactArtifactRights, { status: 'documented_permission' }>['permissionTerms'] {
  const record = objectAt(input, path, ['scope', 'expiry']);
  const expiryPath = `${path}.expiry`;
  if (record.expiry === null || typeof record.expiry !== 'object' || Array.isArray(record.expiry)) {
    fail(expiryPath, 'must be an object');
  }
  const expiryStatus = enumAt(
    (record.expiry as Record<string, unknown>).status,
    `${expiryPath}.status`,
    ['does_not_expire', 'expires_on'] as const,
  );
  const expiry = objectAt(record.expiry, expiryPath, ['status', 'expiresOn']);
  if (expiryStatus === 'does_not_expire') {
    if (expiry.expiresOn !== null) fail(`${expiryPath}.expiresOn`, 'must be null when permission does not expire');
    return {
      scope: safeTextAt(record.scope, `${path}.scope`, EDITION_PROVENANCE_LIMITS.longTextCharacters),
      expiry: { status: 'does_not_expire', expiresOn: null },
    };
  }
  const expiresOn = dateAt(expiry.expiresOn, `${expiryPath}.expiresOn`);
  // Date-only permission is valid through the entire expiresOn UTC calendar
  // date, hence equality with the approval-as-of date remains valid.
  if (expiresOn < redistributionApprovedAsOf) {
    fail(`${expiryPath}.expiresOn`, 'permission was expired before the inclusive redistribution approval date');
  }
  return {
    scope: safeTextAt(record.scope, `${path}.scope`, EDITION_PROVENANCE_LIMITS.longTextCharacters),
    expiry: { status: 'expires_on', expiresOn },
  };
}

function validateProvenance(input: unknown): EditionProvenanceReview {
  const path = '$.edition.provenance';
  const record = objectAt(input, path, ['status', 'uncertainty', 'reviewedAt']);
  const status = enumAt(record.status, `${path}.status`, ['verified', 'verified_with_uncertainty'] as const);
  const uncertainty = record.uncertainty === null
    ? null
    : safeTextAt(record.uncertainty, `${path}.uncertainty`, EDITION_PROVENANCE_LIMITS.longTextCharacters);
  if (status === 'verified' && uncertainty !== null) fail(`${path}.uncertainty`, 'must be null when status is verified');
  if (status === 'verified_with_uncertainty' && uncertainty === null) {
    fail(`${path}.uncertainty`, 'must explain the remaining provenance uncertainty');
  }
  return { status, uncertainty, reviewedAt: dateAt(record.reviewedAt, `${path}.reviewedAt`) };
}

function validateSection(input: unknown, path: string): FrozenEditionSection {
  const record = objectAt(input, path, ['sourceOrdinal', 'sectionKey', 'displayLabel', 'heading', 'content']);
  const content = safeTextAt(record.content, `${path}.content`, Number.MAX_SAFE_INTEGER, true, true);
  if (utf8Length(content) > EDITION_PROVENANCE_LIMITS.sectionUtf8Bytes) {
    fail(`${path}.content`, `exceeds ${EDITION_PROVENANCE_LIMITS.sectionUtf8Bytes} UTF-8 bytes`);
  }
  return {
    sourceOrdinal: integerAt(record.sourceOrdinal, `${path}.sourceOrdinal`, 1, EDITION_PROVENANCE_LIMITS.sections),
    sectionKey: idAt(record.sectionKey, `${path}.sectionKey`),
    displayLabel: safeTextAt(record.displayLabel, `${path}.displayLabel`, EDITION_PROVENANCE_LIMITS.shortTextCharacters),
    heading: safeTextAt(record.heading, `${path}.heading`, EDITION_PROVENANCE_LIMITS.shortTextCharacters),
    content,
  };
}

/**
 * Sole presentation-security boundary for emitting edition plain text inside
 * future CommonMark/GFM. It escapes every ASCII punctuation character, which
 * includes all link, image, autolink, HTML, entity, and destination delimiters.
 * Future Markdown renderers MUST call this function. This foundation is
 * inactive; active formatters are intentionally unchanged.
 */
export function escapeEditionPlainTextForMarkdown(content: string): string {
  const value = safeTextAt(content, '$.content', Number.MAX_SAFE_INTEGER, true, true);
  return value.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '\\$&');
}

function validateContributorGroups(input: unknown): EditionContributorGroups {
  const path = '$.edition.contributorGroups';
  const record = objectAt(input, path, ['translation', 'editing', 'revision']);
  return {
    translation: validateContributorGroup(record.translation, `${path}.translation`, 'translator', 'translation_body'),
    editing: validateContributorGroup(record.editing, `${path}.editing`, 'editor', 'editorial_body'),
    revision: validateContributorGroup(record.revision, `${path}.revision`, 'reviser', 'revision_body'),
  };
}

function validateContributorGroup(
  input: unknown,
  path: string,
  individualRole: Extract<EditionContributorRole, 'translator' | 'editor' | 'reviser'>,
  bodyRole: Extract<EditionContributorRole, 'translation_body' | 'editorial_body' | 'revision_body'>,
): EditionContributorGroup {
  const record = objectAt(input, path, ['metadataStatus', 'contributors']);
  const metadataStatus = enumAt(
    record.metadataStatus,
    `${path}.metadataStatus`,
    ['reviewed', 'none', 'anonymous', 'collective', 'unknown'] as const,
  );
  const contributors = arrayAt(record.contributors, `${path}.contributors`, 0, EDITION_PROVENANCE_LIMITS.contributorsPerRole)
    .map((raw, index) => {
      const contributorPath = `${path}.contributors[${index}]`;
      const contributor = objectAt(raw, contributorPath, ['name', 'role']);
      return {
        name: safeTextAt(contributor.name, `${contributorPath}.name`, EDITION_PROVENANCE_LIMITS.shortTextCharacters),
        role: enumAt(contributor.role, `${contributorPath}.role`, [individualRole, bodyRole] as const),
      };
    })
    .sort((left, right) => compareCanonical(`${left.role}\u0000${left.name}`, `${right.role}\u0000${right.name}`));
  if (new Set(contributors.map(value => `${value.role}\u0000${value.name}`)).size !== contributors.length) {
    fail(`${path}.contributors`, 'contains duplicate contributor identities');
  }
  if (['none', 'anonymous', 'unknown'].includes(metadataStatus) && contributors.length !== 0) {
    fail(`${path}.contributors`, `${metadataStatus} contributor metadata must not invent contributor records`);
  }
  if (metadataStatus === 'reviewed' && (contributors.length === 0 || contributors.some(value => value.role !== individualRole))) {
    fail(`${path}.contributors`, `reviewed contributor metadata requires one or more ${individualRole} records`);
  }
  if (metadataStatus === 'collective' && contributors.some(value => value.role !== bodyRole)) {
    fail(`${path}.contributors`, `collective contributor metadata must use ${bodyRole}`);
  }
  return { metadataStatus, contributors };
}

function objectAt(input: unknown, path: string, expectedKeys: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail(path, 'must be an object');
  const record = input as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort(compareCanonical);
  const enumerableSymbols = Object.getOwnPropertySymbols(record)
    .filter(symbol => Object.prototype.propertyIsEnumerable.call(record, symbol));
  const requiredKeys = [...expectedKeys].sort(compareCanonical);
  if (enumerableSymbols.length !== 0 || JSON.stringify(actualKeys) !== JSON.stringify(requiredKeys)) {
    fail(path, `must contain exactly: ${requiredKeys.join(', ')}`);
  }
  return record;
}

function arrayAt(input: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(input) || input.length < minimum || input.length > maximum) {
    fail(path, `must contain between ${minimum} and ${maximum} items`);
  }
  const expectedKeys = Array.from({ length: input.length }, (_, index) => String(index));
  const enumerableKeys = Object.keys(input);
  const enumerableSymbols = Object.getOwnPropertySymbols(input)
    .filter(symbol => Object.prototype.propertyIsEnumerable.call(input, symbol));
  if (enumerableSymbols.length !== 0
    || enumerableKeys.length !== expectedKeys.length
    || enumerableKeys.some((key, index) => key !== expectedKeys[index])) {
    fail(path, 'must be a dense array with only canonical index properties');
  }
  // Never invoke a caller-controlled Array subclass method. Read each trusted,
  // validated index exactly once into a fresh built-in Array before callers
  // perform map, sort, reduce, or canonical serialization.
  const detached = new Array<unknown>(input.length);
  for (let index = 0; index < input.length; index++) detached[index] = input[index];
  return detached;
}

function stringAt(input: unknown, path: string): string {
  if (typeof input !== 'string') fail(path, 'must be a string');
  return input;
}

function safeTextAt(
  input: unknown,
  path: string,
  maxCharacters: number,
  allowLineBreaks = false,
  allowPlainTextSyntax = false,
): string {
  const raw = stringAt(input, path);
  if (hasLoneSurrogate(raw)) fail(path, 'contains a lone UTF-16 surrogate');
  const value = raw.normalize('NFC');
  if (!value || value !== value.trim() || [...value].length > maxCharacters) {
    fail(path, `must be non-empty, trimmed, and at most ${maxCharacters} Unicode characters`);
  }
  const forbiddenControls = allowLineBreaks
    ? /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u
    : /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
  if (forbiddenControls.test(value)) fail(path, 'contains forbidden control or bidirectional-control characters');
  if (/[\p{Zl}\p{Zp}]/u.test(value)) {
    fail(path, 'contains a Unicode line or paragraph separator; use an explicit line feed in corpus text');
  }
  const allowedFormatCharacters = allowLineBreaks
    ? new Set<string>(EDITION_PROVENANCE_ALLOWED_CONTENT_FORMAT_CHARACTERS)
    : new Set<string>();
  if ([...value].some(character => /\p{Cf}/u.test(character) && !allowedFormatCharacters.has(character))) {
    fail(path, allowLineBreaks
      ? 'contains an unapproved invisible format character; corpus text permits only ZWNJ and ZWJ'
      : 'contains an invisible format character; single-line metadata permits none');
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) >= 0xfffe) {
      fail(path, 'contains a forbidden Unicode noncharacter');
    }
  }
  if (!allowPlainTextSyntax
    && /<\/?[A-Za-z][^>]*>|<!DOCTYPE|<!--|<\?xml|javascript\s*:|\bon[A-Za-z]+\s*=/iu.test(value)) {
    fail(path, 'contains markup or executable-content syntax');
  }
  return value;
}

function idAt(input: unknown, path: string): string {
  const value = stringAt(input, path);
  if (!/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value) || value.length > 128) {
    fail(path, 'must be a canonical lowercase identifier of at most 128 characters');
  }
  return value;
}

function languageAt(input: unknown, path: string): string {
  const value = stringAt(input, path);
  if (!/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?$/.test(value)) {
    fail(path, 'must be a canonical bounded BCP 47 language tag');
  }
  return value;
}

function sha256At(input: unknown, path: string): string {
  const value = stringAt(input, path);
  if (!/^[0-9a-f]{64}$/.test(value)) fail(path, 'must be a lowercase SHA-256');
  return value;
}

function immutableLocatorAt(input: unknown, path: string): string {
  const value = httpsUrlAt(input, path);
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    fail(path, 'must not contain credentials, a query, or a fragment');
  }
  return url.toString();
}

function httpsUrlAt(input: unknown, path: string): string {
  const value = safeTextAt(input, path, EDITION_PROVENANCE_LIMITS.longTextCharacters);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(path, 'must be an absolute HTTPS URL');
  }
  if (url.protocol !== 'https:' || !url.hostname) fail(path, 'must be an absolute HTTPS URL');
  if (url.username || url.password) fail(path, 'must not contain credentials');
  return url.toString();
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index++;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function integerAt(input: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(input) || (input as number) < minimum || (input as number) > maximum) {
    fail(path, `must be a safe integer between ${minimum} and ${maximum}`);
  }
  return input as number;
}

function rightsStatusAt(input: unknown, path: string): RightsStatus {
  return enumAt(input, path, ['public_domain', 'open_license', 'documented_permission'] as const);
}

function enumAt<const T extends readonly string[]>(input: unknown, path: string, allowed: T): T[number] {
  if (typeof input !== 'string' || !allowed.includes(input)) fail(path, `must be one of: ${allowed.join(', ')}`);
  return input as T[number];
}

function literalAt<const T extends string>(input: unknown, path: string, expected: T): asserts input is T {
  if (input !== expected) fail(path, `must equal ${expected}`);
}

function dateAt(input: unknown, path: string): string {
  const value = stringAt(input, path);
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(timestamp)
    || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    fail(path, 'must be an ISO calendar date');
  }
  return value;
}

function instantAt(input: unknown, path: string): string {
  const value = stringAt(input, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value.replace('Z', '.000Z')) {
    fail(path, 'must be a canonical UTC instant with whole seconds');
  }
  return value;
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort(compareCanonical)
      .map(key => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Canonical edition package cannot encode undefined');
  return encoded;
}

function compareCanonical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function fail(path: string, message: string): never {
  throw new EditionProvenanceValidationError(path, message);
}

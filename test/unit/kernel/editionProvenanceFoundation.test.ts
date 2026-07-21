import { describe, expect, it } from 'vitest';
import {
  EDITION_PROVENANCE_LIMITS,
  EDITION_PROVENANCE_ALLOWED_CONTENT_FORMAT_CHARACTERS,
  EditionProvenanceValidationError,
  compileEditionPackage,
  escapeEditionPlainTextForMarkdown,
  validateEditionCompilationPackage,
} from '../../../src/kernel/editionProvenanceFoundation.js';
import { inventedEditionPackageFixture } from '../../fixtures/editionProvenanceFoundation.js';

describe('inactive edition provenance foundation', () => {
  it('keeps work identity separate from the exact edition/transcription rights review', () => {
    const value = validateEditionCompilationPackage(inventedEditionPackageFixture());

    expect(value.work).toMatchObject({ workId: 'invented-clockwork-treatise' });
    expect(value.edition).toMatchObject({
      editionId: 'invented-clockwork-treatise-synthetic-edition',
      workId: 'invented-clockwork-treatise',
      underlyingWorkRights: {
        status: 'public_domain',
        evidenceInstrument: { kind: 'public_domain_statement' },
      },
      exactArtifactRights: {
        status: 'open_license',
        jurisdiction: 'Synthetic test jurisdiction',
        territorialScope: 'Worldwide synthetic test territory',
        redistributionApproved: true,
        redistributionApprovedAsOf: '2026-07-17',
        shareAlike: 'required',
        modifications: 'permitted',
        modificationTerms: 'Synthetic modifications must retain the synthetic fixture notice.',
      },
      provenance: { status: 'verified_with_uncertainty' },
    });
  });

  it('normalizes NFC and emits canonical order and byte-identical output without mutating input', () => {
    const firstInput = inventedEditionPackageFixture();
    const original = structuredClone(firstInput);
    const secondInput = inventedEditionPackageFixture();
    const first = compileEditionPackage(firstInput);
    const second = compileEditionPackage(secondInput);

    expect(firstInput).toEqual(original);
    expect(first.package.sections.map(section => [section.sourceOrdinal, section.sectionKey])).toEqual([
      [1, 'z-first-motion'],
      [2, 'a-second-motion'],
    ]);
    expect(first.package.work.creators.map(creator => creator.name)).toEqual(['Synthetic Alpha', 'Synthetic Beta']);
    expect(first.package.edition.contributorGroups.translation.contributors.map(value => value.name))
      .toEqual(['Synthetic Translator A', 'Synthetic Translator B']);
    expect(first.package.sections[0]!.content).toContain('Café');
    expect(first.canonicalJson).toBe(second.canonicalJson);
    expect(JSON.parse(first.canonicalJson)).toEqual(first.package);
    expect([...first.utf8]).toEqual([...second.utf8]);
    expect(first.sha256).toBe('3f2e5f53b9e678f63de8c0bdcb8a7e9c009d57a931b92d9eb506fcfcc8c79f61');
    expect(first.sha256).toBe(second.sha256);
  });

  it('is strict about unknown, missing, and mismatched fields', () => {
    const extra = inventedEditionPackageFixture();
    (extra.work as Record<string, unknown>).unreviewedAlias = 'no';
    expectValidationError(extra, '$.work', 'must contain exactly');

    const missing = inventedEditionPackageFixture();
    delete (missing.edition as Record<string, unknown>).publication;
    expectValidationError(missing, '$.edition', 'must contain exactly');

    const mismatch = inventedEditionPackageFixture();
    (mismatch.edition as Record<string, unknown>).workId = 'different-invented-work';
    expectValidationError(mismatch, '$.edition.workId', 'must exactly match');
  });

  it('rejects sparse arrays and enumerable non-index properties before canonical mapping', () => {
    for (const mutate of [
      (fixture: Record<string, unknown>) => {
        delete ((fixture.work as Record<string, unknown>).creators as unknown[])[0];
      },
      (fixture: Record<string, unknown>) => {
        const contributors = contributorGroups(fixture).translation.contributors as unknown[];
        delete contributors[0];
      },
      (fixture: Record<string, unknown>) => {
        delete (fixture.sections as unknown[])[0];
      },
    ]) {
      const sparse = inventedEditionPackageFixture();
      mutate(sparse);
      expect(() => compileEditionPackage(sparse)).toThrow(/dense array/);
    }

    for (const select of [
      (fixture: Record<string, unknown>) => (fixture.work as Record<string, unknown>).creators as unknown[],
      (fixture: Record<string, unknown>) => contributorGroups(fixture).translation.contributors as unknown[],
      (fixture: Record<string, unknown>) => fixture.sections as unknown[],
    ]) {
      const decorated = inventedEditionPackageFixture();
      Object.defineProperty(select(decorated), 'hiddenPayload', { value: 'not canonicalized', enumerable: true });
      expect(() => compileEditionPackage(decorated)).toThrow(/dense array/);
    }

    const symbolDecorated = inventedEditionPackageFixture();
    Object.defineProperty(symbolDecorated.sections as unknown[], Symbol('payload'), {
      value: 'not canonicalized', enumerable: true,
    });
    expect(() => compileEditionPackage(symbolDecorated)).toThrow(/dense array/);
  });

  it('detaches Array subclasses before map, sort, reduce, or canonical operations', () => {
    class HostileArray<T> extends Array<T> {
      override map(): never { throw new Error('caller-controlled map invoked'); }
      override sort(): this { throw new Error('caller-controlled sort invoked'); }
      override reduce(): never { throw new Error('caller-controlled reduce invoked'); }
      override [Symbol.iterator](): ArrayIterator<T> { throw new Error('caller-controlled iterator invoked'); }
    }
    const fixture = inventedEditionPackageFixture();
    const creators = (fixture.work as Record<string, unknown>).creators as unknown[];
    (fixture.work as Record<string, unknown>).creators = new HostileArray(...creators);
    const contributors = contributorGroups(fixture).translation.contributors as unknown[];
    contributorGroups(fixture).translation.contributors = new HostileArray(...contributors);
    const sections = fixture.sections as unknown[];
    fixture.sections = new HostileArray(...sections);

    expect(() => compileEditionPackage(fixture)).not.toThrow();
  });

  it('rejects enumerable symbol keys on exact objects at root and nested boundaries', () => {
    for (const select of [
      (fixture: Record<string, unknown>) => fixture,
      (fixture: Record<string, unknown>) => fixture.edition as Record<string, unknown>,
      (fixture: Record<string, unknown>) => exactRights(fixture).rightsInstrument as Record<string, unknown>,
      (fixture: Record<string, unknown>) => (fixture.sections as Record<string, unknown>[])[0]!,
    ]) {
      const fixture = inventedEditionPackageFixture();
      Object.defineProperty(select(fixture), Symbol('hidden'), { value: 'not canonicalized', enumerable: true });
      expect(() => compileEditionPackage(fixture)).toThrow(/must contain exactly/);
    }
  });

  it('represents anonymous and unknown creators honestly using the existing role vocabulary', () => {
    const anonymous = inventedEditionPackageFixture();
    const work = anonymous.work as Record<string, unknown>;
    work.creatorMetadataStatus = 'anonymous';
    work.creators = [];
    expect(validateEditionCompilationPackage(anonymous).work).toMatchObject({
      creatorMetadataStatus: 'anonymous',
      creators: [],
    });

    const inventedCreator = inventedEditionPackageFixture();
    (inventedCreator.work as Record<string, unknown>).creatorMetadataStatus = 'unknown';
    expectValidationError(inventedCreator, '$.work.creators', 'must not invent');

    const collective = inventedEditionPackageFixture();
    (collective.work as Record<string, unknown>).creatorMetadataStatus = 'collective';
    (collective.work as Record<string, unknown>).creators = [
      { name: 'Synthetic Council', role: 'issuing_body' },
    ];
    expect(validateEditionCompilationPackage(collective).work.creators[0]!.role).toBe('issuing_body');

    const collectiveAuthor = inventedEditionPackageFixture();
    (collectiveAuthor.work as Record<string, unknown>).creatorMetadataStatus = 'collective';
    expectValidationError(collectiveAuthor, '$.work.creators', 'issuing_body');

    const collectiveCompiler = inventedEditionPackageFixture();
    (collectiveCompiler.work as Record<string, unknown>).creatorMetadataStatus = 'collective';
    (collectiveCompiler.work as Record<string, unknown>).creators = [
      { name: 'Synthetic Compiler', role: 'compiler' },
    ];
    expectValidationError(collectiveCompiler, '$.work.creators', 'issuing_body');

    const incompleteCollective = inventedEditionPackageFixture();
    (incompleteCollective.work as Record<string, unknown>).creatorMetadataStatus = 'collective';
    (incompleteCollective.work as Record<string, unknown>).creators = [];
    expect(validateEditionCompilationPackage(incompleteCollective).work).toMatchObject({
      creatorMetadataStatus: 'collective',
      creators: [],
    });

    const reviewedWithoutCreator = inventedEditionPackageFixture();
    (reviewedWithoutCreator.work as Record<string, unknown>).creators = [];
    expectValidationError(reviewedWithoutCreator, '$.work.creators', 'reviewed creator records');
  });

  it('fails closed when exact artifact rights are absent, incomplete, or unapproved', () => {
    const absent = inventedEditionPackageFixture();
    delete (absent.edition as Record<string, unknown>).exactArtifactRights;
    expectValidationError(absent, '$.edition', 'must contain exactly');

    const licenseOnly = inventedEditionPackageFixture();
    const rights = exactRights(licenseOnly);
    rights.redistributionApproved = false;
    expectValidationError(licenseOnly, '$.edition.exactArtifactRights.redistributionApproved', 'explicitly true');

    const missingApprovalDate = inventedEditionPackageFixture();
    delete exactRights(missingApprovalDate).redistributionApprovedAsOf;
    expectValidationError(missingApprovalDate, '$.edition.exactArtifactRights', 'must contain exactly');

    const approvalBeforeReview = inventedEditionPackageFixture();
    exactRights(approvalBeforeReview).redistributionApprovedAsOf = '2025-12-31';
    expectValidationError(
      approvalBeforeReview,
      '$.edition.exactArtifactRights.redistributionApprovedAsOf',
      'on or after',
    );

    const noBasis = inventedEditionPackageFixture();
    exactRights(noBasis).basis = '';
    expectValidationError(noBasis, '$.edition.exactArtifactRights.basis', 'non-empty');

    const noJurisdiction = inventedEditionPackageFixture();
    delete exactRights(noJurisdiction).jurisdiction;
    expectValidationError(noJurisdiction, '$.edition.exactArtifactRights', 'must contain exactly');

    const noTerritory = inventedEditionPackageFixture();
    exactRights(noTerritory).territorialScope = '';
    expectValidationError(noTerritory, '$.edition.exactArtifactRights.territorialScope', 'non-empty');

    const noLicenseTerms = inventedEditionPackageFixture();
    delete (exactRights(noLicenseTerms).rightsInstrument as Record<string, unknown>).url;
    expectValidationError(noLicenseTerms, '$.edition.exactArtifactRights.rightsInstrument', 'must contain exactly');

    const noAttribution = inventedEditionPackageFixture();
    exactRights(noAttribution).attributionNotice = '';
    expectValidationError(noAttribution, '$.edition.exactArtifactRights.attributionNotice', 'non-empty');

    const mislabeledPublicDomain = inventedEditionPackageFixture();
    exactRights(mislabeledPublicDomain).status = 'public_domain';
    expectValidationError(
      mislabeledPublicDomain,
      '$.edition.exactArtifactRights.rightsInstrument.kind',
      'public_domain_statement',
    );
  });

  it('requires explicit documented-permission scope and unambiguous expiry semantics', () => {
    const valid = documentedPermissionExactArtifactFixture();
    expect(validateEditionCompilationPackage(valid).edition.exactArtifactRights).toMatchObject({
      status: 'documented_permission',
      permissionTerms: {
        scope: 'Synthetic permission to redistribute and display this exact fixture through TheologAI.',
        expiry: { status: 'expires_on', expiresOn: '2027-01-02' },
      },
      redistributionApprovedAsOf: '2026-07-17',
    });

    const missingScope = documentedPermissionExactArtifactFixture();
    delete (exactRights(missingScope).permissionTerms as Record<string, unknown>).scope;
    expectValidationError(missingScope, '$.edition.exactArtifactRights.permissionTerms', 'must contain exactly');

    const ambiguousExpiry = documentedPermissionExactArtifactFixture();
    (exactRights(ambiguousExpiry).permissionTerms as Record<string, unknown>).expiry = {
      status: 'does_not_expire', expiresOn: '2027-01-02',
    };
    expectValidationError(
      ambiguousExpiry,
      '$.edition.exactArtifactRights.permissionTerms.expiry.expiresOn',
      'must be null',
    );

    const expiredAtApproval = documentedPermissionExactArtifactFixture();
    (exactRights(expiredAtApproval).permissionTerms as Record<string, any>).expiry.expiresOn = '2026-07-16';
    expectValidationError(
      expiredAtApproval,
      '$.edition.exactArtifactRights.permissionTerms.expiry.expiresOn',
      'expired before',
    );

    const expiresOnApprovalDate = documentedPermissionExactArtifactFixture();
    (exactRights(expiresOnApprovalDate).permissionTerms as Record<string, any>).expiry.expiresOn = '2026-07-17';
    expect(validateEditionCompilationPackage(expiresOnApprovalDate).edition.exactArtifactRights)
      .toMatchObject({ permissionTerms: { expiry: { status: 'expires_on', expiresOn: '2026-07-17' } } });

    const permissionFieldsOnLicense = inventedEditionPackageFixture();
    exactRights(permissionFieldsOnLicense).permissionTerms = {
      scope: 'Synthetic', expiry: { status: 'does_not_expire', expiresOn: null },
    };
    expectValidationError(permissionFieldsOnLicense, '$.edition.exactArtifactRights', 'must contain exactly');
  });

  it('requires status-matched evidence for underlying-work rights', () => {
    const missing = inventedEditionPackageFixture();
    delete underlyingRights(missing).evidenceInstrument;
    expectValidationError(missing, '$.edition.underlyingWorkRights', 'must contain exactly');

    const mismatched = inventedEditionPackageFixture();
    underlyingRights(mismatched).status = 'open_license';
    expectValidationError(
      mismatched,
      '$.edition.underlyingWorkRights.evidenceInstrument.kind',
      'must be license',
    );

    const missingIdentity = inventedEditionPackageFixture();
    delete (underlyingRights(missingIdentity).evidenceInstrument as Record<string, unknown>).instrumentId;
    expectValidationError(
      missingIdentity,
      '$.edition.underlyingWorkRights.evidenceInstrument',
      'must contain exactly',
    );
  });

  it('prevents public-domain records from inventing binding attribution, ShareAlike, or modification restrictions', () => {
    const valid = publicDomainExactArtifactFixture();
    expect(validateEditionCompilationPackage(valid).edition.exactArtifactRights).toMatchObject({
      status: 'public_domain',
      attributionRequirement: 'project_policy',
      shareAlike: 'not_required',
      modifications: 'permitted',
    });

    const legalAttribution = publicDomainExactArtifactFixture();
    exactRights(legalAttribution).attributionRequirement = 'license_required';
    expectValidationError(legalAttribution, '$.edition.exactArtifactRights.attributionRequirement', 'cannot claim a legal');

    const shareAlike = publicDomainExactArtifactFixture();
    exactRights(shareAlike).shareAlike = 'required';
    expectValidationError(shareAlike, '$.edition.exactArtifactRights.shareAlike', 'cannot require ShareAlike');

    const prohibited = publicDomainExactArtifactFixture();
    exactRights(prohibited).modifications = 'prohibited';
    expectValidationError(prohibited, '$.edition.exactArtifactRights.modifications', 'cannot prohibit');

    const openPermissionAttribution = inventedEditionPackageFixture();
    exactRights(openPermissionAttribution).attributionRequirement = 'permission_required';
    expectValidationError(
      openPermissionAttribution,
      '$.edition.exactArtifactRights.attributionRequirement',
      'open-license attribution',
    );

    const invalidInstrumentIdentity = inventedEditionPackageFixture();
    (exactRights(invalidInstrumentIdentity).rightsInstrument as Record<string, unknown>).instrumentId = 'Not Canonical';
    expectValidationError(
      invalidInstrumentIdentity,
      '$.edition.exactArtifactRights.rightsInstrument.instrumentId',
      'canonical lowercase identifier',
    );
  });

  it('models translator, editor, and reviser metadata without invented contributors', () => {
    const fixture = inventedEditionPackageFixture();
    const groups = contributorGroups(fixture);
    groups.translation = { metadataStatus: 'anonymous', contributors: [] };
    groups.editing = { metadataStatus: 'unknown', contributors: [] };
    groups.revision = { metadataStatus: 'collective', contributors: [] };
    expect(validateEditionCompilationPackage(fixture).edition.contributorGroups).toMatchObject({
      translation: { metadataStatus: 'anonymous', contributors: [] },
      editing: { metadataStatus: 'unknown', contributors: [] },
      revision: { metadataStatus: 'collective', contributors: [] },
    });

    const inventedAnonymous = inventedEditionPackageFixture();
    contributorGroups(inventedAnonymous).translation = {
      metadataStatus: 'anonymous',
      contributors: [{ name: 'Invented Name', role: 'translator' }],
    };
    expectValidationError(
      inventedAnonymous,
      '$.edition.contributorGroups.translation.contributors',
      'must not invent',
    );

    const collectivePerson = inventedEditionPackageFixture();
    contributorGroups(collectivePerson).revision = {
      metadataStatus: 'collective',
      contributors: [{ name: 'Synthetic Revisers', role: 'reviser' }],
    };
    expectValidationError(
      collectivePerson,
      '$.edition.contributorGroups.revision.contributors',
      'revision_body',
    );

    const reviewedEmpty = inventedEditionPackageFixture();
    contributorGroups(reviewedEmpty).editing = { metadataStatus: 'reviewed', contributors: [] };
    expectValidationError(
      reviewedEmpty,
      '$.edition.contributorGroups.editing.contributors',
      'one or more editor',
    );

    const wrongRole = inventedEditionPackageFixture();
    contributorGroups(wrongRole).editing = {
      metadataStatus: 'reviewed',
      contributors: [{ name: 'Synthetic Translator', role: 'translator' }],
    };
    expectValidationError(wrongRole, '$.edition.contributorGroups.editing.contributors[0].role', 'must be one of');
  });

  it('counts Unicode code points instead of UTF-16 code units for metadata bounds', () => {
    const fixture = inventedEditionPackageFixture();
    (fixture.work as Record<string, unknown>).title = '😀'.repeat(EDITION_PROVENANCE_LIMITS.shortTextCharacters);
    expect(() => validateEditionCompilationPackage(fixture)).not.toThrow();
  });

  it('rejects Zl/Zp and invisible Cf spoofing while preserving justified corpus joiners only', () => {
    for (const hostile of ['Synthetic\u2028Title', 'Synthetic\u2029Title', 'Synthetic\u00adTitle', 'Synthetic\u200dTitle']) {
      const fixture = inventedEditionPackageFixture();
      (fixture.work as Record<string, unknown>).title = hostile;
      expect(() => validateEditionCompilationPackage(fixture)).toThrow(EditionProvenanceValidationError);
    }

    for (const hostile of ['Synthetic\u2028content', 'Synthetic\u2029content', 'Synthetic\u00adcontent']) {
      const fixture = inventedEditionPackageFixture();
      (fixture.sections as Record<string, unknown>[])[0]!.content = hostile;
      expect(() => validateEditionCompilationPackage(fixture)).toThrow(EditionProvenanceValidationError);
    }

    expect(EDITION_PROVENANCE_ALLOWED_CONTENT_FORMAT_CHARACTERS).toEqual(['\u200c', '\u200d']);
    for (const joiner of EDITION_PROVENANCE_ALLOWED_CONTENT_FORMAT_CHARACTERS) {
      const fixture = inventedEditionPackageFixture();
      (fixture.sections as Record<string, unknown>[])[0]!.content = `Synthetic${joiner}content`;
      expect(() => validateEditionCompilationPackage(fixture)).not.toThrow();
    }
  });

  it('requires an immutable locator, pin, content hash, byte count, and truthful acquisition precision', () => {
    const queryLocator = inventedEditionPackageFixture();
    source(queryLocator).locator = 'https://example.invalid/file.txt?moving=latest';
    expectValidationError(queryLocator, '$.edition.source.locator', 'must not contain');

    const mismatchedPin = inventedEditionPackageFixture();
    source(mismatchedPin).pin = { kind: 'sha256', value: 'b'.repeat(64) };
    expectValidationError(mismatchedPin, '$.edition.source.pin.value', 'must equal');

    const malformedHash = inventedEditionPackageFixture();
    source(malformedHash).sha256 = 'A'.repeat(64);
    expectValidationError(malformedHash, '$.edition.source.sha256', 'lowercase SHA-256');

    const excessiveBytes = inventedEditionPackageFixture();
    source(excessiveBytes).bytes = EDITION_PROVENANCE_LIMITS.sourceArtifactBytes + 1;
    expectValidationError(excessiveBytes, '$.edition.source.bytes', 'safe integer');

    const fractionalBytes = inventedEditionPackageFixture();
    source(fractionalBytes).bytes = 1.5;
    expectValidationError(fractionalBytes, '$.edition.source.bytes', 'safe integer');

    const invalidInstant = inventedEditionPackageFixture();
    source(invalidInstant).acquiredAt = '2026-02-31T03:04:05Z';
    expectValidationError(invalidInstant, '$.edition.source.acquiredAt', 'canonical UTC instant');

    const dateOnlyAcquisition = inventedEditionPackageFixture();
    source(dateOnlyAcquisition).acquiredAt = '2026-01-02';
    expect(() => validateEditionCompilationPackage(dateOnlyAcquisition)).not.toThrow();

    const inventedOffset = inventedEditionPackageFixture();
    source(inventedOffset).acquiredAt = '2026-01-02T03:04:05+00:00';
    expectValidationError(inventedOffset, '$.edition.source.acquiredAt', 'canonical UTC instant');
  });

  it('preserves LF-only frozen section boundaries without admitting whitespace rewriting', () => {
    const sourceExactBoundary = inventedEditionPackageFixture();
    (sourceExactBoundary.sections as Record<string, unknown>[])[0]!.content = 'First source section.\n\n';
    expect(() => validateEditionCompilationPackage(sourceExactBoundary)).not.toThrow();

    const trailingSpace = inventedEditionPackageFixture();
    (trailingSpace.sections as Record<string, unknown>[])[0]!.content = 'First source section. \n';
    expectValidationError(trailingSpace, '$.sections[0].content', 'trimmed');

    const carriageReturn = inventedEditionPackageFixture();
    (carriageReturn.sections as Record<string, unknown>[])[0]!.content = 'First source section.\r\n';
    expectValidationError(carriageReturn, '$.sections[0].content', 'carriage return');
  });

  it('rejects credentials in every provenance URL', () => {
    const sourceCredentials = inventedEditionPackageFixture();
    source(sourceCredentials).locator = 'https://user:secret@example.invalid/source.txt';
    expectValidationError(sourceCredentials, '$.edition.source.locator', 'credentials');

    const workEvidenceCredentials = inventedEditionPackageFixture();
    (underlyingRights(workEvidenceCredentials).evidenceInstrument as Record<string, unknown>).url =
      'https://user:secret@example.invalid/public-domain';
    expectValidationError(
      workEvidenceCredentials,
      '$.edition.underlyingWorkRights.evidenceInstrument.url',
      'credentials',
    );

    const artifactEvidenceCredentials = inventedEditionPackageFixture();
    (exactRights(artifactEvidenceCredentials).rightsInstrument as Record<string, unknown>).url =
      'https://user:secret@example.invalid/license';
    expectValidationError(
      artifactEvidenceCredentials,
      '$.edition.exactArtifactRights.rightsInstrument.url',
      'credentials',
    );
  });

  it('requires an explicit and internally consistent provenance uncertainty status', () => {
    const hiddenUncertainty = inventedEditionPackageFixture();
    provenance(hiddenUncertainty).status = 'verified';
    expectValidationError(hiddenUncertainty, '$.edition.provenance.uncertainty', 'must be null');

    const unexplainedUncertainty = inventedEditionPackageFixture();
    provenance(unexplainedUncertainty).uncertainty = null;
    expectValidationError(unexplainedUncertainty, '$.edition.provenance.uncertainty', 'must explain');
  });

  it('rejects duplicate or mutable-looking section identities and applies hard count limits', () => {
    const duplicate = inventedEditionPackageFixture();
    const sections = duplicate.sections as Array<Record<string, unknown>>;
    sections[1]!.sectionKey = sections[0]!.sectionKey;
    expectValidationError(duplicate, '$.sections', 'duplicate frozen section key');

    const malformedKey = inventedEditionPackageFixture();
    (malformedKey.sections as Array<Record<string, unknown>>)[0]!.sectionKey = 'Mutable Key';
    expectValidationError(malformedKey, '$.sections[0].sectionKey', 'canonical lowercase identifier');

    const outOfOrder = inventedEditionPackageFixture();
    (outOfOrder.sections as Array<Record<string, unknown>>)[0]!.sourceOrdinal = 2;
    expectValidationError(outOfOrder, '$.sections[0].sourceOrdinal', 'source order');

    const tooMany = inventedEditionPackageFixture();
    tooMany.sections = Array.from(
      { length: EDITION_PROVENANCE_LIMITS.sections + 1 },
      (_, index) => ({
        sourceOrdinal: index + 1,
        sectionKey: `synthetic-${index}`,
        displayLabel: 'Synthetic',
        heading: 'Synthetic',
        content: 'Synthetic',
      }),
    );
    expectValidationError(tooMany, '$.sections', 'between 1 and 2000');
  });

  it.each([
    'safe text\u061Chidden direction',
    'safe text\u200Ehidden direction',
    'safe text\u200Fhidden direction',
    'safe text\u202Ehidden direction',
    'safe text\u0000hidden control',
    'safe text\uD800lone high surrogate',
    'safe text\uDC00lone low surrogate',
  ])('rejects hostile control content: %j', hostile => {
    const fixture = inventedEditionPackageFixture();
    (fixture.sections as Array<Record<string, unknown>>)[0]!.content = hostile;
    expect(() => compileEditionPackage(fixture)).toThrow(EditionProvenanceValidationError);
  });

  it.each([
    '\\[escaped shortcut label]',
    '\\[escaped label][destination]\n\n[destination]: https://example.invalid/path',
    '![remote image](https://tracker.example.invalid/pixel)',
    '![remote image][destination]\n\n[destination]: https://tracker.example.invalid/pixel',
    '[active link](https://example.invalid/path)',
    '[outer [nested label]](<https://example.invalid/path> "title")',
    '[active link](jav&#x61;script:alert(1))',
    '[active link][destination]\n\n[destination]: https://example.invalid/path',
    '<https://example.invalid/autolink>',
    '<user@example.invalid>',
    '<img src="https://tracker.example.invalid/pixel">',
    '<a href="jav&#x61;script:alert(1)">entity-obfuscated scheme</a>',
    '<!-- raw HTML comment -->',
    'javascript:alert(1) discussed as literal source prose',
  ])('stores Markdown-looking corpus prose but neutralizes it at the required presentation boundary: %j', sourceText => {
    const fixture = inventedEditionPackageFixture();
    (fixture.sections as Array<Record<string, unknown>>)[0]!.content = sourceText;
    const compiled = validateEditionCompilationPackage(fixture);
    expect(compiled.sections[0]!.content).toBe(sourceText);

    const escaped = escapeEditionPlainTextForMarkdown(compiled.sections[0]!.content);
    expect(escaped).toBe(escapeEveryAsciiPunctuation(sourceText));
    expect(escaped).not.toMatch(/(^|[^\\])!\[/u);
    expect(escaped).not.toMatch(/(^|[^\\])<\/?[A-Za-z!]/u);
    expect(escaped).not.toMatch(/(^|[^\\])\]\s*\(/u);
  });

  it('escapes every ASCII punctuation and destination delimiter before Markdown presentation', () => {
    const punctuation = Array.from({ length: 128 }, (_, code) => String.fromCharCode(code))
      .filter(character => /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(character))
      .join('');
    expect(punctuation).toHaveLength(32);
    expect(escapeEditionPlainTextForMarkdown(punctuation))
      .toBe([...punctuation].map(character => `\\${character}`).join(''));
    expect(escapeEditionPlainTextForMarkdown('Synthetic https://example.invalid and [brackets].'))
      .toBe('Synthetic https\\:\\/\\/example\\.invalid and \\[brackets\\]\\.');
  });

  it('rejects every Unicode noncharacter in both metadata and corpus bodies', () => {
    const noncharacters = [
      ...Array.from({ length: 0x20 }, (_, offset) => 0xfdd0 + offset),
      ...Array.from({ length: 17 }, (_, plane) => [
        plane * 0x10000 + 0xfffe,
        plane * 0x10000 + 0xffff,
      ]).flat(),
    ].map(codePoint => String.fromCodePoint(codePoint));
    for (const noncharacter of noncharacters) {
      const metadata = inventedEditionPackageFixture();
      (metadata.work as Record<string, unknown>).title = `Synthetic${noncharacter}Title`;
      expect(() => validateEditionCompilationPackage(metadata)).toThrow(/Unicode noncharacter/);

      const body = inventedEditionPackageFixture();
      (body.sections as Array<Record<string, unknown>>)[0]!.content = `Synthetic${noncharacter}content`;
      expect(() => validateEditionCompilationPackage(body)).toThrow(/Unicode noncharacter/);
    }
  });

  it('enforces section and provisional package UTF-8 bounds rather than character counts', () => {
    const oversizedSection = inventedEditionPackageFixture();
    (oversizedSection.sections as Array<Record<string, unknown>>)[0]!.content =
      'é'.repeat(EDITION_PROVENANCE_LIMITS.sectionUtf8Bytes / 2 + 1);
    expectValidationError(oversizedSection, '$.sections[0].content', 'UTF-8 bytes');

    const oversizedTotal = inventedEditionPackageFixture();
    oversizedTotal.sections = Array.from({ length: 33 }, (_, index) => ({
      sourceOrdinal: index + 1,
      sectionKey: `synthetic-${index}`,
      displayLabel: `Synthetic ${index}`,
      heading: `Synthetic ${index}`,
      content: 'x'.repeat(EDITION_PROVENANCE_LIMITS.sectionUtf8Bytes),
    }));
    expectValidationError(oversizedTotal, '$.sections', 'provisional package bound');
  });
});

function exactRights(fixture: Record<string, unknown>): Record<string, unknown> {
  return (fixture.edition as Record<string, unknown>).exactArtifactRights as Record<string, unknown>;
}

function underlyingRights(fixture: Record<string, unknown>): Record<string, unknown> {
  return (fixture.edition as Record<string, unknown>).underlyingWorkRights as Record<string, unknown>;
}

function contributorGroups(
  fixture: Record<string, unknown>,
): Record<'translation' | 'editing' | 'revision', Record<string, unknown>> {
  return (fixture.edition as Record<string, unknown>).contributorGroups as
    Record<'translation' | 'editing' | 'revision', Record<string, unknown>>;
}

function publicDomainExactArtifactFixture(): Record<string, unknown> {
  const fixture = inventedEditionPackageFixture();
  Object.assign(exactRights(fixture), {
    status: 'public_domain',
    rightsInstrument: {
      instrumentId: 'synthetic-artifact-public-domain-statement',
      kind: 'public_domain_statement',
      label: 'Synthetic Exact Artifact Public Domain Statement',
      url: 'https://example.invalid/rights/invented-artifact-public-domain',
    },
    attributionRequirement: 'project_policy',
    shareAlike: 'not_required',
    modifications: 'permitted',
    modificationTerms: 'No legal modification restriction; retain a synthetic notice as project policy.',
  });
  return fixture;
}

function documentedPermissionExactArtifactFixture(): Record<string, unknown> {
  const fixture = inventedEditionPackageFixture();
  Object.assign(exactRights(fixture), {
    status: 'documented_permission',
    rightsInstrument: {
      instrumentId: 'synthetic-artifact-permission-record',
      kind: 'permission_record',
      label: 'Synthetic Exact Artifact Permission Record',
      url: 'https://example.invalid/rights/invented-artifact-permission',
    },
    attributionRequirement: 'permission_required',
    shareAlike: 'not_required',
    modifications: 'permission_required',
    permissionTerms: {
      scope: 'Synthetic permission to redistribute and display this exact fixture through TheologAI.',
      expiry: { status: 'expires_on', expiresOn: '2027-01-02' },
    },
  });
  return fixture;
}

function source(fixture: Record<string, unknown>): Record<string, unknown> {
  return (fixture.edition as Record<string, unknown>).source as Record<string, unknown>;
}

function provenance(fixture: Record<string, unknown>): Record<string, unknown> {
  return (fixture.edition as Record<string, unknown>).provenance as Record<string, unknown>;
}

function expectValidationError(input: unknown, path: string, message: string): void {
  try {
    validateEditionCompilationPackage(input);
    throw new Error('Expected edition provenance validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(EditionProvenanceValidationError);
    expect(error).toMatchObject({ path });
    expect((error as Error).message).toContain(message);
  }
}

function escapeEveryAsciiPunctuation(value: string): string {
  return [...value].map(character => /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(character)
    ? `\\${character}`
    : character).join('');
}

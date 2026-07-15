import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  RECIPIENT_ADDRESS,
  type DonationVerifyResult,
} from '../../../src/kernel/donation-types.js';
import { verifyDonationOutputSchema } from '../../../src/mcp/schemas/verifyDonation.js';
import { validatorFor } from '../../../src/mcp/validation.js';
import { presentVerifyDonationStructured } from '../../../src/presenters/verifyDonationStructured.js';

const HASH = `0x${'ab'.repeat(32)}`;
const FROM = `0x${'11'.repeat(20)}`;
const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const internalValidate = validatorFor(verifyDonationOutputSchema);
const sdkValidate = new AjvJsonSchemaValidator().getValidator(verifyDonationOutputSchema);

function expectValidInBothValidators(value: unknown): void {
  expect(internalValidate(value).valid).toBe(true);
  expect(sdkValidate(value).valid).toBe(true);
}

function expectInvalidInBothValidators(value: unknown): void {
  expect(internalValidate(value).valid).toBe(false);
  expect(sdkValidate(value).valid).toBe(false);
}

function expectWellFormedSchemaCombinators(value: unknown, path = '#'): void {
  if (typeof value !== 'object' || value === null) return;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => expectWellFormedSchemaCombinators(entry, `${path}/${index}`));
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const entryPath = `${path}/${key}`;
    if (key === 'allOf' || key === 'anyOf' || key === 'oneOf') {
      expect(entry, `${entryPath} must be a non-empty schema array`).toBeInstanceOf(Array);
      expect(entry as unknown[], `${entryPath} must contain at least one schema`).not.toHaveLength(0);
    }
    if (key === 'not') {
      const isSchema = typeof entry === 'boolean'
        || (typeof entry === 'object' && entry !== null && !Array.isArray(entry));
      expect(isSchema, `${entryPath} must be a JSON Schema`).toBe(true);
    }
    expectWellFormedSchemaCombinators(entry, entryPath);
  }
}

function result(overrides: Partial<DonationVerifyResult> = {}): DonationVerifyResult {
  return {
    txHash: HASH,
    status: 'verified',
    minedSuccessfully: true,
    transfers: [{
      chainId: 8453, chainName: 'Base', from: FROM, to: RECIPIENT_ADDRESS,
      amount: '1.5', symbol: 'USDC', tokenAddress: BASE_USDC,
    }],
    explorerUrl: `https://basescan.org/tx/${HASH}`,
    chainStatuses: [
      { chainId: 1, chainName: 'Ethereum', state: 'absent' },
      { chainId: 8453, chainName: 'Base', state: 'mined', minedSuccessfully: true },
      { chainId: 723, chainName: 'Radius', state: 'absent' },
    ],
    classifiedTransferCount: 1,
    ...overrides,
  };
}

function chainStatusesFor(status: DonationVerifyResult['status']): DonationVerifyResult['chainStatuses'] {
  if (['verified', 'wrong_recipient', 'unsupported'].includes(status)) {
    return result().chainStatuses;
  }
  if (status === 'failed') {
    return [
      { chainId: 1, chainName: 'Ethereum', state: 'absent' },
      { chainId: 8453, chainName: 'Base', state: 'mined', minedSuccessfully: false },
      { chainId: 723, chainName: 'Radius', state: 'absent' },
    ];
  }
  if (status === 'pending') {
    return [
      { chainId: 1, chainName: 'Ethereum', state: 'absent' },
      { chainId: 8453, chainName: 'Base', state: 'pending' },
      { chainId: 723, chainName: 'Radius', state: 'absent' },
    ];
  }
  if (status === 'absent') {
    return [
      { chainId: 1, chainName: 'Ethereum', state: 'absent' },
      { chainId: 8453, chainName: 'Base', state: 'absent' },
      { chainId: 723, chainName: 'Radius', state: 'absent' },
    ];
  }
  return [
    { chainId: 1, chainName: 'Ethereum', state: 'unavailable' },
    { chainId: 8453, chainName: 'Base', state: 'absent' },
    { chainId: 723, chainName: 'Radius', state: 'absent' },
  ];
}

describe('presentVerifyDonationStructured', () => {
  it('publishes a valid JSON Schema 2020-12 document with well-formed combinators', () => {
    expectWellFormedSchemaCombinators(verifyDonationOutputSchema);

    // The compact advertised schema relies on parent schemas for object/array types.
    // Keep schema-keyword strictness on while disabling only Ajv's local strictTypes lint.
    const ajv = new Ajv2020({ strict: true, strictTypes: false, allErrors: true });
    expect(ajv.validateSchema(verifyDonationOutputSchema), ajv.errorsText(ajv.errors)).toBe(true);
    expect(() => ajv.compile(verifyDonationOutputSchema)).not.toThrow();
  });

  it.each([
    ['allOf', { properties: { nested: { allOf: [] } } }],
    ['anyOf', { properties: { nested: { anyOf: [] } } }],
    ['oneOf', { properties: { nested: { oneOf: [] } } }],
    ['not', { properties: { nested: { not: [] } } }],
  ])('rejects a malformed nested %s combinator', (_keyword, schema) => {
    expect(() => expectWellFormedSchemaCombinators(schema)).toThrow();
  });

  it('reports receipt observation without claiming confirmation depth or finality', () => {
    const output = presentVerifyDonationStructured(result());

    expect(output).toMatchObject({
      schemaVersion: '1', kind: 'verify_donation', txHash: HASH,
      recipientAddress: RECIPIENT_ADDRESS,
      classification: {
        status: 'verified', donationVerified: true, transactionOutcome: 'mined_successfully',
      },
      coverage: { availability: 'complete', checkedChainCount: 3, supportedChainCount: 3 },
      transfers: [{
        amount: { value: '1.5', unit: 'asset_decimal', decimals: 6 },
        asset: { support: 'supported', kind: 'token', symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
        matches: { configuredAsset: true, recipient: true },
      }],
      transferWindow: { returnedCount: 1, classifiedTotal: 1, truncated: false },
      explorerLinks: [{ chainId: 8453, chainName: 'Base', url: `https://basescan.org/tx/${HASH}` }],
      verificationPolicy: {
        successCriterion: 'successful_receipt_supported_asset_recipient_match',
        finality: 'receipt_observed_no_confirmation_depth',
        providerFailureHandling: 'fail_closed',
      },
    });
    expectValidInBothValidators(output);
  });

  it.each([
    ['verified', true, 'mined_successfully'],
    ['wrong_recipient', false, 'mined_successfully'],
    ['unsupported', false, 'mined_successfully'],
    ['failed', false, 'reverted'],
    ['pending', false, 'pending'],
    ['absent', false, 'not_found'],
    ['unavailable', false, 'indeterminate'],
  ] as const)('keeps %s classification fields correlated', (status, verified, outcome) => {
    const nonTransfer = ['failed', 'pending', 'absent', 'unavailable'].includes(status);
    const wrongRecipient = status === 'wrong_recipient';
    const unsupported = status === 'unsupported';
    const output = presentVerifyDonationStructured(result({
      status,
      minedSuccessfully: ['verified', 'wrong_recipient', 'unsupported'].includes(status),
      transfers: nonTransfer ? [] : [{
        chainId: 8453, chainName: 'Base', from: FROM,
        to: wrongRecipient ? `0x${'22'.repeat(20)}` : RECIPIENT_ADDRESS,
        amount: unsupported ? '7' : '1.5',
        symbol: unsupported ? 'Unsupported asset' : 'USDC',
        tokenAddress: unsupported ? `0x${'99'.repeat(20)}` : BASE_USDC,
      }],
      classifiedTransferCount: nonTransfer ? 0 : 1,
      chainStatuses: chainStatusesFor(status),
      explorerUrl: ['verified', 'wrong_recipient', 'unsupported', 'failed'].includes(status)
        ? `https://basescan.org/tx/${HASH}`
        : '',
    }));

    expect(output.classification).toEqual({ status, donationVerified: verified, transactionOutcome: outcome });
    expectValidInBothValidators(output);
  });

  it('reports unsupported amounts only as raw base units', () => {
    const output = presentVerifyDonationStructured(result({
      status: 'unsupported',
      transfers: [{
        chainId: 8453, chainName: 'Base', from: FROM, to: RECIPIENT_ADDRESS,
        amount: '7000000', symbol: 'Unsupported asset', tokenAddress: `0x${'99'.repeat(20)}`,
      }],
    }));
    expect(output.transfers[0]).toMatchObject({
      amount: { value: '7000000', unit: 'raw_base_units', decimals: null },
      asset: { support: 'unsupported', symbol: null },
      matches: { configuredAsset: false, recipient: true },
    });
  });

  it('reports partial and unavailable coverage from the exact three chain checks', () => {
    const partial = presentVerifyDonationStructured(result({
      chainStatuses: [
        { chainId: 1, chainName: 'Ethereum', state: 'unavailable' },
        { chainId: 8453, chainName: 'Base', state: 'mined', minedSuccessfully: true },
        { chainId: 723, chainName: 'Radius', state: 'absent' },
      ],
    }));
    expect(partial.coverage).toEqual({ availability: 'partial', checkedChainCount: 2, supportedChainCount: 3 });

    const unavailable = presentVerifyDonationStructured(result({
      status: 'unavailable', minedSuccessfully: false, transfers: [], classifiedTransferCount: 0, explorerUrl: '',
      chainStatuses: [
        { chainId: 1, chainName: 'Ethereum', state: 'unavailable' },
        { chainId: 8453, chainName: 'Base', state: 'unavailable' },
        { chainId: 723, chainName: 'Radius', state: 'unavailable' },
      ],
    }));
    expect(unavailable.coverage).toEqual({ availability: 'unavailable', checkedChainCount: 0, supportedChainCount: 3 });
    expectValidInBothValidators(partial);
    expectValidInBothValidators(unavailable);
  });

  it('returns a bounded window while retaining the exact classified total', () => {
    const transfers = Array.from({ length: 100 }, (_, index) => ({
      chainId: 8453, chainName: 'Base', from: FROM, to: RECIPIENT_ADDRESS,
      amount: String(index + 1), symbol: 'USDC', tokenAddress: BASE_USDC,
    }));
    const output = presentVerifyDonationStructured(result({ transfers, classifiedTransferCount: 137 }));
    expect(output.transfers).toHaveLength(100);
    expect(output.transferWindow).toEqual({ returnedCount: 100, classifiedTotal: 137, truncated: true });
    expectValidInBothValidators(output);
  });

  it('fails closed on incomplete, duplicated, or mismatched public chain evidence', () => {
    expect(() => presentVerifyDonationStructured(result({ chainStatuses: result().chainStatuses?.slice(0, 2) })))
      .toThrow('cover every supported chain');
    expect(() => presentVerifyDonationStructured(result({
      chainStatuses: [
        { chainId: 1, chainName: 'Ethereum', state: 'absent' },
        { chainId: 1, chainName: 'Ethereum', state: 'absent' },
        { chainId: 723, chainName: 'Radius', state: 'absent' },
      ],
    }))).toThrow('missing, duplicate, or mismatched');
  });

  it.each([
    ['verified without successful receipt', { chainStatuses: chainStatusesFor('pending') }],
    ['failed with successful receipt', { status: 'failed', minedSuccessfully: false }],
    ['pending without pending evidence', {
      status: 'pending', minedSuccessfully: false, transfers: [], classifiedTransferCount: 0,
      chainStatuses: chainStatusesFor('absent'), explorerUrl: '',
    }],
    ['absent with unavailable evidence', {
      status: 'absent', minedSuccessfully: false, transfers: [], classifiedTransferCount: 0,
      chainStatuses: chainStatusesFor('unavailable'), explorerUrl: '',
    }],
    ['unavailable with pending evidence', {
      status: 'unavailable', minedSuccessfully: false, transfers: [], classifiedTransferCount: 0,
      chainStatuses: chainStatusesFor('pending'), explorerUrl: '',
    }],
  ])('rejects classification/evidence contradiction: %s', (_label, overrides) => {
    expect(() => presentVerifyDonationStructured(result(overrides as Partial<DonationVerifyResult>))).toThrow();
  });

  it('rejects transfers without a corresponding successful mined check', () => {
    expect(() => presentVerifyDonationStructured(result({
      chainStatuses: [
        { chainId: 1, chainName: 'Ethereum', state: 'mined', minedSuccessfully: true },
        { chainId: 8453, chainName: 'Base', state: 'absent' },
        { chainId: 723, chainName: 'Radius', state: 'absent' },
      ],
      explorerUrl: `https://etherscan.io/tx/${HASH}`,
    }))).toThrow('not backed by a successful mined chain check');
  });

  it.each([
    ['lower-than-bound truncation', { classifiedTransferCount: 2 }],
    ['count below returned window', { classifiedTransferCount: 0 }],
  ])('rejects invalid transfer-window evidence: %s', (_label, overrides) => {
    expect(() => presentVerifyDonationStructured(result(overrides))).toThrow('transfer count is invalid');
  });

  it('rejects a legacy explorer URL that is not backed by the observed chain', () => {
    expect(() => presentVerifyDonationStructured(result({
      explorerUrl: `https://etherscan.io/tx/${HASH}`,
    }))).toThrow('does not match observed chain evidence');
  });

  it('uses the official SDK default validator and rejects broken correlations and explorer hosts', () => {
    const validate = sdkValidate;
    const output = presentVerifyDonationStructured(result());
    expect(validate(output).valid).toBe(true);

    const falseVerified = structuredClone(output) as any;
    falseVerified.classification.donationVerified = false;
    expect(validate(falseVerified).valid).toBe(false);

    const wrongHost = structuredClone(output) as any;
    wrongHost.explorerLinks[0].url = `https://evil.example/tx/${HASH}`;
    expect(validate(wrongHost).valid).toBe(false);

    const missingChain = structuredClone(output) as any;
    missingChain.chainChecks[2] = { ...missingChain.chainChecks[1] };
    expect(validate(missingChain).valid).toBe(false);

    const mismatchedAsset = structuredClone(output) as any;
    mismatchedAsset.transfers[0].asset.symbol = 'SBC';
    expect(validate(mismatchedAsset).valid).toBe(false);

    const evidenceContradiction = structuredClone(output) as any;
    evidenceContradiction.chainChecks[1] = {
      chainId: 8453, chainName: 'Base', state: 'pending', minedSuccessfully: null,
    };
    expect(validate(evidenceContradiction).valid).toBe(false);

    const missingExplorer = structuredClone(output) as any;
    missingExplorer.explorerLinks = [];
    expect(validate(missingExplorer).valid).toBe(false);

    const wrongWindow = structuredClone(output) as any;
    wrongWindow.transferWindow.returnedCount = 2;
    expect(validate(wrongWindow).valid).toBe(false);

    const wrongClassifiedTotal = structuredClone(output) as any;
    wrongClassifiedTotal.transferWindow.classifiedTotal = 2;
    expect(validate(wrongClassifiedTotal).valid).toBe(false);

    const prematureTruncation = structuredClone(output) as any;
    prematureTruncation.transferWindow.classifiedTotal = 2;
    prematureTruncation.transferWindow.truncated = true;
    expect(validate(prematureTruncation).valid).toBe(false);

    const wrongRecipientIdentity = structuredClone(output) as any;
    wrongRecipientIdentity.recipientAddress = `0x${'99'.repeat(20)}`;
    expect(validate(wrongRecipientIdentity).valid).toBe(false);

    const transferWithoutSameChainSuccess = structuredClone(output) as any;
    transferWithoutSameChainSuccess.chainChecks = [
      { chainId: 1, chainName: 'Ethereum', state: 'mined', minedSuccessfully: true },
      { chainId: 8453, chainName: 'Base', state: 'absent', minedSuccessfully: null },
      { chainId: 723, chainName: 'Radius', state: 'absent', minedSuccessfully: null },
    ];
    transferWithoutSameChainSuccess.explorerLinks = [{
      chainId: 1, chainName: 'Ethereum', url: `https://etherscan.io/tx/${HASH}`,
    }];
    expectInvalidInBothValidators(transferWithoutSameChainSuccess);

    const duplicateChainExplorer = structuredClone(output) as any;
    duplicateChainExplorer.explorerLinks.push({
      chainId: 8453,
      chainName: 'Base',
      url: `https://basescan.org/tx/0x${'cd'.repeat(32)}`,
    });
    expectInvalidInBothValidators(duplicateChainExplorer);
  });

  it('keeps the advertised schema below its reviewed tools-list size ceiling', () => {
    const serializedBytes = new TextEncoder().encode(JSON.stringify(verifyDonationOutputSchema)).byteLength;
    expect(serializedBytes).toBeLessThan(45_000);
  });
});

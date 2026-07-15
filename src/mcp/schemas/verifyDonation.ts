import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  RECIPIENT_ADDRESS,
  SUPPORTED_DONATION_CHAINS,
  SUPPORTED_TOKENS,
  type SupportedDonationChainId,
  type SupportedDonationChainName,
  type SupportedDonationSymbol,
} from '../../kernel/donation-types.js';

export type VerifyDonationStatus =
  | 'unavailable' | 'absent' | 'pending' | 'failed'
  | 'unsupported' | 'wrong_recipient' | 'verified';

export interface VerifyDonationOutputV1 {
  [key: string]: unknown;
  schemaVersion: '1';
  kind: 'verify_donation';
  txHash: string;
  recipientAddress: string;
  classification: {
    status: VerifyDonationStatus;
    donationVerified: boolean;
    transactionOutcome: 'indeterminate' | 'not_found' | 'pending' | 'reverted' | 'mined_successfully';
  };
  coverage: {
    availability: 'complete' | 'partial' | 'unavailable';
    checkedChainCount: number;
    supportedChainCount: typeof SUPPORTED_DONATION_CHAINS['length'];
  };
  chainChecks: Array<{
    chainId: SupportedDonationChainId;
    chainName: SupportedDonationChainName;
    state: 'unavailable' | 'absent' | 'pending' | 'mined';
    minedSuccessfully: boolean | null;
  }>;
  transfers: Array<{
    chainId: SupportedDonationChainId;
    chainName: SupportedDonationChainName;
    from: string;
    to: string;
    amount: {
      value: string;
      unit: 'asset_decimal' | 'raw_base_units';
      decimals: number | null;
    };
    asset: {
      support: 'supported' | 'unsupported';
      kind: 'native' | 'token';
      symbol: SupportedDonationSymbol | null;
      address: string | null;
    };
    matches: { configuredAsset: boolean; recipient: boolean };
  }>;
  transferWindow: { returnedCount: number; classifiedTotal: number; truncated: boolean };
  explorerLinks: Array<{
    chainId: SupportedDonationChainId;
    chainName: SupportedDonationChainName;
    url: string;
  }>;
  verificationPolicy: {
    successCriterion: 'successful_receipt_supported_asset_recipient_match';
    finality: 'receipt_observed_no_confirmation_depth';
    providerFailureHandling: 'fail_closed';
  };
}

const ADDRESS_PATTERN = '^0x[0-9a-fA-F]{40}$';
const HASH_PATTERN = '^0x[0-9a-fA-F]{64}$';
const POSITIVE_DECIMAL_PATTERN = '^(?:[1-9]\\d*|0\\.\\d*[1-9]|[1-9]\\d*\\.\\d*[1-9])$';
const POSITIVE_INTEGER_PATTERN = '^[1-9]\\d*$';
const chainIds = SUPPORTED_DONATION_CHAINS.map(chain => chain.chainId);
const chainNames = SUPPORTED_DONATION_CHAINS.map(chain => chain.chainName);
const supportedSymbols = [...new Set(SUPPORTED_TOKENS.map(asset => asset.symbol))];
const chainIdentityVariants = SUPPORTED_DONATION_CHAINS.map(chain => ({
  type: 'object',
  properties: { chainId: { const: chain.chainId }, chainName: { const: chain.chainName } },
  required: ['chainId', 'chainName'],
}));

const chainCheckSchema = {
  type: 'object',
  properties: {
    chainId: { type: 'integer', enum: chainIds },
    chainName: { type: 'string', enum: chainNames },
    state: { type: 'string', enum: ['unavailable', 'absent', 'pending', 'mined'] },
    minedSuccessfully: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
  },
  required: ['chainId', 'chainName', 'state', 'minedSuccessfully'],
  additionalProperties: false,
  allOf: [
    { oneOf: chainIdentityVariants },
    {
      oneOf: [
        { type: 'object', properties: { state: { const: 'mined' }, minedSuccessfully: { type: 'boolean' } }, required: ['state', 'minedSuccessfully'] },
        { type: 'object', properties: { state: { enum: ['unavailable', 'absent', 'pending'] }, minedSuccessfully: { type: 'null' } }, required: ['state', 'minedSuccessfully'] },
      ],
    },
  ],
};

const supportedTransferVariants = SUPPORTED_TOKENS.map(asset => ({
  type: 'object', properties: {
    chainId: { const: asset.chainId },
    chainName: { const: asset.chainName },
    amount: { type: 'object', properties: { decimals: { const: asset.decimals } }, required: ['decimals'] },
    asset: {
      type: 'object', properties: {
        kind: { const: asset.isNative ? 'native' : 'token' },
        symbol: { const: asset.symbol },
        address: { const: asset.isNative ? null : asset.asset },
      }, required: ['kind', 'symbol', 'address'],
    },
  }, required: ['chainId', 'chainName', 'amount', 'asset'],
}));

const transferSchema = {
  type: 'object',
  properties: {
    chainId: { type: 'integer', enum: chainIds },
    chainName: { type: 'string', enum: chainNames },
    from: { type: 'string', pattern: ADDRESS_PATTERN },
    to: { type: 'string', pattern: ADDRESS_PATTERN },
    amount: {
      type: 'object', properties: {
        value: { type: 'string', minLength: 1, maxLength: 100 },
        unit: { type: 'string', enum: ['asset_decimal', 'raw_base_units'] },
        decimals: { oneOf: [{ type: 'integer', minimum: 0, maximum: 255 }, { type: 'null' }] },
      }, required: ['value', 'unit', 'decimals'], additionalProperties: false,
    },
    asset: {
      type: 'object', properties: {
        support: { type: 'string', enum: ['supported', 'unsupported'] },
        kind: { type: 'string', enum: ['native', 'token'] },
        symbol: { oneOf: [{ type: 'string', enum: supportedSymbols }, { type: 'null' }] },
        address: { oneOf: [{ type: 'string', pattern: ADDRESS_PATTERN }, { type: 'null' }] },
      }, required: ['support', 'kind', 'symbol', 'address'], additionalProperties: false,
      allOf: [{
        oneOf: [
          { type: 'object', properties: { kind: { const: 'native' }, address: { type: 'null' } }, required: ['kind', 'address'] },
          { type: 'object', properties: { kind: { const: 'token' }, address: { type: 'string', pattern: ADDRESS_PATTERN } }, required: ['kind', 'address'] },
        ],
      }],
    },
    matches: {
      type: 'object', properties: {
        configuredAsset: { type: 'boolean' }, recipient: { type: 'boolean' },
      }, required: ['configuredAsset', 'recipient'], additionalProperties: false,
    },
  },
  required: ['chainId', 'chainName', 'from', 'to', 'amount', 'asset', 'matches'],
  additionalProperties: false,
  allOf: [
    { oneOf: chainIdentityVariants },
    {
      oneOf: [
        {
          type: 'object', properties: {
            amount: { type: 'object', properties: { value: { pattern: POSITIVE_DECIMAL_PATTERN }, unit: { const: 'asset_decimal' }, decimals: { type: 'integer' } }, required: ['value', 'unit', 'decimals'] },
            asset: { type: 'object', properties: { support: { const: 'supported' }, symbol: { type: 'string', enum: supportedSymbols } }, required: ['support', 'symbol'] },
            matches: { type: 'object', properties: { configuredAsset: { const: true } }, required: ['configuredAsset'] },
          }, required: ['amount', 'asset', 'matches'],
          allOf: [{ oneOf: supportedTransferVariants }],
        },
        {
          type: 'object', properties: {
            amount: { type: 'object', properties: { value: { pattern: POSITIVE_INTEGER_PATTERN }, unit: { const: 'raw_base_units' }, decimals: { type: 'null' } }, required: ['value', 'unit', 'decimals'] },
            asset: { type: 'object', properties: { support: { const: 'unsupported' }, symbol: { type: 'null' } }, required: ['support', 'symbol'] },
            matches: { type: 'object', properties: { configuredAsset: { const: false } }, required: ['configuredAsset'] },
          }, required: ['amount', 'asset', 'matches'],
        },
      ],
    },
  ],
};

const classificationVariants = [
  ['verified', true, 'mined_successfully'],
  ['wrong_recipient', false, 'mined_successfully'],
  ['unsupported', false, 'mined_successfully'],
  ['failed', false, 'reverted'],
  ['pending', false, 'pending'],
  ['absent', false, 'not_found'],
  ['unavailable', false, 'indeterminate'],
].map(([status, donationVerified, transactionOutcome]) => ({
  type: 'object', properties: {
    classification: {
      type: 'object', properties: {
        status: { const: status }, donationVerified: { const: donationVerified }, transactionOutcome: { const: transactionOutcome },
      }, required: ['status', 'donationVerified', 'transactionOutcome'],
    },
  }, required: ['classification'],
}));

const statusTransferVariants = [
  {
    type: 'object', properties: {
      classification: { type: 'object', properties: { status: { const: 'verified' } }, required: ['status'] },
      transfers: { type: 'array', minItems: 1, items: { type: 'object', properties: { matches: { type: 'object', properties: { configuredAsset: { const: true }, recipient: { const: true } }, required: ['configuredAsset', 'recipient'] } }, required: ['matches'] } },
    }, required: ['classification', 'transfers'],
  },
  {
    type: 'object', properties: {
      classification: { type: 'object', properties: { status: { const: 'wrong_recipient' } }, required: ['status'] },
      transfers: { type: 'array', minItems: 1, items: { type: 'object', properties: { matches: { type: 'object', properties: { configuredAsset: { const: true }, recipient: { const: false } }, required: ['configuredAsset', 'recipient'] } }, required: ['matches'] } },
    }, required: ['classification', 'transfers'],
  },
  {
    type: 'object', properties: {
      classification: { type: 'object', properties: { status: { const: 'unsupported' } }, required: ['status'] },
      transfers: { type: 'array', items: { type: 'object', properties: { matches: { type: 'object', properties: { configuredAsset: { const: false } }, required: ['configuredAsset'] } }, required: ['matches'] } },
    }, required: ['classification', 'transfers'],
  },
  ...['failed', 'pending', 'absent', 'unavailable'].map(status => ({
    type: 'object', properties: {
      classification: { type: 'object', properties: { status: { const: status } }, required: ['status'] },
      transfers: { type: 'array', maxItems: 0 },
      transferWindow: { type: 'object', properties: { returnedCount: { const: 0 }, classifiedTotal: { const: 0 }, truncated: { const: false } }, required: ['returnedCount', 'classifiedTotal', 'truncated'] },
    }, required: ['classification', 'transfers', 'transferWindow'],
  })),
];

const coverageVariants: unknown[] = [];
for (let mask = 0; mask < 2 ** SUPPORTED_DONATION_CHAINS.length; mask += 1) {
  const unavailableCount = SUPPORTED_DONATION_CHAINS
    .filter((_chain, index) => (mask & (1 << index)) !== 0).length;
  const checked = SUPPORTED_DONATION_CHAINS.length - unavailableCount;
  coverageVariants.push({
    properties: {
      coverage: {
        properties: {
          availability: {
            const: checked === SUPPORTED_DONATION_CHAINS.length
              ? 'complete'
              : checked === 0 ? 'unavailable' : 'partial',
          },
          checkedChainCount: { const: checked },
        },
      },
      chainChecks: {
        allOf: SUPPORTED_DONATION_CHAINS.map((chain, index) => ({
          contains: {
            properties: {
              chainId: { const: chain.chainId },
              state: (mask & (1 << index)) !== 0
                ? { const: 'unavailable' }
                : { enum: ['absent', 'pending', 'mined'] },
            },
            required: ['chainId', 'state'],
          },
        })),
      },
    },
  });
}

const successfulMinedCheck = {
  type: 'object',
  properties: { state: { const: 'mined' }, minedSuccessfully: { const: true } },
  required: ['state', 'minedSuccessfully'],
};
const revertedMinedCheck = {
  type: 'object',
  properties: { state: { const: 'mined' }, minedSuccessfully: { const: false } },
  required: ['state', 'minedSuccessfully'],
};
const anyMinedCheck = {
  type: 'object',
  properties: { state: { const: 'mined' } },
  required: ['state'],
};
const statusEvidenceVariants = [
  ...['verified', 'wrong_recipient', 'unsupported'].map(status => ({
    type: 'object',
    properties: {
      classification: { type: 'object', properties: { status: { const: status } }, required: ['status'] },
      chainChecks: { type: 'array', contains: successfulMinedCheck },
    },
    required: ['classification', 'chainChecks'],
  })),
  {
    type: 'object',
    properties: {
      classification: { type: 'object', properties: { status: { const: 'failed' } }, required: ['status'] },
      chainChecks: {
        type: 'array',
        contains: revertedMinedCheck,
        not: { contains: successfulMinedCheck },
      },
    },
    required: ['classification', 'chainChecks'],
  },
  {
    type: 'object',
    properties: {
      classification: { type: 'object', properties: { status: { const: 'pending' } }, required: ['status'] },
      chainChecks: {
        type: 'array',
        contains: { type: 'object', properties: { state: { const: 'pending' } }, required: ['state'] },
        not: { contains: anyMinedCheck },
      },
    },
    required: ['classification', 'chainChecks'],
  },
  {
    type: 'object',
    properties: {
      classification: { type: 'object', properties: { status: { const: 'absent' } }, required: ['status'] },
      chainChecks: {
        type: 'array',
        items: { type: 'object', properties: { state: { const: 'absent' } }, required: ['state'] },
      },
    },
    required: ['classification', 'chainChecks'],
  },
  {
    type: 'object',
    properties: {
      classification: { type: 'object', properties: { status: { const: 'unavailable' } }, required: ['status'] },
      chainChecks: {
        type: 'array',
        contains: { type: 'object', properties: { state: { const: 'unavailable' } }, required: ['state'] },
        not: {
          contains: {
            type: 'object',
            properties: { state: { enum: ['pending', 'mined'] } },
            required: ['state'],
          },
        },
      },
    },
    required: ['classification', 'chainChecks'],
  },
];

const exactUntruncatedWindowVariants = Array.from({ length: 101 }, (_, count) => ({
  properties: {
    transfers: { minItems: count, maxItems: count },
    transferWindow: {
      properties: {
        returnedCount: { const: count },
        classifiedTotal: { const: count },
      },
    },
  },
}));
const transferWindowVariants: unknown[] = [
  {
    properties: {
      transferWindow: {
        properties: { truncated: { const: false } },
      },
    },
    allOf: [{ oneOf: exactUntruncatedWindowVariants }],
  },
  {
    properties: {
      transfers: { minItems: 100, maxItems: 100 },
      transferWindow: {
        properties: {
          returnedCount: { const: 100 },
          classifiedTotal: { type: 'integer', minimum: 101, maximum: 1_000_000 },
          truncated: { const: true },
        },
      },
    },
  },
];

const explorerIdentityVariants = SUPPORTED_DONATION_CHAINS.map(chain => ({
  type: 'object',
  properties: {
    chainId: { const: chain.chainId },
    chainName: { const: chain.chainName },
    url: {
      pattern: `^${escapeRegex(chain.explorerTransactionUrl)}0x[0-9a-fA-F]{64}$`,
    },
  },
  required: ['chainId', 'chainName', 'url'],
}));

const explorerCoverageVariants: unknown[] = [];
for (let mask = 0; mask < 2 ** SUPPORTED_DONATION_CHAINS.length; mask += 1) {
  const linkedChains = SUPPORTED_DONATION_CHAINS
    .filter((_chain, index) => (mask & (1 << index)) !== 0);
  explorerCoverageVariants.push({
    properties: {
      chainChecks: {
        allOf: SUPPORTED_DONATION_CHAINS.map((chain, index) => ({
          contains: {
            properties: {
              chainId: { const: chain.chainId },
              state: (mask & (1 << index)) !== 0
                ? { enum: ['pending', 'mined'] }
                : { enum: ['unavailable', 'absent'] },
            },
            required: ['chainId', 'state'],
          },
        })),
      },
      explorerLinks: {
        minItems: linkedChains.length,
        maxItems: linkedChains.length,
        ...(linkedChains.length > 0 ? {
          allOf: linkedChains.map(chain => ({
            contains: {
              properties: { chainId: { const: chain.chainId } },
              required: ['chainId'],
            },
          })),
        } : {}),
      },
    },
  });
}

const transferEvidenceCorrelations = SUPPORTED_DONATION_CHAINS.map(chain => ({
  if: {
    type: 'object',
    properties: {
      transfers: {
        type: 'array',
        contains: {
          type: 'object',
          properties: { chainId: { const: chain.chainId } },
          required: ['chainId'],
        },
      },
    },
    required: ['transfers'],
  },
  then: {
    type: 'object',
    properties: {
      chainChecks: {
        type: 'array',
        contains: {
          type: 'object',
          properties: {
            chainId: { const: chain.chainId },
            state: { const: 'mined' },
            minedSuccessfully: { const: true },
          },
          required: ['chainId', 'state', 'minedSuccessfully'],
        },
      },
    },
    required: ['chainChecks'],
  },
}));

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const verifyDonationOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string', const: '1' },
    kind: { type: 'string', const: 'verify_donation' },
    txHash: { type: 'string', pattern: HASH_PATTERN },
    recipientAddress: { type: 'string', const: RECIPIENT_ADDRESS, pattern: ADDRESS_PATTERN },
    classification: {
      type: 'object', properties: {
        status: { type: 'string', enum: ['unavailable', 'absent', 'pending', 'failed', 'unsupported', 'wrong_recipient', 'verified'] },
        donationVerified: { type: 'boolean' },
        transactionOutcome: { type: 'string', enum: ['indeterminate', 'not_found', 'pending', 'reverted', 'mined_successfully'] },
      }, required: ['status', 'donationVerified', 'transactionOutcome'], additionalProperties: false,
    },
    coverage: {
      type: 'object', properties: {
        availability: { type: 'string', enum: ['complete', 'partial', 'unavailable'] },
        checkedChainCount: { type: 'integer', minimum: 0, maximum: SUPPORTED_DONATION_CHAINS.length },
        supportedChainCount: { type: 'integer', const: SUPPORTED_DONATION_CHAINS.length },
      }, required: ['availability', 'checkedChainCount', 'supportedChainCount'], additionalProperties: false,
    },
    chainChecks: {
      type: 'array',
      items: chainCheckSchema,
      minItems: SUPPORTED_DONATION_CHAINS.length,
      maxItems: SUPPORTED_DONATION_CHAINS.length,
      allOf: SUPPORTED_DONATION_CHAINS.map(chain => ({
        contains: {
          type: 'object',
          properties: { chainId: { const: chain.chainId }, chainName: { const: chain.chainName } },
          required: ['chainId', 'chainName'],
        },
      })),
    },
    transfers: { type: 'array', items: transferSchema, maxItems: 100 },
    transferWindow: {
      type: 'object', properties: {
        returnedCount: { type: 'integer', minimum: 0, maximum: 100 },
        classifiedTotal: { type: 'integer', minimum: 0, maximum: 1000000 },
        truncated: { type: 'boolean' },
      }, required: ['returnedCount', 'classifiedTotal', 'truncated'], additionalProperties: false,
    },
    explorerLinks: {
      type: 'array',
      maxItems: SUPPORTED_DONATION_CHAINS.length,
      uniqueItems: true,
      items: {
        type: 'object', properties: {
          chainId: { type: 'integer', enum: chainIds },
          chainName: { type: 'string', enum: chainNames },
          url: { type: 'string', minLength: 68, maxLength: 256 },
        }, required: ['chainId', 'chainName', 'url'], additionalProperties: false,
        allOf: [{ oneOf: explorerIdentityVariants }],
      },
    },
    verificationPolicy: {
      type: 'object', properties: {
        successCriterion: { type: 'string', const: 'successful_receipt_supported_asset_recipient_match' },
        finality: { type: 'string', const: 'receipt_observed_no_confirmation_depth' },
        providerFailureHandling: { type: 'string', const: 'fail_closed' },
      }, required: ['successCriterion', 'finality', 'providerFailureHandling'], additionalProperties: false,
    },
  },
  required: ['schemaVersion', 'kind', 'txHash', 'recipientAddress', 'classification', 'coverage', 'chainChecks', 'transfers', 'transferWindow', 'explorerLinks', 'verificationPolicy'],
  additionalProperties: false,
  allOf: [
    { oneOf: classificationVariants },
    { oneOf: statusTransferVariants },
    { oneOf: coverageVariants },
    { oneOf: statusEvidenceVariants },
    { oneOf: transferWindowVariants },
    { oneOf: explorerCoverageVariants },
    ...transferEvidenceCorrelations,
  ],
} as NonNullable<Tool['outputSchema']>;

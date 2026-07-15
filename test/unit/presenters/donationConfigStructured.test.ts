import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_TOKENS,
  type DonationConfig,
  type TokenConfig,
} from '../../../src/kernel/donation-types.js';
import { PUBLIC_DONATION_URL } from '../../../src/kernel/publicUrls.js';
import { donationConfigOutputSchema } from '../../../src/mcp/schemas/donationConfig.js';
import { validatorFor } from '../../../src/mcp/validation.js';
import { presentDonationConfigStructured } from '../../../src/presenters/donationConfigStructured.js';

const TOKEN_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RECIPIENT = '0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04';

function config(tokens: DonationConfig['tokens']): DonationConfig {
  return { recipientAddress: RECIPIENT, tokens };
}

describe('presentDonationConfigStructured', () => {
  it('preserves configured order and values while distinguishing native and token assets', () => {
    const output = presentDonationConfigStructured(config([
      {
        symbol: 'USDC', name: 'USD Coin', chainId: 8453, chainName: 'Base',
        network: 'eip155:8453', asset: TOKEN_ADDRESS, decimals: 6, isNative: false,
      },
      {
        symbol: 'ETH', name: 'Ether', chainId: 1, chainName: 'Ethereum',
        network: 'eip155:1', asset: 'native', decimals: 18, isNative: true,
      },
    ]));

    expect(output).toEqual({
      schemaVersion: '1',
      kind: 'donation_config',
      voluntary: true,
      featureAccessIndependentOfDonation: true,
      assetOrderMeaning: 'configured_display_order_not_ranking',
      webDonationUrl: PUBLIC_DONATION_URL,
      recipientAddress: RECIPIENT,
      assets: [
        {
          symbol: 'USDC', name: 'USD Coin', chainId: 8453, chainName: 'Base',
          network: 'eip155:8453', assetKind: 'token', assetAddress: TOKEN_ADDRESS, decimals: 6,
        },
        {
          symbol: 'ETH', name: 'Ether', chainId: 1, chainName: 'Ethereum',
          network: 'eip155:1', assetKind: 'native', assetAddress: null, decimals: 18,
        },
      ],
    });
    expect(validatorFor(donationConfigOutputSchema)(output).valid).toBe(true);
  });

  it('advertises a structural native/token union that rejects contradictory addresses', () => {
    const output = presentDonationConfigStructured(config(SUPPORTED_TOKENS));
    const validate = validatorFor(donationConfigOutputSchema);

    const nativeWithContract = structuredClone(output);
    const native = nativeWithContract.assets.find(asset => asset.assetKind === 'native')!;
    native.assetAddress = TOKEN_ADDRESS as never;
    expect(validate(nativeWithContract).valid).toBe(false);

    const tokenWithNull = structuredClone(output);
    const tokenAsset = tokenWithNull.assets.find(asset => asset.assetKind === 'token')!;
    tokenAsset.assetAddress = null as never;
    expect(validate(tokenWithNull).valid).toBe(false);

    const tokenWithoutAddress = structuredClone(output) as any;
    delete tokenWithoutAddress.assets.find((asset: any) => asset.assetKind === 'token').assetAddress;
    expect(validate(tokenWithoutAddress).valid).toBe(false);

    const duplicateAsset = structuredClone(output);
    duplicateAsset.assets.push({ ...duplicateAsset.assets[0] });
    expect(validate(duplicateAsset).valid).toBe(false);

    const inconsistentNetwork = structuredClone(output);
    inconsistentNetwork.assets[0].network = 'eip155:1';
    expect(validate(inconsistentNetwork).valid).toBe(false);

    const inconsistentChainId = structuredClone(output);
    inconsistentChainId.assets[0].chainId = 1;
    expect(validate(inconsistentChainId).valid).toBe(false);

    const oversizedName = structuredClone(output);
    oversizedName.assets[0].name = 'x'.repeat(101);
    expect(validate(oversizedName).valid).toBe(false);

    const wrongRecipient = structuredClone(output);
    wrongRecipient.recipientAddress = '0x1111111111111111111111111111111111111111';
    expect(validate(wrongRecipient).valid).toBe(false);
  });

  it('fails closed when native/token metadata contradicts its asset value', () => {
    expect(() => presentDonationConfigStructured(config([{
      symbol: 'ETH', name: 'Ether', chainId: 1, chainName: 'Ethereum',
      network: 'eip155:1', asset: TOKEN_ADDRESS, decimals: 18, isNative: true,
    }]))).toThrow('has a contract address');

    expect(() => presentDonationConfigStructured(config([{
      symbol: 'USDC', name: 'USD Coin', chainId: 8453, chainName: 'Base',
      network: 'eip155:8453', asset: 'native', decimals: 6, isNative: false,
    }]))).toThrow('has no contract address');
  });

  it('fails closed on inconsistent chain identities and unsupported catalog values', () => {
    const usdc = { ...SUPPORTED_TOKENS[0] };
    expect(() => presentDonationConfigStructured(config([
      { ...usdc, network: 'eip155:1' },
    ]))).toThrow('inconsistent chain identity');
    expect(() => presentDonationConfigStructured(config([
      { ...usdc, chainName: 'Ethereum' },
    ]))).toThrow('inconsistent chain identity');
    expect(() => presentDonationConfigStructured(config([
      { ...usdc, decimals: 18 },
    ]))).toThrow('does not match the supported catalog');
  });

  it('fails closed on duplicate asset identities and invalid bounded fields', () => {
    const usdc = { ...SUPPORTED_TOKENS[0] };
    expect(() => presentDonationConfigStructured(config([usdc, { ...usdc }]))).toThrow(
      'Duplicate donation asset identity',
    );

    const invalidCases: Array<[Partial<TokenConfig>, string]> = [
      [{ symbol: 'x'.repeat(17) }, 'invalid symbol'],
      [{ name: ` ${usdc.name}` }, 'invalid name'],
      [{ chainId: 0 }, 'invalid chain ID'],
      [{ decimals: 256 }, 'invalid decimals'],
    ];
    for (const [changes, message] of invalidCases) {
      expect(() => presentDonationConfigStructured(config([{ ...usdc, ...changes }]))).toThrow(message);
    }
  });

  it('fails closed on recipient drift, empty catalogs, and oversized catalogs', () => {
    expect(() => presentDonationConfigStructured({
      recipientAddress: '0x1111111111111111111111111111111111111111',
      tokens: SUPPORTED_TOKENS,
    })).toThrow('recipient');
    expect(() => presentDonationConfigStructured(config([]))).toThrow('must contain 1-20 assets');
    expect(() => presentDonationConfigStructured(config(Array.from({ length: 21 }, (_, index) => ({
      ...SUPPORTED_TOKENS[0],
      asset: `0x${index.toString(16).padStart(40, '0')}`,
    }))))).toThrow('must contain 1-20 assets');
  });
});

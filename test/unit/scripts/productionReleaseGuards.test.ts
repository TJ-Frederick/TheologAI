import { describe, expect, it } from 'vitest';
import { PRODUCTION_PROFILE as historicalProfile } from '../../../scripts/audit-historical-core-preview.js';
import { SPINE_PRODUCTION_PROFILE } from '../../../scripts/audit-historical-spine-preview.js';
import { PRODUCTION_PROFILE as languageProfile } from '../../../scripts/audit-original-language-v2-preview.js';

describe('production release guards', () => {
  it('keeps both post-deploy audit profiles fixed to the production custom domain and 3.6.0', () => {
    expect(languageProfile).toEqual({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '3.6.0',
      audit: 'original-language-v2-production', endpointClass: 'production-custom', label: 'production',
    });
    expect(historicalProfile).toMatchObject({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '3.6.0',
      audit: 'historical-core-production', endpointClass: 'production-custom', label: 'production',
      primarySource: {
        contractVersion: '6', schemaVersion: '6', openWorldHint: false,
        providerEnum: ['local'], providerMaximum: 1,
        inputSchemaSha256: '37849624bac2e884106050fcff39851e40cac31969b4f7511f516f78348fea87',
        outputSchemaSha256: '25758f8d06c43c3f2961fa7b35ba1d62a548df923589b391c65204813a6511b8',
        externalDiscoveryBoundary: 'rejected_at_input_schema',
      },
    });
    expect(SPINE_PRODUCTION_PROFILE).toMatchObject({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '3.6.0',
      audit: 'historical-spine-production', endpointClass: 'production-custom', label: 'production',
    });
  });

});

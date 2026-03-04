/**
 * donation_config tool handler.
 *
 * Returns TheologAI donation configuration: supported tokens,
 * recipient address, x402 payment endpoint, and facilitator details.
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { DonationService } from '../../services/donation/DonationService.js';
import { formatDonationConfig } from '../../formatters/donationFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createDonationConfigHandler(donationService: DonationService): ToolHandler {
  return {
    name: 'donation_config',
    description:
      'Get technical donation configuration for programmatic payment flows: supported tokens, contract addresses, chain IDs, x402 endpoint, and facilitators. Donations are voluntary and do not gate features. For a human-friendly donation guide, use the "donate" prompt instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },

    handler: async () => {
      try {
        const config = donationService.getConfig();
        return {
          content: [{ type: 'text' as const, text: formatDonationConfig(config) }],
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

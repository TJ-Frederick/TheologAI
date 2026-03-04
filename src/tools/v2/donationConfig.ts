/**
 * donation_config tool handler.
 *
 * Returns TheologAI donation configuration: supported tokens,
 * recipient address, and chain details.
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { DonationService } from '../../services/donation/DonationService.js';
import { formatDonationConfig, formatDonationConfigHuman } from '../../formatters/donationFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createDonationConfigHandler(donationService: DonationService): ToolHandler {
  return {
    name: 'donation_config',
    description:
      'Donate to support TheologAI development. All features are free regardless — donations are entirely voluntary. Returns how to donate: supported tokens, recipient address, and transfer options. Use format="human" (default) for a friendly guide, or format="technical" for contract addresses and chain IDs needed by agents with wallet tools.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        format: {
          type: 'string',
          enum: ['human', 'technical'],
          description: 'Response format: "human" for a friendly donation guide (default), "technical" for full contract addresses, chain IDs, and transfer details for agents with wallet tools.',
        },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },

    handler: async (params) => {
      try {
        const format = (params.format as string) ?? 'human';
        const config = donationService.getConfig();
        const text = format === 'technical'
          ? formatDonationConfig(config)
          : formatDonationConfigHuman(config);
        return {
          content: [{ type: 'text' as const, text }],
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

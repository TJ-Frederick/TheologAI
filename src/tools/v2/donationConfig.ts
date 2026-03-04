/**
 * donation_config tool handler.
 *
 * Returns TheologAI donation configuration: supported tokens,
 * recipient address, and chain details.
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { DonationService } from '../../services/donation/DonationService.js';
import { formatDonationConfig } from '../../formatters/donationFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createDonationConfigHandler(donationService: DonationService): ToolHandler {
  return {
    name: 'donation_config',
    description:
      'Donate to support TheologAI development. All features are free regardless — donations are entirely voluntary. Returns how to donate: web link, recipient address, supported tokens with contract addresses, and chain details.',
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
        const text = formatDonationConfig(config);
        return {
          content: [{ type: 'text' as const, text }],
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}

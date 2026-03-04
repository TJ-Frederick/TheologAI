/**
 * Pure Markdown formatting for donation tool responses.
 */

import type {
  DonationConfig,
  DonationVerifyResult,
} from '../kernel/donation-types.js';

export function formatDonationConfigHuman(config: DonationConfig): string {
  let s = '**TheologAI Donations**\n\n';

  s += 'Donations help support TheologAI\'s development and are entirely voluntary — all features are free regardless.\n\n';

  s += '**Easiest option:** Donate via the web at [theologai.pages.dev](https://theologai.pages.dev/), which has a donation section with wallet connection support.\n\n';

  s += '**Manual transfer options:**\n';
  s += '- USDC on Base (lowest fees, recommended)\n';
  s += '- USDC or ETH on Ethereum\n';
  s += '- SBC on Radius\n\n';

  s += `Recipient address: \`${config.recipientAddress}\`\n\n`;

  s += '---\n\n';
  s += '*If the user has a wallet MCP tool available, you can help them send a transaction directly — call `donation_config` with format="technical" to get the contract addresses and chain details needed.*';

  return s.trim();
}

export function formatDonationConfig(config: DonationConfig): string {
  let s = '**TheologAI Donation Options**\n\n';

  s += `**Recipient:** \`${config.recipientAddress}\`\n\n`;

  s += '| Token | Chain | Contract | Decimals |\n';
  s += '|-------|-------|----------|----------|\n';
  for (const t of config.tokens) {
    const contract = t.isNative ? 'native' : `\`${t.asset}\``;
    s += `| ${t.symbol} | ${t.chainName} | ${contract} | ${t.decimals} |\n`;
  }

  s += '\n*Donations are entirely voluntary and do not gate any features.*\n\n';
  s += '*For agents with wallet tools: use the contract addresses and chain IDs above to construct a direct transfer to the recipient address.*';

  return s.trim();
}

export function formatDonationVerifyResult(result: DonationVerifyResult): string {
  const status = result.confirmed ? 'Confirmed' : 'Pending';
  let s = `**Donation ${status}**\n\n`;

  s += `| Field | Value |\n`;
  s += `|-------|-------|\n`;
  s += `| Amount | ${result.amount} ${result.symbol} |\n`;
  s += `| Chain | ${result.chainName} |\n`;
  s += `| From | \`${result.from}\` |\n`;
  s += `| Transaction | \`${result.txHash}\` |\n`;

  if (result.explorerUrl) {
    s += `\n[View on Explorer](${result.explorerUrl})\n`;
  }

  if (!result.isToRecipient) {
    s += '\n**Warning:** This transaction was not sent to the TheologAI donation address.\n';
  } else {
    s += `\nThank you for your donation of ${result.amount} ${result.symbol} on ${result.chainName}!\n`;
  }

  return s.trim();
}

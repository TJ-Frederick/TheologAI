/**
 * Pure Markdown formatting for donation tool responses.
 */

import type {
  DonationConfig,
  DonationVerifyResult,
} from '../kernel/donation-types.js';

export function formatDonationConfig(config: DonationConfig): string {
  let s = '**TheologAI Donation Options**\n\n';

  s += `**Recipient:** \`${config.recipientAddress}\`\n\n`;

  s += '| Token | Chain | Contract | Decimals | x402 |\n';
  s += '|-------|-------|----------|----------|------|\n';
  for (const t of config.tokens) {
    const contract = t.isNative ? 'native' : `\`${t.asset}\``;
    const x402 = t.x402Supported ? 'Yes' : 'No';
    s += `| ${t.symbol} | ${t.chainName} | ${contract} | ${t.decimals} | ${x402} |\n`;
  }

  if (config.facilitators.length > 0) {
    s += '\n**x402 Facilitators:**\n';
    for (const f of config.facilitators) {
      s += `- **${f.name}** — ${f.networks.join(', ')}`;
      if (f.requiresApiKey) s += ' (API key required)';
      s += '\n';
    }
  }

  if (config.x402PayEndpoint) {
    s += `\n**x402 Endpoint:** \`${config.x402PayEndpoint}\`\n`;
  }

  s += '\n*Donations are entirely voluntary and do not gate any features.*';

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

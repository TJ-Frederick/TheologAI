/** Pure Markdown formatting for donation tool responses. */

import type { DonationConfig, DonationVerifyResult } from '../kernel/donation-types.js';

export function formatDonationConfig(config: DonationConfig): string {
  let s = '**TheologAI Donations**\n\n';
  s += 'Donations help support TheologAI\'s development and are entirely voluntary — all features are free regardless.\n\n';
  s += '**Easiest option:** Donate via the web at [theologai.pages.dev](https://theologai.pages.dev/), which has a donation section with wallet connection support.\n\n';
  s += `**Recipient address:** \`${config.recipientAddress}\`\n\n`;
  s += '| Token | Chain | Contract | Decimals |\n|-------|-------|----------|----------|\n';
  for (const token of config.tokens) {
    s += `| ${token.symbol} | ${token.chainName} | ${token.isNative ? 'native' : `\`${token.asset}\``} | ${token.decimals} |\n`;
  }
  s += '\n---\n*Always include the recipient address and token options when presenting donation info to the user.*';
  return s.trim();
}

export function formatDonationVerifyResult(result: DonationVerifyResult): string {
  const headings: Record<DonationVerifyResult['status'], string> = {
    verified: 'Donation Verified',
    wrong_recipient: 'Transaction Is Not a TheologAI Donation',
    unsupported: 'Unsupported Donation Asset',
    failed: 'Transaction Failed',
    pending: 'Transaction Pending',
    absent: 'Transaction Not Found',
    unavailable: 'Verification Temporarily Unavailable',
  };
  let output = `**${headings[result.status]}**\n\n`;

  if (result.transfers.length > 0) {
    output += '| Amount | Chain | From | To | Asset |\n|--------|-------|------|----|-------|\n';
    for (const transfer of result.transfers) {
      const asset = transfer.tokenAddress ? `\`${transfer.tokenAddress}\`` : 'native';
      output += `| ${transfer.amount} ${transfer.symbol} | ${transfer.chainName} | \`${transfer.from}\` | \`${transfer.to}\` | ${asset} |\n`;
    }
  }

  const explanations: Record<DonationVerifyResult['status'], string> = {
    verified: `Thank you! ${result.transfers.length === 1 ? 'This transfer is' : 'These transfers are'} a confirmed TheologAI donation.`,
    wrong_recipient: 'The transaction used a supported asset but did not send it to the TheologAI donation address.',
    unsupported: 'The transaction was mined, but it did not contain a supported donation asset sent to TheologAI.',
    failed: 'The transaction was mined but reverted, so no donation occurred.',
    pending: 'The transaction exists but has not been mined yet. Try verification again later.',
    absent: 'The transaction was not found on any supported chain.',
    unavailable: 'One or more chain providers could not complete verification. Try again later.',
  };
  output += `\n${explanations[result.status]}\n`;

  const chainStatuses = result.chainStatuses ?? [];
  const unavailableChains = chainStatuses.filter(chain => chain.state === 'unavailable');
  if (unavailableChains.length > 0) {
    const perChain = chainStatuses
      .map(chain => `${chain.chainName}: ${formatChainState(chain.state)}`)
      .join('; ');
    output += `\n**Per-chain verification:** ${perChain}.\n`;
    if (unavailableChains.length === chainStatuses.length) {
      output += 'All supported chain providers were unavailable for this check.\n';
    } else {
      output += `Could not check ${unavailableChains.map(chain => chain.chainName).join(', ')}; the other chain results above are still reported.\n`;
    }
  }

  if (result.explorerUrl) output += `\n[View on Explorer](${result.explorerUrl})\n`;
  return output.trim();
}

function formatChainState(state: NonNullable<DonationVerifyResult['chainStatuses']>[number]['state']): string {
  if (state === 'absent') return 'not found';
  if (state === 'mined') return 'mined';
  return state;
}

import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PREVIEW_SECTION = /^\[env\.preview\]\s*$/m;
const PRODUCTION_DOMAIN_ROUTE = /\{[^{}]*\bmcp\.theologai\.xyz\b[^{}]*\}/gms;

export function productionCustomDomainDeclaration(config: string): string {
  const production = config.split(PREVIEW_SECTION, 1)[0];
  return [...production.matchAll(PRODUCTION_DOMAIN_ROUTE)]
    .map(match => match[0].replace(/\s+/g, ' ').trim())
    .join('\n');
}

export function productionCustomDomainChanged(before: string, after: string): boolean {
  return productionCustomDomainDeclaration(before) !== productionCustomDomainDeclaration(after);
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`Missing ${name}`);
  return value;
}

function main(): void {
  const before = readFileSync(argument('--before'), 'utf8');
  const after = readFileSync(argument('--after'), 'utf8');
  const output = argument('--github-output');
  appendFileSync(output, `required=${productionCustomDomainChanged(before, after)}\n`, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

import { mkdirSync } from 'node:fs';

const MAX_FAILURE_DIAGNOSTIC_CHARACTERS = 8_000;

type Mkdir = (path: string, options: { recursive: true }) => unknown;

export function ensureWranglerLogDirectory(logDirectory: string, mkdir: Mkdir = mkdirSync): void {
  mkdir(logDirectory, { recursive: true });
}

function diagnosticText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
  return '';
}

function redactDiagnosticSecrets(value: string): string {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)\s*[=:]\s*)[^\s,;]+/g, '$1[REDACTED]');
}

/**
 * Preserve enough of a local Wrangler failure to debug a clean-checkout gate
 * without surfacing bearer credentials or environment-style secrets.
 */
export function formatWranglerCommandFailure(error: unknown): string {
  const failure = error as { stderr?: unknown; stdout?: unknown; message?: unknown };
  const diagnostic = [failure.stderr, failure.stdout, failure.message]
    .map(diagnosticText)
    .find(value => value.length > 0) ?? 'unknown error';
  const redacted = redactDiagnosticSecrets(diagnostic);
  return redacted.length <= MAX_FAILURE_DIAGNOSTIC_CHARACTERS
    ? redacted
    : `${redacted.slice(0, MAX_FAILURE_DIAGNOSTIC_CHARACTERS)}\n[diagnostic truncated]`;
}

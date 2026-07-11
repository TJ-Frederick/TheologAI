export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_ALLOWED_ORIGIN = 'https://theologai.pages.dev';
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export interface NodeHttpConfig {
  host: string;
  port: number;
  allowedHosts: string[];
  allowedOrigins: string[];
  maxBodyBytes: number;
}

export function readNodeHttpConfig(
  env: NodeJS.ProcessEnv,
  options: { allowEphemeralPort?: boolean } = {},
): NodeHttpConfig {
  const host = env.HOST?.trim() || DEFAULT_HTTP_HOST;
  const port = parsePort(env.PORT, options.allowEphemeralPort ?? false);
  const allowedOrigins = parseOrigins(env.MCP_ALLOWED_ORIGINS);
  const maxBodyBytes = parsePositiveInteger(
    env.MCP_MAX_BODY_BYTES,
    'MCP_MAX_BODY_BYTES',
    DEFAULT_MAX_BODY_BYTES,
  );
  const configuredHosts = parseList(env.MCP_ALLOWED_HOSTS).map(normalizeHostname);
  const allowedHosts = unique([
    normalizeHostname(host),
    ...(isLoopback(host) ? ['127.0.0.1', 'localhost', '::1'] : []),
    ...configuredHosts,
  ]);

  return {
    host,
    port,
    allowedHosts,
    allowedOrigins,
    maxBodyBytes,
  };
}

function parsePositiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`Invalid ${name}: ${value}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Invalid ${name}: ${value}`);
  return parsed;
}

function parsePort(value: string | undefined, allowEphemeralPort: boolean): number {
  if (!value) throw new Error('PORT is required for HTTP mode');
  if (!/^\d+$/.test(value)) throw new Error(`Invalid PORT: ${value}`);

  const port = Number(value);
  const minimum = allowEphemeralPort ? 0 : 1;
  if (!Number.isSafeInteger(port) || port < minimum || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function parseOrigins(value: string | undefined): string[] {
  const origins = value === undefined ? [DEFAULT_ALLOWED_ORIGIN] : parseList(value);
  return unique(origins.map(origin => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid MCP_ALLOWED_ORIGINS entry: ${origin}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`MCP_ALLOWED_ORIGINS entries must be exact HTTP origins: ${origin}`);
    }
    return origin;
  }));
}

function parseList(value: string | undefined): string[] {
  return value?.split(',').map(item => item.trim()).filter(Boolean) ?? [];
}

export function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isLoopback(host: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(normalizeHostname(host));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

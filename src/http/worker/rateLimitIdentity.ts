/** Domain-separated keys; caller-controlled headers never subdivide an IP. */
export async function hashRateLimitIp(ip: string, scope: string): Promise<string> {
  const input = new TextEncoder().encode(`${scope}\0${ip.trim().toLowerCase()}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

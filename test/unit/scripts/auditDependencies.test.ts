import { describe, expect, it } from 'vitest';
import { evaluateAudit } from '../../../scripts/audit-dependencies.mjs';

const pool = '@cloudflare/vitest-pool-workers';
const poolPath = `node_modules/${pool}`;
const zodPath = `${poolPath}/node_modules/zod`;
const now = new Date('2026-10-23T00:00:00Z');
function fixture() {
  const report = {
    metadata: { vulnerabilities: { high: 2 } },
    vulnerabilities: {
      zod: { severity: 'high', isDirect: false, nodes: [zodPath], effects: [pool], via: [{
        url: 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5', severity: 'high',
      }] },
      [pool]: { severity: 'high', via: ['zod'], nodes: [poolPath], effects: [] },
    } as Record<string, { severity: string; isDirect?: boolean; nodes?: string[]; effects?: string[]; via?: unknown[] }>,
  };
  const lock = { packages: {
    [poolPath]: { version: '0.18.8', dev: true },
    [zodPath]: { version: '3.25.76', dev: true },
  } };
  return { report, lock };
}
describe('high-severity dependency gate', () => {
  it('accepts a clean report and only the exact documented development exception', () => {
    const { report, lock } = fixture();
    expect(evaluateAudit({ ...report, vulnerabilities: {} }, lock, now).blocking).toEqual([]);
    expect(evaluateAudit(report, lock, now)).toMatchObject({ blocking: [], exceptions: ['zod', pool] });
  });
  it('continues to reject an unrelated high or critical advisory', () => {
    for (const severity of ['high', 'critical']) {
      const { report, lock } = fixture();
      report.vulnerabilities.other = { severity };
      expect(evaluateAudit(report, lock, now).blocking).toEqual(['other']);
    }
  });
  it('rejects broader affected paths, production dependencies, version drift, and expiry', () => {
    for (const mutation of ['path', 'production', 'version', 'direct', 'advisory', 'expiry']) {
      const { report, lock } = fixture();
      if (mutation === 'path') report.vulnerabilities.zod!.nodes!.push('node_modules/zod');
      if (mutation === 'production') lock.packages[zodPath]!.dev = false;
      if (mutation === 'version') lock.packages[poolPath]!.version = '0.19.0';
      if (mutation === 'direct') report.vulnerabilities.zod!.isDirect = true;
      if (mutation === 'advisory') report.vulnerabilities.zod!.via!.push({ url: 'another advisory' });
      expect(evaluateAudit(report, lock, mutation === 'expiry' ? new Date('2026-11-22') : now).blocking).toEqual(['zod', pool]);
    }
  });
  it('fails closed on missing evidence and registry errors', () => {
    const { report, lock } = fixture();
    for (const input of [{}, { ...report, error: { code: 'EHTTP' } }]) {
      expect(() => evaluateAudit(input, lock, now)).toThrow('evidence');
    }
  });
});

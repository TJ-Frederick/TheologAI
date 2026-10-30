/** Fail closed on high/critical advisories, with one bounded dev-only exception. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const POOL = '@cloudflare/vitest-pool-workers';
const POOL_PATH = `node_modules/${POOL}`;
const ZOD_PATH = `${POOL_PATH}/node_modules/zod`;
const ADVISORY = 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5';
const EXPIRES = '2026-11-22T00:00:00Z';
const exactly = (value, expected) => JSON.stringify(value) === JSON.stringify(expected);

export function evaluateAudit(report, lock, now = new Date()) {
  if (report?.error || !report?.vulnerabilities || !report?.metadata?.vulnerabilities || !lock?.packages) {
    throw new Error('Missing or invalid npm audit/lock evidence');
  }
  const zod = report.vulnerabilities.zod;
  const pool = report.vulnerabilities[POOL];
  const exceptionApplies = now.getTime() < Date.parse(EXPIRES)
    && lock.packages[POOL_PATH]?.version === '0.18.8'
    && lock.packages[POOL_PATH]?.dev === true
    && lock.packages[ZOD_PATH]?.version === '3.25.76'
    && lock.packages[ZOD_PATH]?.dev === true
    && zod?.severity === 'high' && zod.isDirect === false
    && exactly(zod.nodes, [ZOD_PATH]) && exactly(zod.effects, [POOL])
    && zod.via?.length === 1 && zod.via[0]?.url === ADVISORY
    && zod.via[0]?.severity === 'high'
    && pool?.severity === 'high' && exactly(pool.via, ['zod'])
    && exactly(pool.nodes, [POOL_PATH]) && exactly(pool.effects, []);
  const exceptions = exceptionApplies ? ['zod', POOL] : [];
  const blocking = Object.entries(report.vulnerabilities)
    .filter(([name, finding]) => ['high', 'critical'].includes(finding.severity) && !exceptions.includes(name))
    .map(([name]) => name);
  return { blocking, exceptions, exceptionExpires: EXPIRES };
}

export function main() {
  const result = spawnSync('npm', ['audit', '--package-lock-only', '--include=dev', '--json'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('npm audit failed to produce usable evidence');
  const report = JSON.parse(result.stdout);
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const assessment = evaluateAudit(report, lock);
  console.log(JSON.stringify({ ...assessment, totals: report.metadata.vulnerabilities }, null, 2));
  if (assessment.exceptions.length) {
    console.log(`Dev-only exception: ${ADVISORY}; expires ${assessment.exceptionExpires}. See docs/RELEASE-SECURITY-REMEDIATION.md.`);
  }
  if (assessment.blocking.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

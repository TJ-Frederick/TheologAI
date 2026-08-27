/**
 * Execute one command while streaming stdout and stderr into bounded files.
 *
 * The child is terminated as soon as either stream exceeds the byte budget.
 * Chunks are treated as bytes (never as JavaScript characters), so a UTF-8
 * chunk split across reads cannot bypass the limit. No unbounded command
 * output is accumulated in memory or queued in a writable stream.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const DEFAULT_MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const TERMINATION_GRACE_MS = 250;
const TERMINATION_TIMEOUT_MS = 2_000;
const SHA256 = /^[0-9a-f]{64}$/;

export interface BoundedCommandOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdoutPath: string;
  stderrPath: string;
  maxBytes?: number;
  stdoutPrefix?: string;
}

export interface BoundedCommandResult {
  schemaVersion: 'theologai-bounded-command.v1';
  exitStatus: number | null;
  signal: NodeJS.Signals | null;
  overflow: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutSha256: string;
  stderrSha256: string;
}

export class BoundedCommandError extends Error {
  readonly result: BoundedCommandResult;

  constructor(result: BoundedCommandResult) {
    super(result.overflow
      ? 'bounded command output exceeded its byte budget'
      : `bounded command exited with status ${result.exitStatus ?? `signal ${result.signal ?? 'unknown'}`}`);
    this.name = 'BoundedCommandError';
    this.result = result;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Bounded command refused: ${message}.`);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function alive(child: ReturnType<typeof spawn>): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function signalProcessGroup(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    // Detached children form their own group, so descendants cannot survive
    // an output overflow. A negative PID targets the complete process group.
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill(signal);
  }
}

async function terminate(child: ReturnType<typeof spawn>): Promise<void> {
  if (!alive(child)) return;
  signalProcessGroup(child, 'SIGTERM');
  await new Promise(resolve => setTimeout(resolve, TERMINATION_GRACE_MS));
  if (alive(child)) signalProcessGroup(child, 'SIGKILL');
  // A descendant that inherited a pipe must not hold the parent close event
  // open indefinitely after the process group has been signalled.
  child.stdout?.destroy();
  child.stderr?.destroy();
  await new Promise(resolve => setTimeout(resolve, 25));
}

async function closeAfterTermination(
  closePromise: Promise<[number | null, NodeJS.Signals | null]>,
  termination: () => Promise<void> | undefined,
): Promise<[number | null, NodeJS.Signals | null]> {
  let closed = false;
  closePromise.then(() => { closed = true; }, () => { closed = true; });
  const waitForTermination = async (): Promise<[number | null, NodeJS.Signals | null]> => {
    while (!closed && !termination()) await new Promise(resolve => setTimeout(resolve, 10));
    if (closed) throw new Error('bounded command close race was lost');
    const terminated = termination();
    if (!terminated) throw new Error('bounded command termination state was lost');
    await terminated;
    return Promise.race([
      closePromise,
      new Promise<[number | null, NodeJS.Signals | null]>((_, reject) => {
        setTimeout(() => reject(new Error('bounded command did not close after termination')), TERMINATION_TIMEOUT_MS);
      }),
    ]);
  };
  return Promise.race([closePromise, waitForTermination()]);
}

async function consume(
  stream: NodeJS.ReadableStream,
  handle: Awaited<ReturnType<typeof open>>,
  maxBytes: number,
  onOverflow: () => Promise<void>,
  isTerminating: () => boolean,
  initial: Buffer = Buffer.alloc(0),
): Promise<{ bytes: number; hash: string; overflow: boolean }> {
  const digest = createHash('sha256');
  digest.update(initial);
  let bytes = initial.byteLength;
  let overflow = false;
  try {
    for await (const value of stream as AsyncIterable<Buffer | string>) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = maxBytes - bytes;
      if (chunk.byteLength > remaining) {
        if (remaining > 0) {
          const prefix = chunk.subarray(0, remaining);
          await handle.write(prefix);
          digest.update(prefix);
          bytes += prefix.byteLength;
        }
        overflow = true;
        await onOverflow();
        break;
      }
      await handle.write(chunk);
      digest.update(chunk);
      bytes += chunk.byteLength;
    }
  } catch (error) {
    // The peer stream is destroyed when the other stream overflows. This is
    // expected cleanup, not a successful uncapped command.
    if (!isTerminating()) throw error;
  }
  return { bytes, hash: digest.digest('hex'), overflow };
}

export async function runBoundedCommand(options: BoundedCommandOptions): Promise<BoundedCommandResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_CAPTURE_BYTES;
  assert(Number.isSafeInteger(maxBytes) && maxBytes > 0, 'maxBytes must be a positive safe integer');
  assert(options.command.length > 0, 'command is required');
  const prefix = Buffer.from(options.stdoutPrefix ?? '', 'utf8');
  assert(prefix.byteLength <= maxBytes, 'stdout prefix exceeds maxBytes');

  const stdout = await open(options.stdoutPath, 'wx');
  let stderr: Awaited<ReturnType<typeof open>>;
  try {
    stderr = await open(options.stderrPath, 'wx');
  } catch (error) {
    await stdout.close();
    throw error;
  }
  if (prefix.byteLength > 0) await stdout.write(prefix);
  let child: ReturnType<typeof spawn> | undefined;
  let overflow = false;
  let termination: Promise<void> | undefined;
  const stop = async () => {
    overflow = true;
    if (!termination && child) termination = terminate(child);
    await termination;
  };

  try {
    child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const childProcess = child;
    const closePromise = new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
      childProcess.once('close', (code, signal) => resolve([code, signal]));
      childProcess.once('error', reject);
    });
    const stdoutPromise = consume(childProcess.stdout!, stdout, maxBytes, stop, () => overflow, prefix);
    const stderrPromise = consume(childProcess.stderr!, stderr, maxBytes, stop, () => overflow);
    const close = await closeAfterTermination(closePromise, () => termination);
    await termination;
    const [exitStatus, signal] = close;
    const stdoutResult = await stdoutPromise;
    const stderrResult = await stderrPromise;
    const result: BoundedCommandResult = {
      schemaVersion: 'theologai-bounded-command.v1',
      exitStatus,
      signal,
      overflow: overflow || stdoutResult.overflow || stderrResult.overflow,
      stdoutBytes: stdoutResult.bytes,
      stderrBytes: stderrResult.bytes,
      stdoutSha256: stdoutResult.hash,
      stderrSha256: stderrResult.hash,
    };
    if (result.overflow || result.exitStatus !== 0) throw new BoundedCommandError(result);
    return result;
  } finally {
    await Promise.allSettled([stdout.close(), stderr.close()]);
  }
}

function parseCli(argv: string[]): { options: BoundedCommandOptions; resultPath?: string } {
  const separator = argv.indexOf('--');
  assert(separator > 0, 'command separator -- is required');
  const flags = argv.slice(0, separator);
  const command = argv[separator + 1];
  const args = argv.slice(separator + 2);
  const values = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const key = flags[index];
    const value = flags[index + 1];
    assert(typeof key === 'string' && key.startsWith('--') && typeof value === 'string' && value.length > 0 && !values.has(key), 'arguments are malformed');
    values.set(key, value);
  }
  assert(values.has('--stdout') && values.has('--stderr'), 'stdout and stderr paths are required');
  const max = values.get('--max-bytes');
  const maxBytes = max === undefined ? undefined : Number(max);
  if (max !== undefined) assert(Number.isSafeInteger(maxBytes), 'max-bytes is malformed');
  return {
    resultPath: values.get('--result'),
    options: {
      command: command!, args,
      cwd: values.get('--cwd'),
      stdoutPath: values.get('--stdout')!, stderrPath: values.get('--stderr')!,
      maxBytes, stdoutPrefix: values.get('--stdout-prefix'),
    },
  };
}

async function cli(argv: string[]): Promise<void> {
  const { options, resultPath } = parseCli(argv);
  try {
    const result = await runBoundedCommand(options);
    const output = `${JSON.stringify(result)}\n`;
    if (resultPath) await writeFile(resultPath, output, { encoding: 'utf8', flag: 'wx' });
    process.stdout.write(output);
  } catch (error) {
    if (error instanceof BoundedCommandError) {
      const output = `${JSON.stringify(error.result)}\n`;
      if (resultPath) await writeFile(resultPath, output, { encoding: 'utf8', flag: 'wx' }).catch(() => undefined);
      process.stderr.write(output);
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export function isBoundedCommandResult(value: unknown): value is BoundedCommandResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<BoundedCommandResult>;
  return result.schemaVersion === 'theologai-bounded-command.v1'
    && (result.exitStatus === null || Number.isSafeInteger(result.exitStatus))
    && (result.signal === null || typeof result.signal === 'string')
    && typeof result.overflow === 'boolean'
    && Number.isSafeInteger(result.stdoutBytes) && Number.isSafeInteger(result.stderrBytes)
    && typeof result.stdoutSha256 === 'string' && SHA256.test(result.stdoutSha256)
    && typeof result.stderrSha256 === 'string' && SHA256.test(result.stderrSha256);
}

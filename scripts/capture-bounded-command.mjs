/**
 * Execute one command while streaming stdout and stderr into bounded files.
 *
 * This entrypoint intentionally uses only Node.js built-ins. It runs before
 * npm ci in the protected rehearsal workflow, so it cannot depend on the
 * repository's node_modules directory.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';

export const DEFAULT_MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const TERMINATION_GRACE_MS = 250;
const TERMINATION_TIMEOUT_MS = 2_000;
const SHA256 = /^[0-9a-f]{64}$/;

export class BoundedCommandError extends Error {
  constructor(result) {
    super(result.overflow
      ? 'bounded command output exceeded its byte budget'
      : `bounded command exited with status ${result.exitStatus ?? `signal ${result.signal ?? 'unknown'}`}`);
    this.name = 'BoundedCommandError';
    this.result = result;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Bounded command refused: ${message}.`);
}

function alive(child) {
  return child.exitCode === null && child.signalCode === null;
}

function signalProcessGroup(child, processGroupId, signal) {
  if (!processGroupId) return;
  try {
    // Detached children form their own group, so descendants cannot survive
    // an output overflow. A negative PID targets the complete process group.
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH' && alive(child)) child.kill(signal);
  }
}

async function terminate(child, processGroupId) {
  // The leader may have exited while a descendant still owns a pipe. Always
  // signal the saved process group so that descendant cannot survive overflow.
  signalProcessGroup(child, processGroupId, 'SIGTERM');
  await new Promise(resolve => setTimeout(resolve, TERMINATION_GRACE_MS));
  signalProcessGroup(child, processGroupId, 'SIGKILL');
  // A descendant that inherited a pipe must not hold the parent close event
  // open indefinitely after the process group has been signalled.
  child.stdout?.destroy();
  child.stderr?.destroy();
  await new Promise(resolve => setTimeout(resolve, 25));
}

async function exitAfterTermination(exitPromise, termination) {
  let closed = false;
  exitPromise.then(() => { closed = true; }, () => { closed = true; });
  const waitForTermination = async () => {
    while (!closed && !termination()) await new Promise(resolve => setTimeout(resolve, 10));
    if (closed) throw new Error('bounded command close race was lost');
    const terminated = termination();
    if (!terminated) throw new Error('bounded command termination state was lost');
    await terminated;
    return Promise.race([
      exitPromise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('bounded command did not close after termination')), TERMINATION_TIMEOUT_MS);
      }),
    ]);
  };
  return Promise.race([exitPromise, waitForTermination()]);
}

async function consume(stream, handle, maxBytes, onOverflow, isTerminating, initial = Buffer.alloc(0)) {
  const digest = createHash('sha256');
  digest.update(initial);
  let bytes = initial.byteLength;
  let overflow = false;
  try {
    for await (const value of stream) {
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

export async function runBoundedCommand(options) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_CAPTURE_BYTES;
  assert(Number.isSafeInteger(maxBytes) && maxBytes > 0, 'maxBytes must be a positive safe integer');
  assert(typeof options.command === 'string' && options.command.length > 0, 'command is required');
  const prefix = Buffer.from(options.stdoutPrefix ?? '', 'utf8');
  assert(prefix.byteLength <= maxBytes, 'stdout prefix exceeds maxBytes');

  const stdout = await open(options.stdoutPath, 'wx');
  let stderr;
  try {
    stderr = await open(options.stderrPath, 'wx');
  } catch (error) {
    await stdout.close();
    throw error;
  }
  if (prefix.byteLength > 0) await stdout.write(prefix);
  let child;
  let processGroupId;
  let overflow = false;
  let termination;
  const stop = async () => {
    overflow = true;
    if (!termination && child && processGroupId) termination = terminate(child, processGroupId);
    await termination;
  };

  try {
    child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const childProcess = child;
    processGroupId = childProcess.pid;
    const exitPromise = new Promise((resolve, reject) => {
      childProcess.once('exit', (code, signal) => resolve([code, signal]));
      childProcess.once('error', reject);
    });
    const stdoutPromise = consume(childProcess.stdout, stdout, maxBytes, stop, () => overflow, prefix);
    const stderrPromise = consume(childProcess.stderr, stderr, maxBytes, stop, () => overflow);
    const [exitStatus, signal] = await exitAfterTermination(exitPromise, () => termination);
    await termination;
    const stdoutResult = await stdoutPromise;
    const stderrResult = await stderrPromise;
    const result = {
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

function parseCli(argv) {
  const separator = argv.indexOf('--');
  assert(separator > 0, 'command separator -- is required');
  const flags = argv.slice(0, separator);
  const command = argv[separator + 1];
  const args = argv.slice(separator + 2);
  const values = new Map();
  for (let index = 0; index < flags.length; index += 2) {
    const key = flags[index];
    const value = flags[index + 1];
    assert(typeof key === 'string' && key.startsWith('--') && typeof value === 'string' && value.length > 0 && !values.has(key), 'arguments are malformed');
    values.set(key, value);
  }
  assert(typeof command === 'string' && command.length > 0, 'command is required');
  assert(values.has('--stdout') && values.has('--stderr'), 'stdout and stderr paths are required');
  const max = values.get('--max-bytes');
  const maxBytes = max === undefined ? undefined : Number(max);
  if (max !== undefined) assert(Number.isSafeInteger(maxBytes), 'max-bytes is malformed');
  return {
    resultPath: values.get('--result'),
    options: {
      command,
      args,
      cwd: values.get('--cwd'),
      stdoutPath: values.get('--stdout'),
      stderrPath: values.get('--stderr'),
      maxBytes,
      stdoutPrefix: values.get('--stdout-prefix'),
    },
  };
}

async function cli(argv) {
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

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  cli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export function isBoundedCommandResult(value) {
  if (!value || typeof value !== 'object') return false;
  const result = value;
  return result.schemaVersion === 'theologai-bounded-command.v1'
    && (result.exitStatus === null || Number.isSafeInteger(result.exitStatus))
    && (result.signal === null || typeof result.signal === 'string')
    && typeof result.overflow === 'boolean'
    && Number.isSafeInteger(result.stdoutBytes) && result.stdoutBytes >= 0
    && Number.isSafeInteger(result.stderrBytes) && result.stderrBytes >= 0
    && typeof result.stdoutSha256 === 'string' && SHA256.test(result.stdoutSha256)
    && typeof result.stderrSha256 === 'string' && SHA256.test(result.stderrSha256);
}

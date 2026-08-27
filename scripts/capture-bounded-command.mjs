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
import { constants as osConstants } from 'node:os';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
const TERMINATION_GRACE_MS = 250;
const TERMINATION_TIMEOUT_MS = 2_000;
const SIGNAL_NAMES = new Set(Object.keys(osConstants.signals));

export class BoundedCommandError extends Error {
  constructor(result) {
    super(result.overflow
      ? 'bounded command output exceeded its byte budget'
      : `bounded command exited with status ${result.exitStatus ?? `signal ${result.signal ?? 'unknown'}`}`);
    this.name = 'BoundedCommandError';
    this.result = result;
  }
}

function isSignal(value) {
  return value === null || (typeof value === 'string' && SIGNAL_NAMES.has(value));
}

function isOutcome(exitStatus, signal) {
  return (Number.isSafeInteger(exitStatus) && exitStatus >= 0 && signal === null)
    || (exitStatus === null && typeof signal === 'string' && isSignal(signal));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function boundedAwait(promise, timeoutMs, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Bounded command refused: ${message}.`);
}

function alive(child) {
  return child.exitCode === null && child.signalCode === null;
}

function defaultSignalGroup(processGroupId, signal) {
  process.kill(-processGroupId, signal);
}

function signalProcessGroup(child, processGroupId, signal, signalGroup = defaultSignalGroup) {
  if (!processGroupId) return;
  try {
    // Detached children form their own group, so descendants cannot survive
    // an output overflow. A negative PID targets the complete process group.
    signalGroup(processGroupId, signal);
    return true;
  } catch (error) {
    return false;
  }
}

function signalChild(child, signal, signaler) {
  if (!alive(child)) return false;
  try {
    return signaler(child, signal) === true;
  } catch {
    return false;
  }
}

function destroy(stream) {
  try { stream?.destroy(); } catch { /* cleanup must remain best-effort */ }
}

async function terminate(child, processGroupId, signalGroup = defaultSignalGroup, signaler = (target, signal) => {
  if (!alive(target)) return false;
  try { return target.kill(signal); } catch { return false; }
}) {
  try {
    // The supervisor remains alive until the parent acknowledges completion,
    // so this PGID cannot be reused during TERM -> KILL escalation.
    const termGroup = signalProcessGroup(child, processGroupId, 'SIGTERM', signalGroup);
    if (!termGroup) {
      // The group identity is no longer trustworthy. Use only the direct
      // supervisor handle and never send a delayed signal to that stale PGID.
      signalChild(child, 'SIGTERM', signaler);
      return { groupIdentityLost: true };
    }
    await wait(TERMINATION_GRACE_MS);
    const killGroup = signalProcessGroup(child, processGroupId, 'SIGKILL', signalGroup);
    if (!killGroup) {
      // Do not retry the saved PGID after this point: it may be stale. A direct
      // handle is safe to attempt once, and failure remains bounded.
      signalChild(child, 'SIGKILL', signaler);
    }
    return { groupIdentityLost: !killGroup };
  } finally {
    // A descendant that inherited a pipe must not hold the parent close event
    // open indefinitely after the process group has been signalled.
    destroy(child.stdout);
    destroy(child.stderr);
  }
}

async function settleWithin(promises, timeoutMs = TERMINATION_TIMEOUT_MS) {
  try {
    await boundedAwait(Promise.allSettled(promises), timeoutMs, 'bounded command cleanup timed out');
  } catch {
    // Cleanup is deliberately best effort after the bounded deadline.
  }
}

function sendAck(child) {
  return new Promise((resolve, reject) => {
    if (!child.connected || typeof child.send !== 'function') {
      reject(new Error('bounded command supervisor IPC channel is unavailable'));
      return;
    }
    try {
      child.send({ type: 'ack' }, error => error ? reject(error) : resolve());
    } catch (error) {
      reject(error);
    }
  });
}

function sendAbort(child) {
  return new Promise((resolve, reject) => {
    if (!child.connected || typeof child.send !== 'function') {
      resolve(false);
      return;
    }
    try {
      child.send({ type: 'abort' }, error => error ? reject(error) : resolve(true));
    } catch (error) {
      reject(error);
    }
  });
}

async function abortSupervisor(child, exitPromise) {
  try {
    await boundedAwait(sendAbort(child), TERMINATION_TIMEOUT_MS, 'bounded command supervisor abort send timed out');
  } catch {
    return;
  }
  try {
    await boundedAwait(exitPromise, TERMINATION_TIMEOUT_MS, 'bounded command supervisor abort exit timed out');
  } catch {
    // The outer runner remains bounded even if the supervisor cannot report
    // its final OS-level exit after self-terminating the stable group.
  }
}

function captureState(initial = Buffer.alloc(0)) {
  const digest = createHash('sha256');
  digest.update(initial);
  return { digest, bytes: initial.byteLength, overflow: false };
}

function captureSnapshot(state) {
  return { bytes: state.bytes, hash: state.digest.copy().digest('hex'), overflow: state.overflow };
}

function relay(source, destination) {
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    source.once('end', finish);
    source.once('error', () => {
      source.destroy();
      finish();
    });
    destination.once('error', () => {
      source.destroy();
      finish();
    });
    source.pipe(destination, { end: false });
  });
}

async function supervisor(argv) {
  const separator = argv.indexOf('--');
  assert(separator >= 0, 'supervisor command separator -- is required');
  const flags = argv.slice(0, separator);
  assert(flags.length === 0, 'supervisor arguments are malformed');
  const command = argv[separator + 1];
  const args = argv.slice(separator + 2);
  assert(typeof command === 'string' && command.length > 0, 'supervisor command is required');

  let signalRequested = false;
  let keeper;
  const keepAliveAfterTermination = () => {
    signalRequested = true;
    // This referenced handle deliberately remains alive until the outer
    // runner's SIGKILL. It pins the supervisor's process group after the
    // requested command and its relays have closed.
    keeper ??= setInterval(() => undefined, 1_000_000_000);
  };
  // The supervisor is the stable process-group leader. It must not exit when
  // the group receives SIGTERM; the outer runner escalates to SIGKILL after
  // its grace interval if output overflow is still being handled.
  process.on('SIGTERM', keepAliveAfterTermination);
  process.on('SIGINT', keepAliveAfterTermination);
  process.on('message', message => {
    if (message?.type !== 'abort') return;
    // This signal originates inside the still-live supervisor, so its own
    // process group identity is stable and cannot refer to a reused PGID.
    try {
      process.kill(-process.pid, 'SIGKILL');
    } catch {
      try { process.kill(process.pid, 'SIGKILL'); } catch { /* best effort */ }
    }
  });
  process.stdout.on('error', () => undefined);
  process.stderr.on('error', () => undefined);

  const commandProcess = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdoutRelay = relay(commandProcess.stdout, process.stdout);
  const stderrRelay = relay(commandProcess.stderr, process.stderr);
  const [exitStatus, signal] = await new Promise((resolve, reject) => {
    commandProcess.once('error', reject);
    commandProcess.once('close', (code, childSignal) => resolve([code, childSignal]));
  });
  assert(isOutcome(exitStatus, signal), 'supervisor exit outcome is malformed');
  // ChildProcess close is emitted only after its pipe-backed stdio closes, so
  // a descendant that inherited either pipe pins this supervisor in the same
  // process group until the outer runner can observe all output.
  await Promise.all([stdoutRelay, stderrRelay]);
  process.stdout.end();
  process.stderr.end();
  assert(typeof process.send === 'function', 'supervisor IPC channel is unavailable');
  await new Promise((resolve, reject) => {
    try {
      process.send({ type: 'completion', exitStatus, signal }, error => error ? reject(error) : resolve());
    } catch (error) {
      reject(error);
    }
  });
  await new Promise((resolve, reject) => {
    const onMessage = message => {
      process.off('disconnect', onDisconnect);
      if (message?.type === 'ack') resolve();
      else reject(new Error('bounded command supervisor received malformed acknowledgement'));
    };
    const onDisconnect = () => {
      process.off('message', onMessage);
      reject(new Error('bounded command supervisor IPC channel disconnected'));
    };
    process.once('message', onMessage);
    process.once('disconnect', onDisconnect);
  });
  if (signalRequested) await new Promise(() => undefined);
  if (signal) {
    // The child outcome is authoritative. The supervisor is only a control
    // process; replaying the child's signal can be ignored or reserved by
    // Node (for example SIGPIPE), so exit neutrally after the ACK.
    process.disconnect();
    process.exit(0);
    return;
  }
  process.disconnect();
  process.exit(exitStatus ?? 0);
}

async function waitForCompletionOrTermination(completionPromise, exitPromise, isTerminating) {
  let completion;
  let completionFailure;
  let complete = false;
  let exited = false;
  completionPromise.then(value => { completion = value; complete = true; }, error => {
    completionFailure = error;
    complete = true;
  });
  exitPromise.then(() => { exited = true; }, error => {
    completionFailure = error;
    exited = true;
  });
  while (!isTerminating() && !complete && !exited) await wait(10);
  if (isTerminating()) return undefined;
  if (completionFailure) throw completionFailure;
  if (!complete) throw new Error('bounded command supervisor exited without completion');
  return completion;
}

async function consume(stream, handle, maxBytes, onOverflow, onCaptureFailure, isTerminating, state) {
  try {
    for await (const value of stream) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = maxBytes - state.bytes;
      if (chunk.byteLength > remaining) {
        state.overflow = true;
        // Start group termination before waiting on the final bounded write;
        // a slow or wedged sink must not postpone killing an overflowing
        // producer. The write is still given a bounded chance to preserve the
        // deterministic prefix already within the byte budget.
        const terminationPromise = onOverflow();
        if (remaining > 0) {
          const prefix = chunk.subarray(0, remaining);
          try {
            await boundedAwait(handle.write(prefix), TERMINATION_TIMEOUT_MS, 'bounded command overflow prefix write timed out');
            state.digest.update(prefix);
            state.bytes += prefix.byteLength;
          } catch {
            // Overflow remains the primary result; termination and stream
            // cleanup are handled by the outer runner.
          }
        }
        await terminationPromise;
        break;
      }
      await handle.write(chunk);
      state.digest.update(chunk);
      state.bytes += chunk.byteLength;
    }
  } catch (error) {
    // The peer stream is destroyed when the other stream overflows. This is
    // expected cleanup, not a successful uncapped command.
    if (!isTerminating()) await onCaptureFailure(error);
  }
  return captureSnapshot(state);
}

export async function runBoundedCommand(options) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_CAPTURE_BYTES;
  assert(Number.isSafeInteger(maxBytes) && maxBytes > 0, 'maxBytes must be a positive safe integer');
  assert(typeof options.command === 'string' && options.command.length > 0, 'command is required');
  const prefix = Buffer.from(options.stdoutPrefix ?? '', 'utf8');
  assert(prefix.byteLength <= maxBytes, 'stdout prefix exceeds maxBytes');

  const openCapture = options.openCapture ?? (path => open(path, 'wx'));
  const stdout = await openCapture(options.stdoutPath);
  let stderr;
  try {
    stderr = await openCapture(options.stderrPath);
  } catch (error) {
    await boundedAwait(stdout.close(), TERMINATION_TIMEOUT_MS, 'bounded command stdout capture close timed out').catch(() => undefined);
    throw error;
  }
  let child;
  let childExitPromise;
  let processGroupId;
  let overflow = false;
  let termination;
  let captureFailure;
  let groupIdentityLost = false;
  const requestTermination = (isOverflow) => {
    if (isOverflow) overflow = true;
    if (!termination && child && processGroupId) {
      termination = terminate(child, processGroupId, options.signalGroup, options.signalChild)
        .then(async result => {
          groupIdentityLost ||= result.groupIdentityLost;
          if (result.groupIdentityLost && childExitPromise) await abortSupervisor(child, childExitPromise);
          return result;
        }, async error => {
          groupIdentityLost = true;
          if (childExitPromise) await abortSupervisor(child, childExitPromise);
          throw error;
        });
    }
    return termination ?? Promise.resolve();
  };
  const stop = () => requestTermination(true);
  const onCaptureFailure = error => {
    captureFailure ??= error;
    return requestTermination(false);
  };

  try {
    if (prefix.byteLength > 0) await stdout.write(prefix);
    child = spawn(process.execPath, [
      fileURLToPath(import.meta.url),
      '--supervise',
      '--', options.command, ...(options.args ?? []),
    ], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      detached: true,
    });
    const childProcess = child;
    processGroupId = childProcess.pid;
    const exitPromise = new Promise((resolve, reject) => {
      childProcess.once('exit', (code, signal) => resolve([code, signal]));
      childProcess.once('error', reject);
    });
    childExitPromise = exitPromise;
    let observedOutcome = [null, 'SIGTERM'];
    exitPromise.then(outcome => { observedOutcome = outcome; }, () => undefined);
    const completionPromise = new Promise((resolve, reject) => {
      const onMessage = message => {
        if (!message || message.type !== 'completion'
          || !isOutcome(message.exitStatus, message.signal)) {
          reject(new Error('bounded command supervisor completion is malformed'));
          return;
        }
        resolve({ exitStatus: message.exitStatus, signal: message.signal });
      };
      const onDisconnect = () => reject(new Error('bounded command supervisor IPC channel disconnected'));
      childProcess.once('message', onMessage);
      childProcess.once('disconnect', onDisconnect);
    });
    const stdoutState = captureState(prefix);
    const stderrState = captureState();
    const stdoutPromise = consume(childProcess.stdout, stdout, maxBytes, stop, onCaptureFailure, () => overflow, stdoutState);
    const stderrPromise = consume(childProcess.stderr, stderr, maxBytes, stop, onCaptureFailure, () => overflow, stderrState);
    const capturesPromise = Promise.all([stdoutPromise, stderrPromise]);
    let completion;
    let captures;
    try {
      completion = await waitForCompletionOrTermination(completionPromise, exitPromise, () => Boolean(termination));
      if (termination) {
        await boundedAwait(termination, TERMINATION_TIMEOUT_MS, 'bounded command termination timed out');
        try {
          captures = await boundedAwait(capturesPromise, TERMINATION_TIMEOUT_MS, 'bounded command capture settle timed out');
        } catch {
          captures = [captureSnapshot(stdoutState), captureSnapshot(stderrState)];
        }
      } else {
        captures = await capturesPromise;
      }
    } catch (error) {
      await requestTermination(false);
      await settleWithin([exitPromise, completionPromise, capturesPromise]);
      throw error;
    }
    if (termination) await termination;
    const [stdoutResult, stderrResult] = captures;
    if (captureFailure) throw captureFailure;
    if (groupIdentityLost && !overflow) throw new Error('bounded command process-group identity was lost during cleanup');
    let exitStatus;
    let signal;
    if (completion) {
      await boundedAwait(sendAck(childProcess), TERMINATION_TIMEOUT_MS, 'bounded command supervisor acknowledgement timed out');
      await boundedAwait(exitPromise, TERMINATION_TIMEOUT_MS, 'bounded command supervisor exit timed out');
      [exitStatus, signal] = [completion.exitStatus, completion.signal];
    } else {
      [exitStatus, signal] = observedOutcome;
    }
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
  } catch (error) {
    await requestTermination(false);
    if (child) {
      await settleWithin([new Promise(resolve => {
        if (!alive(child)) {
          resolve();
          return;
        }
        child.once('exit', resolve);
      })]);
    }
    throw error;
  } finally {
    await settleWithin([stdout.close(), stderr.close()]);
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

if (process.argv[2] === '--supervise') {
  supervisor(process.argv.slice(3)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
} else if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  cli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

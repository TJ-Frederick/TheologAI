import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export interface PublicationOperations {
  rename(source: string, destination: string): void;
  remove?: typeof rmSync;
}

const defaultOperations: PublicationOperations = { rename: renameSync };

function finishPublication(
  transactionRoot: string,
  remove: typeof rmSync,
  install: () => void,
  rollback: () => void = () => {},
): void {
  try {
    install();
  } catch (publicationError) {
    try {
      rollback();
    } catch (rollbackError) {
      throw new AggregateError(
        [publicationError, rollbackError],
        `Publication failed (${String(publicationError)}). Recovery required at ${transactionRoot}: ${String(rollbackError)}`,
        { cause: publicationError },
      );
    }
    try {
      remove(transactionRoot, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [publicationError, cleanupError],
        `Publication rolled back after ${String(publicationError)}, but cleanup failed at ${transactionRoot}: ${String(cleanupError)}`,
        { cause: publicationError },
      );
    }
    throw publicationError;
  }

  try {
    remove(transactionRoot, { recursive: true, force: true });
  } catch (cleanupError) {
    throw new Error(
      `Publication committed, but cleanup failed at ${transactionRoot}: ${String(cleanupError)}`,
      { cause: cleanupError },
    );
  }
}

function assertRelativeFile(path: string): void {
  if (!/^[A-Za-z0-9._/-]+$/.test(path)
    || path.startsWith('/') || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe publication path: ${path}`);
  }
}

export function publishFilesAtomically(
  stagedRoot: string,
  targetRoot: string,
  relativePaths: readonly string[],
  operations: PublicationOperations = defaultOperations,
): void {
  if (relativePaths.length === 0 || new Set(relativePaths).size !== relativePaths.length) {
    throw new Error('Atomic file publication requires a nonempty unique path set');
  }
  for (const path of relativePaths) {
    assertRelativeFile(path);
    const staged = join(stagedRoot, path);
    if (!existsSync(staged) || !statSync(staged).isFile()) throw new Error(`Staged publication file is missing: ${path}`);
  }
  mkdirSync(targetRoot, { recursive: true });
  if (statSync(stagedRoot).dev !== statSync(targetRoot).dev) {
    throw new Error('Atomic publication staging and target must share a filesystem');
  }

  const transactionRoot = mkdtempSync(join(dirname(targetRoot), `.${basename(targetRoot)}-transaction-`));
  const backupRoot = join(transactionRoot, 'backup');
  const remove = operations.remove ?? rmSync;
  const backedUp: string[] = [];
  const published: string[] = [];
  finishPublication(transactionRoot, remove, () => {
    mkdirSync(backupRoot);
    for (const path of relativePaths) {
      const target = join(targetRoot, path);
      if (!existsSync(target)) continue;
      mkdirSync(dirname(join(backupRoot, path)), { recursive: true });
      operations.rename(target, join(backupRoot, path));
      backedUp.push(path);
    }
    for (const path of relativePaths) {
      const target = join(targetRoot, path);
      mkdirSync(dirname(target), { recursive: true });
      operations.rename(join(stagedRoot, path), target);
      published.push(path);
    }
  }, () => {
    const failures: Error[] = [];
    const blockedPaths = new Set<string>();
    for (const path of published.reverse()) {
      const target = join(targetRoot, path);
      try {
        remove(target, { force: true });
      } catch (error) {
        blockedPaths.add(path);
        const recovery = backedUp.includes(path) ? ` (original at ${join(backupRoot, path)})` : '';
        failures.push(new Error(`Remove installed file ${target}${recovery}: ${String(error)}`, { cause: error }));
      }
    }
    for (const path of backedUp.reverse()) {
      if (blockedPaths.has(path)) continue;
      const target = join(targetRoot, path);
      const backup = join(backupRoot, path);
      try {
        operations.rename(backup, target);
      } catch (error) {
        failures.push(new Error(`Restore ${backup} to ${target}: ${String(error)}`, { cause: error }));
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, failures.map(error => error.message).join('\n'));
    }
  });
}

export function publishDirectoryAtomically(
  stagedDirectory: string,
  targetDirectory: string,
  operations: PublicationOperations = defaultOperations,
): void {
  if (!existsSync(stagedDirectory) || !statSync(stagedDirectory).isDirectory()) {
    throw new Error(`Staged publication directory is missing: ${stagedDirectory}`);
  }
  mkdirSync(dirname(targetDirectory), { recursive: true });
  if (statSync(stagedDirectory).dev !== statSync(dirname(targetDirectory)).dev) {
    throw new Error('Atomic directory staging and target must share a filesystem');
  }
  const transactionRoot = mkdtempSync(join(dirname(targetDirectory), `.${basename(targetDirectory)}-transaction-`));
  const backup = join(transactionRoot, 'previous');
  let backedUp = false;
  finishPublication(transactionRoot, operations.remove ?? rmSync, () => {
    if (existsSync(targetDirectory)) {
      operations.rename(targetDirectory, backup);
      backedUp = true;
    }
    operations.rename(stagedDirectory, targetDirectory);
  }, () => {
    if (!backedUp) return;
    try {
      operations.rename(backup, targetDirectory);
    } catch (error) {
      throw new Error(`Restore ${backup} to ${targetDirectory}: ${String(error)}`, { cause: error });
    }
  });
}

export function writeFileAtomically(
  path: string,
  content: string | Buffer,
  operations: PublicationOperations & { write?: typeof writeFileSync } = defaultOperations,
): void {
  mkdirSync(dirname(path), { recursive: true });
  const transactionRoot = mkdtempSync(join(dirname(path), `.${basename(path)}-write-`));
  const staged = join(transactionRoot, basename(path));
  const write = operations.write ?? writeFileSync;
  finishPublication(transactionRoot, operations.remove ?? rmSync, () => {
    write(staged, content);
    operations.rename(staged, path);
  });
}

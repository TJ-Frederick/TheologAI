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
}

const defaultOperations: PublicationOperations = { rename: renameSync };

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
  mkdirSync(backupRoot);
  const backedUp: string[] = [];
  const published: string[] = [];
  try {
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
  } catch (error) {
    for (const path of published.reverse()) rmSync(join(targetRoot, path), { force: true });
    for (const path of backedUp.reverse()) {
      const target = join(targetRoot, path);
      mkdirSync(dirname(target), { recursive: true });
      operations.rename(join(backupRoot, path), target);
    }
    throw error;
  } finally {
    rmSync(transactionRoot, { recursive: true, force: true });
  }
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
  try {
    if (existsSync(targetDirectory)) {
      operations.rename(targetDirectory, backup);
      backedUp = true;
    }
    operations.rename(stagedDirectory, targetDirectory);
  } catch (error) {
    if (existsSync(targetDirectory)) rmSync(targetDirectory, { recursive: true, force: true });
    if (backedUp) operations.rename(backup, targetDirectory);
    throw error;
  } finally {
    rmSync(transactionRoot, { recursive: true, force: true });
  }
}

export function writeFileAtomically(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const transactionRoot = mkdtempSync(join(dirname(path), `.${basename(path)}-write-`));
  const staged = join(transactionRoot, basename(path));
  try {
    writeFileSync(staged, content);
    renameSync(staged, path);
  } finally {
    rmSync(transactionRoot, { recursive: true, force: true });
  }
}

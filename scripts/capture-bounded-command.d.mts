export interface BoundedCommandOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdoutPath: string;
  stderrPath: string;
  maxBytes?: number;
  stdoutPrefix?: string;
  openCapture?: (path: string) => Promise<{ write: (value: Buffer) => Promise<unknown>; close: () => Promise<unknown> }>;
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

export declare class BoundedCommandError extends Error {
  readonly result: BoundedCommandResult;
}

export declare const DEFAULT_MAX_CAPTURE_BYTES: number;
export declare function runBoundedCommand(options: BoundedCommandOptions): Promise<BoundedCommandResult>;
export declare function isBoundedCommandResult(value: unknown): value is BoundedCommandResult;

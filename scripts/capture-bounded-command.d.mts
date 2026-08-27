export interface BoundedCommandOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdoutPath: string;
  stderrPath: string;
  maxBytes?: number;
  stdoutPrefix?: string;
  openCapture?: (path: string) => Promise<{ write: (value: Buffer) => Promise<unknown>; close: () => Promise<unknown> }>;
  /** Receives the positive process-group ID; the default sends to -processGroupId. */
  signalGroup?: (processGroupId: number, signal: NodeJS.Signals) => void;
  signalChild?: (child: unknown, signal: NodeJS.Signals) => boolean;
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
  constructor(result: BoundedCommandResult);
  readonly result: BoundedCommandResult;
}

export declare const DEFAULT_MAX_CAPTURE_BYTES: number;
export declare function runBoundedCommand(options: BoundedCommandOptions): Promise<BoundedCommandResult>;

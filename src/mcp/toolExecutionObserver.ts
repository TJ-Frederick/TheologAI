import type { ToolResult } from '../kernel/types.js';

/**
 * A deliberately small, content-free event for operational tool outcomes.
 *
 * This is an application telemetry contract, not an MCP response field. It
 * must never contain request arguments, result content, raw errors, client
 * identifiers, or provider URLs.
 */
export type ToolExecutionOutcome = 'success' | 'partial' | 'unavailable' | 'invalid' | 'error';

export type ToolExecutionFailureCategory =
  | 'input_validation'
  | 'unknown_tool'
  | 'handler_exception'
  | 'output_contract'
  | 'execution_exception'
  | 'tool_reported_error'
  | 'dependency_unavailable';

export interface ToolExecutionEvent {
  readonly event: 'theologai.tool.execution';
  readonly tool: string;
  readonly outcome: ToolExecutionOutcome;
  readonly durationMs: number;
  readonly releaseVersion: string;
  readonly failureCategory?: ToolExecutionFailureCategory;
}

/** A synchronous, best-effort sink. Callers must not await or depend on it. */
export type ToolExecutionObserver = (event: ToolExecutionEvent) => void;

export const UNKNOWN_TOOL_NAME = 'unknown';
const OBSERVABLE_TOOL_NAMES = [
  'bible_lookup',
  'bible_cross_references',
  'parallel_passages',
  'commentary_lookup',
  'classic_text_lookup',
  'primary_source_search',
  'original_language_lookup',
  'bible_verse_morphology',
  'original_language_study',
  'donation_config',
  'verify_donation',
] as const;
const RELEASE_VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]{1,32})?(?:\+[0-9A-Za-z.-]{1,32})?$/;

export function safeToolName(value: unknown): string {
  return typeof value === 'string' && OBSERVABLE_TOOL_NAMES.includes(value as never) ? value : UNKNOWN_TOOL_NAME;
}

export function safeReleaseVersion(value: unknown): string {
  return typeof value === 'string' && value.length <= 64 && RELEASE_VERSION.test(value) ? value : 'unknown';
}

export function observeToolExecution(
  observer: ToolExecutionObserver | undefined,
  event: ToolExecutionEvent,
): void {
  try {
    // A function typed `() => void` may still accidentally return a Promise.
    // Attach a rejection handler without awaiting so an optional sink cannot
    // create an unhandled rejection or add call latency.
    const delivered = (observer as ((value: ToolExecutionEvent) => unknown) | undefined)?.(event);
    if (isPromiseLike(delivered)) void Promise.resolve(delivered).catch(() => undefined);
  } catch {
    // Observability is best-effort and must never delay or change a tool call.
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value
    && typeof (value as { then?: unknown }).then === 'function';
}

/**
 * Classify only the public, versioned structured fields documented by each
 * tool. Unknown shapes intentionally fall back to the MCP `isError` signal;
 * this avoids parsing prose or guessing meaning from arbitrary payload data.
 */
export function classifyToolResult(tool: string, result: ToolResult): Pick<ToolExecutionEvent, 'outcome' | 'failureCategory'> {
  const structured = asRecord(result.structuredContent);
  const structuredOutcome = classifyKnownStructuredOutcome(tool, structured);
  if (structuredOutcome) return structuredOutcome;
  return result.isError
    ? { outcome: 'error', failureCategory: 'tool_reported_error' }
    : { outcome: 'success' };
}

function classifyKnownStructuredOutcome(
  tool: string,
  structured: Record<string, unknown> | undefined,
): Pick<ToolExecutionEvent, 'outcome' | 'failureCategory'> | undefined {
  if (!structured) return undefined;

  switch (tool) {
    case 'bible_lookup': {
      const passages = asArray(structured.passages);
      const failures = asArray(structured.failures);
      if (passages.length > 0 && failures.length > 0) return { outcome: 'partial' };
      if (passages.length === 0 && failures.length > 0) {
        return { outcome: 'unavailable', failureCategory: 'dependency_unavailable' };
      }
      return undefined;
    }
    case 'parallel_passages':
      return asRecord(structured.textEnrichment)?.completionStatus === 'incomplete'
        ? { outcome: 'partial' }
        : undefined;
    case 'primary_source_search':
      return classifyPlanStatus(structured.planStatus);
    case 'original_language_study':
      return asRecord(structured.study)?.status === 'partial' ? { outcome: 'partial' } : undefined;
    case 'verify_donation': {
      const coverage = asRecord(structured.coverage);
      if (coverage?.availability === 'partial') return { outcome: 'partial' };
      if (coverage?.availability === 'unavailable' || asRecord(structured.classification)?.status === 'unavailable') {
        return { outcome: 'unavailable', failureCategory: 'dependency_unavailable' };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function classifyPlanStatus(value: unknown): Pick<ToolExecutionEvent, 'outcome' | 'failureCategory'> | undefined {
  if (value === 'partial') return { outcome: 'partial' };
  if (value === 'unavailable') return { outcome: 'unavailable', failureCategory: 'dependency_unavailable' };
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

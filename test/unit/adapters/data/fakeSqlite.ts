import type Database from 'better-sqlite3';
import { vi, type Mock } from 'vitest';

type ResultFactory = unknown | Error | ((...args: unknown[]) => unknown);

export interface StatementRule {
  match: string | RegExp;
  all?: ResultFactory;
  get?: ResultFactory;
}

export interface FakeStatement {
  readonly sql: string;
  readonly all: Mock<(...args: unknown[]) => unknown>;
  readonly get: Mock<(...args: unknown[]) => unknown>;
}

function matches(sql: string, matcher: string | RegExp): boolean {
  return typeof matcher === 'string' ? sql.includes(matcher) : matcher.test(sql);
}

function resolve(result: ResultFactory | undefined, args: unknown[], fallback: unknown): unknown {
  if (result instanceof Error) throw result;
  if (typeof result === 'function') {
    return (result as (...values: unknown[]) => unknown)(...args);
  }
  return result ?? fallback;
}

/**
 * Small, typed test double for the synchronous better-sqlite3 surface used by
 * the repositories. It deliberately models prepare/all/get only, so these
 * tests never instantiate the native database binding.
 */
export class FakeSqliteDatabase {
  readonly statements: FakeStatement[] = [];
  readonly prepare = vi.fn((sql: string): FakeStatement => {
    const rule = this.rules.find(candidate => matches(sql, candidate.match));
    const statement: FakeStatement = {
      sql,
      all: vi.fn((...args: unknown[]) => resolve(rule?.all, args, [])),
      get: vi.fn((...args: unknown[]) => resolve(rule?.get, args, undefined)),
    };
    this.statements.push(statement);
    return statement;
  });

  constructor(private readonly rules: StatementRule[] = []) {}

  statement(matcher: string | RegExp): FakeStatement {
    const statement = this.statements.find(candidate => matches(candidate.sql, matcher));
    if (!statement) throw new Error(`No prepared statement matched ${String(matcher)}`);
    return statement;
  }

  asDatabase(): Database.Database {
    return this as unknown as Database.Database;
  }
}

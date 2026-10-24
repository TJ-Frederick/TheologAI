export function evaluateAudit(report: unknown, lock: unknown, now?: Date): {
  blocking: string[];
  exceptions: string[];
  exceptionExpires: string;
};
export function main(): void;

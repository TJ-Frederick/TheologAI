/**
 * Internal handoff used only when the release-capacity audit owns the final
 * structured size decision. The verifier still runs every semantic check.
 */
export const VERIFY_DATABASE_DEFER_CAPACITY_FLAG = '--defer-capacity-to-release-report';

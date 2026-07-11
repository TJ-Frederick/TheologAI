#!/usr/bin/env bash
# Backwards-compatible entry point. The implementation is TypeScript so it can
# validate exact UTF-8 statement sizes and write a cryptographic seed manifest.
set -euo pipefail
exec npx --no-install tsx scripts/export-for-d1.ts "$@"

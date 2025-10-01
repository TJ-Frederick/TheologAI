# TheologAI Test Suite

## Directory Structure

- `adapters/` - Isolation tests for API adapters (CCEL, NET Bible, Bible API)
- `services/` - Tests for business logic services
- `tools/` - Tests for MCP tool handlers
- `integration/` - End-to-end integration tests

## Running Tests

### Isolation Tests
Run standalone test scripts to verify adapters work before integration:
```bash
# Test CCEL adapter
npm run test:ccel

# Test NET Bible adapter
npm run test:netbible

# Test Bible API adapter
npm run test:bibleapi
```

### Unit Tests
Run formal test suite (after Jest/Vitest setup):
```bash
npm test
```

## Development Workflow

1. Create new adapter in `src/adapters/`
2. Create isolation test script in `test/adapters/`
3. Run isolation test until it passes
4. Integrate adapter into main codebase
5. Convert isolation test to unit test
6. Add integration test for end-to-end functionality

/**
 * Global Test Setup
 *
 * This file is executed before all tests.
 * Sets up environment variables, mocks, and global utilities.
 */

import { vi } from 'vitest';
import * as dotenv from 'dotenv';

// Load environment variables for tests
dotenv.config();

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.ESV_API_KEY = process.env.ESV_API_KEY || 'test-esv-api-key';

// Global test timeout
vi.setConfig({ testTimeout: 30000 });

// Mock console methods in tests to reduce noise
// (Tests can override this as needed)
global.console = {
  ...console,
  // Uncomment to silence logs in tests:
  // log: vi.fn(),
  // error: vi.fn(),
  // warn: vi.fn(),
  // info: vi.fn(),
};

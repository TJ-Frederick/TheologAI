/**
 * Error Utility Tests
 *
 * Tests for custom error classes and error handling utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  APIError,
  ValidationError,
  RateLimitError,
  getUserMessage,
  handleToolError
} from '../../../src/utils/errors.js';

describe('Error Utilities', () => {
  describe('Custom Error Classes', () => {
    describe('APIError', () => {
      it('should create an APIError with status and message', () => {
        const error = new APIError(404, 'Resource not found');

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(APIError);
        expect(error.status).toBe(404);
        expect(error.message).toBe('Resource not found');
        expect(error.name).toBe('APIError');
      });

      it('should handle different HTTP status codes', () => {
        const error500 = new APIError(500, 'Internal server error');
        const error401 = new APIError(401, 'Unauthorized');
        const error503 = new APIError(503, 'Service unavailable');

        expect(error500.status).toBe(500);
        expect(error401.status).toBe(401);
        expect(error503.status).toBe(503);
      });
    });

    describe('ValidationError', () => {
      it('should create a ValidationError with field and message', () => {
        const error = new ValidationError('reference', 'Invalid reference format');

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.field).toBe('reference');
        expect(error.message).toBe('Invalid reference format');
        expect(error.name).toBe('ValidationError');
      });

      it('should support different field names', () => {
        const refError = new ValidationError('reference', 'Invalid reference');
        const transError = new ValidationError('translation', 'Invalid translation');

        expect(refError.field).toBe('reference');
        expect(transError.field).toBe('translation');
      });
    });

    describe('RateLimitError', () => {
      it('should create a RateLimitError with retryAfter value', () => {
        const error = new RateLimitError(60);

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(RateLimitError);
        expect(error.retryAfter).toBe(60);
        expect(error.message).toBe('Rate limit exceeded');
        expect(error.name).toBe('RateLimitError');
      });

      it('should handle different retry times', () => {
        const shortRetry = new RateLimitError(30);
        const longRetry = new RateLimitError(3600);

        expect(shortRetry.retryAfter).toBe(30);
        expect(longRetry.retryAfter).toBe(3600);
      });
    });
  });

  describe('getUserMessage', () => {
    it('should return rate limit message for RateLimitError', () => {
      const error = new RateLimitError(60);
      const message = getUserMessage(error);

      expect(message).toContain('temporarily limited');
      expect(message).toContain('Try again');
    });

    it('should return validation message for ValidationError', () => {
      const error = new ValidationError('reference', 'Bad format');
      const message = getUserMessage(error);

      expect(message).toContain('Invalid reference format');
      expect(message).toContain('John 3:16');
    });

    it('should return API message for APIError', () => {
      const error = new APIError(500, 'Server error');
      const message = getUserMessage(error);

      expect(message).toContain('connecting to the Bible service');
      expect(message).toContain('try again');
    });

    it('should return generic message for unknown errors', () => {
      const error = new Error('Unknown error');
      const message = getUserMessage(error);

      expect(message).toContain('encountered an error');
      expect(message).toContain('try again');
    });

    it('should return generic message for TypeError', () => {
      const error = new TypeError('Type mismatch');
      const message = getUserMessage(error);

      expect(message).toContain('encountered an error');
    });
  });

  describe('handleToolError', () => {
    let consoleErrorSpy: any;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should return MCP error response structure', () => {
      const error = new Error('Test error');
      const result = handleToolError(error);

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('isError', true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should log error to console', () => {
      const error = new Error('Test error');
      handleToolError(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Test error');
    });

    it('should include user-friendly message for RateLimitError', () => {
      const error = new RateLimitError(60);
      const result = handleToolError(error);

      expect(result.content[0].text).toContain('temporarily limited');
    });

    it('should include user-friendly message for ValidationError', () => {
      const error = new ValidationError('reference', 'Bad format');
      const result = handleToolError(error);

      expect(result.content[0].text).toContain('Invalid reference format');
    });

    it('should include user-friendly message for APIError', () => {
      const error = new APIError(500, 'Server down');
      const result = handleToolError(error);

      expect(result.content[0].text).toContain('connecting to the Bible service');
    });

    it('should include generic message for unknown errors', () => {
      const error = new Error('Random error');
      const result = handleToolError(error);

      expect(result.content[0].text).toContain('encountered an error');
      expect(result.content[0].text).not.toContain('Random error'); // Should not expose internal error
    });

    it('should mark response as error', () => {
      const error = new Error('Test');
      const result = handleToolError(error);

      expect(result.isError).toBe(true);
    });
  });

  describe('Error inheritance and instanceof checks', () => {
    it('should properly identify error types with instanceof', () => {
      const apiError = new APIError(404, 'Not found');
      const valError = new ValidationError('field', 'Invalid');
      const rateLimitError = new RateLimitError(60);
      const genericError = new Error('Generic');

      expect(apiError instanceof APIError).toBe(true);
      expect(apiError instanceof Error).toBe(true);
      expect(apiError instanceof ValidationError).toBe(false);

      expect(valError instanceof ValidationError).toBe(true);
      expect(valError instanceof Error).toBe(true);
      expect(valError instanceof APIError).toBe(false);

      expect(rateLimitError instanceof RateLimitError).toBe(true);
      expect(rateLimitError instanceof Error).toBe(true);

      expect(genericError instanceof Error).toBe(true);
      expect(genericError instanceof APIError).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty error messages', () => {
      const error = new Error('');
      const result = handleToolError(error);

      expect(result.content[0].text).toBeTruthy();
    });

    it('should handle null/undefined-like errors', () => {
      const error = new Error();
      const result = handleToolError(error);

      expect(result.content[0].text).toBeTruthy();
      expect(result.isError).toBe(true);
    });

    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new Error(longMessage);
      const result = handleToolError(error);

      // Should return generic message, not the long internal message
      expect(result.content[0].text.length).toBeLessThan(500);
    });
  });
});

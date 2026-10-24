import { describe, expect, it, vi } from 'vitest';
import { Validator } from '@cfworker/json-schema';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { TheologAiMcpServer } from '../../../src/mcp/server.js';
import { exceedsMcpInputLimits, MCP_INPUT_LIMITS, MCP_INPUT_LIMIT_MESSAGE } from '../../../src/mcp/inputLimits.js';
import { inputValidatorFor, validatorFor } from '../../../src/mcp/validation.js';
import { createBibleLookupHandler } from '../../../src/tools/v2/bibleLookup.js';

const properties = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, 0]));

describe('untrusted MCP input budgets', () => {
  it('rejects the original many-key attack before invoking schema validation', () => {
    const validate = inputValidatorFor(createBibleLookupHandler({} as never).inputSchema);
    const schemaValidation = vi.spyOn(Validator.prototype, 'validate');
    try {
      expect(validate({ reference: 'John 3:16', ...properties(90000) })).toEqual({
        valid: false, data: undefined, errorMessage: MCP_INPUT_LIMIT_MESSAGE,
      });
      expect(schemaValidation).not.toHaveBeenCalled();
    } finally {
      schemaValidation.mockRestore();
    }
  });

  it('bounds individual containers, strings, and property names', () => {
    expect(exceedsMcpInputLimits(properties(MCP_INPUT_LIMITS.containerEntries))).toBe(false);
    expect(exceedsMcpInputLimits(properties(MCP_INPUT_LIMITS.containerEntries + 1))).toBe(true);
    expect(exceedsMcpInputLimits(Array(MCP_INPUT_LIMITS.containerEntries).fill(0))).toBe(false);
    expect(exceedsMcpInputLimits(Array(MCP_INPUT_LIMITS.containerEntries + 1).fill(0))).toBe(true);
    expect(exceedsMcpInputLimits('x'.repeat(MCP_INPUT_LIMITS.stringLength))).toBe(false);
    expect(exceedsMcpInputLimits('x'.repeat(MCP_INPUT_LIMITS.stringLength + 1))).toBe(true);
    expect(exceedsMcpInputLimits({ ['x'.repeat(MCP_INPUT_LIMITS.keyLength + 1)]: 0 })).toBe(true);
  });

  it('bounds total traversal work across individually small containers', () => {
    expect(exceedsMcpInputLimits(Array.from({ length: 8 }, () => properties(127)))).toBe(false);
    expect(exceedsMcpInputLimits(Array.from({ length: 8 }, () => properties(128)))).toBe(true);
  });

  it('bounds depth without recursion and terminates on cycles', () => {
    const nest = (depth: number): unknown => {
      let value: unknown = null;
      for (let i = 0; i < depth; i++) value = { child: value };
      return value;
    };
    expect(exceedsMcpInputLimits(nest(MCP_INPUT_LIMITS.depth))).toBe(false);
    expect(exceedsMcpInputLimits(nest(MCP_INPUT_LIMITS.depth + 1))).toBe(true);
    expect(exceedsMcpInputLimits(nest(10000))).toBe(true);
    const cyclic: { child?: unknown } = {};
    cyclic.child = cyclic;
    expect(exceedsMcpInputLimits(cyclic)).toBe(true);
  });

  it('keeps validation diagnostics bounded without imposing input budgets on output', () => {
    const input = properties(128);
    const result = validatorFor({ type: 'object', additionalProperties: false })(input);
    expect(result.valid).toBe(false);
    expect(result.errorMessage!.length).toBeLessThanOrEqual(4110);
    expect(result.errorMessage!.split('; ').length).toBeLessThanOrEqual(8);
    const arraySchema = { type: 'array', items: { type: 'integer' } };
    expect(validatorFor(arraySchema)(Array(200).fill(1)).valid).toBe(true);
    expect(inputValidatorFor(arraySchema)(Array(200).fill(1)).valid).toBe(false);
  });

  it('protects the shared server over stdio-compatible transports before its handler runs', async () => {
    const server = new TheologAiMcpServer({ name: 'input-budget-test', version: '1' }, { capabilities: { tools: {} } });
    const handler = vi.fn(async () => ({ content: [] }));
    server.setRequestHandler('tools/call', handler);
    const client = new Client({ name: 'input-budget-client', version: '1' }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await expect(client.callTool({ name: 'bible_lookup', arguments: properties(129) })).rejects.toMatchObject({
        code: -32602, message: expect.stringContaining(MCP_INPUT_LIMIT_MESSAGE),
      });
      expect(handler).not.toHaveBeenCalled();
      await client.callTool({ name: 'bible_lookup', arguments: { reference: 'John 3:16' } });
      expect(handler).toHaveBeenCalledOnce();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});

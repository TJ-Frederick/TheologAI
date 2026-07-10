import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from '../kernel/types.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validatorCache = new Map<string, ValidateFunction>();

export function validatorFor(schema: ToolHandler['inputSchema']): ValidateFunction {
  const serializedSchema = JSON.stringify(schema);
  const cached = validatorCache.get(serializedSchema);
  if (cached) return cached;

  const validator = ajv.compile(JSON.parse(serializedSchema));
  validatorCache.set(serializedSchema, validator);
  return validator;
}

export function formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
  const error = errors?.[0];
  if (!error) return 'arguments do not match the advertised schema';

  if (error.keyword === 'required') {
    return `missing required argument "${String(error.params.missingProperty)}"`;
  }
  if (error.keyword === 'additionalProperties') {
    return `unknown argument "${String(error.params.additionalProperty)}"`;
  }

  const argument = error.instancePath.replace(/^\//, '').replaceAll('/', '.');
  return `${argument ? `argument "${argument}" ` : ''}${error.message ?? 'is invalid'}`;
}

const PROMPT_ARGUMENTS = {
  'word-study': { required: ['word'], allowed: ['word', 'testament'] },
  'passage-exegesis': { required: ['reference'], allowed: ['reference', 'translation'] },
  'compare-translations': { required: ['reference'], allowed: ['reference', 'translations'] },
  'confession-study': { required: ['topic'], allowed: ['topic', 'traditions'] },
  donate: { required: [], allowed: [] },
} as const;

export function validatePromptArguments(name: string, args: Record<string, string> | undefined): void {
  const definition = PROMPT_ARGUMENTS[name as keyof typeof PROMPT_ARGUMENTS];
  if (!definition) {
    throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
  }

  const values = args ?? {};
  const unknown = Object.keys(values).find(key => !(definition.allowed as readonly string[]).includes(key));
  if (unknown) {
    throw new McpError(ErrorCode.InvalidParams, `Unknown argument "${unknown}" for prompt "${name}"`);
  }

  const missing = (definition.required as readonly string[]).find(key => !values[key]?.trim());
  if (missing) {
    throw new McpError(ErrorCode.InvalidParams, `Missing required argument "${missing}" for prompt "${name}"`);
  }

  const oversized = Object.entries(values).find(([, value]) => value.length > 500);
  if (oversized) {
    throw new McpError(ErrorCode.InvalidParams, `Argument "${oversized[0]}" for prompt "${name}" exceeds 500 characters`);
  }

  if (name === 'word-study') {
    const word = values.word?.trim() ?? '';
    if (word.length < 2 || word.length > 100) {
      throw new McpError(ErrorCode.InvalidParams, 'Argument "word" for prompt "word-study" must be between 2 and 100 characters');
    }
    if (values.testament && !['OT', 'NT'].includes(values.testament.toUpperCase())) {
      throw new McpError(ErrorCode.InvalidParams, 'Argument "testament" for prompt "word-study" must be OT or NT');
    }
  }

  if (['passage-exegesis', 'compare-translations'].includes(name) && (values.reference?.length ?? 0) > 100) {
    throw new McpError(ErrorCode.InvalidParams, `Argument "reference" for prompt "${name}" exceeds 100 characters`);
  }
}

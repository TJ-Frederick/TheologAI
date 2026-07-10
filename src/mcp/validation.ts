import { Validator, type Schema } from '@cfworker/json-schema';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from '../kernel/types.js';

export type SchemaValidationResult<T> = {
  valid: true;
  data: T;
  errorMessage: undefined;
} | {
  valid: false;
  data: undefined;
  errorMessage: string;
};

export type SchemaValidator<T> = (input: unknown) => SchemaValidationResult<T>;

export const jsonSchemaValidator = {
  getValidator<T>(schema: ToolHandler['inputSchema']): SchemaValidator<T> {
    const validator = new Validator(schema as Schema, '2020-12', true);
    return (input: unknown): SchemaValidationResult<T> => {
      const result = validator.validate(input);
      if (result.valid) {
        return { valid: true, data: input as T, errorMessage: undefined };
      }
      return {
        valid: false,
        data: undefined,
        errorMessage: result.errors
          .map(error => `${error.instanceLocation}: ${error.error}`)
          .join('; '),
      };
    };
  },
};
const validatorCache = new Map<string, SchemaValidator<Record<string, unknown>>>();

export function validatorFor(
  schema: ToolHandler['inputSchema'],
): SchemaValidator<Record<string, unknown>> {
  const serializedSchema = JSON.stringify(schema);
  const cached = validatorCache.get(serializedSchema);
  if (cached) return cached;

  const validator = jsonSchemaValidator.getValidator<Record<string, unknown>>(
    JSON.parse(serializedSchema),
  );
  validatorCache.set(serializedSchema, validator);
  return validator;
}

export function formatValidationError(errorMessage: string | undefined): string {
  if (!errorMessage) return 'arguments do not match the advertised schema';

  if (errorMessage.includes('Instance does not match exactly one subschema')) {
    return 'arguments do not match exactly one advertised schema option';
  }

  const missing = errorMessage.match(/does not have required property "([^"]+)"/);
  if (missing) return `missing required argument "${missing[1]}"`;

  const additional = errorMessage.match(/Property "([^"]+)" does not match additional properties schema/);
  if (additional) return `unknown argument "${additional[1]}"`;

  const dependency = errorMessage.match(/Instance has "[^"]+" but does not have "([^"]+)"/);
  if (dependency) return `must have property ${dependency[1]}`;

  const details = errorMessage
    .split('; ')
    .map(part => part.match(/^#\/([^:]+): (.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match));
  const detail = details.find(match => match[2] !== 'False boolean schema.') ?? details[0];
  if (!detail) return errorMessage;

  const argument = detail[1]
    .split('/')
    .map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .join('.');
  const message = normalizeValidationMessage(detail[2]);
  return `argument "${argument}" ${message}`;
}

function normalizeValidationMessage(message: string): string {
  const type = message.match(/^Instance type "[^"]+" is invalid\. Expected "([^"]+)"\.$/);
  if (type) return `must be ${type[1]}`;

  const tooLong = message.match(/^String is too long \(\d+ > (\d+)\)\.$/);
  if (tooLong) return `must NOT have more than ${tooLong[1]} characters`;

  const tooShort = message.match(/^String is too short \(\d+ < (\d+)\)\.$/);
  if (tooShort) return `must NOT have fewer than ${tooShort[1]} characters`;

  const lessThan = message.match(/^[^ ]+ is less than ([^\.]+)\.$/);
  if (lessThan) return `must be >= ${lessThan[1]}`;

  const greaterThan = message.match(/^[^ ]+ is greater than ([^\.]+)\.$/);
  if (greaterThan) return `must be <= ${greaterThan[1]}`;

  return message;
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

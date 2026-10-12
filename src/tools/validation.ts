import AjvModule from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { toolDefinitions } from './definitions.js';

const AjvConstructor = ((AjvModule as any).default ?? AjvModule) as new (options: object) => {
  compile(schema: object): ValidateFunction;
};
const ajv = new AjvConstructor({ allErrors: true, strict: false });
const validators = new Map<string, ValidateFunction>();

for (const definition of toolDefinitions) {
  validators.set(definition.name, ajv.compile(definition.inputSchema));
}

/**
 * 输出参数位置与修正信息，不回显参数内容。
 */
function formatErrors(errors: ErrorObject[] | null | undefined, schema: object): string {
  return (errors || [])
    .map((error) => {
      const path = error.instancePath || 'arguments';
      if (error.keyword === 'additionalProperties') {
        let parent: any = schema;
        for (const part of error.schemaPath.split('/').slice(1, -1)) {
          parent = parent?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
        }
        const allowed = Object.keys(parent?.properties ?? {});
        return `${path}: unsupported parameter ${JSON.stringify(error.params.additionalProperty)}. Allowed parameters: ${allowed.join(', ') || '(none)'}`;
      }
      if (error.keyword === 'required') {
        return `${path}: missing required parameter ${JSON.stringify(error.params.missingProperty)}`;
      }
      if (error.keyword === 'enum') {
        return `${path}: expected ${error.params.allowedValues.map((value: unknown) => JSON.stringify(value)).join(' | ')}`;
      }
      return `${path}: ${error.message || 'is invalid'}`;
    })
    .join('; ');
}

export function validateToolArguments(name: string, args: unknown): void {
  const validator = validators.get(name);
  if (!validator) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const value = args ?? {};
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('not serializable');
  } catch {
    throw new Error(`Invalid arguments for '${name}': arguments must be JSON-serializable.`);
  }
  if (Buffer.byteLength(serialized) > 1024 * 1024) {
    throw new Error(`Invalid arguments for '${name}': payload exceeds the 1 MiB limit.`);
  }
  // JSON 已确认可序列化，递归拒绝无法传给 Shell 或文件接口的 NUL。
  const rejectNul = (input: unknown): void => {
    if (typeof input === 'string' && input.includes('\0')) throw new Error(`Invalid arguments for '${name}': NUL bytes are forbidden.`);
    if (input && typeof input === 'object') Object.values(input).forEach(rejectNul);
  };
  rejectNul(value);
  if (!validator(value)) {
    throw new Error(`Invalid arguments for '${name}': ${formatErrors(validator.errors, validator.schema as object)}`);
  }

  if (name === 'execute_batch') {
    const commands = (value as { commands: Array<{ name: string; arguments: unknown }> }).commands;
    for (const [index, command] of commands.entries()) {
      if (command.name === 'execute_batch') {
        throw new Error(`Invalid arguments for 'execute_batch': nested batches are not supported (commands/${index}).`);
      }
      if (['connect', 'disconnect', 'list_servers', 'list_working_directories', 'upload_file', 'download_file'].includes(command.name)) {
        throw new Error(`commands/${index}: tool '${command.name}' is not supported in a batch.`);
      }
      try {
        const child = command.arguments as Record<string, unknown>;
        if ('sessionId' in child || 'serverAlias' in child) throw new Error('Batch child must inherit the parent sessionId; target overrides are forbidden.');
        validateToolArguments(command.name, {
          ...child,
          sessionId: (value as { sessionId: string }).sessionId
        });
      } catch (error) {
        throw new Error(`commands/${index}: ${error instanceof Error ? error.message : 'Invalid tool arguments'}`);
      }
    }
  }
}

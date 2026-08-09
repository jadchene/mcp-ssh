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

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors || [])
    .map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`)
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
  if (!validator(value)) {
    throw new Error(`Invalid arguments for '${name}': ${formatErrors(validator.errors)}`);
  }

  if (name === 'execute_batch') {
    const commands = (value as { commands: Array<{ name: string; arguments: unknown }> }).commands;
    for (const [index, command] of commands.entries()) {
      if (command.name === 'execute_batch') {
        throw new Error(`Invalid arguments for 'execute_batch': nested batches are not supported (commands/${index}).`);
      }
      validateToolArguments(command.name, {
        serverAlias: (value as { serverAlias: string }).serverAlias,
        ...(command.arguments as Record<string, unknown>)
      });
    }
  }
}

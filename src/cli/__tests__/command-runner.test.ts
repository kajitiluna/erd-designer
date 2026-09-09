import { describe, expect, test, vi } from 'vitest';

import { CommandOptions } from '~/cli/options';
import CommandRunner from "~/cli/command-runner";
import SchemaCommand, { SchemaCommandResult } from '~/cli/commands/schema-command';

describe('SchemaCommandRunner.toExitCode', () => {
    test('maps each result to its exit code', () => {
        expect(CommandRunner.toExitCode('ok')).toBe(0);
        expect(CommandRunner.toExitCode('detected')).toBe(1);
        expect(CommandRunner.toExitCode('error')).toBe(2);
    });
});

describe('SchemaCommandRunner.execute', () => {
    test('parses argv with the command optionSpecs and delegates to execute', async () => {
        const execute = vi.fn().mockResolvedValue('ok' as SchemaCommandResult);
        const command: SchemaCommand = {
            name: 'stub',
            usage: 'stub usage',
            optionSpecs: [{ name: '--flag', arity: 'flag' }],
            create: () => execute
        };

        const result = await CommandRunner.execute(command, ['--flag']);

        expect(result).toBe('ok');
        expect(execute).toHaveBeenCalledTimes(1);
        const options = execute.mock.calls[0][0] as CommandOptions;
        expect(options.hasFlag('--flag')).toBe(true);
    });

    test('an argv parse failure reports the message and returns "error" without calling execute', async () => {
        const execute = vi.fn();
        const command: SchemaCommand = { name: 'stub', usage: 'stub usage', optionSpecs: [], create: () => execute };
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { return; });

        const result = await CommandRunner.execute(command, ['--unknown']);

        expect(result).toBe('error');
        expect(execute).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith('Unknown option: --unknown.');
        errorSpy.mockRestore();
    });
});

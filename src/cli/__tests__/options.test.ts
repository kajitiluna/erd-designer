import { describe, expect, test } from 'vitest';
import { OptionSpec, parseOptions } from '~/cli/options';

const FILE_AND_TAGS_SPECS: readonly OptionSpec[] = [
    { name: '--file', arity: 'single' },
    { name: '--ignore-table', arity: 'repeatable' },
    { name: '--no-index', arity: 'flag' }
];

const parseOrThrow = (argv: readonly string[], specs: readonly OptionSpec[] = FILE_AND_TAGS_SPECS) => {
    const result = parseOptions(argv, specs);
    if (result.resultType === 'invalid') {
        throw new Error(`expected a parsed result but got invalid: ${result.message}`);
    }

    return result.options;
};

describe('parseOptions', () => {
    test('reads a single option given as two tokens', () => {
        const options = parseOrThrow(['--file', 'schema.erd']);

        expect(options.findValue('--file')).toBe('schema.erd');
    });

    test('reads a single option given as --name=value', () => {
        const options = parseOrThrow(['--file=schema.erd']);

        expect(options.findValue('--file')).toBe('schema.erd');
    });

    test('an unspecified single option returns null', () => {
        const options = parseOrThrow([]);

        expect(options.findValue('--file')).toBeNull();
    });

    test('a repeated single option keeps the last value', () => {
        const options = parseOrThrow(['--file', 'a.erd', '--file', 'b.erd']);

        expect(options.findValue('--file')).toBe('b.erd');
    });

    test('a repeatable option collects every occurrence in order', () => {
        const options = parseOrThrow([
            '--ignore-table', 'flyway_schema_history',
            '--ignore-table=order_item_backup_20260701'
        ]);

        expect(options.listValues('--ignore-table')).toEqual([
            'flyway_schema_history', 'order_item_backup_20260701'
        ]);
    });

    test('an unspecified repeatable option returns an empty array', () => {
        const options = parseOrThrow([]);

        expect(options.listValues('--ignore-table')).toEqual([]);
    });

    test('a flag option is true only when present', () => {
        const present = parseOrThrow(['--no-index']);
        const absent = parseOrThrow([]);

        expect(present.hasFlag('--no-index')).toBe(true);
        expect(absent.hasFlag('--no-index')).toBe(false);
    });

    test('tokens that are not options become operands', () => {
        const options = parseOrThrow(['run', '--file', 'schema.erd', 'extra']);

        expect(options.operands).toEqual(['run', 'extra']);
        expect(options.findValue('--file')).toBe('schema.erd');
    });

    test('everything after -- is treated as an operand, even option-like tokens', () => {
        const options = parseOrThrow(['--file', 'schema.erd', '--', '--ignore-table', 'x']);

        expect(options.operands).toEqual(['--ignore-table', 'x']);
    });

    test('an option missing its required value is rejected', () => {
        const result = parseOptions(['--file'], FILE_AND_TAGS_SPECS);

        expect(result).toEqual({
            resultType: 'invalid', message: 'Option --file requires a value.'
        });
    });

    test('a value that looks like another option is rejected, not consumed', () => {
        const result = parseOptions(['--file', '--no-index'], FILE_AND_TAGS_SPECS);

        expect(result).toEqual({
            resultType: 'invalid', message: 'Option --file requires a value.'
        });
    });

    test('a flag option rejects an inline value', () => {
        const result = parseOptions(['--no-index=true'], FILE_AND_TAGS_SPECS);

        expect(result).toEqual({
            resultType: 'invalid', message: 'Option --no-index does not take a value.'
        });
    });

    test('an option outside the given specs is rejected rather than silently ignored', () => {
        const result = parseOptions(['--bogus', 'value'], FILE_AND_TAGS_SPECS);

        expect(result).toEqual({
            resultType: 'invalid', message: 'Unknown option: --bogus.'
        });
    });
});

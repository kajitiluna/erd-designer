import process from 'process';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { SchemaCompareOptions } from '~/cli/commands/support/schema-compare-options';
import { parseOptions } from '~/cli/options';

describe('SchemaCompareOptions.toCompareScope', () => {
    test('all --no-* flags default to enabled (withXxx: true)', () => {
        const parsed = parseOptions([], SchemaCompareOptions.OPTION_SPECS);
        const options = (parsed.resultType === 'parsed') ? parsed.options : null;

        const scope = SchemaCompareOptions.toCompareScope(options!, 'designToDatabase', 'with_description');

        expect(scope).toEqual({
            withIndex: true, withForeignKey: true, withComment: true, withSchema: true, withLogicalName: false,
            commentStyle: 'with_description'
        });
    });

    test('--no-* flags disable their corresponding scope entry', () => {
        const parsed = parseOptions(
            ['--no-index', '--no-foreign-key', '--no-comment', '--no-schema'], SchemaCompareOptions.OPTION_SPECS
        );
        const options = (parsed.resultType === 'parsed') ? parsed.options : null;

        const scope = SchemaCompareOptions.toCompareScope(options!, 'designToDatabase', 'with_description');

        expect(scope).toEqual({
            withIndex: false, withForeignKey: false, withComment: false, withSchema: false, withLogicalName: false,
            commentStyle: 'with_description'
        });
    });

    test('withLogicalName is forced by direction, not by any CLI flag', () => {
        const parsed = parseOptions([], SchemaCompareOptions.OPTION_SPECS);
        const options = (parsed.resultType === 'parsed') ? parsed.options : null;

        const dbDiffScope = SchemaCompareOptions.toCompareScope(options!, 'designToDatabase', 'with_description');
        const erdDiffScope = SchemaCompareOptions.toCompareScope(options!, 'designToRevision', 'with_description');

        expect(dbDiffScope.withLogicalName).toBe(false);
        expect(erdDiffScope.withLogicalName).toBe(true);
    });

    test('commentStyle is passed through as given by the caller', () => {
        const parsed = parseOptions([], SchemaCompareOptions.OPTION_SPECS);
        const options = (parsed.resultType === 'parsed') ? parsed.options : null;

        const scope = SchemaCompareOptions.toCompareScope(options!, 'designToDatabase', 'logical_name');

        expect(scope.commentStyle).toBe('logical_name');
    });
});

describe('SchemaCompareOptions.toDiffFormat', () => {
    test('defaults to text when --format is not given', () => {
        const parsed = parseOptions([], SchemaCompareOptions.OPTION_SPECS);
        const options = (parsed.resultType === 'parsed') ? parsed.options : null;

        const result = SchemaCompareOptions.toDiffFormat(options!);

        expect(result).toEqual({ resultType: 'parsed', format: 'text' });
    });

    test('accepts json and markdown', () => {
        const jsonParsed = parseOptions(['--format', 'json'], SchemaCompareOptions.OPTION_SPECS);
        const markdownParsed = parseOptions(['--format', 'markdown'], SchemaCompareOptions.OPTION_SPECS);

        const jsonOptions = (jsonParsed.resultType === 'parsed') ? jsonParsed.options : null;
        const markdownOptions = (markdownParsed.resultType === 'parsed') ? markdownParsed.options : null;

        expect(SchemaCompareOptions.toDiffFormat(jsonOptions!)).toEqual({ resultType: 'parsed', format: 'json' });
        expect(SchemaCompareOptions.toDiffFormat(markdownOptions!)).toEqual({ resultType: 'parsed', format: 'markdown' });
    });

    test('rejects an unsupported format value', () => {
        const parsed = parseOptions(['--format', 'xml'], SchemaCompareOptions.OPTION_SPECS);
        const options = (parsed.resultType === 'parsed') ? parsed.options : null;

        const result = SchemaCompareOptions.toDiffFormat(options!);

        expect(result.resultType).toBe('invalid');
    });
});

describe('SchemaCompareOptions.findConnectionUrl', () => {
    let originalErdDbUrl: string | undefined;

    beforeEach(() => {
        originalErdDbUrl = process.env.ERD_DB_URL;
        delete process.env.ERD_DB_URL;
    });

    afterEach(() => {
        if (originalErdDbUrl != null) {
            process.env.ERD_DB_URL = originalErdDbUrl;
        } else {
            delete process.env.ERD_DB_URL;
        }
    });

    test('falls back to --dsn when ERD_DB_URL is not set', () => {
        const parsed = parseOptions(['--dsn', 'mysql://user@host/db'], [{ name: '--dsn', arity: 'single' }]);
        const options = (parsed.resultType === 'parsed') ? parsed.options : null;

        expect(SchemaCompareOptions.findConnectionUrl(options!)).toBe('mysql://user@host/db');
    });

    test('ERD_DB_URL takes precedence over --dsn', () => {
        process.env.ERD_DB_URL = 'mysql://from-env@host/db';
        const parsed = parseOptions(['--dsn', 'mysql://from-flag@host/db'], [{ name: '--dsn', arity: 'single' }]);
        const options = (parsed.resultType === 'parsed') ? parsed.options : null;

        expect(SchemaCompareOptions.findConnectionUrl(options!)).toBe('mysql://from-env@host/db');
    });

    test('returns null when neither ERD_DB_URL nor --dsn is set', () => {
        const parsed = parseOptions([], [{ name: '--dsn', arity: 'single' }]);
        const options = (parsed.resultType === 'parsed') ? parsed.options : null;

        expect(SchemaCompareOptions.findConnectionUrl(options!)).toBeNull();
    });
});

import { describe, expect, test } from 'vitest';

import { ConnectionTimeoutOptions } from '~/cli/commands/support/connection-timeout-options';
import { parseOptions } from '~/cli/options';

const parse = (argv: readonly string[]) => {
    const parsed = parseOptions(argv, ConnectionTimeoutOptions.OPTION_SPECS);
    if (parsed.resultType !== 'parsed') {
        throw new Error(`unexpected parse failure: ${parsed.message}`);
    }
    return parsed.options;
};

describe('ConnectionTimeoutOptions.toConnectionTimeouts', () => {
    test('defaults to 10s connect / 30s query when neither flag is given', () => {
        const result = ConnectionTimeoutOptions.toConnectionTimeouts(parse([]));

        expect(result).toEqual({ resultType: 'parsed', timeouts: { connectSeconds: 10, querySeconds: 30 } });
    });

    test('accepts explicit positive values for both flags', () => {
        const result = ConnectionTimeoutOptions.toConnectionTimeouts(
            parse(['--connect-timeout', '5', '--query-timeout', '60'])
        );

        expect(result).toEqual({ resultType: 'parsed', timeouts: { connectSeconds: 5, querySeconds: 60 } });
    });

    test('a non-numeric --connect-timeout value is rejected', () => {
        const result = ConnectionTimeoutOptions.toConnectionTimeouts(parse(['--connect-timeout', 'abc']));

        expect(result.resultType).toBe('invalid');
    });

    test('"0" is rejected for --connect-timeout, not treated as "unlimited"', () => {
        const result = ConnectionTimeoutOptions.toConnectionTimeouts(parse(['--connect-timeout', '0']));

        expect(result.resultType).toBe('invalid');
    });

    test('a negative --query-timeout value is rejected', () => {
        const result = ConnectionTimeoutOptions.toConnectionTimeouts(parse(['--query-timeout', '-5']));

        expect(result.resultType).toBe('invalid');
    });

    test('a non-numeric --query-timeout value is rejected', () => {
        const result = ConnectionTimeoutOptions.toConnectionTimeouts(parse(['--query-timeout', 'ten']));

        expect(result.resultType).toBe('invalid');
    });
});

import { describe, expect, test } from 'vitest';
import DbDriver, { driverConnectionSupport } from '../db-driver';

describe('driverConnectionSupport.toPostgresClientConfig', () => {
    test('converts connectSeconds/querySeconds (seconds) to the millisecond fields pg.Client expects', () => {
        const config = driverConnectionSupport.toPostgresClientConfig(
            'postgres://user@host/db', { connectSeconds: 10, querySeconds: 30 }
        );

        expect(config).toEqual({
            connectionString: 'postgres://user@host/db',
            connectionTimeoutMillis: 10000,
            statement_timeout: 30000,
            query_timeout: 30000
        });
    });
});

describe('driverConnectionSupport.toMySqlConnectionOptions', () => {
    test('wraps the connection string as { uri } and converts connectSeconds to connectTimeout (ms)', () => {
        const options = driverConnectionSupport.toMySqlConnectionOptions(
            'mysql://user@host/db', { connectSeconds: 10, querySeconds: 30 }
        );

        expect(options).toEqual({ uri: 'mysql://user@host/db', connectTimeout: 10000 });
    });
});

describe('driverConnectionSupport.appendTimeoutHint', () => {
    test('appends a hint with the configured seconds when the driver error spells out "timeout"', () => {
        const message = driverConnectionSupport.appendTimeoutHint(
            'Failed to connect to the database.', 'Connection terminated due to connection timeout', 'connection', 10
        );

        expect(message).toBe('Failed to connect to the database.\n  hint  : connection timed out after 10s.');
    });

    test('also appends the hint for Node\'s OS-level "ETIMEDOUT" spelling', () => {
        const message = driverConnectionSupport.appendTimeoutHint(
            'Failed to connect to the database.', 'connect ETIMEDOUT 10.0.3.21:3306', 'connection', 10
        );

        expect(message).toBe('Failed to connect to the database.\n  hint  : connection timed out after 10s.');
    });

    test('leaves the message untouched when the driver error has nothing to do with a timeout', () => {
        const message = driverConnectionSupport.appendTimeoutHint(
            'Failed to connect to the database.', 'password authentication failed for user "app"', 'connection', 10
        );

        expect(message).toBe('Failed to connect to the database.');
    });
});

describe('maskDsn', () => {
    test('replaces the password with **** but keeps the username and host visible', () => {
        expect(DbDriver.maskConnectionUrl('mysql://app:s3cr3t@db.internal:3306/shop'))
            .toBe('mysql://app:****@db.internal:3306/shop');
    });

    test('a username with no password is shown as-is, without a fabricated mask', () => {
        expect(DbDriver.maskConnectionUrl('mysql://readonly@db.internal:3306/shop'))
            .toBe('mysql://readonly@db.internal:3306/shop');
    });

    test('a DSN with no credentials at all has no @ segment', () => {
        expect(DbDriver.maskConnectionUrl('postgres://db.internal:5432/shop'))
            .toBe('postgres://db.internal:5432/shop');
    });

    test('an invalid DSN never leaks its raw text', () => {
        expect(DbDriver.maskConnectionUrl('mysql://app:s3cr3t@[unclosed'))
            .toBe('(invalid connection URL)');
    });
});

import TableIndexSupport, { TableIndexOption, TableIndexType } from '../TableIndexSupport';

describe('TableIndexSupport', () => {
    describe('constructor', () => {
        test('should create with index options and types', () => {
            const indexOptions: TableIndexOption[] = ['UNIQUE', 'FULLTEXT'];
            const indexTypes: TableIndexType[] = ['BTREE', 'HASH'];
            const support = new TableIndexSupport(indexOptions, indexTypes);

            expect(support.indexOptions).toEqual(indexOptions);
            expect(support.indexTypes).toEqual(indexTypes);
            expect(support.nullsOrder).toBe(false); // default value
        });

        test('should create with nullsOrder specified', () => {
            const indexOptions: TableIndexOption[] = ['UNIQUE'];
            const indexTypes: TableIndexType[] = ['BTREE', 'GIST'];
            const support = new TableIndexSupport(indexOptions, indexTypes, true);

            expect(support.indexOptions).toEqual(indexOptions);
            expect(support.indexTypes).toEqual(indexTypes);
            expect(support.nullsOrder).toBe(true);
        });

        test('should create with empty arrays', () => {
            const support = new TableIndexSupport([], []);

            expect(support.indexOptions).toEqual([]);
            expect(support.indexTypes).toEqual([]);
            expect(support.nullsOrder).toBe(false);
        });

        test('should handle all supported index options', () => {
            const allOptions: TableIndexOption[] = ['UNIQUE', 'FULLTEXT', 'SPATIAL', ''];
            const support = new TableIndexSupport(allOptions, ['BTREE']);

            expect(support.indexOptions).toEqual(allOptions);
            expect(support.indexOptions).toContain('UNIQUE');
            expect(support.indexOptions).toContain('FULLTEXT');
            expect(support.indexOptions).toContain('SPATIAL');
            expect(support.indexOptions).toContain('');
        });

        test('should handle all supported index types', () => {
            const allTypes: TableIndexType[] = ['BTREE', 'HASH', 'GIST', 'SPGIST', 'GIN', 'BRIN', ''];
            const support = new TableIndexSupport(['UNIQUE'], allTypes);

            expect(support.indexTypes).toEqual(allTypes);
            expect(support.indexTypes).toContain('BTREE');
            expect(support.indexTypes).toContain('HASH');
            expect(support.indexTypes).toContain('GIST');
            expect(support.indexTypes).toContain('SPGIST');
            expect(support.indexTypes).toContain('GIN');
            expect(support.indexTypes).toContain('BRIN');
            expect(support.indexTypes).toContain('');
        });
    });

    describe('properties immutability', () => {
        test('should have readonly properties', () => {
            const indexOptions: TableIndexOption[] = ['UNIQUE'];
            const indexTypes: TableIndexType[] = ['BTREE'];
            const support = new TableIndexSupport(indexOptions, indexTypes, true);

            // These should be readonly - TypeScript compilation will enforce this
            expect(support.indexOptions).toBe(indexOptions);
            expect(support.indexTypes).toBe(indexTypes);
            expect(support.nullsOrder).toBe(true);
        });

        test('should preserve reference to original arrays', () => {
            const indexOptions: TableIndexOption[] = ['UNIQUE', 'FULLTEXT'];
            const indexTypes: TableIndexType[] = ['BTREE', 'HASH'];
            const support = new TableIndexSupport(indexOptions, indexTypes);

            expect(support.indexOptions).toBe(indexOptions);
            expect(support.indexTypes).toBe(indexTypes);
        });
    });

    describe('typical usage scenarios', () => {
        test('should support PostgreSQL configuration', () => {
            const postgresSupport = new TableIndexSupport(
                ['UNIQUE'],
                ['BTREE', 'HASH', 'GIST', 'SPGIST', 'GIN', 'BRIN'],
                true
            );

            expect(postgresSupport.indexOptions).toEqual(['UNIQUE']);
            expect(postgresSupport.indexTypes).toHaveLength(6);
            expect(postgresSupport.nullsOrder).toBe(true);
        });

        test('should support MySQL configuration', () => {
            const mysqlSupport = new TableIndexSupport(
                ['UNIQUE', 'FULLTEXT', 'SPATIAL'],
                ['BTREE', 'HASH'],
                false
            );

            expect(mysqlSupport.indexOptions).toEqual(['UNIQUE', 'FULLTEXT', 'SPATIAL']);
            expect(mysqlSupport.indexTypes).toEqual(['BTREE', 'HASH']);
            expect(mysqlSupport.nullsOrder).toBe(false);
        });
    });
});
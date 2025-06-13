import { databases } from '~/models/database/DatabaseType';
import ColumnShareModel from '../ColumnShareModel';
import ColumnType from '../ColumnType';

describe('ColumnShareModel', () => {
    // unsigned を定義できない (withUnsigned === false) の ColumnType
    const mockWithoutUnsigned = new ColumnType({
        id: 1,
        name: "TEST_TYPE",
        description: "Test type",
        baseQuery: "TEST",
        withPrecision: true,
        withScale: true
    });

    // unsigned を定義できる (withUnsigned === true) の ColumnType
    const mockWithUnsigned = new ColumnType({
        id: 1,
        name: "TEST_TYPE",
        description: "Test type",
        baseQuery: "TEST",
        withUnsigned: true,
        withPrecision: true,
        withScale: true
    });

    const database = databases.postgres;

    describe('constructor', () => {
        test('should create with minimum required values', () => {
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });

            expect(model.columnShareModelId).toBe('test-id');
            expect(model.physicalName).toBe('test_column');
            expect(model.logicalName).toBe('Test Column');
            expect(model.columnType).toBe(mockWithoutUnsigned);
            expect(model.precision).toBe('');
            expect(model.scale).toBe('');
            expect(model.unsigned).toBe(false);
            expect(model.description).toBe('');
        });

        test('should create with all values with no-unsigned column type', () => {
            const now = new Date();
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned,
                precision: '10',
                scale: '2',
                unsigned: true,
                description: 'test description',
                createdAt: now
            });

            expect(model.precision).toBe('10');
            expect(model.scale).toBe('2');
            expect(model.unsigned).toBe(false);
            expect(model.description).toBe('test description');
        });

        test('should create with all values with unsigned column type', () => {
            const now = new Date();
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithUnsigned,
                precision: '10',
                scale: '2',
                unsigned: true,
                description: 'test description',
                createdAt: now
            });

            expect(model.precision).toBe('10');
            expect(model.scale).toBe('2');
            expect(model.unsigned).toBe(true);
            expect(model.description).toBe('test description');
        });
    });

    describe('query', () => {
        test('should generate query without options', () => {
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });

            const query = model.query({ database });
            expect(query).toBe('test_column TEST');
        });

        test('should generate query with notNull', () => {
            const model = new ColumnShareModel({
                columnShareModelId: 'test-id',
                physicalName: 'test_column',
                logicalName: 'Test Column',
                columnType: mockWithoutUnsigned
            });

            const query = model.query({ database, notNull: true });
            expect(query).toBe('test_column TEST NOT NULL');
        });
    });

    describe('matchForReferenceType', () => {
        test('should match same column types', () => {
            const model1 = new ColumnShareModel({
                columnShareModelId: 'test-id-1',
                physicalName: 'test_column_1',
                logicalName: 'Test Column 1',
                columnType: mockWithoutUnsigned
            });

            const model2 = new ColumnShareModel({
                columnShareModelId: 'test-id-2',
                physicalName: 'test_column_2',
                logicalName: 'Test Column 2',
                columnType: mockWithoutUnsigned
            });

            expect(model1.matchForReferenceType(model2)).toBe(true);
        });
    });
});
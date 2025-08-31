import DbSchemaConfig from '../DbSchemaConfig';
import DbSchemaModel from '../database/DbSchemaModel';
import { PropertyNotExistsError } from '../exceptions';

describe('DbSchemaConfig', () => {
    let testSchema1: DbSchemaModel;
    let testSchema2: DbSchemaModel;
    let testSchema3: DbSchemaModel;

    beforeEach(() => {
        testSchema1 = DbSchemaModel.create('Schema1', 'First schema');
        testSchema2 = DbSchemaModel.create('Schema2', 'Second schema');
        testSchema3 = DbSchemaModel.create('Schema3', 'Third schema');
    });

    describe('create', () => {
        test('should create empty config with default values', () => {
            const config = DbSchemaConfig.create();

            expect(config.defaultSchemaId).toBe('');
            expect(config.hasSchemas()).toBe(false);
            expect(config.getSchemas()).toEqual([]);
        });

        test('should create config with schemas but no default', () => {
            const config = DbSchemaConfig.create({
                schemas: [testSchema1, testSchema2]
            });

            expect(config.defaultSchemaId).toBe('');
            expect(config.hasSchemas()).toBe(true);
            expect(config.getSchemas()).toEqual([testSchema1, testSchema2]);
        });

        test('should create config with valid defaultSchemaId', () => {
            const config = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });

            expect(config.defaultSchemaId).toBe(testSchema1.schemaId);
            expect(config.hasSchemas()).toBe(true);
            expect(config.getSchemas()).toEqual([testSchema1, testSchema2]);
        });

        test('should ignore invalid defaultSchemaId (not in schemas)', () => {
            const config = DbSchemaConfig.create({
                defaultSchemaId: 'non-existent-id',
                schemas: [testSchema1, testSchema2]
            });

            expect(config.defaultSchemaId).toBe('');
            expect(config.hasSchemas()).toBe(true);
            expect(config.getSchemas()).toEqual([testSchema1, testSchema2]);
        });

        test('should create config with empty schemas array', () => {
            const config = DbSchemaConfig.create({
                defaultSchemaId: 'some-id',
                schemas: []
            });

            expect(config.defaultSchemaId).toBe('');
            expect(config.hasSchemas()).toBe(false);
            expect(config.getSchemas()).toEqual([]);
        });
    });

    describe('findSchema', () => {
        test('should return null when no schemas exist and empty schemaId is provided', () => {
            const config = DbSchemaConfig.create();

            const result = config.findSchema('');

            expect(result).toBeNull();
        });

        test('should return null when no schemas exist and non-empty schemaId is provided', () => {
            const config = DbSchemaConfig.create();

            const result = config.findSchema('some-id');

            expect(result).toBeNull();
        });

        test('should return default schema when empty schemaId is provided', () => {
            const config = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });

            const result = config.findSchema('');

            expect(result).toBe(testSchema1);
        });

        test('should return specific schema when valid schemaId is provided', () => {
            const config = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });

            const result = config.findSchema(testSchema2.schemaId);

            expect(result).toBe(testSchema2);
        });

        test('should return default schema when invalid schemaId is provided', () => {
            const config = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });

            const result = config.findSchema('non-existent-id');

            expect(result).toBe(testSchema1);
        });

        test('should return null when invalid schemaId is provided and no default schema', () => {
            const config = DbSchemaConfig.create({
                schemas: [testSchema1, testSchema2]
            });

            const result = config.findSchema('non-existent-id');

            expect(result).toBeNull();
        });

        test('should return null when default schema is invalid', () => {
            // Create config manually to test edge case where defaultSchemaId is not in schemaMap
            const config = DbSchemaConfig.create({
                defaultSchemaId: 'invalid-default',
                schemas: [testSchema1, testSchema2]
            });

            const result = config.findSchema('');

            expect(result).toBeNull();
        });
    });

    describe('hasSchemas', () => {
        test('should return false for empty config', () => {
            const config = DbSchemaConfig.create();

            expect(config.hasSchemas()).toBe(false);
        });

        test('should return false for config with empty schemas array', () => {
            const config = DbSchemaConfig.create({ schemas: [] });

            expect(config.hasSchemas()).toBe(false);
        });

        test('should return true for config with schemas', () => {
            const config = DbSchemaConfig.create({ schemas: [testSchema1] });

            expect(config.hasSchemas()).toBe(true);
        });
    });

    describe('getSchemas', () => {
        test('should return empty array for empty config', () => {
            const config = DbSchemaConfig.create();

            expect(config.getSchemas()).toEqual([]);
        });

        test('should return schemas in correct order', () => {
            const config = DbSchemaConfig.create({
                schemas: [testSchema1, testSchema2, testSchema3]
            });

            const schemas = config.getSchemas();

            expect(schemas).toEqual([testSchema1, testSchema2, testSchema3]);
        });
    });

    describe('equals', () => {
        test('should return true for same instance', () => {
            const config = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });

            expect(config.equals(config)).toBe(true);
        });

        test('should return true for identical configs', () => {
            const config1 = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });
            const config2 = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });

            expect(config1.equals(config2)).toBe(true);
        });

        test('should return false for different defaultSchemaId', () => {
            const config1 = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });
            const config2 = DbSchemaConfig.create({
                defaultSchemaId: testSchema2.schemaId,
                schemas: [testSchema1, testSchema2]
            });

            expect(config1.equals(config2)).toBe(false);
        });

        test('should return false for different number of schemas', () => {
            const config1 = DbSchemaConfig.create({
                schemas: [testSchema1]
            });
            const config2 = DbSchemaConfig.create({
                schemas: [testSchema1, testSchema2]
            });

            expect(config1.equals(config2)).toBe(false);
        });

        test('should return false for different schema order', () => {
            const config1 = DbSchemaConfig.create({
                schemas: [testSchema1, testSchema2]
            });
            const config2 = DbSchemaConfig.create({
                schemas: [testSchema2, testSchema1]
            });

            expect(config1.equals(config2)).toBe(false);
        });

        test('should return false for different schema content', () => {
            const differentSchema = DbSchemaModel.create('Different', 'Different schema');
            const config1 = DbSchemaConfig.create({
                schemas: [testSchema1, testSchema2]
            });
            const config2 = DbSchemaConfig.create({
                schemas: [testSchema1, differentSchema]
            });

            expect(config1.equals(config2)).toBe(false);
        });

        test('should return true for empty configs', () => {
            const config1 = DbSchemaConfig.create();
            const config2 = DbSchemaConfig.create();

            expect(config1.equals(config2)).toBe(true);
        });
    });

    describe('toJSON', () => {
        test('should serialize empty config', () => {
            const config = DbSchemaConfig.create();

            const json = config.toJSON();

            expect(json).toEqual({
                defaultSchemaId: '',
                schemas: []
            });
        });

        test('should serialize config with schemas', () => {
            const config = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });

            const json = config.toJSON();

            expect(json).toEqual({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1.toJSON(), testSchema2.toJSON()]
            });
        });

        test('should serialize config without default schema', () => {
            const config = DbSchemaConfig.create({
                schemas: [testSchema1, testSchema2]
            });

            const json = config.toJSON();

            expect(json).toEqual({
                defaultSchemaId: '',
                schemas: [testSchema1.toJSON(), testSchema2.toJSON()]
            });
        });
    });

    describe('toObject', () => {
        test('should deserialize from JSON object', () => {
            const jsonData = {
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1.toJSON(), testSchema2.toJSON()]
            };

            const config = DbSchemaConfig.toObject(jsonData);

            expect(config).toBeInstanceOf(DbSchemaConfig);
            expect(config.defaultSchemaId).toBe(testSchema1.schemaId);
            expect(config.hasSchemas()).toBe(true);
            expect(config.getSchemas()).toHaveLength(2);
            expect(config.getSchemas()[0].equals(testSchema1)).toBe(true);
            expect(config.getSchemas()[1].equals(testSchema2)).toBe(true);
        });

        test('should deserialize from JSON with empty schemas', () => {
            const jsonData = {
                defaultSchemaId: '',
                schemas: []
            };

            const config = DbSchemaConfig.toObject(jsonData);

            expect(config).toBeInstanceOf(DbSchemaConfig);
            expect(config.defaultSchemaId).toBe('');
            expect(config.hasSchemas()).toBe(false);
            expect(config.getSchemas()).toEqual([]);
        });

        test('should throw PropertyNotExistsError for missing defaultSchemaId', () => {
            const jsonData = {
                schemas: []
            };

            expect(() => DbSchemaConfig.toObject(jsonData))
                .toThrow(PropertyNotExistsError);
        });

        test('should throw PropertyNotExistsError for missing schemas', () => {
            const jsonData = {
                defaultSchemaId: ''
            };

            expect(() => DbSchemaConfig.toObject(jsonData))
                .toThrow(PropertyNotExistsError);
        });

        test('should handle round-trip serialization', () => {
            const original = DbSchemaConfig.create({
                defaultSchemaId: testSchema1.schemaId,
                schemas: [testSchema1, testSchema2]
            });

            const json = original.toJSON();
            const deserialized = DbSchemaConfig.toObject(json);

            expect(deserialized.equals(original)).toBe(true);
        });

        test('should handle invalid defaultSchemaId during deserialization', () => {
            const jsonData = {
                defaultSchemaId: 'non-existent-id',
                schemas: [testSchema1.toJSON(), testSchema2.toJSON()]
            };

            const config = DbSchemaConfig.toObject(jsonData);

            expect(config.defaultSchemaId).toBe('');
            expect(config.hasSchemas()).toBe(true);
        });
    });
});
